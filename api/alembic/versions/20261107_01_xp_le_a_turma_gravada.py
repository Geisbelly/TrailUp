"""Somas de XP leem a turma gravada no evento, em vez de resolvê-la de novo linha por linha

## O que estava errado

`aluno_faixa_xp`, `fn_xp_da_matricula` e `professor_notas_da_turma` filtravam a turma com
`COALESCE(ea.classe_id, fn_eventos_aluno_resolve_classe_id(ea.tipo, ea.referencia))`. A função de
resolução é SQL com sete `LEFT JOIN` e `SET search_path`, então não é inlinada: roda uma vez por
linha com `classe_id` nulo, a ~0,4 ms cada, e o `COALESCE` impede o índice
`eventos_aluno_classe_aluno_idx (classe_id, aluno_id)`.

Medido em produção em 07/11, só leitura: 1057 dos 1223 eventos têm `classe_id` nulo, e a soma da
faixa levava **486 ms** no servidor (`EXPLAIN ANALYZE`, varredura sequencial). Com
`ea.classe_id = p_classe_id`, **4,7 ms** pelo índice. `aluno_faixa_xp` era 6,9% do tempo do banco
(1001 chamadas desde 06/11), e `fn_xp_da_matricula` levava 547 ms. Nos picos de saturação de 06 e
07/11 isso entrava na fila com todo o resto e estourava os 8 s do `authenticated`.

## Por que a turma gravada basta

`trg_eventos_aluno_valor_do_banco` (`20261021_06`) resolve a turma **uma vez, no INSERT**, ignora o
que o cliente mandar e congela a coluna no UPDATE. Resolver de novo na leitura só muda algo para
linha com `classe_id` nulo cuja referência passou a existir depois, e isso não acontece:

- conferido em produção em 07/11: das 1057 linhas com `classe_id` nulo, **nenhuma** resolve para
  turma hoje, e a soma com e sem a resolução dá o mesmo valor;
- evento com referência e sem turma já nasce com valor 0 (mesmo gatilho), então resolvê-lo depois
  não traria ponto nenhum, e só abriria a porta para uma referência inventada passar a valer quando
  um id futuro existir.

O ranking (`vw_rank_posicoes_por_classe_todas`) continua com a resolução por JOIN, em conjunto, que
é barata. Pelo motivo acima, as duas contas dão o mesmo resultado.

## Fora daqui

`evento_classe_durante`, `fn_evento_classe_apurar`, `painel_tecnico` e o critério `acertos` de
`economia_avaliar_metas_de` também chamam a resolução por linha. Ficam para outra mudança: não
estavam entre as caras no perfil de 07/11.

## Downgrade

Volta as três funções da `20261103_15`.

Revision ID: 20261107_01
Revises: 20261106_07
Create Date: 2026-11-07
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261107_01"
down_revision = "20261106_07"
branch_labels = None
depends_on = None

RESOLVE = "COALESCE(ea.classe_id, public.fn_eventos_aluno_resolve_classe_id(ea.tipo, ea.referencia))"
NOTA = "-- A turma gravada no INSERT (`20261107_01`): resolver aqui rodava uma consulta por linha.\n"


def _load(nome: str):
    path = Path(__file__).with_name(nome)
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _troca(texto: str, antigo: str, novo: str, onde: str) -> str:
    if texto.count(antigo) != 1:
        raise RuntimeError(f"{onde}: esperava 1 ocorrência, achei {texto.count(antigo)}")
    return texto.replace(antigo, novo)


def _sem_resolver(texto: str, recuo: str, fim: str, onde: str) -> str:
    return _troca(
        texto,
        f"{recuo}AND {RESOLVE} = {fim}",
        f"{recuo}{NOTA}{recuo}AND ea.classe_id = {fim}",
        onde,
    )


def _anterior():
    return _load("20261103_15_duelo_fora_do_xp.py")


def xp_antigo() -> str:
    return _anterior().XP_NOVO


def xp_novo() -> str:
    return _sem_resolver(xp_antigo(), "     ", "p_classe\n", "fn_xp_da_matricula")


def faixa_antiga() -> str:
    return _anterior().faixa_nova()


def faixa_nova() -> str:
    return _sem_resolver(faixa_antiga(), "     ", "p_classe_id;", "aluno_faixa_xp")


def notas_antigas() -> str:
    return _anterior().notas_novas()


def notas_novas() -> str:
    return _sem_resolver(notas_antigas(), "       ", "p_classe_id\n", "professor_notas_da_turma")


def upgrade() -> None:
    op.execute(xp_novo())
    op.execute(faixa_nova())
    op.execute(notas_novas())
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(notas_antigas())
    op.execute(faixa_antiga())
    op.execute(xp_antigo())
    op.execute("NOTIFY pgrst, 'reload schema'")
