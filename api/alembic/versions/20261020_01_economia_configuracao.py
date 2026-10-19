"""configuração da economia: preços, tetos, metas e a trilha de auditoria

O professor já decidia quanto cada evento paga (`eventos_pontuacao_classe`) e
os tetos grossos da loja (`loja_config_classe`). Faltava o que a dona do
projeto pediu em cima disso: mínimo e máximo de uma extensão, preço e estoque
por turma, regra por tópico ou atividade, meta com recompensa, e um registro
de quem mudou o quê.

Nada aqui credita moeda nem aplica item. São as tabelas. As funções vêm em
`20261020_02` e `20261020_03`.

Revision ID: 20261020_01
Revises: 20261019_13
Create Date: 2026-10-19
"""

from alembic import op

revision = "20261020_01"
down_revision = "20261019_13"
branch_labels = None
depends_on = None


TEMPO_EXTRA = """
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
      FROM pg_constraint con
     WHERE con.conrelid = 'public.loja_itens'::regclass
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ILIKE '%efeito%'
  LOOP
    EXECUTE format('ALTER TABLE public.loja_itens DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.loja_itens
  ADD CONSTRAINT loja_itens_efeito_check
  CHECK (efeito IN (
    'prazo_extra', 'segunda_chance', 'dica', 'troca_formato', 'tempo_extra'
  ));

INSERT INTO public.loja_itens
  (codigo, nome, descricao, efeito, preco_base, preco_fator, parametros, ordem)
VALUES (
  'tempo_extra',
  'Tempo extra',
  'Soma minutos ao tempo de uma atividade, dentro do mínimo e do máximo definidos pelo professor.',
  'tempo_extra',
  8,
  2,
  '{"minutos": 10}'::jsonb,
  5
)
ON CONFLICT (codigo) DO NOTHING;
"""


COLUNAS = """
ALTER TABLE public.loja_config_classe
  ADD COLUMN IF NOT EXISTS prazo_extensao_min_dias integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS prazo_extensao_max_dias integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tempo_extra_min_minutos integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS tempo_extra_max_minutos integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS tempo_max_por_ativ integer NOT NULL DEFAULT 30;

ALTER TABLE public.loja_config_classe
  DROP CONSTRAINT IF EXISTS loja_config_prazo_extensao_faixa,
  DROP CONSTRAINT IF EXISTS loja_config_tempo_extensao_faixa,
  DROP CONSTRAINT IF EXISTS loja_config_tempo_teto;

ALTER TABLE public.loja_config_classe
  ADD CONSTRAINT loja_config_prazo_extensao_faixa
    CHECK (
      prazo_extensao_min_dias BETWEEN 0 AND 14
      AND prazo_extensao_max_dias BETWEEN 0 AND 14
      AND prazo_extensao_min_dias <= prazo_extensao_max_dias
    ),
  ADD CONSTRAINT loja_config_tempo_extensao_faixa
    CHECK (
      tempo_extra_min_minutos BETWEEN 0 AND 180
      AND tempo_extra_max_minutos BETWEEN 0 AND 180
      AND tempo_extra_min_minutos <= tempo_extra_max_minutos
    ),
  ADD CONSTRAINT loja_config_tempo_teto
    CHECK (tempo_max_por_ativ BETWEEN 0 AND 600 AND tempo_extra_max_minutos <= tempo_max_por_ativ);

COMMENT ON COLUMN public.loja_config_classe.prazo_extensao_min_dias IS
  'Mínimo de dias que UM uso de prazo extra pode somar. O pedido do item é apertado para dentro de [min, max].';
COMMENT ON COLUMN public.loja_config_classe.prazo_extensao_max_dias IS
  'Máximo de dias que UM uso pode somar. O teto acumulado continua em prazo_max_por_ativ e prazo_max_dias_total.';
"""


PRECO = """
CREATE TABLE IF NOT EXISTS public.loja_preco_classe (
  classe_id          bigint  NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  item_codigo        text    NOT NULL REFERENCES public.loja_itens(codigo),
  preco_base         numeric NULL CHECK (preco_base IS NULL OR preco_base > 0),
  estoque            integer NULL CHECK (estoque IS NULL OR estoque >= 0),
  uso_max_por_aluno  integer NULL CHECK (uso_max_por_aluno IS NULL OR uso_max_por_aluno >= 0),
  ativo              boolean NULL,
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (classe_id, item_codigo)
);

COMMENT ON TABLE public.loja_preco_classe IS
  'Sobreposição da turma no catálogo global. NULL herda: preço, estoque (ilimitado), limite de compras e se o item está à venda.';

ALTER TABLE public.loja_preco_classe ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.loja_preco_classe FROM anon, authenticated;
GRANT SELECT ON public.loja_preco_classe TO authenticated;

DROP POLICY IF EXISTS loja_preco_classe_sel ON public.loja_preco_classe;
CREATE POLICY loja_preco_classe_sel ON public.loja_preco_classe
  FOR SELECT TO authenticated
  USING (
    classe_id IN (SELECT public.app_classes_do_aluno())
    OR classe_id IN (SELECT public.app_classes_do_professor())
  );
"""


