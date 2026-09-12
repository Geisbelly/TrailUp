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


def upgrade() -> None:
    op.execute(COLUNA)


def downgrade() -> None:
    op.execute("ALTER TABLE public.eventos_pontuacao DROP COLUMN IF EXISTS moedas;")
