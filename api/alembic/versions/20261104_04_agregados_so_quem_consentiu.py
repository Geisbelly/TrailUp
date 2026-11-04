"""Agregados da pesquisa só com quem consentiu pesquisa (#17, critério 5).

Decisão de 04/11: quem não consentiu pesquisa fica **fora dos agregados analíticos**. A ingestão não
muda — a personalização do próprio aluno depende dela. Até aqui, nenhum agregado lia o
consentimento: o estudo usava todo o `classe_aluno` pareado.

Os dois agregados de pesquisa passam a filtrar a população por `vw_alunos_pesquisa_elegiveis`, a
porta única para dado de aluno em pesquisa (`20261024_02`):

- `estudo_indicadores_janela` (o CTE `pareados`), que alimenta `metricas_estudo_coortes` — pré/pós,
  série semanal e lotes por plataforma;
- `metricas_perfil_formato` (o CTE `alunos`), o `pr3.*`.

E as duas RPCs passam a dizer isso em `definicoes.populacao`.

**Fora, de propósito:** `metricas_engajamento_turma`, `metricas_engajamento_coortes_turma` e as
views por aluno são o painel do professor sobre os próprios alunos, não relatório analítico
(decisão 4 da #17). Mudar a população ali faria o professor ver números que não batem com a lista da
turma.

Efeito esperado: `pareados` (e `alunos`) caem para quem consentiu, e a supressão abaixo de
`n_minimo` passa a valer sobre esse número menor. Isso muda a população do TCC — foi a decisão.

Mesmo padrão da `20261102_25`: lê o texto da função da migration que a criou e troca só o trecho;
se o trecho mudou de forma, a migration falha em vez de aplicar algo diferente do revisado.

Revision ID: 20261104_04
Revises: 20261104_03
Create Date: 2026-11-04
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261104_04"
down_revision = "20261104_03"
branch_labels = None
depends_on = None

AQUI = Path(__file__).resolve()

FILTRO = "EXISTS (SELECT 1 FROM public.vw_alunos_pesquisa_elegiveis el WHERE el.aluno_id = ca.aluno_id)"

INICIO_JANELA = "CREATE OR REPLACE FUNCTION public.estudo_indicadores_janela("
FIM_FUNCAO = "$fn$;"

TROCAS_JANELA = (
    (
        "   WHERE ca.classe_id = p_classe_id\n     AND ca.aluno_id IS NOT NULL\n",
        f"   WHERE ca.classe_id = p_classe_id\n     AND ca.aluno_id IS NOT NULL\n     AND {FILTRO}\n",
    ),
)

TROCAS_ESTUDO = (
    (
        "      'populacao', 'pareados, matriculados antes do corte (intencao de tratar)',\n",
        "      'populacao', 'pareados com consentimento de pesquisa vigente (vw_alunos_pesquisa_elegiveis),"
        " matriculados antes do corte (intencao de tratar)',\n",
    ),
)

TROCAS_PERFIL_FORMATO = (
    (
        "      JOIN turmas t ON t.id = ca.classe_id\n     WHERE ca.aluno_id IS NOT NULL\n",
        f"      JOIN turmas t ON t.id = ca.classe_id\n     WHERE ca.aluno_id IS NOT NULL\n       AND {FILTRO}\n",
    ),
    (
        "      'populacao', 'alunos matriculados nas turmas; sem aluno_perfil fica fora e conta em sem_perfil',\n",
        "      'populacao', 'alunos matriculados nas turmas com consentimento de pesquisa vigente"
        " (vw_alunos_pesquisa_elegiveis); sem aluno_perfil fica fora e conta em sem_perfil',\n",
    ),
)


def _load(nome: str):
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}_para_04_04", AQUI.with_name(nome))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _trocar(texto: str, trocas: tuple[tuple[str, str], ...], nome: str) -> str:
    for antigo, novo in trocas:
        if texto.count(antigo) != 1:
            raise RuntimeError(f"{nome} mudou de forma desde a migration que a criou; revise a 20261104_04")
        texto = texto.replace(antigo, novo)
    return texto


def janela_anterior() -> str:
    texto = _load("20261102_03_metricas_estudo_coortes.py").INTERNAS
    a = texto.index(INICIO_JANELA)
    return texto[a : texto.index(FIM_FUNCAO, a) + len(FIM_FUNCAO)]


def estudo_anterior() -> str:
    return _load("20261102_03_metricas_estudo_coortes.py").RPC


def perfil_formato_anterior() -> str:
    return _load("20261102_26_metricas_perfil_formato.py").RPC


def upgrade() -> None:
    op.execute(_trocar(janela_anterior(), TROCAS_JANELA, "estudo_indicadores_janela"))
    op.execute(_trocar(estudo_anterior(), TROCAS_ESTUDO, "metricas_estudo_coortes"))
    op.execute(_trocar(perfil_formato_anterior(), TROCAS_PERFIL_FORMATO, "metricas_perfil_formato"))


def downgrade() -> None:
    op.execute(janela_anterior())
    op.execute(estudo_anterior())
    op.execute(perfil_formato_anterior())
