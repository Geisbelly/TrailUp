"""O que a conversa com o Guia deixa, sem a conversa (`chat_guia_registros`)

O chat do Guia não guardava nada que servisse: a conversa volta do app a cada pergunta
(`assinatura_chat.py`), e o único rastro era o texto cru em `ia_decision_logs`, que ninguém lê e que
a `20261003_09` redige aos 90 dias. Esta tabela guarda o contrário disso: **o que a pergunta era,
nunca o que o aluno escreveu.**

Uma linha por pergunta respondida:

- `intencao`: dúvida da matéria, pedido de resposta, navegação no app, personalização, estratégia de
  estudo, desabafo ou outro;
- `assunto` e `conceitos`: o tema em termos da matéria ("frações equivalentes"), escritos pelo
  modelo **na mesma chamada que responde ao aluno** (nenhuma chamada a mais, nenhuma cota a mais) e
  passados pelo mascarador da API (`app/services/mascaramento_chat.py`): e-mail, telefone, CPF, link,
  @usuário, número longo e o nome do aluno e dos colegas da turma saem antes de gravar;
- `dificuldade`: `nenhuma`, `alguma` ou `travado`, como o modelo leu a mensagem;
- `origem`: `modelo`, `regra` (pergunta de navegação respondida sem modelo) ou `reserva` (a resposta
  foi a de reserva, e o modelo não classificou nada).

Quem grava é a API (`service_role`), porque a linha é saída do modelo. Quem lê:

- o próprio Guia, na pergunta seguinte, como memória do aluno e dificuldades da turma
  (`ChatGuiaRegistrosRepository`);
- o aluno, a própria linha (é dado dele; LGPD, direito de acesso);
- o professor, as linhas das turmas dele (`app_classes_do_professor()`), como já lê a telemetria.

Ninguém do cliente escreve: sem INSERT, UPDATE nem DELETE para `authenticated`.

**Views, todas `security_invoker = on`** (a RLS da tabela vale dentro delas):

- `vw_chat_guia_aluno_topico`: por aluno × tópico, quantas perguntas, de que tipo, quantas com
  dificuldade, e o acerto médio nas tentativas de atividade do tópico **antes** e **depois** da
  primeira conversa. Isso é coincidência no tempo, não efeito do chat: quem conversou pode ter
  estudado mais por outro motivo. O nome das colunas diz "antes/depois", não "ganho".
- `vw_chat_guia_conceitos_turma`: por turma × tópico × conceito, menções, alunos e alunos com
  dificuldade. É a "dificuldade da sala".
- `vw_chat_guia_turma_topico`: por turma × tópico, o resumo da turma.

**Retenção:** apagar aos 395 dias (730 para quem consentiu pesquisa), o mesmo prazo da telemetria
derivada da `20261024_03`. Sai também com a conta e com a turma, pelas FKs.

Nada aqui foi aplicado em produção.

Revision ID: 20261118_01
Revises: 20261117_04
Create Date: 2026-11-18
"""

from __future__ import annotations

from alembic import op

revision = "20261118_01"
down_revision = "20261117_04"
branch_labels = None
depends_on = None

INTENCOES = (
    "duvida_materia",
    "pedido_resposta",
    "navegacao_app",
    "personalizacao",
    "estrategia_estudo",
    "desabafo",
    "outro",
)
DIFICULDADES = ("nenhuma", "alguma", "travado")
ORIGENS = ("modelo", "regra", "reserva")

MAX_ASSUNTO = 120
MAX_CONCEITOS = 5
DIAS = 395
DIAS_PESQUISA = 730


def _lista(valores: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in valores)


