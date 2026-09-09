"""presenca e participacao presencial concedidas pelo professor

No estudo que embasa esta camada (O'Donovan, Gain & Marais, 2013), presenca
valia 10 XP por aula, dobrados nos dias de tutorial, mais XP discricionario pela
qualidade da participacao. O resultado (SS6.6) foi presenca media de **79,1%**,
contra a faixa de 30-60% das outras disciplinas do mesmo departamento -- o
resultado quantitativo mais forte do estudo depois das notas. E SS6.4 poe presenca
lado a lado com os quizzes como o que mais beneficiou o aprendizado.

Aqui os 12 tipos de `eventos_aluno` sao **todos derivados do app**. Nenhum evento
podia ser concedido pelo professor, e nenhum representava algo acontecido fora do
aparelho. `eventos_aluno` ja e' o livro-razao certo; faltava quem pode escrever
nele.

Os tres bloqueios que "so inserir um tipo novo" esbarra, e o quarto que apareceu:

**1. O evento nao chegaria ao rank.** A view resolvia a classe por prefixo do
tipo (`topico`, `conteudo`, `atividade`, e `conquista` desde a `20260909_01`).
`presenca_aula` nao casaria com nenhum, resolveria `classe_id` nulo e seria
**excluido da soma** pelo `WHERE ... IS NOT NULL`, sem erro nenhum.

Em vez de acrescentar mais um prefixo, o ramo passa a olhar a **forma da
referencia**: o que comeca com `classe:` resolve contra `classe`. Assim nenhum
tipo creditado futuro precisa mexer na view outra vez.

**2. Presenca destravaria conquista de estudo.** Depois da `20260909_01`, a
metrica `eventos_totais` conta todo evento do aluno exceto o premio de conquista.
Presenca entraria nessa conta e destravaria "Primeiro Passo" (`minimo: 1`) para
quem nunca abriu o app. O mesmo para `dias_seguidos`, cujas conquistas dizem "use
a plataforma por N dias seguidos" -- estar em aula nao e' usar a plataforma.

A correcao generaliza o que ja existia: `fn_evento_creditado()` marca os eventos
que **nao sao uso do app** (concedidos pelo professor ou pelo sistema), e as
metricas derivadas de evento passam a ignora-los. Quando o professor quiser uma
conquista de presenca, ela vem explicita pela autoria dele (#158), nao por
acidente.

**3. Conceder para a turma disparava o motor de conquistas N vezes.** A
`20260909_01` ja tirou as agregacoes de dentro do laco. Agora a guarda de
recursao vira guarda de evento creditado: conceder presenca para 20 alunos nao
avalia conquista nenhuma, porque nenhuma metrica olha para esse evento.

**4. Presenca seria auto-servico.** `eventos_aluno_posse_ins` permite ao aluno
inserir **qualquer** tipo para si (`WITH CHECK (aluno_id = auth.uid())`) -- e o
app depende disso, porque e' o proprio cliente que grava os eventos de estudo.
Sem restringir, o aluno se daria presenca. A policy passa a recusar tipo
creditado; concede-los so' pela RPC, que confere se a classe e' do professor.

Duas tecnicas diferentes de proposito: a **view** e' recriada inteira (60 linhas
de SQL literal, e o ramo generico e' o ponto da mudanca), enquanto o **gatilho**
e' alterado por substituicao no proprio corpo, como a `20260826_16` faz --
recolar 200 linhas geradas desfaria em silencio qualquer ajuste que outra
migracao tenha feito nele.

Revision ID: 20260909_03
Revises: 20260909_02
Create Date: 2026-09-09
"""

from alembic import op

revision = "20260909_03"
down_revision = "20260909_02"
branch_labels = None
depends_on = None


# Tipos que o professor pode conceder. Fechado de proposito: `conquista_*` e' do
# sistema e nao entra aqui.
TIPOS_CONCEDIVEIS = ("presenca_aula", "participacao_aula")

# Tipos que NAO sao uso do app -- concedidos pelo professor ou pelo sistema.
PREFIXOS_CREDITADOS = ("presenca", "participacao", "conquista")

EVENTO_PREMIO = "conquista_desbloqueada"


def _lista(valores: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in valores)


