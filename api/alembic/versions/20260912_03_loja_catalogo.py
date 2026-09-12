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


CONFIG = """
CREATE TABLE IF NOT EXISTS public.loja_config_classe (
  classe_id            bigint PRIMARY KEY REFERENCES public.classe(id) ON DELETE CASCADE,
  prazo_max_dias_total integer NOT NULL DEFAULT 2 CHECK (prazo_max_dias_total BETWEEN 0 AND 14),
  prazo_max_por_ativ   integer NOT NULL DEFAULT 2 CHECK (prazo_max_por_ativ   BETWEEN 0 AND 14),
  retry_max_por_topico integer NOT NULL DEFAULT 1 CHECK (retry_max_por_topico BETWEEN 0 AND 5),
  itens_desligados     text[]  NOT NULL DEFAULT '{}'::text[],
  atualizado_em        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.loja_config_classe.prazo_max_dias_total IS
  'Teto de prazo extra no semestre. Conta dotacao e compra juntas: o teto e
   sobre quanto prazo e aceitavel, nao sobre quanto o aluno pagou.';

CREATE TABLE IF NOT EXISTS public.loja_dotacao (
  classe_id   bigint  NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  item_codigo text    NOT NULL REFERENCES public.loja_itens(codigo),
  quantidade  integer NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  PRIMARY KEY (classe_id, item_codigo)
);

COMMENT ON TABLE public.loja_dotacao IS
  'Unidades gratuitas por turma. A concessao e derivada, nao materializada na
   matricula: mudar o numero vale para todos na hora, sem linha para migrar.';

ALTER TABLE public.loja_config_classe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loja_dotacao       ENABLE ROW LEVEL SECURITY;

-- O aluno precisa ver o teto e a dotacao da turma dele: a dotacao so' cumpre o
-- papel dela se ele souber que existe ANTES de precisar.
DROP POLICY IF EXISTS loja_config_classe_sel ON public.loja_config_classe;
CREATE POLICY loja_config_classe_sel ON public.loja_config_classe
  FOR SELECT TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_aluno())
         OR classe_id IN (SELECT public.app_classes_do_professor()));

DROP POLICY IF EXISTS loja_dotacao_sel ON public.loja_dotacao;
CREATE POLICY loja_dotacao_sel ON public.loja_dotacao
  FOR SELECT TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_aluno())
         OR classe_id IN (SELECT public.app_classes_do_professor()));

REVOKE INSERT, UPDATE, DELETE ON public.loja_config_classe FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.loja_dotacao       FROM anon;
GRANT  INSERT, UPDATE, DELETE ON public.loja_config_classe TO authenticated;
GRANT  INSERT, UPDATE, DELETE ON public.loja_dotacao       TO authenticated;

DROP POLICY IF EXISTS loja_config_classe_professor ON public.loja_config_classe;
CREATE POLICY loja_config_classe_professor ON public.loja_config_classe
  FOR ALL TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()))
  WITH CHECK (classe_id IN (SELECT public.app_classes_do_professor()));

DROP POLICY IF EXISTS loja_dotacao_professor ON public.loja_dotacao;
CREATE POLICY loja_dotacao_professor ON public.loja_dotacao
  FOR ALL TO authenticated
  USING (classe_id IN (SELECT public.app_classes_do_professor()))
  WITH CHECK (classe_id IN (SELECT public.app_classes_do_professor()));
"""


def upgrade() -> None:
    op.execute(TABELA)
    op.execute(CONFIG)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.loja_dotacao CASCADE;")
    op.execute("DROP TABLE IF EXISTS public.loja_config_classe CASCADE;")
    op.execute("DROP TABLE IF EXISTS public.loja_itens CASCADE;")
