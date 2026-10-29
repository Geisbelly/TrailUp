"""Catálogo de métricas no banco, resultado das invariantes e a view que diz o que pode ser mostrado

F0 da spec de métricas ("medir antes de mexer").

## O que faltava

Cada número que o produto mostra (progresso, tempo ativo, ranking, domínio...) depende de dados que
podem estar errados em silêncio: lote duplicado, trigger que não rodou, função ausente num banco novo.
Hoje a tela desenha o número do mesmo jeito. A F0 acrescenta um **auditor** (as invariantes `I01`…`I20`,
funções `public.fn_inv_i01()`…, escritas na `20261029_03`) e esta migration põe o que ele precisa para
falar com o resto do sistema:

- `metricas_catalogo`: uma linha por métrica (chave, quem enxerga, de onde vem, quanto dado precisa
  e **de quais invariantes ela depende**). É o contrato que cliente e IA leem; não é configuração.
- `metricas_invariante_resultado`: uma linha por rodada de cada invariante (`ok`, quantas linhas
  violaram, `erro` se a função estourou). Quem escreve é o executor da `20261029_03`.
- `metricas_invariante_amostra`: até 20 **ids** de linhas que violaram a invariante, para o dev
  investigar. Tem id de aluno, de lote, de sessão.
- `vw_metricas_disponibilidade`: a resposta pronta, `disponivel` + `motivo`, para o cliente decidir
  entre desenhar o número e mostrar "indisponível".

## Quem lê o quê (RLS é a autorização)

- `metricas_catalogo` e `metricas_invariante_resultado`: `SELECT` para `authenticated`
  (`USING (true)`), sem escrita para ninguém além do `service_role`/`postgres`. Não há dado de aluno
  ali: chaves de métrica e contagens de linhas violadas. No resultado o GRANT é **por coluna**
  (`id, invariante, rodado_em, ok, linhas`): `erro` carrega SQLSTATE e texto de exceção e só o
  `service_role`/`postgres` o lê. `vw_metricas_disponibilidade` não precisa dele.
- `metricas_invariante_amostra`: **só service_role**. Sem policy e com `REVOKE ALL ... FROM PUBLIC, anon,
  authenticated`: a tabela guarda ids de aluno, e RLS ligada sem policy já a fecha para o cliente; o
  REVOKE tira também o GRANT que o Supabase dá por padrão (a ausência de policy passa a ser decisão
  registrada, não esquecimento — ver CLAUDE.md, "Tabela nova nasce com RLS ligada").
- `vw_metricas_disponibilidade`: nasce `security_invoker = on` e só `authenticated` tem `SELECT`. Ela
  lê o catálogo e o resultado, ambos liberados para o mesmo papel.

## Ids de invariante

Sempre `'I01'`…`'I20'` (I maiúsculo, dois dígitos), no catálogo e no resultado. Dois dígitos fazem
`I08,I09,I10` ordenar certo no `motivo`; um CHECK impede que alguém grave `i8`, `I8` ou `I21` e a
dependência vire "invariante que nunca roda" sem ninguém notar.

## `motivo` e a ordem de precedência

Para a métrica `m`, `disponivel = (motivo IS NULL)`, e `motivo` é o **primeiro** que valer:

1. `aguardando_validacao`: `requer_validacao <> 'nenhuma'` e `validacao_promovida = false`. Métrica
   cujo valor vem de modelo (`ml`/`llm`) só aparece depois que alguém mediu o modelo e promoveu. Vale
   mesmo com todas as invariantes verdes e mesmo sem invariantes.
2. `auditoria_atrasada`: alguma invariante de que ela depende **nunca rodou** ou a última rodada tem
   mais de 26 h. Auditoria parada (cron desligado, rodada de anteontem) não pode virar "tudo verde":
   sem rodada recente não se sabe, e "não se sabe" é indisponível. O cron diário roda às 03:30 BRT;
   26 h dão duas horas de folga sobre as 24 h entre rodadas, mas não escondem uma rodada perdida.
3. `invariante_falhou:<ids>`: a última rodada de alguma delas deu `ok = false`; os ids vêm ordenados e
   separados por vírgula (`invariante_falhou:I08,I09`).

Métrica sem invariantes e sem validação (`prof.vencidas`) é sempre disponível: não há o que auditar,
e `rodado_em` fica nulo. Nos demais casos `rodado_em` é a rodada **mais antiga** entre as invariantes
de que ela depende (o elo mais fraco), ou nulo se alguma nunca rodou.

## `dev.transporte` não depende de invariante

O card de transporte mostra quantos lotes chegaram por cada via e o motivo do fallback. A I20 é alerta
(spec §5.1) e não pode desligar o card; a I18 mede a cobertura do próprio motivo, que é exatamente o
que o card mostra, então ela falhar não é razão para escondê-lo. Por isso `invariantes = '{}'`.

## O que esta migration não faz

Não cria as funções das invariantes nem o executor nem o `pg_cron`: é a `20261029_03`. A view já
funciona com linhas inseridas à mão no resultado, que é como o e2e a exercita.
"""

