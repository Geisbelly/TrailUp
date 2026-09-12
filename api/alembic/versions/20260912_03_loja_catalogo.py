"""o catalogo da loja, global e ligavel por turma

Preco unico para todo o sistema, decidido de proposito: e' simples de explicar
a 20 adultos, e desconto invisivel por desempenho seria descoberto e lido como
julgamento numa sala em que todos se conhecem.

Quatro itens, tres deles com consequencia academica. O quarto, `troca_formato`,
existe para o aluno ter o que comprar sem apostar nada -- autonomia de escolha
e' o que preserva motivacao intrinseca, porque o dano medido vem da recompensa
percebida como controladora, e um item que o aluno escolhe nao e'.

Nenhum item da vantagem de um aluno SOBRE outro: nada de roubar ponto, pular a
vez ou subir no rank.

`preco_fator` e' o preco crescente -- a n-esima unidade custa
`preco_base * preco_fator^(n-1)`. E' a pratica convergente das politicas de
late days de Tufts, Cornell e UMD, e e' o custo que faz a folga produzir
persistencia.

A dotacao inicial e' igual para todos. Uma economia onde moeda e' proporcional
ao desempenho e os itens de recuperacao custam moeda faz quem esta atras ficar
sem justamente o que o ajudaria. Moeda compra apenas unidades ADICIONAIS.

Revision ID: 20260912_03
Revises: 20260912_02
Create Date: 2026-09-12
"""

from alembic import op

revision = "20260912_03"
down_revision = "20260912_02"
branch_labels = None
depends_on = None


ITENS: dict[str, dict] = {
    "prazo_extra": {
        "nome": "Prazo extra",
        "descricao": "Adia a entrega de uma atividade em 24 horas, sem penalidade.",
        "efeito": "prazo_extra",
        "preco_base": 10,
        # Dobra a cada dia: folga com custo, nao folga de graca.
        "preco_fator": 2,
        "parametros": '{"dias": 1}',
        "ordem": 1,
    },
    "segunda_chance": {
        "nome": "Segunda chance",
        "descricao": "Refaz a atividade valendo nota: 90% da melhor tentativa "
        "mais 10% da pior.",
        "efeito": "segunda_chance",
        "preco_base": 12,
        "preco_fator": 2,
        "parametros": "{}",
        "ordem": 2,
    },
    "dica": {
        "nome": "Dica",
        "descricao": "Explica por que a alternativa errada esta errada. Nao "
        "entrega a resposta.",
        "efeito": "dica",
        "preco_base": 5,
        "preco_fator": 1,
        "parametros": "{}",
        "ordem": 3,
    },
    "troca_formato": {
        "nome": "Trocar formato",
        "descricao": "Escolhe como receber o proximo material: audio, texto ou "
        "slides.",
        "efeito": "troca_formato",
        "preco_base": 4,
        "preco_fator": 1,
        "parametros": "{}",
        "ordem": 4,
    },
}

# Unidades que TODO aluno da turma recebe, de graca. Moeda compra apenas
# unidades adicionais. Some o problema por construcao, sem preco progressivo
# nem subsidio invisivel -- e preco que muda por aluno seria descoberto e lido
# como julgamento numa sala de 20 adultos.
DOTACAO_PADRAO: dict[str, int] = {
    "prazo_extra": 2,
    "segunda_chance": 1,
}


def _linhas_seed() -> str:
    partes = []
    for codigo, item in ITENS.items():
        partes.append(
            "    ("
            f"'{codigo}', "
            f"'{item['nome']}', "
            f"'{item['descricao']}', "
            f"'{item['efeito']}', "
            f"{item['preco_base']}, "
            f"{item['preco_fator']}, "
            f"'{item['parametros']}'::jsonb, "
            f"{item['ordem']}"
            ")"
        )
    return ",\n".join(partes)


TABELA = f"""
CREATE TABLE IF NOT EXISTS public.loja_itens (
  codigo       text PRIMARY KEY,
  nome         text    NOT NULL,
  descricao    text    NOT NULL,
  efeito       text    NOT NULL CHECK (efeito IN
                 ('prazo_extra','segunda_chance','dica','troca_formato')),
  preco_base   numeric NOT NULL CHECK (preco_base > 0),
  preco_fator  numeric NOT NULL DEFAULT 1 CHECK (preco_fator >= 1),
  parametros   jsonb   NOT NULL DEFAULT '{{}}'::jsonb,
  ativo        boolean NOT NULL DEFAULT true,
  ordem        integer NOT NULL DEFAULT 0
);

COMMENT ON COLUMN public.loja_itens.preco_fator IS
  'Preco crescente: a n-esima unidade custa preco_base * preco_fator^(n-1).';

INSERT INTO public.loja_itens
  (codigo, nome, descricao, efeito, preco_base, preco_fator, parametros, ordem)
VALUES
{_linhas_seed()}
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE public.loja_itens ENABLE ROW LEVEL SECURITY;

-- O aluno precisa ver preco e descricao; ninguem escreve pelo cliente.
DROP POLICY IF EXISTS loja_itens_sel ON public.loja_itens;
CREATE POLICY loja_itens_sel ON public.loja_itens
  FOR SELECT TO authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.loja_itens FROM anon, authenticated;
"""


def upgrade() -> None:
    op.execute(TABELA)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.loja_itens CASCADE;")
