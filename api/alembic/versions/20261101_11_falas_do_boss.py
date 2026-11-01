"""Falas do boss geradas em lote, por conteúdo × perfil BrainHex

Hoje todo aluno enfrenta o mesmo inimigo local do app ("Sombra do Tópico",
`DEFAULT_FEATURE_REGISTRY` em `mobile/src/context/IAContext.tsx`), com falas
fixas: entrada, "O boss revidou!", "O encontro está no limite" e a mensagem de
vitória. A imagem de boss por IA saiu (#753) e a arte vem do catálogo do perfil
(#751); o que falta é a voz.

`boss_falas` guarda, para cada conteúdo e perfil, o **nome** do boss e as
**falas** dele (JSONB): entrada, derrota, provocações a cada dano, os marcos de
metade e de um quarto da vida, alerta de tempo, contra-ataque e a mensagem de
vitória do aluno. É a camada "base por perfil" do CLAUDE.md: a mesma linha
serve todos os alunos daquele perfil na turma, sem nada do aluno dentro.

Quem escreve é o worker da fila de personalização (API, `service_role`), numa
chamada ao modelo por tópico × perfil que cobre todos os conteúdos do tópico
(`api/app/services/boss_falas.py`). `source_hash` é o hash do que entrou no
prompt (tópico, conteúdos, perfil, versão das falas): igual, a geração é
pulada. O mobile lê direto do Supabase e sorteia as falas no aparelho, então a
batalha continua falando com a API fora do ar; sem linha, valem as falas fixas.

RLS: só SELECT, para professor dono e aluno matriculado
(`app_minhas_classes()` — o helper evita a recursão por `classe_aluno`).
Nenhuma policy de escrita: cliente nenhum grava aqui. `classe_id` vem
desnormalizado na linha para a policy não precisar de join.

Sem coluna de pessoa: não entra em `retencao_politica`. Sai pela FK com o
conteúdo, o tópico ou a turma.

Nasceu como `20261101_09` (#755), o mesmo número da migration do risco (#752), que já
estava em produção: duas cabeças no Alembic. Renumerada para `_11`, depois da `_10` (#754).

Revision ID: 20261101_11
Revises: 20261101_10
Create Date: 2026-11-01
"""

from alembic import op

revision = "20261101_11"
down_revision = "20261101_10"
branch_labels = None
depends_on = None

POLICY = "boss_falas_minhas_classes_sel"

TABELA = r"""
CREATE TABLE IF NOT EXISTS public.boss_falas (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  classe_id    bigint      NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  topico_id    bigint      NOT NULL REFERENCES public.topicos(id) ON DELETE CASCADE,
  conteudo_id  bigint      NOT NULL REFERENCES public.conteudos(id) ON DELETE CASCADE,
  perfil       text        NOT NULL CHECK (perfil IN (
                 'seeker', 'survivor', 'daredevil', 'mastermind',
                 'conqueror', 'socializer', 'achiever')),
  nome         text        NOT NULL CHECK (char_length(btrim(nome)) BETWEEN 1 AND 60),
  falas        jsonb       NOT NULL CHECK (jsonb_typeof(falas) = 'object'),
  source_hash  text        NOT NULL,
  versao       text        NOT NULL,
  gerado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conteudo_id, perfil)
);

CREATE INDEX IF NOT EXISTS boss_falas_classe_perfil_idx
  ON public.boss_falas (classe_id, perfil);
"""

RLS = rf"""
ALTER TABLE public.boss_falas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.boss_falas FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.boss_falas FROM authenticated;
GRANT SELECT ON public.boss_falas TO authenticated;

DROP POLICY IF EXISTS {POLICY} ON public.boss_falas;
CREATE POLICY {POLICY} ON public.boss_falas
  FOR SELECT TO authenticated
  USING (classe_id IN (SELECT public.app_minhas_classes()));
"""


def upgrade() -> None:
    op.execute(TABELA)
    op.execute(RLS)


def downgrade() -> None:
    op.execute(f"DROP POLICY IF EXISTS {POLICY} ON public.boss_falas")
    op.execute("DROP TABLE IF EXISTS public.boss_falas")