from alembic import op

revision = "20261029_02"
down_revision = "20261029_01"
branch_labels = None
depends_on = None

INVARIANTES = tuple(f"I{n:02d}" for n in range(1, 21))
_LISTA_INV = ", ".join(f"'{i}'" for i in INVARIANTES)

# (chave, nome, descricao, publico, unidade, janela, fonte, nulo_significa, requer_validacao, invariantes)
# `legado.*` são os cards atuais do console sobre `vw_metricas_engajamento_aluno_classe`; ficam presos à
# I16 até a F5 trocá-los. Sem `%` nem `:` seguido de letra nos textos: o SQL passa por `text()`.
CATALOGO = [
    ("aluno.progresso", "Progresso no tópico",
     "Percentual do percurso personalizado do tópico que o aluno concluiu (material do professor vale bônus).",
     ["aluno", "professor"], "percentual", "tópico", "topico_aluno.percentual_concluido",
     "tópico sem conteúdo cadastrado", "nenhuma", ["I04", "I05"]),
    ("aluno.tempo_ativo_semana", "Tempo ativo na semana",
     "Minutos em que o aluno interagiu com o material na semana, somando os lotes de telemetria.",
     ["aluno", "professor"], "minutos", "7 dias", "telemetria_lotes.active_sec",
     "nenhum lote de estudo na semana", "nenhuma", ["I01", "I02", "I03"]),
    ("aluno.sequencia", "Sequência de dias",
     "Dias seguidos em que o aluno estudou.",
     ["aluno"], "dias", "contínua", "eventos_aluno",
     "o aluno ainda não estudou", "nenhuma", ["I08"]),
    ("aluno.conquistas", "Conquistas do aluno",
     "Conquistas desbloqueadas pelo aluno e quanto falta para as próximas.",
     ["aluno"], "contagem", "contínua", "conquistas_aluno",
     "nenhuma conquista desbloqueada", "nenhuma", ["I13"]),
    ("aluno.ranking", "Posição no ranking",
     "Posição do aluno entre os colegas da turma pela pontuação acumulada.",
     ["aluno", "professor"], "posição", "contínua", "vw_rank_posicoes_por_classe",
     "aluno sem pontuação na turma", "nenhuma", ["I08", "I09", "I10"]),
    ("aluno.dominio", "Domínio estimado",
     "Estimativa do domínio do aluno sobre o tópico, produzida por modelo. Só aparece depois de validada.",
     ["aluno", "professor", "ia"], "0 a 1", "tópico", "aluno_dominio",
     "poucas respostas para estimar", "ml", ["I15"]),
    ("aluno.nota_sugerida", "Nota sugerida",
     "Nota proposta por modelo de linguagem para a produção do aluno. Só aparece depois de validada.",
     ["aluno", "professor"], "nota", "atividade", "atividade_aluno",
     "atividade sem correção sugerida", "llm", []),
    ("aluno.sugestao_material", "Ordem aconselhada do material",
     "Ordem em que o aluno deveria consumir o material, escolhida pelo motor de sugestão. Só aparece depois de validada.",
     ["aluno", "ia"], "ordem", "tópico", "personalizacao_sugestao",
     "material do tópico ainda não gerado", "ml", ["I15"]),
    ("prof.questao_problema", "Questão problemática",
     "Questões com taxa de erro muito acima da média da turma.",
     ["professor"], "contagem", "30 dias", "questoes_personalizadas",
     "menos respostas que o mínimo", "nenhuma", ["I19"]),
    ("prof.conteudo_trava", "Conteúdo que trava",
     "Conteúdos em que a turma gasta muito mais tempo ativo que o esperado antes de avançar.",
     ["professor"], "contagem", "30 dias", "telemetria_lotes",
     "menos alunos que o mínimo", "nenhuma", ["I01", "I02", "I03"]),
    ("prof.inatividade", "Alunos inativos",
     "Alunos da turma sem nenhuma atividade de estudo no período.",
     ["professor"], "contagem", "7 dias", "aluno_atividade_diaria",
     "turma sem alunos matriculados", "nenhuma", ["I01", "I17"]),
    ("prof.estagnado", "Alunos estagnados",
     "Alunos cujo progresso no tópico não andou no período.",
     ["professor"], "contagem", "14 dias", "topico_aluno.percentual_concluido",
     "turma sem alunos matriculados", "nenhuma", ["I04", "I05"]),
    ("prof.vencidas", "Atividades vencidas",
     "Atividades com prazo vencido e ainda sem entrega, por turma.",
     ["professor"], "contagem", "contínua", "atividade_aluno",
     "turma sem atividade com prazo", "nenhuma", []),
    ("prof.cobertura", "Cobertura de personalização",
     "Parcela dos pares aluno e tópico que já têm material personalizado gerado.",
     ["professor", "dev"], "percentual", "contínua", "conteudo_personalizado",
     "turma sem tópicos", "nenhuma", ["I15"]),
    ("prof.sem_material", "Tópicos sem material",
     "Tópicos publicados que ainda não têm nenhum material cadastrado pelo professor.",
     ["professor"], "contagem", "contínua", "conteudos",
     "turma sem tópicos", "nenhuma", []),
    ("legado.tempo_uso", "Tempo de uso (card atual)",
     "Card atual do console sobre vw_metricas_engajamento_aluno_classe. Mantido até a F5 trocá-lo.",
     ["professor"], "minutos", "7 dias", "vw_metricas_engajamento_aluno_classe",
     "sem telemetria no período", "nenhuma", ["I16"]),
    ("legado.abandono", "Abandono (card atual)",
     "Card atual do console sobre vw_metricas_engajamento_aluno_classe. Mantido até a F5 trocá-lo.",
     ["professor"], "percentual", "7 dias", "vw_metricas_engajamento_aluno_classe",
     "sem telemetria no período", "nenhuma", ["I16"]),
    ("dev.transporte", "Transporte da telemetria",
     "Quantos lotes chegaram pela API e quantos pela via direta, e por que o app desistiu da API.",
     ["dev"], "contagem", "24 horas", "telemetria_lotes.via",
     "nenhum lote no período", "nenhuma", []),
    ("dev.uso", "Uso do app",
     "Sessões e tempo de uso do app por dia.",
     ["dev"], "contagem", "24 horas", "aluno_atividade_diaria",
     "nenhuma sessão no período", "nenhuma", ["I17"]),
    ("dev.gamificacao", "Saúde da gamificação",
     "Consistência entre pontos, ranking e conquistas.",
     ["dev"], "contagem", "contínua", "eventos_aluno",
     "nenhum evento no período", "nenhuma", ["I08", "I09", "I13"]),
    ("dev.ia", "Saúde da geração por IA",
     "Jobs de personalização por estado e cobertura do que foi gerado.",
     ["dev"], "contagem", "24 horas", "personalizacao_jobs",
     "nenhum job no período", "nenhuma", ["I15"]),
]


