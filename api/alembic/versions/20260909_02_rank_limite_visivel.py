"""o ranking passa a mostrar so' o topo, mais a linha do proprio aluno

O placar e' o elemento de incentivo mais motivador do estudo que embasa esta
camada (O'Donovan, Gain & Marais, 2013, SAICSIT), com desvio-padrao de 0,65 --
quase consenso. Mas la' ele mostrava os 20 primeiros **mais as estatisticas do
aluno logado**, por duas razoes declaradas: manter a disputa por uma vaga, e
**nao envergonhar a metade de baixo da turma**.

Aqui a lista vinha inteira. Numa turma de 20 adultos, isso e' 19 pessoas vendo
exatamente onde estao em relacao a todo mundo.

**O corte tem que ser no banco.** Cortar na tela seria cosmetico: nome e
pontuacao de todos os colegas continuariam trafegando ate o aparelho e legiveis
em qualquer proxy. A razao do limite e' nao expor quem esta embaixo -- cortar so'
na renderizacao nao entrega isso.

**E tem que ser na view embrulhada, nao na base.** Em
`vw_rank_posicoes_por_classe_todas`, `posicao` sai de um `dense_rank()` e
`progresso` e' normalizado por `MAX(pontuacao) OVER (PARTITION BY rank_id)`. Com
o corte na base, a 14a posicao viraria 100% de progresso.

Tres condicoes, e a terceira nao e' detalhe:

1. `posicao <= limite` -- o topo visivel;
2. `id_aluno = auth.uid()` -- a propria linha, sempre, mesmo fora do corte;
3. classe do professor -- `app_minhas_classes()` serve aluno **e** professor, e o
   console (`RanksSection.tsx`) le a mesma view. Sem esta condicao o professor
   perde a metade de baixo da turma, que e' exatamente a metade que o sinal de
   risco de reprovacao precisa enxergar.

O limite fica em configuracao, nao em constante: no estudo a turma tinha 44
alunos e o corte em 20 escondia ~55% dela; numa turma de 20, um corte em 15
esconde 5 pessoas. A propriedade de "nao envergonhar a metade de baixo" depende
da escala, entao o piloto precisa poder ajustar sem migracao nova.

Sobre `app_config`: `notificacoes_config` ja e' na pratica o armazem de
parametros do app (guarda `sessao_ociosa_min`, `tempo_uso_limiar_min`,
`revisao_pular_se_uso_min`), mas o nome nao comporta uma chave de ranking. Esta
tabela nasce com a mesma forma e a mesma RLS para que as duas possam ser fundidas
depois, sem inventar um terceiro formato.

Revision ID: 20260909_02
Revises: 20260909_01
Create Date: 2026-09-09
"""

from alembic import op

revision = "20260909_02"
down_revision = "20260909_01"
branch_labels = None
depends_on = None


CHAVE_LIMITE = "rank_limite_visivel"
LIMITE_PADRAO = 15

TABELA_CONFIG = f"""
CREATE TABLE IF NOT EXISTS public.app_config (
  chave        text PRIMARY KEY,
  valor        text NOT NULL,
  descricao    text,
  publico      boolean NOT NULL DEFAULT false,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Mesma forma de `notificacoes_config`: leitura so' do que e' publico, e
-- nenhuma policy de escrita -- sem policy, o RLS nega, mesmo com o GRANT que o
-- Supabase concede por padrao.
DROP POLICY IF EXISTS app_config_sel ON public.app_config;
CREATE POLICY app_config_sel ON public.app_config
  FOR SELECT TO anon, authenticated
  USING (publico);

REVOKE INSERT, UPDATE, DELETE ON public.app_config FROM anon, authenticated;

INSERT INTO public.app_config (chave, valor, descricao, publico)
VALUES (
  '{CHAVE_LIMITE}',
  '{LIMITE_PADRAO}',
  'Quantas posicoes o aluno enxerga no ranking da turma. A propria posicao '
  || 'aparece sempre, mesmo fora do corte. O professor ve a turma inteira.',
  true
)
ON CONFLICT (chave) DO NOTHING;
"""

# SECURITY DEFINER para nao depender do flag `publico` continuar ligado: se
# alguem fechar a chave, o corte tem que continuar valendo -- e um limite que
# some nao pode virar "mostra tudo".
FUNCAO_LIMITE = f"""
CREATE OR REPLACE FUNCTION public.app_rank_limite_visivel()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT GREATEST(
    1,
    COALESCE(
      (SELECT NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::int
         FROM public.app_config WHERE chave = '{CHAVE_LIMITE}'),
      {LIMITE_PADRAO}
    )
  );
$fn$;
"""

VIEW_FILTRADA = """
CREATE OR REPLACE VIEW public.vw_rank_posicoes_por_classe AS
 SELECT rank_id,
    classe_id,
    posicao,
    id_aluno,
    nome_aluno,
    pontuacao,
    progresso,
    medalha
   FROM vw_rank_posicoes_por_classe_todas b
  WHERE (classe_id IN ( SELECT app_minhas_classes() AS app_minhas_classes))
    AND (
      posicao <= public.app_rank_limite_visivel()
      OR id_aluno = auth.uid()
      OR classe_id IN ( SELECT app_classes_do_professor() AS app_classes_do_professor)
    );
"""

VIEW_SEM_CORTE = """
CREATE OR REPLACE VIEW public.vw_rank_posicoes_por_classe AS
 SELECT rank_id,
    classe_id,
    posicao,
    id_aluno,
    nome_aluno,
    pontuacao,
    progresso,
    medalha
   FROM vw_rank_posicoes_por_classe_todas b
  WHERE (classe_id IN ( SELECT app_minhas_classes() AS app_minhas_classes));
"""


def upgrade() -> None:
    op.execute(TABELA_CONFIG)
    op.execute(FUNCAO_LIMITE)
    op.execute(VIEW_FILTRADA)


def downgrade() -> None:
    op.execute(VIEW_SEM_CORTE)
    op.execute("DROP FUNCTION IF EXISTS public.app_rank_limite_visivel()")
    # `app_config` fica: derrubar a tabela levaria junto qualquer chave que outra
    # migracao tenha acrescentado depois.
    op.execute(
        f"DELETE FROM public.app_config WHERE chave = '{CHAVE_LIMITE}'"
    )