FUNCAO_CREDITADO = f"""
CREATE OR REPLACE FUNCTION public.fn_evento_creditado(p_tipo text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT COALESCE(
    {" OR ".join(f"starts_with(lower(p_tipo), '{p}')" for p in PREFIXOS_CREDITADOS)},
    false
  );
$fn$;
"""

COLUNA_E_INDICE = f"""
ALTER TABLE public.eventos_aluno
  ADD COLUMN IF NOT EXISTS concedido_por uuid;

COMMENT ON COLUMN public.eventos_aluno.concedido_por IS
  'Quem concedeu o evento, quando ele nao veio do uso do app. Nulo para evento '
  'gerado pelo proprio aluno.';

-- Idempotencia: dois cliques do professor nao podem valer o dobro de pontos, e
-- uma conquista nao pode pagar duas vezes.
--
-- O predicado e' uma lista literal, nao `fn_evento_creditado(tipo)`: funcao em
-- predicado de indice congela a semantica no momento da criacao, e trocar a
-- funcao depois deixaria o indice inconsistente sem aviso. Acrescentar um tipo
-- creditado aqui e' uma migracao visivel, e e' melhor assim.
CREATE UNIQUE INDEX IF NOT EXISTS eventos_aluno_creditado_unico
  ON public.eventos_aluno (aluno_id, tipo, referencia)
  WHERE tipo IN ({_lista(TIPOS_CONCEDIVEIS + (EVENTO_PREMIO,))});
"""

# O app grava os eventos de estudo pelo cliente do proprio aluno, entao a policy
# de INSERT tem que continuar existindo -- o que ela nao pode e' deixar o aluno
# se dar presenca.
POLICY_INSERT = """
DROP POLICY IF EXISTS eventos_aluno_posse_ins ON public.eventos_aluno;
CREATE POLICY eventos_aluno_posse_ins ON public.eventos_aluno
  FOR INSERT TO authenticated
  WITH CHECK (aluno_id = auth.uid() AND NOT public.fn_evento_creditado(tipo));
"""

POLICY_INSERT_ANTIGA = """
DROP POLICY IF EXISTS eventos_aluno_posse_ins ON public.eventos_aluno;
CREATE POLICY eventos_aluno_posse_ins ON public.eventos_aluno
  FOR INSERT TO authenticated
  WITH CHECK (aluno_id = auth.uid());
"""

