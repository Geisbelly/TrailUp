"""A guilda não perde os pontos de quem saiu da turma no meio do evento (#153)

## O bug

A apuração (`fn_evento_classe_apurar`, versão da `20261025_01`) monta o resultado individual a
partir de `classe_aluno` e soma a guilda juntando a cópia congelada (`guilda_evento_snapshot`,
gravada ao abrir) com esse resultado. Quem foi desmatriculado depois de abrir o evento não está mais
em `classe_aluno`, então não ganha linha em `eventos_classe_resultado`, o `LEFT JOIN` da guilda dá
`NULL` e a contribuição dele cai a 0. A guilda perdia pontos que de fato fez, e o professor podia
"derrubar" uma guilda tirando alguém da turma.

## O que muda

Só a soma da guilda. Para cada integrante da cópia congelada:

- **ainda matriculado**: vale a linha de `eventos_classe_resultado`, como antes (mesma soma, mesma
  janela, mesmo filtro de turma e de `evento_classe_pontos`);
- **saiu da turma** (não tem linha de resultado e o `aluno_id` ainda existe): soma os
  `eventos_aluno` dele na janela do evento, na turma do evento, **até a saída**. A hora da saída
  vem de `classe_aluno_saidas.saiu_em` (gravada pelo gatilho `trg_classe_aluno_saida`, `20261024_03`).
  Sem registro de saída (saiu antes de o gatilho existir), vale o fim do evento: depois de sair o
  aluno não registra atividade na turma, então a janela basta.

`membros` continua sendo o tamanho da cópia congelada (quem saiu conta, como já contava).

O resultado individual **não** muda: quem saiu não ganha linha em `eventos_classe_resultado`, nem
moedas, nem os pontos do evento (#141), nem medalha. Prêmio individual de quem não está mais na turma
é decisão de produto que a issue não toma; o que ela pede é que a guilda mantenha os pontos.

Quem volta para a turma antes da apuração está em `classe_aluno` de novo (o gatilho apaga o
registro de saída) e é apurado como matriculado, com a janela inteira.

## Exclusão de conta (LGPD)

Nada muda no que já está definido (`docs/lgpd/README.md`, `20261024_03`/`20261024_07`):

- `guilda_evento_snapshot.aluno_id` é `ON DELETE SET NULL`: a linha fica (a guilda continua com o
  mesmo número de integrantes) e perde o vínculo com a pessoa;
- `eventos_aluno` sai em cascata com a conta.

Por isso, com o evento **aberto**, quem excluiu a conta não contribui mais para a guilda: a atividade
foi apagada a pedido do titular, e a apuração não tem de onde tirá-la (o ramo novo exige
`aluno_id` não nulo). Com o evento **encerrado**, nada é recalculado: a apuração roda uma vez, no
`evento_classe_encerrar` (que exige status `aberto`), e `eventos_classe_resultado_guilda` fica
gravado; excluir a conta depois não altera o total da guilda (teste e2e).

## Downgrade

Volta a apuração da `20261025_01`.

Revision ID: 20261025_03
Revises: 20261025_02
Create Date: 2026-10-25
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261025_03"
down_revision = "20261025_02"
branch_labels = None
depends_on = None


def _load(nome: str):
    path = Path(__file__).with_name(nome)
    spec = importlib.util.spec_from_file_location(nome, path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _troca(texto: str, antigo: str, novo: str, onde: str) -> str:
    if texto.count(antigo) != 1:
        raise RuntimeError(f"o trecho de {onde} mudou de forma; revise a 20261025_03")
    return texto.replace(antigo, novo, 1)


def apuracao_anterior() -> str:
    """`fn_evento_classe_apurar` como a `20261025_01` a deixa (a última que a redefine)."""
    return _load("20261025_01_pontos_do_evento_no_rank.py").apuracao_com_pontos()


SOMA_ANTIGA = """      SELECT s.guilda_id, COALESCE(SUM(r.pontos), 0) AS pontos, COUNT(*)::integer AS membros
      FROM public.guilda_evento_snapshot s
      LEFT JOIN public.eventos_classe_resultado r ON r.evento_id = p_evento_id AND r.aluno_id = s.aluno_id
      WHERE s.evento_id = p_evento_id::text
"""

SOMA_NOVA = """      -- #153: quem saiu da turma depois de abrir não tem linha de resultado; a guilda soma a
      -- atividade dele na janela, na turma do evento, até a saída (`classe_aluno_saidas`).
      SELECT s.guilda_id, COALESCE(SUM(COALESCE(r.pontos, saiu.pontos)), 0) AS pontos,
             COUNT(*)::integer AS membros
      FROM public.guilda_evento_snapshot s
      LEFT JOIN public.eventos_classe_resultado r ON r.evento_id = p_evento_id AND r.aluno_id = s.aluno_id
      LEFT JOIN LATERAL (
        SELECT SUM(ea.valor) AS pontos
        FROM public.eventos_aluno ea
        WHERE r.aluno_id IS NULL
          AND s.aluno_id IS NOT NULL
          AND ea.aluno_id = s.aluno_id
          AND ea.criado_em >= v_evento.inicio
          -- LEAST ignora NULL: sem registro de saída, vale o fim do evento.
          AND ea.criado_em <= LEAST(v_evento.fim, (
                SELECT sa.saiu_em FROM public.classe_aluno_saidas sa
                WHERE sa.classe_id = v_evento.classe_id AND sa.aluno_id = s.aluno_id))
          AND ea.tipo <> 'evento_classe_pontos'
          AND (
            ea.classe_id = v_evento.classe_id
            OR (ea.classe_id IS NULL AND public.fn_eventos_aluno_resolve_classe_id(ea.tipo, ea.referencia) = v_evento.classe_id)
          )
      ) saiu ON true
      WHERE s.evento_id = p_evento_id::text
"""


def apuracao_guilda_mantem_quem_saiu() -> str:
    return _troca(apuracao_anterior(), SOMA_ANTIGA, SOMA_NOVA, "soma da guilda")


def upgrade() -> None:
    op.execute(apuracao_guilda_mantem_quem_saiu())


def downgrade() -> None:
    op.execute(apuracao_anterior())
