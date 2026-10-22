"""#191: a resposta do flashcard sai da coluna `descricao`

Issue #191, decidida em 22/10. Ela deixava três perguntas em aberto; as duas primeiras eram
respondíveis por medição, e foram medidas antes de decidir:

| pergunta | resposta medida |
| --- | --- |
| qual lado é a fonte? | **`metadata.frente`/`verso`** — `TrailupApiProvider.ts:447` lê o metadata primeiro e só cai em `titulo`/`descricao` como reserva |
| quem duplica? | `artefatos_personalizados.py` e `personalizacao.py`: quando o gerador entrega só `frente`/`verso`, os dois copiavam para as colunas |
| as linhas já gravadas | **5 hoje** (a issue media 135; a base foi limpa), e **todas as 5** com `descricao = metadata->>'verso'` |

## A decisão

`titulo` **continua com a pergunta** — ali o nome não engana, serve de rótulo em listagem e é a
reserva que o cliente já usa. `descricao` **deixa de carregar a resposta**: só guarda texto
quando o gerador mandar algo que não seja o verso.

Vazio, e não `NULL`, porque `cards_personalizados.descricao` é `NOT NULL` (medido). Dito por
inteiro, porque é o lado fraco desta escolha: string vazia em coluna obrigatória é um cheiro, e
alguém pode "consertar" isso um dia preenchendo de volta com o verso. O comentário no escritor e
este docstring existem para que essa pessoa saiba o que está desfazendo.

## Por que isso não é só arrumação

A armadilha é semântica. Um campo chamado `descricao` com conteúdo de resposta convida qualquer
consumidor novo a mostrá-lo como legenda — e foi exatamente assim que o flashcard entregou a
resposta na frente (#190). Corrigir a renderização resolveu aquele consumidor; tirar a resposta
do campo mal-nomeado é o que evita o próximo.

O par desta migration é o código: `app/repositories/artefatos_personalizados.py` (persistência)
e `app/services/personalizacao.py` (payload em memória, que vai na resposta da API). Os dois
duplicavam, e consertar só um deixaria a resposta vazando pelo outro.

## O que esta migration faz

Normaliza as 5 linhas que já estão gravadas, com o predicado exato: só onde `descricao` é
**igual** ao verso. Linha com descrição própria — se existir — fica intocada.

Não mexe em `metadata`: a resposta continua lá, que é a fonte. Nenhum dado é perdido.

## Downgrade

Devolve o verso para `descricao` nas linhas em que ela está vazia e o metadata tem verso. É
reversão fiel, e reabre a armadilha — dito aqui porque quem reverter precisa saber que está
devolvendo a resposta a um campo com nome de legenda.

Revision ID: 20261022_01
Revises: 20261021_28
Create Date: 2026-10-22
"""

from alembic import op

revision = "20261022_01"
down_revision = "20261021_28"
branch_labels = None
depends_on = None


NORMALIZA = """
UPDATE public.cards_personalizados
   SET descricao = '',
       atualizado_em = now()
 WHERE descricao IS NOT NULL
   AND descricao <> ''
   AND descricao = metadata->>'verso';
"""


def upgrade() -> None:
    op.execute(NORMALIZA)


def downgrade() -> None:
    # Reversão fiel, e ela REABRE a armadilha da #191: a resposta volta para um campo chamado
    # `descricao`. Só preenche onde está vazia e o metadata tem verso, para não inventar texto.
    op.execute(
        """
        UPDATE public.cards_personalizados
           SET descricao = metadata->>'verso',
               atualizado_em = now()
         WHERE COALESCE(descricao, '') = ''
           AND COALESCE(metadata->>'verso', '') <> '';
        """
    )