TABELA = f"""
CREATE TABLE IF NOT EXISTS public.chat_guia_registros (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aluno_id    uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  classe_id   bigint NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  topico_id   bigint REFERENCES public.topicos(id) ON DELETE SET NULL,
  conteudo_id bigint REFERENCES public.conteudos(id) ON DELETE SET NULL,
  escopo      text NOT NULL,
  intencao    text NOT NULL CHECK (intencao IN ({_lista(INTENCOES)})),
  assunto     text CHECK (assunto IS NULL OR char_length(assunto) BETWEEN 1 AND {MAX_ASSUNTO}),
  conceitos   text[] NOT NULL DEFAULT '{{}}' CHECK (cardinality(conceitos) <= {MAX_CONCEITOS}),
  dificuldade text NOT NULL DEFAULT 'nenhuma' CHECK (dificuldade IN ({_lista(DIFICULDADES)})),
  origem      text NOT NULL CHECK (origem IN ({_lista(ORIGENS)})),
  guardrail   boolean NOT NULL DEFAULT false,
  versao      text NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_chat_guia_registros_aluno
  ON public.chat_guia_registros (aluno_id, classe_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS ix_chat_guia_registros_turma
  ON public.chat_guia_registros (classe_id, topico_id, criado_em DESC);

COMMENT ON TABLE public.chat_guia_registros IS
  'O que cada pergunta ao Guia era (intencao, assunto, conceitos, dificuldade), mascarado, sem o texto '
  'do aluno (20261118_01). Grava so a API; le o aluno (a propria) e o professor (as turmas dele).';
COMMENT ON COLUMN public.chat_guia_registros.assunto IS
  'Tema em termos da materia, escrito pelo modelo e passado pelo mascarador da API. Nunca a frase do aluno.';
COMMENT ON COLUMN public.chat_guia_registros.guardrail IS
  'Alguma guarda do chat (vazamento de gabarito, grounding) interveio nesta resposta.';
"""

RLS = """
ALTER TABLE public.chat_guia_registros ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.chat_guia_registros FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.chat_guia_registros TO authenticated;
GRANT ALL ON TABLE public.chat_guia_registros TO service_role;

DROP POLICY IF EXISTS chat_guia_registros_sel ON public.chat_guia_registros;
CREATE POLICY chat_guia_registros_sel ON public.chat_guia_registros
  FOR SELECT TO authenticated
  USING (aluno_id = auth.uid() OR classe_id IN (SELECT public.app_classes_do_professor()));
"""