def _q(valor: str | None) -> str:
    return "NULL" if valor is None else "'" + valor.replace("'", "''") + "'"


def _arr(valores: list[str]) -> str:
    return "'{" + ",".join(valores) + "}'"


def _valores_do_catalogo() -> str:
    linhas = []
    for chave, nome, descricao, publico, unidade, janela, fonte, nulo, requer, invs in CATALOGO:
        linhas.append(
            f"  ({_q(chave)}, {_q(nome)}, {_q(descricao)}, {_arr(publico)}, {_q(unidade)}, {_q(janela)}, "
            f"{_q(fonte)}, {_q(nulo)}, {_q(requer)}, {_arr(invs)})"
        )
    return ",\n".join(linhas)


TABELAS = """
CREATE TABLE IF NOT EXISTS public.metricas_catalogo (
  chave text PRIMARY KEY,
  nome text NOT NULL,
  descricao text NOT NULL,
  publico text[] NOT NULL
    CONSTRAINT metricas_catalogo_publico_valido CHECK (publico <@ ARRAY['aluno','professor','dev','ia']),
  unidade text,
  janela text,
  fonte text NOT NULL,
  formula_versao integer NOT NULL DEFAULT 1,
  nulo_significa text,
  n_minimo integer NOT NULL DEFAULT 5,
  requer_validacao text NOT NULL DEFAULT 'nenhuma'
    CONSTRAINT metricas_catalogo_requer_validacao_valido CHECK (requer_validacao IN ('nenhuma','ml','llm')),
  validacao_promovida boolean NOT NULL DEFAULT false,
  invariantes text[] NOT NULL DEFAULT '{}'
    CONSTRAINT metricas_catalogo_invariantes_validas CHECK (invariantes <@ ARRAY[__INVARIANTES__])
);

CREATE TABLE IF NOT EXISTS public.metricas_invariante_resultado (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invariante text NOT NULL
    CONSTRAINT metricas_invariante_resultado_invariante_valida CHECK (invariante IN (__INVARIANTES__)),
  rodado_em timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL,
  linhas bigint,
  erro text
);
CREATE INDEX IF NOT EXISTS metricas_invariante_resultado_invariante_rodado_idx
  ON public.metricas_invariante_resultado (invariante, rodado_em DESC);

CREATE TABLE IF NOT EXISTS public.metricas_invariante_amostra (
  invariante text NOT NULL
    CONSTRAINT metricas_invariante_amostra_invariante_valida CHECK (invariante IN (__INVARIANTES__)),
  rodado_em timestamptz NOT NULL DEFAULT now(),
  ids text[]
);
CREATE INDEX IF NOT EXISTS metricas_invariante_amostra_invariante_rodado_idx
  ON public.metricas_invariante_amostra (invariante, rodado_em DESC);
""".replace("__INVARIANTES__", _LISTA_INV)

