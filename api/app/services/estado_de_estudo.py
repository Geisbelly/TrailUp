"""Estado de estudo do ciclo: o que entra em `aluno_mental_state_history` (DAT-45).

A tabela guarda, a cada ciclo de análise, um estado que o sistema consegue observar no estudo,
e não uma emoção. A telemetria mede engajamento comportamental, não emoção (DAT-45, DAT-04),
e a "emoção" do pipeline é uma regra fixa sobre eventos de erro. Gravá-la como ansiedade ou
frustração faria a intervenção dizer ao professor algo que ninguém mediu.

Os estados, do mais forte para o mais fraco (um por ciclo):

- `abandono`: o aluno abriu uma atividade e saiu sem concluí-la (`abandono_atividade`, que o
  lote deriva do timeout sem `activity_complete`);
- `dificuldade`: acerto médio baixo nas atividades concluídas do tópico (a mesma regra da
  camada 0 da sugestão, DAT-21) ou erros seguidos no lote (`erro_recorrente`);
- `sem_alerta`: nenhum dos dois.

`sem_alerta` também é gravado: a recorrência é "3 dos últimos 5 ciclos", e sem ele a janela
pularia os ciclos sem problema e juntaria alertas de semanas diferentes.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from app.schemas.common import Evento
from app.services.sugestao_material import _em_dificuldade

ABANDONO = "abandono"
DIFICULDADE = "dificuldade"
SEM_ALERTA = "sem_alerta"

# Os que contam para a recorrência (`memoria_aluno`) e viram intervenção.
KINDS_DE_ALERTA = frozenset({ABANDONO, DIFICULDADE})


def estado_do_ciclo(
    *,
    eventos_novos: Iterable[Evento],
    desempenho_topico: dict[str, Any] | None,
) -> dict[str, Any]:
    """Pura. `desempenho_topico` é o de `SugestaoMaterialRepository.desempenho_no_topico`."""
    tipos = [evento.tipo for evento in eventos_novos]
    if "abandono_atividade" in tipos:
        return {"kind": ABANDONO, "reason": "atividade aberta e deixada sem concluir no lote"}
    if _em_dificuldade(desempenho_topico):
        media = desempenho_topico["media_acertos"]
        itens = desempenho_topico["itens"]
        return {
            "kind": DIFICULDADE,
            "reason": f"acerto médio de {media:g}% em {itens} atividades concluídas do tópico",
        }
    if "erro_recorrente" in tipos:
        return {"kind": DIFICULDADE, "reason": "erros seguidos no lote"}
    return {"kind": SEM_ALERTA, "reason": None}