VIEWS = """
CREATE OR REPLACE VIEW public.vw_chat_guia_aluno_topico
WITH (security_invoker = on) AS
WITH conversa AS (
  SELECT r.classe_id,
         r.aluno_id,
         r.topico_id,
         count(*)                                                    AS perguntas,
         count(*) FILTER (WHERE r.intencao = 'duvida_materia')       AS duvidas_materia,
         count(*) FILTER (WHERE r.intencao = 'pedido_resposta')      AS pedidos_resposta,
         count(*) FILTER (WHERE r.dificuldade <> 'nenhuma')          AS com_dificuldade,
         count(*) FILTER (WHERE r.dificuldade = 'travado')           AS travado,
         min(r.criado_em)                                            AS primeira_em,
         max(r.criado_em)                                            AS ultima_em
    FROM public.chat_guia_registros r
   WHERE r.topico_id IS NOT NULL
   GROUP BY r.classe_id, r.aluno_id, r.topico_id
)
SELECT c.classe_id,
       c.aluno_id,
       c.topico_id,
       c.perguntas,
       c.duvidas_materia,
       c.pedidos_resposta,
       c.com_dificuldade,
       c.travado,
       c.primeira_em,
       c.ultima_em,
       t.tentativas_antes,
       t.acerto_antes_pct,
       t.tentativas_depois,
       t.acerto_depois_pct
  FROM conversa c
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE x.respondida_em < c.primeira_em)                 AS tentativas_antes,
           round(avg(x.acertos_percentual) FILTER (WHERE x.respondida_em < c.primeira_em), 1)
                                                                                    AS acerto_antes_pct,
           count(*) FILTER (WHERE x.respondida_em >= c.primeira_em)                AS tentativas_depois,
           round(avg(x.acertos_percentual) FILTER (WHERE x.respondida_em >= c.primeira_em), 1)
                                                                                    AS acerto_depois_pct
      FROM public.atividade_tentativas x
      JOIN public.atividades a ON a.id = x.atividade_id
     WHERE x.aluno_id = c.aluno_id
       AND x.classe_id = c.classe_id
       AND a.topico_id = c.topico_id
       AND x.respondida_em IS NOT NULL
       AND x.acertos_percentual IS NOT NULL
  ) t ON true;

COMMENT ON VIEW public.vw_chat_guia_aluno_topico IS
  'Por aluno x topico: perguntas ao Guia e acerto nas atividades antes e depois da 1a conversa. '
  'Antes/depois e coincidencia no tempo, nao efeito do chat (20261118_01).';

CREATE OR REPLACE VIEW public.vw_chat_guia_conceitos_turma
WITH (security_invoker = on) AS
SELECT r.classe_id,
       r.topico_id,
       lower(c.conceito)                                                     AS conceito,
       count(*)                                                              AS mencoes,
       count(DISTINCT r.aluno_id)                                            AS alunos,
       count(DISTINCT r.aluno_id) FILTER (WHERE r.dificuldade <> 'nenhuma')  AS alunos_com_dificuldade,
       max(r.criado_em)                                                      AS ultima_em
  FROM public.chat_guia_registros r
 CROSS JOIN LATERAL unnest(r.conceitos) AS c(conceito)
 GROUP BY r.classe_id, r.topico_id, lower(c.conceito);

COMMENT ON VIEW public.vw_chat_guia_conceitos_turma IS
  'Conceitos que aparecem nas perguntas ao Guia, por turma x topico: a dificuldade da sala (20261118_01).';

CREATE OR REPLACE VIEW public.vw_chat_guia_turma_topico
WITH (security_invoker = on) AS
SELECT r.classe_id,
       r.topico_id,
       count(*)                                                             AS perguntas,
       count(DISTINCT r.aluno_id)                                           AS alunos,
       count(*) FILTER (WHERE r.intencao = 'duvida_materia')                AS duvidas_materia,
       count(*) FILTER (WHERE r.intencao = 'pedido_resposta')               AS pedidos_resposta,
       count(*) FILTER (WHERE r.intencao = 'navegacao_app')                 AS navegacao_app,
       count(DISTINCT r.aluno_id) FILTER (WHERE r.dificuldade <> 'nenhuma') AS alunos_com_dificuldade,
       count(DISTINCT r.aluno_id) FILTER (WHERE r.dificuldade = 'travado')  AS alunos_travados,
       max(r.criado_em)                                                     AS ultima_em
  FROM public.chat_guia_registros r
 GROUP BY r.classe_id, r.topico_id;

COMMENT ON VIEW public.vw_chat_guia_turma_topico IS
  'Resumo das perguntas ao Guia por turma x topico (20261118_01).';

REVOKE ALL ON public.vw_chat_guia_aluno_topico, public.vw_chat_guia_conceitos_turma,
              public.vw_chat_guia_turma_topico FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.vw_chat_guia_aluno_topico, public.vw_chat_guia_conceitos_turma,
                public.vw_chat_guia_turma_topico TO authenticated, service_role;
"""

RETENCAO = f"""
INSERT INTO public.retencao_politica
  (tabela, acao, coluna_aluno, coluna_tempo, dias, dias_pesquisa, ordem, categoria, motivo)
VALUES
  ('chat_guia_registros', 'apagar', 'aluno_id', 'criado_em', {DIAS}, {DIAS_PESQUISA}, 88, 'chat_derivado',
   'o que cada pergunta ao Guia era, mascarado e sem o texto do aluno; prazo da telemetria derivada')
ON CONFLICT (tabela, acao) DO NOTHING;
"""


def upgrade() -> None:
    op.execute(TABELA)
    op.execute(RLS)
    op.execute(VIEWS)
    op.execute(RETENCAO)


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS public.vw_chat_guia_turma_topico")
    op.execute("DROP VIEW IF EXISTS public.vw_chat_guia_conceitos_turma")
    op.execute("DROP VIEW IF EXISTS public.vw_chat_guia_aluno_topico")
    op.execute("DELETE FROM public.retencao_politica WHERE tabela = 'chat_guia_registros'")
    op.execute("DROP TABLE IF EXISTS public.chat_guia_registros")