COMENTARIOS = """
COMMENT ON TABLE public.metricas_catalogo IS
  'Uma linha por métrica do produto: quem enxerga, de onde vem e de quais invariantes (I01 a I20) depende. Leitura para authenticated; escrita só service_role.';
COMMENT ON TABLE public.metricas_invariante_resultado IS
  'Uma linha por rodada de cada invariante (ok, linhas violadas, erro). Escrita só pelo executor (service_role/postgres); leitura para authenticated.';
COMMENT ON TABLE public.metricas_invariante_amostra IS
  'Até 20 ids de linhas que violaram a invariante, por rodada. Tem id de aluno: só service_role: sem policy e sem permissão alguma para anon e authenticated.';
COMMENT ON COLUMN public.metricas_catalogo.invariantes IS
  'Ids I01 a I20 (I maiúsculo, dois dígitos) de que a métrica depende. Vazio = nada a auditar.';
COMMENT ON COLUMN public.metricas_catalogo.validacao_promovida IS
  'Métrica com requer_validacao ml ou llm só fica disponível quando alguém mediu o modelo e promoveu (true).';
"""

SEGURANCA = """
ALTER TABLE public.metricas_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metricas_invariante_resultado ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metricas_invariante_amostra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS metricas_catalogo_sel ON public.metricas_catalogo;
CREATE POLICY metricas_catalogo_sel ON public.metricas_catalogo
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS metricas_invariante_resultado_sel ON public.metricas_invariante_resultado;
CREATE POLICY metricas_invariante_resultado_sel ON public.metricas_invariante_resultado
  FOR SELECT TO authenticated
  USING (true);

-- O Supabase concede ALL a anon e authenticated em toda tabela nova de public; RLS é a única barreira
-- e, na amostra, nem ela basta como documentação. Tira tudo e devolve só o SELECT que tem policy.
REVOKE ALL ON public.metricas_catalogo FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.metricas_invariante_resultado FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.metricas_invariante_amostra FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.metricas_catalogo TO authenticated;
-- `erro` guarda SQLSTATE e texto de exceção (R6): fica de fora do GRANT por coluna. A view não o lê.
GRANT SELECT (id, invariante, rodado_em, ok, linhas) ON public.metricas_invariante_resultado TO authenticated;
"""

