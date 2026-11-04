"""Rank do evento por tempo de estudo, contado só na janela do evento (#932)

Fase 5 de `docs/superpowers/specs/2026-11-03-inscricao-em-evento-e-rank-do-evento-design.md` (D4).
A `20261104_01` deixou `tempo` de fora dos critérios do rank do evento porque a view lia
`classe_aluno."tempoGastoMin"`, que é o tempo da matrícula inteira. Num rank de evento isso mostraria o
tempo da vida toda na turma, não o tempo gasto durante o evento.

## O que muda

- **`tempo_por_rank`**, uma CTE nova em `vw_rank_posicoes_por_classe_todas`. Ela só vale para rank
  de evento com critério `tempo`. Conta o tempo ativo em minutos dentro da janela do rank
  (`captured_at` em `[inicio, fim)`). A conta é a de `trailup_tempo_telemetria_min`, que grava
  `topico_aluno.tempo_gasto_min`, e daí `classe_aluno."tempoGastoMin"`:
  - **Só o escopo `topic`.** `topic`, `content` e `material` contam o mesmo intervalo, então somar
    escopos multiplicaria o tempo.
  - **A soma das linhas.** Cada lote é o tempo daquele lote, não um acumulado.
  - **Os tópicos da turma** (`topicos.classe_id`), como a matrícula soma, e também
    `e.classe_id = rank.classe_id`. Esse segundo filtro não muda a conta, porque a linha herda a
    turma do tópico, mas é o que deixa o planejador usar o índice por turma e janela (ver Custo).
  - Arredondada em 2 casas.

  Medido em produção em 04/11, as três regras batem:
  - a soma por tópico no escopo `topic` é igual a `topico_aluno.tempo_gasto_min` em 5 de 5 pares;
  - nenhuma linha do escopo `topic` tem `classe_id` diferente da turma do tópico.
- **Rank de turma por `tempo` não muda.** Ele continua lendo `"tempoGastoMin"`, sem janela, como
  antes. A troca vale só para `r.evento_id IS NOT NULL`.
- **`tempo` entra em `eventos_classe_arena_criterios`.** Sem a CTE, um critério que a view não
  conhece cai no `ELSE 0` e zera o rank sem erro. Por isso o CHECK só muda junto com a view.

**Nenhuma função nova na view.** Função chamada nela precisa de EXECUTE para o cliente, foi o 42501
de 29/10. A CTE é só JOIN sobre tabelas, que a `_todas` lê como dona.

**Custo.** A view é lida a cada abertura do ranking. A CTE começa pelos ranks de evento do tipo
`tempo`, então sem nenhum deles a telemetria não é lida. Com eles, a busca é uma por rank, pelo
índice que já existe em produção, `idx_tme_kpis_classe_scope_captura`
`(classe_id, scope, captured_at, aluno_id)`.

Sem o filtro por `e.classe_id`, a busca rodava uma vez por rank × tópico. Um índice parcial novo
também foi medido e ficou pior com vários ranks, por isso não entrou. Números no PR.

O custo cresce com a soma das janelas de todos os ranks de tempo, inclusive os de eventos já
encerrados, que continuam na view. Se um dia pesar, o caminho é congelar o resultado ao encerrar.

## Downgrade

Volta a view da `20261104_01`. Evento com `tempo` já gravado ainda existe depois do downgrade, mas a
view antiga não sabe contá-lo, e o CHECK antigo recusaria essa linha. Por isso o CHECK antigo volta
`NOT VALID`: ele vale para escrita nova e não derruba o downgrade.

Revision ID: 20261104_07
Revises: 20261104_06
Create Date: 2026-11-04
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261104_07"
down_revision = "20261104_06"
branch_labels = None
depends_on = None

CRITERIOS = ("pontuacao", "missoes", "ranqueada", "tempo")


def _load(nome: str):
    path = Path(__file__).with_name(nome)
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}_para_04_07", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _m0401():
    return _load("20261104_01_rank_do_evento.py")


def _troca(texto: str, antigo: str, novo: str, onde: str) -> str:
    if texto.count(antigo) != 1:
        raise RuntimeError(f"{onde}: esperava 1 ocorrência, achei {texto.count(antigo)}")
    return texto.replace(antigo, novo)


def _check(criterios: tuple[str, ...], *, valida: bool = True) -> str:
    lista = ", ".join(f"'{c}'" for c in criterios)
    sufixo = "" if valida else " NOT VALID"
    return (
        "ALTER TABLE public.eventos_classe DROP CONSTRAINT IF EXISTS eventos_classe_arena_criterios;\n"
        "ALTER TABLE public.eventos_classe ADD CONSTRAINT eventos_classe_arena_criterios\n"
        f"  CHECK (arena_criterios <@ ARRAY[{lista}]::text[]){sufixo};\n"
    )


def view_antiga() -> str:
    return _m0401().view_nova()


TEMPO_POR_RANK = """        ), tempo_por_rank AS (
         -- Rank do evento por tempo (#932): tempo ativo na janela, a conta de
         -- trailup_tempo_telemetria_min. Só o escopo 'topic' (os escopos aninham o mesmo intervalo) e
         -- a soma das linhas (cada lote é o tempo daquele lote). Rank de turma não passa por aqui.
         SELECT rj.rank_id,
            e.aluno_id,
            round(sum(e.active_sec) / 60.0, 2) AS pontuacao
           FROM ranks_janela rj
             JOIN rank_tipo rtt ON rtt.id = rj.tipo_id AND rtt.criterio = 'tempo'::text
             JOIN topicos t ON t.classe_id = rj.classe_id
             JOIN telemetria_time_metric_entries e ON e.classe_id = rj.classe_id AND e.topico_id = t.id
                  AND e.scope = 'topic'::text
          WHERE rj.evento_id IS NOT NULL
            AND e.captured_at >= rj.inicio AND (rj.fim IS NULL OR e.captured_at < rj.fim)
          GROUP BY rj.rank_id, e.aluno_id
        ), elo_config AS ("""


def view_nova() -> str:
    sql = _troca(
        view_antiga(),
        "            r.fim AT TIME ZONE 'UTC'::text AS fim_utc,\n            r.evento_id\n           FROM ranks r\n",
        "            r.fim AT TIME ZONE 'UTC'::text AS fim_utc,\n            r.evento_id,\n            r.tipo_id\n"
        "           FROM ranks r\n",
        "ranks_janela",
    )
    sql = _troca(sql, "        ), elo_config AS (", TEMPO_POR_RANK, "tempo_por_rank")
    sql = _troca(
        sql,
        "                    WHEN 'tempo'::text THEN COALESCE(ca.\"tempoGastoMin\", 0::numeric)\n",
        "                    -- Rank do evento conta a janela (#932); o da turma segue com a matrícula inteira.\n"
        "                    WHEN 'tempo'::text THEN CASE WHEN r.evento_id IS NULL\n"
        "                        THEN COALESCE(ca.\"tempoGastoMin\", 0::numeric)\n"
        "                        ELSE COALESCE(tpr.pontuacao, 0::numeric) END\n",
        "CASE do tempo",
    )
    return _troca(
        sql,
        "             LEFT JOIN missoes_por_rank mpr ON mpr.rank_id = r.id AND mpr.aluno_id = ca.aluno_id\n",
        "             LEFT JOIN missoes_por_rank mpr ON mpr.rank_id = r.id AND mpr.aluno_id = ca.aluno_id\n"
        "             LEFT JOIN tempo_por_rank tpr ON tpr.rank_id = r.id AND tpr.aluno_id = ca.aluno_id\n",
        "LEFT JOIN do tempo",
    )


COMENTARIO = """
COMMENT ON COLUMN public.eventos_classe.arena_criterios IS
  'Critérios do rank do evento (#155, #932): pontuacao, missoes, ranqueada e tempo, os que respeitam a '
  'janela. Vazio = ranqueada. Congela ao abrir.';
"""


COMENTARIO_ANTIGO = """
COMMENT ON COLUMN public.eventos_classe.arena_criterios IS
  'Critérios do rank do evento (#155, D4): só os que respeitam a janela. Vazio com a peça arena '
  'vale ranqueada. Congelam ao abrir.';
"""


def upgrade() -> None:
    op.execute(view_nova())
    op.execute(_check(CRITERIOS))
    op.execute(COMENTARIO)


def downgrade() -> None:
    op.execute(_check(_m0401().CRITERIOS, valida=False))
    op.execute(COMENTARIO_ANTIGO)
    op.execute(view_antiga())
