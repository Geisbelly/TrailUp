"""o professor define o ganho em moedas; o banco aplica

`eventos_pontuacao` ja decidia quantos pontos vale cada evento. Ganha `moedas`
ao lado, porque XP e moeda medem coisas diferentes: XP e' esforco acumulado e
precisa ser monotonico; moeda e' o que se gasta. Ter valor proprio permite
pagar moeda por algo que nao vale XP, e o contrario.

`atividade_revisada` paga zero de proposito. Sao 86 eventos desse tipo num
unico aluno de demonstracao -- a 1 moeda cada, revisar seria a melhor fonte de
renda do sistema, e a estrategia dominante viraria reabrir a mesma atividade.

Revision ID: 20260912_02
Revises: 20260912_01
Create Date: 2026-09-12
"""

from alembic import op

revision = "20260912_02"
down_revision = "20260912_01"
branch_labels = None
depends_on = None


# tipo -> moedas. Semente, nao dogma: a tabela existe para ser ajustada sem
# migracao nova, e o professor sobrepoe por turma.
MOEDAS: dict[str, int] = {
    "conteudo_concluido": 2,
    "atividade_concluida": 3,
    "atividade_acertada": 1,
    # Errar faz parte de aprender: o saldo nao anda para tras.
    "atividade_errada": 0,
    # Zero de proposito: ver o cabecalho.
    "atividade_revisada": 0,
    # Abrir nao e' esforco.
    "topico_aberto": 0,
    "topico_iniciado": 0,
    "topico_pular_conteudo": 0,
    "conteudo_aberto": 0,
    "atividade_iniciada": 0,
    # O ciclo e' da IA, nao do aluno.
    "ciclo_iniciado": 0,
    "ciclo_executado": 0,
}


def _linhas_seed() -> str:
    return ",\n".join(f"    ('{tipo}', {moedas})" for tipo, moedas in MOEDAS.items())


COLUNA = f"""
ALTER TABLE public.eventos_pontuacao
  ADD COLUMN IF NOT EXISTS moedas numeric NOT NULL DEFAULT 0;

ALTER TABLE public.eventos_pontuacao
  DROP CONSTRAINT IF EXISTS eventos_pontuacao_moedas_check;

ALTER TABLE public.eventos_pontuacao
  ADD CONSTRAINT eventos_pontuacao_moedas_check CHECK (moedas >= 0);

INSERT INTO public.eventos_pontuacao (tipo, moedas)
VALUES
{_linhas_seed()}
ON CONFLICT (tipo) DO UPDATE SET moedas = EXCLUDED.moedas;
"""


OVERRIDE = """
CREATE TABLE IF NOT EXISTS public.eventos_pontuacao_classe (
  classe_id  bigint  NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  tipo       text    NOT NULL,
  pontos     numeric NULL CHECK (pontos >= 0),
  moedas     numeric NULL CHECK (moedas >= 0),
  PRIMARY KEY (classe_id, tipo)
);

COMMENT ON TABLE public.eventos_pontuacao_classe IS
  'Sobreposicao por turma de eventos_pontuacao. NULL herda o valor global.';

ALTER TABLE public.eventos_pontuacao_classe ENABLE ROW LEVEL SECURITY;

-- O aluno precisa ver quanto cada acao rende na turma dele.
DROP POLICY IF EXISTS eventos_pontuacao_classe_sel ON public.eventos_pontuacao_classe;
CREATE POLICY eventos_pontuacao_classe_sel ON public.eventos_pontuacao_classe
  FOR SELECT TO authenticated
  USING (true);

-- Escrita e' do professor, e so' nas classes dele -- quem recorta e' a policy
-- abaixo, nao o GRANT. Pelo console, nao pela API.
REVOKE INSERT, UPDATE, DELETE ON public.eventos_pontuacao_classe FROM anon;
GRANT INSERT, UPDATE, DELETE ON public.eventos_pontuacao_classe TO authenticated;

DROP POLICY IF EXISTS eventos_pontuacao_classe_professor
  ON public.eventos_pontuacao_classe;
CREATE POLICY eventos_pontuacao_classe_professor ON public.eventos_pontuacao_classe
  FOR ALL TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()))
  WITH CHECK (classe_id IN (SELECT public.app_classes_do_professor()));
"""


GATILHO = """
CREATE OR REPLACE FUNCTION public.fn_moedas_do_evento(
  p_tipo      text,
  p_classe_id bigint
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_moedas_classe numeric;
  v_moedas_global numeric;
BEGIN
  IF p_classe_id IS NOT NULL THEN
    SELECT moedas INTO v_moedas_classe
      FROM public.eventos_pontuacao_classe
     WHERE classe_id = p_classe_id AND tipo = p_tipo;
  END IF;

  SELECT moedas INTO v_moedas_global
    FROM public.eventos_pontuacao
   WHERE tipo = p_tipo;

  -- Tipo desconhecido vale zero, nao e' recusado: recusar quebraria o fluxo do
  -- aluno na cara dele se algum cliente emitisse um tipo novo.
  RETURN COALESCE(v_moedas_classe, v_moedas_global, 0);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_paga_moeda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_classe_id bigint;
  v_moedas    numeric;
BEGIN
  IF NEW.aluno_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_classe_id := public.fn_eventos_aluno_resolve_classe_id(NEW.tipo, NEW.referencia);
  v_moedas := public.fn_moedas_do_evento(NEW.tipo, v_classe_id);

  IF v_moedas <= 0 THEN
    RETURN NEW;
  END IF;

  -- O predicado do indice parcial precisa ser repetido no ON CONFLICT, senao o
  -- Postgres nao casa o indice e levanta "no unique or exclusion constraint
  -- matching".
  INSERT INTO public.moedas_ledger
    (aluno_id, delta, motivo, evento_tipo, referencia, classe_id)
  VALUES
    (NEW.aluno_id, v_moedas, 'evento', NEW.tipo, NEW.referencia, v_classe_id)
  ON CONFLICT (aluno_id, evento_tipo, referencia) WHERE motivo = 'evento'
  DO NOTHING;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_eventos_aluno_paga_moeda ON public.eventos_aluno;
CREATE TRIGGER trg_eventos_aluno_paga_moeda
  AFTER INSERT ON public.eventos_aluno
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_eventos_aluno_paga_moeda();
"""


def upgrade() -> None:
    op.execute(COLUNA)
    op.execute(OVERRIDE)
    op.execute(GATILHO)


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS trg_eventos_aluno_paga_moeda ON public.eventos_aluno;"
    )
    op.execute("DROP TABLE IF EXISTS public.eventos_pontuacao_classe CASCADE;")
    op.execute("ALTER TABLE public.eventos_pontuacao DROP COLUMN IF EXISTS moedas;")