VIEW = """
CREATE OR REPLACE VIEW public.vw_metricas_disponibilidade
WITH (security_invoker = on) AS
WITH ultima AS (
  SELECT DISTINCT ON (r.invariante) r.invariante, r.ok, r.rodado_em
    FROM public.metricas_invariante_resultado r
   ORDER BY r.invariante, r.rodado_em DESC, r.id DESC
),
dependencia AS (
  SELECT c.chave, d.invariante, u.ok, u.rodado_em
    FROM public.metricas_catalogo c
   CROSS JOIN LATERAL unnest(c.invariantes) AS d(invariante)
    LEFT JOIN ultima u ON u.invariante = d.invariante
),
resumo AS (
  SELECT chave,
         bool_or(rodado_em IS NULL OR rodado_em < now() - interval '26 hours') AS atrasada,
         string_agg(invariante, ',' ORDER BY invariante) FILTER (WHERE ok IS FALSE) AS falharam,
         CASE WHEN bool_or(rodado_em IS NULL) THEN NULL ELSE min(rodado_em) END AS rodado_em
    FROM dependencia
   GROUP BY chave
),
decisao AS (
  SELECT c.chave,
         CASE
           WHEN c.requer_validacao <> 'nenhuma' AND NOT c.validacao_promovida
             THEN 'aguardando_validacao'
           WHEN COALESCE(r.atrasada, false)
             THEN 'auditoria_atrasada'
           WHEN r.falharam IS NOT NULL
             THEN 'invariante_falhou:' || r.falharam
         END AS motivo,
         r.rodado_em
    FROM public.metricas_catalogo c
    LEFT JOIN resumo r ON r.chave = c.chave
)
SELECT chave,
       (motivo IS NULL) AS disponivel,
       motivo,
       rodado_em
  FROM decisao;

COMMENT ON VIEW public.vw_metricas_disponibilidade IS
  'Por métrica do catálogo: disponivel e, se não, motivo (aguardando_validacao, auditoria_atrasada, invariante_falhou:ids), nessa ordem de precedência. rodado_em = rodada mais antiga entre as invariantes de que ela depende.';

REVOKE ALL ON public.vw_metricas_disponibilidade FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.vw_metricas_disponibilidade TO authenticated;
"""

DOWNGRADE = """
DROP VIEW IF EXISTS public.vw_metricas_disponibilidade;
DROP TABLE IF EXISTS public.metricas_invariante_amostra;
DROP TABLE IF EXISTS public.metricas_invariante_resultado;
DROP TABLE IF EXISTS public.metricas_catalogo;
"""


def _semente() -> str:
    return (
        "INSERT INTO public.metricas_catalogo\n"
        "  (chave, nome, descricao, publico, unidade, janela, fonte, nulo_significa, requer_validacao, invariantes)\n"
        "VALUES\n"
        + _valores_do_catalogo()
        + "\nON CONFLICT (chave) DO UPDATE SET\n"
        "  nome = EXCLUDED.nome,\n"
        "  descricao = EXCLUDED.descricao,\n"
        "  publico = EXCLUDED.publico,\n"
        "  unidade = EXCLUDED.unidade,\n"
        "  janela = EXCLUDED.janela,\n"
        "  fonte = EXCLUDED.fonte,\n"
        "  nulo_significa = EXCLUDED.nulo_significa,\n"
        "  requer_validacao = EXCLUDED.requer_validacao,\n"
        "  invariantes = EXCLUDED.invariantes;\n"
    )


def upgrade() -> None:
    op.execute(TABELAS)
    op.execute(COMENTARIOS)
    op.execute(SEGURANCA)
    op.execute(_semente())
    op.execute(VIEW)


def downgrade() -> None:
    op.execute(DOWNGRADE)