ESCOPO = """
CREATE TABLE IF NOT EXISTS public.economia_config_escopo (
  id                       bigserial PRIMARY KEY,
  classe_id                bigint  NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  escopo                   text    NOT NULL CHECK (escopo IN ('topico', 'atividade')),
  alvo_id                  bigint  NOT NULL,
  moedas_conclusao         numeric NULL CHECK (moedas_conclusao IS NULL OR moedas_conclusao >= 0),
  moedas_aprovacao         numeric NULL CHECK (moedas_aprovacao IS NULL OR moedas_aprovacao >= 0),
  pontos                   numeric NULL CHECK (pontos IS NULL OR pontos >= 0),
  prazo_extensao_min_dias  integer NULL CHECK (prazo_extensao_min_dias IS NULL OR prazo_extensao_min_dias BETWEEN 0 AND 14),
  prazo_extensao_max_dias  integer NULL CHECK (prazo_extensao_max_dias IS NULL OR prazo_extensao_max_dias BETWEEN 0 AND 14),
  prazo_max_por_ativ       integer NULL CHECK (prazo_max_por_ativ IS NULL OR prazo_max_por_ativ BETWEEN 0 AND 14),
  tempo_extra_min_minutos  integer NULL CHECK (tempo_extra_min_minutos IS NULL OR tempo_extra_min_minutos BETWEEN 0 AND 180),
  tempo_extra_max_minutos  integer NULL CHECK (tempo_extra_max_minutos IS NULL OR tempo_extra_max_minutos BETWEEN 0 AND 180),
  tempo_max_por_ativ       integer NULL CHECK (tempo_max_por_ativ IS NULL OR tempo_max_por_ativ BETWEEN 0 AND 600),
  uso_max_prazo            integer NULL CHECK (uso_max_prazo IS NULL OR uso_max_prazo >= 0),
  uso_max_tempo            integer NULL CHECK (uso_max_tempo IS NULL OR uso_max_tempo >= 0),
  uso_max_retry            integer NULL CHECK (uso_max_retry IS NULL OR uso_max_retry BETWEEN 0 AND 5),
  atualizado_em            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (escopo, alvo_id)
);

COMMENT ON TABLE public.economia_config_escopo IS
  'Regra da trilha (tópico) ou da atividade. NULL herda a turma, que herda o padrão global.';

ALTER TABLE public.economia_config_escopo ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.economia_config_escopo FROM anon, authenticated;
GRANT SELECT ON public.economia_config_escopo TO authenticated;

DROP POLICY IF EXISTS economia_config_escopo_sel ON public.economia_config_escopo;
CREATE POLICY economia_config_escopo_sel ON public.economia_config_escopo
  FOR SELECT TO authenticated
  USING (
    classe_id IN (SELECT public.app_classes_do_aluno())
    OR classe_id IN (SELECT public.app_classes_do_professor())
  );
"""


META = """
CREATE TABLE IF NOT EXISTS public.economia_meta (
  id            bigserial PRIMARY KEY,
  classe_id     bigint  NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  escopo        text    NOT NULL CHECK (escopo IN ('classe', 'topico', 'atividade')),
  alvo_id       bigint  NULL,
  titulo        text    NOT NULL CHECK (char_length(btrim(titulo)) BETWEEN 1 AND 120),
  criterio      text    NOT NULL CHECK (criterio IN (
                    'atividades_concluidas', 'nota_minima', 'acertos', 'presencas'
                  )),
  limiar        numeric NOT NULL CHECK (limiar > 0),
  moedas        numeric NOT NULL DEFAULT 0 CHECK (moedas >= 0),
  pontos        numeric NOT NULL DEFAULT 0 CHECK (pontos >= 0),
  ativa         boolean NOT NULL DEFAULT true,
  criada_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (escopo = 'classe' OR alvo_id IS NOT NULL)
);

COMMENT ON TABLE public.economia_meta IS
  'Meta da turma. O crédito é uma linha no razão (meta_atingida / meta:<id>) e, se houver pontos, um evento creditado.';

CREATE INDEX IF NOT EXISTS economia_meta_classe_idx
  ON public.economia_meta (classe_id) WHERE ativa;

ALTER TABLE public.economia_meta ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.economia_meta FROM anon, authenticated;
GRANT SELECT ON public.economia_meta TO authenticated;

DROP POLICY IF EXISTS economia_meta_sel ON public.economia_meta;
CREATE POLICY economia_meta_sel ON public.economia_meta
  FOR SELECT TO authenticated
  USING (
    classe_id IN (SELECT public.app_classes_do_aluno())
    OR classe_id IN (SELECT public.app_classes_do_professor())
  );
"""