# Recriada por inteiro: o ramo generico e' a mudanca, e vale ver o contexto dela.
VIEW_RANK = """
CREATE OR REPLACE VIEW public.vw_rank_posicoes_por_classe_todas AS
 WITH referencias_normalizadas AS (
         SELECT e.aluno_id,
            e.tipo,
            COALESCE(e.valor, 0::numeric) AS valor,
            TRIM(BOTH FROM COALESCE(e.referencia, ''::text)) AS referencia_bruta,
                CASE
                    WHEN NULLIF(TRIM(BOTH FROM e.referencia), ''::text) IS NULL THEN NULL::bigint
                    WHEN TRIM(BOTH FROM e.referencia) ~ '^\\d+$'::text
                      THEN TRIM(BOTH FROM e.referencia)::bigint
                    WHEN split_part(TRIM(BOTH FROM e.referencia), ':'::text, 2) ~ '^\\d+$'::text
                      THEN split_part(TRIM(BOTH FROM e.referencia), ':'::text, 2)::bigint
                    ELSE NULL::bigint
                END AS referencia_id
           FROM eventos_aluno e
        ), eventos_por_classe AS (
         SELECT e.aluno_id,
            COALESCE(t.classe_id, t_c.classe_id, t_a.classe_id, cl.id) AS classe_id,
            sum(e.valor) AS pontuacao
           FROM referencias_normalizadas e
             LEFT JOIN topicos t
               ON starts_with(lower(COALESCE(e.tipo, ''::text)), 'topico') AND t.id = e.referencia_id
             LEFT JOIN conteudos c
               ON starts_with(lower(COALESCE(e.tipo, ''::text)), 'conteudo') AND c.id = e.referencia_id
             LEFT JOIN topicos t_c ON t_c.id = c.topico_id
             LEFT JOIN atividades atv
               ON starts_with(lower(COALESCE(e.tipo, ''::text)), 'atividade') AND atv.id = e.referencia_id
             LEFT JOIN topicos t_a ON t_a.id = atv.topico_id
             -- Nao olha o tipo, e sim a FORMA da referencia: `classe:<id>` resolve
             -- direto. Assim um tipo creditado novo nao precisa mexer nesta view.
             LEFT JOIN classe cl
               ON starts_with(lower(e.referencia_bruta), 'classe:') AND cl.id = e.referencia_id
          WHERE COALESCE(t.classe_id, t_c.classe_id, t_a.classe_id, cl.id) IS NOT NULL
          GROUP BY e.aluno_id, (COALESCE(t.classe_id, t_c.classe_id, t_a.classe_id, cl.id))
        ), base AS (
         SELECT r.id AS rank_id,
            r.classe_id,
            ca.aluno_id,
            rt.criterio,
                CASE rt.criterio
                    WHEN 'percentual'::text THEN COALESCE(ca."porcentagemConcluida", 0::numeric)
                    WHEN 'pontuacao'::text THEN COALESCE(epc.pontuacao, 0::numeric)
                    WHEN 'tempo'::text THEN COALESCE(ca."tempoGastoMin", 0::numeric)
                    ELSE 0::numeric
                END AS pontuacao
           FROM ranks r
             JOIN rank_tipo rt ON rt.id = r.tipo_id
             JOIN classe_aluno ca ON ca.classe_id = r.classe_id
             LEFT JOIN eventos_por_classe epc
               ON epc.classe_id = r.classe_id AND epc.aluno_id = ca.aluno_id
        ), ordenado AS (
         SELECT b.rank_id,
            b.classe_id,
            b.aluno_id,
            b.pontuacao,
            dense_rank() OVER (PARTITION BY b.rank_id ORDER BY b.pontuacao DESC, b.aluno_id) AS posicao
           FROM base b
        )
 SELECT o.rank_id,
    o.classe_id,
    o.posicao,
    a.id AS id_aluno,
    a.nome AS nome_aluno,
    o.pontuacao,
    round(o.pontuacao / NULLIF(max(o.pontuacao) OVER (PARTITION BY o.rank_id), 0::numeric)
          * 100::numeric, 2) AS progresso,
        CASE
            WHEN o.posicao = 1 THEN 'ouro'::text
            WHEN o.posicao = 2 THEN 'prata'::text
            WHEN o.posicao = 3 THEN 'bronze'::text
            ELSE NULL::text
        END AS medalha
   FROM ordenado o
     JOIN alunos a ON a.id = o.aluno_id;
"""

# Substituicao no corpo, nao recolagem: o gatilho e' gerado a partir do
# dicionario de metricas da `20260909_01`, e recolar uma copia aqui congelaria
# aquela geracao dentro desta migracao.
GATILHO_SUBSTITUICOES = f"""
DO $$
DECLARE
  v_src  text;
  v_novo text;
BEGIN
  SELECT p.prosrc INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'trg_eventos_aluno_after_iud';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'trg_eventos_aluno_after_iud nao encontrada';
  END IF;

  IF position('fn_evento_creditado' in v_src) > 0 THEN
    RETURN;  -- ja aplicado
  END IF;

  -- 1) A guarda de recursao vira guarda de evento creditado: presenca tambem
  --    nao avalia conquista, porque nenhuma metrica olha para ela.
  v_novo := replace(
    v_src,
    'IF v_tipo = ''{EVENTO_PREMIO}'' THEN',
    'IF public.fn_evento_creditado(v_tipo) THEN'
  );

  -- 2) As metricas derivadas de evento ignoram o que nao e' uso do app.
  v_novo := replace(
    v_novo,
    'tipo <> ''{EVENTO_PREMIO}''',
    'NOT public.fn_evento_creditado(tipo)'
  );

  -- 3) A referencia do premio ganha a conquista, senao o indice unico deixaria
  --    o aluno receber uma unica conquista por classe.
  v_novo := replace(
    v_novo,
    'ELSE ''classe:'' || v_classe_id::text END,',
    'ELSE ''classe:'' || v_classe_id::text || '':conquista:'' || v_conquista.id::text END,'
  );

  IF v_novo = v_src THEN
    RAISE EXCEPTION
      'Nao encontrei o ponto de insercao em trg_eventos_aluno_after_iud';
  END IF;

  EXECUTE
    'CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_after_iud() '
    || 'RETURNS trigger LANGUAGE plpgsql AS $fn$' || v_novo || '$fn$';
END $$;
"""

