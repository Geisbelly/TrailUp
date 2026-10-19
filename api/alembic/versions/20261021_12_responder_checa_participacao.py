"""Conserto: solo, dupla e turma podiam ser criados e não podiam ser respondidos

Defeito introduzido pela fase 10 (`20261021_11`) e medido em produção, que está em `_11`:

    formato   guilda_desafio_responder
    guilda    OK
    solo      RECUSADO  (guilda_desafio_sem_permissao)
    dupla     RECUSADO
    turma     RECUSADO

## Por quê

`guilda_desafio_responder` (fase 8) checa permissão por **pertencer à guilda do desafio**:

    AND EXISTS (SELECT 1 FROM guilda_membros gm
                 WHERE gm.guilda_id = d.guilda_id AND gm.aluno_id = auth.uid() ...)

A fase 10 grava `guilda_id = NULL` em solo, dupla e turma — obrigada por
`guilda_desafios_guilda_do_formato`, que é `(formato = 'guilda') = (guilda_id IS NOT NULL)`.
Com `d.guilda_id` nulo, `gm.guilda_id = NULL` nunca é verdade, o `SELECT ... INTO` não acha
linha e a função levanta `guilda_desafio_sem_permissao`.

Resultado: os três formatos novos criam, aparecem no chat, e **ninguém consegue jogar**. A
varredura da fase 8 os encerra como abandonados sem pagar nada a ninguém, porque o pagamento
exige `respondidas > 0`.

Nenhum teste pegou: a fase 10 mediu a CRIAÇÃO dos quatro formatos e o FECHAMENTO, e o
caminho de resposta não tem cliente que o chame — então nada o exercitava de ponta a ponta.

## O conserto, e por que ele é mais correto e não só diferente

A pergunta certa não é "este aluno é da guilda?", é **"este aluno é participante aceito deste
desafio?"** — que é exatamente o que `fn_arena_placar` usa para contar e o que
`fn_desafio_encerrar` usa para pagar. A permissão passa a coincidir com quem o placar conta.

Dois efeitos, os dois desejados:

- **solo, dupla e turma passam a funcionar** — a fase 10 matricula participante em todos os
  quatro formatos;
- **aperta o formato guilda**: antes, qualquer membro da guilda respondia, inclusive quem
  entrou DEPOIS de o desafio ser criado e por isso não está em `desafio_participantes`. O
  elenco é congelado na criação (é o que o placar enxerga), e agora a permissão também.

> `arena_responder` aceita os três formatos novos porque já checa participação — mas não é o
> caminho certo para substituir este: ela não cobra `desafio_tentativas_*` e faz a primeira
> resposta ser final (`ON CONFLICT DO NOTHING`). Qual dos dois caminhos de resposta fica é
> decisão de desenho, registrada no plano; este conserto não a antecipa.

Revision ID: 20261021_12
Revises: 20261021_11
Create Date: 2026-10-19
"""

from alembic import op

revision = "20261021_12"
down_revision = "20261021_11"
branch_labels = None
depends_on = None


GUARDA_POR_GUILDA = """     AND EXISTS (
       SELECT 1 FROM public.guilda_membros gm
        WHERE gm.guilda_id = d.guilda_id
          AND gm.aluno_id = auth.uid()
          AND gm.left_at IS NULL
     );"""

GUARDA_POR_PARTICIPACAO = """     -- Participacao, nao pertencimento a guilda: `guilda_id` e NULL em solo, dupla e turma
     -- (`guilda_desafios_guilda_do_formato` obriga), e a guarda por guilda recusava os tres.
     -- Esta pergunta e a mesma que `fn_arena_placar` faz para contar e `fn_desafio_encerrar`
     -- para pagar, entao permissao e placar passam a coincidir.
     AND EXISTS (
       SELECT 1 FROM public.desafio_participantes dp
        WHERE dp.desafio_id = d.id
          AND dp.aluno_id = auth.uid()
          AND dp.estado = 'aceito'
     );"""


def _responder(guarda: str) -> str:
    """`guilda_desafio_responder` como a fase 8 a deixa, trocando só a guarda de permissão.

    Recortada do arquivo da fase 8 em vez de copiada: cópia seria uma segunda fonte da
    verdade, e o downgrade restauraria algo que já não é a fase 8.
    """
    from pathlib import Path

    fase8 = Path(__file__).with_name("20261021_09_o_desafio_fecha_e_paga.py")
    texto = fase8.read_text(encoding="utf-8")
    marca = 'RESPONDER = """\n'
    inicio = texto.index(marca) + len(marca)
    fim = texto.index('\n"""', inicio)
    sql = texto[inicio:fim]

    if "CREATE OR REPLACE FUNCTION public.guilda_desafio_responder(" not in sql:
        raise RuntimeError("o bloco RESPONDER da fase 8 mudou de forma; revise 20261021_12")
    if GUARDA_POR_GUILDA not in sql:
        raise RuntimeError("a guarda de permissao da fase 8 mudou; revise 20261021_12")

    return sql.replace(GUARDA_POR_GUILDA, guarda, 1)


RELOAD = "\nNOTIFY pgrst, 'reload schema';\n"


def upgrade() -> None:
    op.execute(_responder(GUARDA_POR_PARTICIPACAO))
    op.execute(RELOAD)


def downgrade() -> None:
    op.execute(_responder(GUARDA_POR_GUILDA))
    op.execute(RELOAD)