DEV = """
CREATE TABLE IF NOT EXISTS public.plataforma_dev (
  user_id    uuid PRIMARY KEY,
  email      text NULL,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plataforma_dev IS
  'Quem pode ler a auditoria da economia. Nasce vazia: incluir alguém é INSERT do dono do banco, não desta migration.';

ALTER TABLE public.plataforma_dev ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plataforma_dev FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.app_e_dev()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.plataforma_dev d WHERE d.user_id = auth.uid()
  );
$fn$;

REVOKE ALL ON FUNCTION public.app_e_dev() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_e_dev() TO authenticated;
"""


AUDITORIA = """
CREATE TABLE IF NOT EXISTS public.economia_auditoria (
  id           bigserial PRIMARY KEY,
  ocorrido_em  timestamptz NOT NULL DEFAULT now(),
  ator_id      uuid NULL,
  operacao     text NOT NULL,
  entidade     text NOT NULL,
  entidade_id  text NULL,
  classe_id    bigint NULL,
  aluno_id     uuid NULL,
  antes        jsonb NULL,
  depois       jsonb NULL
);

COMMENT ON TABLE public.economia_auditoria IS
  'Trilha append-only das operações econômicas e das mudanças de configuração. A leitura é do painel admin da API; o cliente não tem GRANT.';

CREATE INDEX IF NOT EXISTS economia_auditoria_quando_idx
  ON public.economia_auditoria (ocorrido_em DESC);

ALTER TABLE public.economia_auditoria ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.economia_auditoria FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS economia_auditoria_sel_dev ON public.economia_auditoria;
CREATE POLICY economia_auditoria_sel_dev ON public.economia_auditoria
  FOR SELECT TO authenticated
  USING (public.app_e_dev());

CREATE OR REPLACE FUNCTION public.economia_auditar(
  p_operacao    text,
  p_entidade    text,
  p_entidade_id text,
  p_classe_id   bigint,
  p_aluno_id    uuid,
  p_antes       jsonb,
  p_depois      jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  INSERT INTO public.economia_auditoria
    (ator_id, operacao, entidade, entidade_id, classe_id, aluno_id, antes, depois)
  VALUES
    (auth.uid(), p_operacao, p_entidade, p_entidade_id, p_classe_id, p_aluno_id, p_antes, p_depois);
$fn$;

REVOKE ALL ON FUNCTION public.economia_auditar(text, text, text, bigint, uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
"""


ESCRITA_SO_POR_FUNCAO = """
-- O professor lia e escrevia direto. A escrita passa para as RPCs de
-- 20261020_03, que gravam o antes/depois. A policy de SELECT fica.
REVOKE INSERT, UPDATE, DELETE ON public.loja_config_classe FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.loja_dotacao FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.eventos_pontuacao_classe FROM authenticated;
"""


def upgrade() -> None:
    op.execute(TEMPO_EXTRA)
    op.execute(COLUNAS)
    op.execute(PRECO)
    op.execute(ESCOPO)
    op.execute(META)
    op.execute(DEV)
    op.execute(AUDITORIA)
    op.execute(ESCRITA_SO_POR_FUNCAO)


def downgrade() -> None:
    op.execute("GRANT INSERT, UPDATE, DELETE ON public.eventos_pontuacao_classe TO authenticated;")
    op.execute("GRANT INSERT, UPDATE, DELETE ON public.loja_dotacao TO authenticated;")
    op.execute("GRANT INSERT, UPDATE, DELETE ON public.loja_config_classe TO authenticated;")
    op.execute("DROP FUNCTION IF EXISTS public.economia_auditar(text, text, text, bigint, uuid, jsonb, jsonb);")
    op.execute("DROP TABLE IF EXISTS public.economia_auditoria;")
    op.execute("DROP FUNCTION IF EXISTS public.app_e_dev();")
    op.execute("DROP TABLE IF EXISTS public.plataforma_dev;")
    op.execute("DROP TABLE IF EXISTS public.economia_meta;")
    op.execute("DROP TABLE IF EXISTS public.economia_config_escopo;")
    op.execute("DROP TABLE IF EXISTS public.loja_preco_classe;")
    op.execute(
        """
        ALTER TABLE public.loja_config_classe
          DROP CONSTRAINT IF EXISTS loja_config_prazo_extensao_faixa,
          DROP CONSTRAINT IF EXISTS loja_config_tempo_extensao_faixa,
          DROP CONSTRAINT IF EXISTS loja_config_tempo_teto,
          DROP COLUMN IF EXISTS prazo_extensao_min_dias,
          DROP COLUMN IF EXISTS prazo_extensao_max_dias,
          DROP COLUMN IF EXISTS tempo_extra_min_minutos,
          DROP COLUMN IF EXISTS tempo_extra_max_minutos,
          DROP COLUMN IF EXISTS tempo_max_por_ativ;
        """
    )
    op.execute("DELETE FROM public.loja_itens WHERE codigo = 'tempo_extra';")
    op.execute(
        """
        ALTER TABLE public.loja_itens DROP CONSTRAINT IF EXISTS loja_itens_efeito_check;
        ALTER TABLE public.loja_itens
          ADD CONSTRAINT loja_itens_efeito_check
          CHECK (efeito IN ('prazo_extra', 'segunda_chance', 'dica', 'troca_formato'));
        """
    )