CONFIG = """
INSERT INTO public.app_config (chave, valor, descricao, publico)
VALUES (
  'presenca_aula_pontos',
  '10',
  'Pontos por presenca em aula. No estudo de referencia eram 10, dobrados em '
  || 'dia de tutorial. Participacao e sempre discricionaria: o professor informa '
  || 'o valor na hora.',
  true
)
ON CONFLICT (chave) DO NOTHING;
"""

RPC = f"""
CREATE OR REPLACE FUNCTION public.registrar_presenca_da_turma(
  p_classe_id bigint,
  p_alunos    uuid[] DEFAULT NULL,
  p_tipo      text DEFAULT 'presenca_aula',
  p_valor     numeric DEFAULT NULL,
  p_data      date DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_professor uuid := auth.uid();
  v_data      date := COALESCE(p_data, CURRENT_DATE);
  v_valor     numeric;
  v_ref       text;
  v_qtd       integer;
BEGIN
  IF v_professor IS NULL THEN
    RAISE EXCEPTION 'sem sessao';
  END IF;

  -- A classe tem que ser dele. Sem isto, um professor daria presenca na turma
  -- de outro.
  IF p_classe_id IS NULL
     OR p_classe_id NOT IN (SELECT public.app_classes_do_professor()) THEN
    RAISE EXCEPTION USING MESSAGE = 'classe ' || p_classe_id::text || ' nao e sua';
  END IF;

  IF p_tipo NOT IN ({_lista(TIPOS_CONCEDIVEIS)}) THEN
    RAISE EXCEPTION USING MESSAGE = 'tipo ' || p_tipo || ' nao pode ser concedido';
  END IF;

  v_valor := COALESCE(
    p_valor,
    (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::numeric
       FROM public.app_config WHERE chave = 'presenca_aula_pontos')
  );

  IF v_valor IS NULL OR v_valor <= 0 THEN
    RAISE EXCEPTION USING MESSAGE = 'valor invalido para ' || p_tipo;
  END IF;

  -- A data entra na referencia, entao o indice unico dedupe por dia. O
  -- `split_part(..., '':'', 2)` da view continua achando o id da classe.
  v_ref := 'classe:' || p_classe_id::text || ':' || to_char(v_data, 'YYYY-MM-DD');

  INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em, concedido_por)
  SELECT ca.aluno_id, p_tipo, v_ref, v_valor, now(), v_professor
    FROM public.classe_aluno ca
   WHERE ca.classe_id = p_classe_id
     AND (p_alunos IS NULL OR ca.aluno_id = ANY(p_alunos))
  ON CONFLICT (aluno_id, tipo, referencia)
    WHERE tipo IN ({_lista(TIPOS_CONCEDIVEIS + (EVENTO_PREMIO,))})
    DO NOTHING;

  GET DIAGNOSTICS v_qtd = ROW_COUNT;
  RETURN v_qtd;
END;
$fn$;

REVOKE ALL ON FUNCTION public.registrar_presenca_da_turma(bigint, uuid[], text, numeric, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_presenca_da_turma(bigint, uuid[], text, numeric, date) TO authenticated;
"""


def upgrade() -> None:
    op.execute(FUNCAO_CREDITADO)
    op.execute(COLUNA_E_INDICE)
    op.execute(POLICY_INSERT)
    op.execute(VIEW_RANK)
    op.execute(GATILHO_SUBSTITUICOES)
    op.execute(CONFIG)
    op.execute(RPC)


def downgrade() -> None:
    op.execute(
        "DROP FUNCTION IF EXISTS public.registrar_presenca_da_turma"
        "(bigint, uuid[], text, numeric, date)"
    )
    op.execute("DELETE FROM public.app_config WHERE chave = 'presenca_aula_pontos'")
    op.execute(POLICY_INSERT_ANTIGA)
    op.execute("DROP INDEX IF EXISTS public.eventos_aluno_creditado_unico")
    # `concedido_por` e `fn_evento_creditado` ficam: o gatilho reescrito ainda
    # chama a funcao, e apagar a coluna perderia a auditoria do que ja foi
    # concedido.
