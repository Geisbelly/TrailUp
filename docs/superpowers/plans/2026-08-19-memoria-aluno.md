# Memória do aluno (estado mental histórico + domínio por tópico) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a lacuna documentada no `CLAUDE.md` (`aluno_mental_state_history`
write-only) e persistir domínio/dificuldade por tópico pela primeira vez —
disponibilizando os dois via `state["memoria_aluno"]` pros nós de decisão do
grafo, sem mudar nenhuma assinatura de `Protocol` existente.

**Architecture:** Módulo dedicado `api/app/services/memoria_aluno.py`
(`ler_memoria`/`atualizar_memoria`), nova tabela `aluno_topico_dominio`,
propagado via `state` a partir de `build_initial_state`. Ver spec completa em
`docs/superpowers/specs/2026-08-19-memoria-aluno-design.md`.

**Tech Stack:** Python, FastAPI, SQLAlchemy (raw SQL via `text()`), Alembic, Pydantic, pytest, pytest-asyncio.

---

## Task 1: Migração — tabela `aluno_topico_dominio`

**Files:**
- Create: `api/alembic/versions/20260819_01_memoria_aluno.py`
- Test: `api/tests/test_migrations_memoria_aluno.py`

- [ ] **Step 1: Write the failing tests**

Crie `api/tests/test_migrations_memoria_aluno.py`:

```python
import importlib.util
from pathlib import Path


def _load_migration():
    path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "20260819_01_memoria_aluno.py"
    )
    spec = importlib.util.spec_from_file_location("migration_20260819_01", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_revision_chain():
    module = _load_migration()
    assert module.revision == "20260819_01"
    assert module.down_revision == "20260818_01"


def test_migration_upgrade_and_downgrade_are_idempotent_sql():
    module = _load_migration()
    executed = []

    class FakeOp:
        def execute(self, sql):
            executed.append(str(sql))

    module.op = FakeOp()
    module.upgrade()
    assert any("CREATE TABLE IF NOT EXISTS aluno_topico_dominio" in s for s in executed)
    assert any("UNIQUE (aluno_id, topico_id)" in s for s in executed)

    executed.clear()
    module.downgrade()
    assert any("DROP TABLE IF EXISTS aluno_topico_dominio" in s for s in executed)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && python -m pytest tests/test_migrations_memoria_aluno.py -v`
Expected: FAIL — arquivo de migração ainda não existe (`FileNotFoundError`).

- [ ] **Step 3: Implement**

Crie `api/alembic/versions/20260819_01_memoria_aluno.py`:

```python
"""memoria do aluno - dominio por topico persistido entre ciclos

Cria aluno_topico_dominio: domínio/dificuldade estimado por (aluno, tópico),
persistido a cada ciclo de análise (DeepKnowledgeTracingAnalyzer), em vez de
recalculado do zero a partir de uma média flat toda vez. Ver
docs/superpowers/specs/2026-08-19-memoria-aluno-design.md.

Revision ID: 20260819_01
Revises: 20260818_01
Create Date: 2026-08-19
"""

from alembic import op

revision = "20260819_01"
down_revision = "20260818_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS aluno_topico_dominio (
          id BIGSERIAL PRIMARY KEY,
          aluno_id UUID NOT NULL,
          topico_id BIGINT NOT NULL REFERENCES topicos(id) ON DELETE CASCADE,
          dominio_estimado DOUBLE PRECISION NOT NULL,
          tendencia TEXT NOT NULL,
          confianca DOUBLE PRECISION NOT NULL,
          atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (aluno_id, topico_id)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_aluno_topico_dominio_aluno
        ON aluno_topico_dominio (aluno_id)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_aluno_topico_dominio_aluno")
    op.execute("DROP TABLE IF EXISTS aluno_topico_dominio")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && python -m pytest tests/test_migrations_memoria_aluno.py -v`
Expected: 2 passed.

- [ ] **Step 5: Atualizar o teste de head existente**

Em `api/tests/test_migrations.py`, troque `test_idempotent_generated_materials_is_the_only_alembic_head`:

```python
def test_idempotent_generated_materials_is_the_only_alembic_head() -> None:
    scripts = ScriptDirectory.from_config(_offline_alembic_config())

    assert scripts.get_heads() == ["20260819_01"]
    revision = scripts.get_revision("20260819_01")
    assert revision is not None
    assert revision.down_revision == "20260818_01"
```

Run: `cd api && python -m pytest tests/test_migrations.py -v`
Expected: passa.

- [ ] **Step 6: Commit**

```bash
git add api/alembic/versions/20260819_01_memoria_aluno.py api/tests/test_migrations_memoria_aluno.py api/tests/test_migrations.py
git commit -m "feat(api): migracao aluno_topico_dominio (memoria de dominio por topico)"
```

---

## Task 2: Schemas de memória

**Files:**
- Create: `api/app/schemas/memoria_aluno.py`

- [ ] **Step 1: Implement (schema puro, sem lógica — sem teste dedicado, coberto pelos testes de Task 3-5)**

Crie `api/app/schemas/memoria_aluno.py`:

```python
from datetime import datetime

from pydantic import BaseModel, Field


class DominioTopico(BaseModel):
    dominio_estimado: float
    tendencia: str
    confianca: float
    atualizado_em: datetime | None = None


class MentalStateRecorrente(BaseModel):
    recorrente: bool = False
    kind: str | None = None
    ocorrencias: int = 0


class MemoriaAluno(BaseModel):
    dominio_por_topico: dict[str, DominioTopico] = Field(default_factory=dict)
    mental_state_recorrente: MentalStateRecorrente = Field(default_factory=MentalStateRecorrente)
```

- [ ] **Step 2: Commit**

```bash
git add api/app/schemas/memoria_aluno.py
git commit -m "feat(api): schemas de memoria do aluno (DominioTopico, MentalStateRecorrente, MemoriaAluno)"
```

---

## Task 3: `AlunoTopicoDominioRepository`

**Files:**
- Create: `api/app/repositories/aluno_topico_dominio.py`
- Test: `api/tests/test_repositories.py`

- [ ] **Step 1: Write the failing tests**

Adicione a `api/tests/test_repositories.py` (reaproveita `RecordingSession`,
`ScalarResult`, `MappingResult`/`MappingRows` já definidos no arquivo):

```python
from app.repositories.aluno_topico_dominio import AlunoTopicoDominioRepository


@pytest.mark.asyncio
async def test_aluno_topico_dominio_buscar_por_classe_maps_rows() -> None:
    session = RecordingSession(
        [
            MappingResult(
                [
                    {
                        "topico_id": 10,
                        "dominio_estimado": 0.72,
                        "tendencia": "ascendente",
                        "confianca": 0.66,
                        "atualizado_em": datetime(2026, 8, 19),
                    }
                ]
            )
        ]
    )
    repo = AlunoTopicoDominioRepository(session)

    registros = await repo.buscar_por_classe(aluno_id="aluno-1", classe_id=32)

    assert set(registros) == {"10"}
    assert registros["10"]["dominio_estimado"] == 0.72
    assert registros["10"]["tendencia"] == "ascendente"


@pytest.mark.asyncio
async def test_aluno_topico_dominio_upsert_sends_on_conflict_update() -> None:
    session = RecordingSession([ScalarResult(True)])
    repo = AlunoTopicoDominioRepository(session)

    await repo.upsert(
        aluno_id="aluno-1",
        topico_id=10,
        dominio_estimado=0.8,
        tendencia="ascendente",
        confianca=0.7,
    )

    sql, params = session.calls[0]
    assert "INSERT INTO aluno_topico_dominio" in sql
    assert "ON CONFLICT (aluno_id, topico_id) DO UPDATE" in sql
    assert params["dominio_estimado"] == 0.8
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && python -m pytest tests/test_repositories.py -k aluno_topico_dominio -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.repositories.aluno_topico_dominio'`.

- [ ] **Step 3: Implement**

Crie `api/app/repositories/aluno_topico_dominio.py`:

```python
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class AlunoTopicoDominioRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def buscar_por_classe(self, *, aluno_id: str, classe_id: int) -> dict[str, dict[str, Any]]:
        result = await self.session.execute(
            text(
                """
                SELECT d.topico_id, d.dominio_estimado, d.tendencia, d.confianca, d.atualizado_em
                FROM aluno_topico_dominio d
                JOIN topicos t ON t.id = d.topico_id
                WHERE d.aluno_id = CAST(:aluno_id AS UUID)
                  AND t.classe_id = :classe_id
                """
            ),
            {"aluno_id": aluno_id, "classe_id": classe_id},
        )
        registros: dict[str, dict[str, Any]] = {}
        for row in result.mappings():
            registros[str(row["topico_id"])] = {
                "dominio_estimado": float(row["dominio_estimado"]),
                "tendencia": row["tendencia"],
                "confianca": float(row["confianca"]),
                "atualizado_em": row["atualizado_em"],
            }
        return registros

    async def upsert(
        self,
        *,
        aluno_id: str,
        topico_id: int,
        dominio_estimado: float,
        tendencia: str,
        confianca: float,
    ) -> None:
        await self.session.execute(
            text(
                """
                INSERT INTO aluno_topico_dominio (
                  aluno_id, topico_id, dominio_estimado, tendencia, confianca, atualizado_em
                )
                VALUES (
                  CAST(:aluno_id AS UUID), :topico_id, :dominio_estimado, :tendencia, :confianca, NOW()
                )
                ON CONFLICT (aluno_id, topico_id) DO UPDATE
                SET dominio_estimado = EXCLUDED.dominio_estimado,
                    tendencia = EXCLUDED.tendencia,
                    confianca = EXCLUDED.confianca,
                    atualizado_em = EXCLUDED.atualizado_em
                """
            ),
            {
                "aluno_id": aluno_id,
                "topico_id": topico_id,
                "dominio_estimado": dominio_estimado,
                "tendencia": tendencia,
                "confianca": confianca,
            },
        )
        await self.session.commit()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && python -m pytest tests/test_repositories.py -k aluno_topico_dominio -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add api/app/repositories/aluno_topico_dominio.py api/tests/test_repositories.py
git commit -m "feat(api): AlunoTopicoDominioRepository (buscar_por_classe, upsert)"
```

---

## Task 4: `_detectar_recorrencia` (função pura)

**Files:**
- Create: `api/app/services/memoria_aluno.py`
- Test: `api/tests/test_memoria_aluno.py`

- [ ] **Step 1: Write the failing tests**

Crie `api/tests/test_memoria_aluno.py`:

```python
from app.services.memoria_aluno import _detectar_recorrencia


def test_detectar_recorrencia_marca_3_de_5_mesmo_kind_negativo() -> None:
    registros = [
        {"kind": "frustrated"},
        {"kind": "focused"},
        {"kind": "frustrated"},
        {"kind": "frustrated"},
        {"kind": "neutral"},
    ]

    resultado = _detectar_recorrencia(registros)

    assert resultado.recorrente is True
    assert resultado.kind == "frustrated"
    assert resultado.ocorrencias == 3


def test_detectar_recorrencia_nao_marca_kinds_mistos_sem_maioria() -> None:
    registros = [
        {"kind": "frustrated"},
        {"kind": "anxious"},
        {"kind": "tired"},
        {"kind": "neutral"},
        {"kind": "focused"},
    ]

    resultado = _detectar_recorrencia(registros)

    assert resultado.recorrente is False
    assert resultado.kind is None
    assert resultado.ocorrencias == 0


def test_detectar_recorrencia_ignora_kinds_positivos() -> None:
    registros = [{"kind": "motivated"}] * 5

    resultado = _detectar_recorrencia(registros)

    assert resultado.recorrente is False


def test_detectar_recorrencia_ignora_registros_alem_da_janela_de_5() -> None:
    # 3 ocorrencias de 'frustrated', mas fora da janela dos 5 mais recentes.
    registros = [
        {"kind": "neutral"},
        {"kind": "neutral"},
        {"kind": "neutral"},
        {"kind": "neutral"},
        {"kind": "neutral"},
        {"kind": "frustrated"},
        {"kind": "frustrated"},
        {"kind": "frustrated"},
    ]

    resultado = _detectar_recorrencia(registros)

    assert resultado.recorrente is False


def test_detectar_recorrencia_com_lista_vazia() -> None:
    assert _detectar_recorrencia([]).recorrente is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && python -m pytest tests/test_memoria_aluno.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.memoria_aluno'`.

- [ ] **Step 3: Implement**

Crie `api/app/services/memoria_aluno.py`:

```python
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.aluno_topico_dominio import AlunoTopicoDominioRepository
from app.repositories.mental_state import MentalStateHistoryRepository
from app.schemas.memoria_aluno import DominioTopico, MemoriaAluno, MentalStateRecorrente

logger = logging.getLogger(__name__)

_KINDS_NEGATIVOS = {"frustrated", "anxious", "overwhelmed", "tired"}
_JANELA_RECORRENCIA = 5
_LIMIAR_RECORRENCIA = 3


def _detectar_recorrencia(registros: list[dict[str, Any]]) -> MentalStateRecorrente:
    """Pura, sem I/O. `registros` ja vem ordenado do mais recente pro mais
    antigo (MentalStateHistoryRepository.listar_por_aluno). 3 dos ultimos 5
    registros com o MESMO kind negativo marca recorrencia."""
    janela = registros[:_JANELA_RECORRENCIA]
    contagem: dict[str, int] = {}
    for registro in janela:
        kind = str(registro.get("kind") or "")
        if kind in _KINDS_NEGATIVOS:
            contagem[kind] = contagem.get(kind, 0) + 1

    for kind, ocorrencias in contagem.items():
        if ocorrencias >= _LIMIAR_RECORRENCIA:
            return MentalStateRecorrente(recorrente=True, kind=kind, ocorrencias=ocorrencias)

    return MentalStateRecorrente(recorrente=False, kind=None, ocorrencias=0)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && python -m pytest tests/test_memoria_aluno.py -v`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add api/app/services/memoria_aluno.py api/tests/test_memoria_aluno.py
git commit -m "feat(api): _detectar_recorrencia (3 de 5 mesmo kind negativo)"
```

---

## Task 5: `ler_memoria`

**Files:**
- Modify: `api/app/services/memoria_aluno.py`
- Test: `api/tests/test_memoria_aluno.py`

- [ ] **Step 1: Write the failing tests**

Adicione a `api/tests/test_memoria_aluno.py`:

```python
import pytest

from app.repositories.aluno_topico_dominio import AlunoTopicoDominioRepository
from app.repositories.mental_state import MentalStateHistoryRepository
from app.services.memoria_aluno import ler_memoria


@pytest.mark.asyncio
async def test_ler_memoria_combina_dominio_e_recorrencia(monkeypatch) -> None:
    async def fake_buscar_por_classe(self, *, aluno_id, classe_id):
        return {
            "10": {
                "dominio_estimado": 0.72,
                "tendencia": "ascendente",
                "confianca": 0.66,
                "atualizado_em": None,
            }
        }

    async def fake_listar_por_aluno(self, *, aluno_id, limit=50):
        return [{"kind": "frustrated"}] * 3

    monkeypatch.setattr(AlunoTopicoDominioRepository, "buscar_por_classe", fake_buscar_por_classe)
    monkeypatch.setattr(MentalStateHistoryRepository, "listar_por_aluno", fake_listar_por_aluno)

    memoria = await ler_memoria(object(), aluno_id="aluno-1", classe_id=32)

    assert memoria.dominio_por_topico["10"].dominio_estimado == 0.72
    assert memoria.mental_state_recorrente.recorrente is True
    assert memoria.mental_state_recorrente.kind == "frustrated"


@pytest.mark.asyncio
async def test_ler_memoria_devolve_vazio_em_falha_de_leitura(monkeypatch) -> None:
    async def fake_buscar_por_classe(self, *, aluno_id, classe_id):
        raise RuntimeError("tabela indisponivel")

    monkeypatch.setattr(AlunoTopicoDominioRepository, "buscar_por_classe", fake_buscar_por_classe)

    memoria = await ler_memoria(object(), aluno_id="aluno-1", classe_id=32)

    assert memoria.dominio_por_topico == {}
    assert memoria.mental_state_recorrente.recorrente is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && python -m pytest tests/test_memoria_aluno.py -k ler_memoria -v`
Expected: FAIL — `ImportError: cannot import name 'ler_memoria'`.

- [ ] **Step 3: Implement**

Adicione ao final de `api/app/services/memoria_aluno.py`:

```python
async def ler_memoria(session: AsyncSession, *, aluno_id: str, classe_id: int) -> MemoriaAluno:
    """Nunca levanta - falha de leitura (tabela indisponivel, erro de
    conexao pontual) devolve memoria vazia, igual ao principio de 'permitir
    fallback' ja documentado nos guardrails de pipeline."""
    try:
        dominio_rows = await AlunoTopicoDominioRepository(session).buscar_por_classe(
            aluno_id=aluno_id, classe_id=classe_id
        )
        registros_mentais = await MentalStateHistoryRepository(session).listar_por_aluno(
            aluno_id=aluno_id, limit=_JANELA_RECORRENCIA
        )
    except Exception as exc:
        logger.warning("Falha ao ler memoria do aluno %s: %s", aluno_id, exc)
        return MemoriaAluno()

    dominio_por_topico = {
        topico_id: DominioTopico.model_validate(registro)
        for topico_id, registro in dominio_rows.items()
    }
    return MemoriaAluno(
        dominio_por_topico=dominio_por_topico,
        mental_state_recorrente=_detectar_recorrencia(registros_mentais),
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && python -m pytest tests/test_memoria_aluno.py -v`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add api/app/services/memoria_aluno.py api/tests/test_memoria_aluno.py
git commit -m "feat(api): ler_memoria combina dominio por topico e recorrencia de estado mental"
```

---

## Task 6: `atualizar_memoria`

**Files:**
- Modify: `api/app/services/memoria_aluno.py`
- Test: `api/tests/test_memoria_aluno.py`

- [ ] **Step 1: Write the failing tests**

Adicione a `api/tests/test_memoria_aluno.py`:

```python
from app.services.memoria_aluno import atualizar_memoria


@pytest.mark.asyncio
async def test_atualizar_memoria_faz_upsert_com_resumo_de_performance(monkeypatch) -> None:
    chamadas = []

    async def fake_upsert(self, **kwargs):
        chamadas.append(kwargs)

    monkeypatch.setattr(AlunoTopicoDominioRepository, "upsert", fake_upsert)

    await atualizar_memoria(
        object(),
        aluno_id="aluno-1",
        topico_id=10,
        performance_resumo={"dominio_estimado": 0.8, "tendencia": "ascendente", "confianca": 0.7},
    )

    assert chamadas == [
        {
            "aluno_id": "aluno-1",
            "topico_id": 10,
            "dominio_estimado": 0.8,
            "tendencia": "ascendente",
            "confianca": 0.7,
        }
    ]


@pytest.mark.asyncio
async def test_atualizar_memoria_nao_falha_sem_topico_id(monkeypatch) -> None:
    chamadas = []

    async def fake_upsert(self, **kwargs):
        chamadas.append(kwargs)

    monkeypatch.setattr(AlunoTopicoDominioRepository, "upsert", fake_upsert)

    await atualizar_memoria(
        object(),
        aluno_id="aluno-1",
        topico_id=None,
        performance_resumo={"dominio_estimado": 0.8, "tendencia": "ascendente", "confianca": 0.7},
    )

    assert chamadas == []


@pytest.mark.asyncio
async def test_atualizar_memoria_engole_falha_de_upsert(monkeypatch) -> None:
    async def fake_upsert(self, **kwargs):
        raise RuntimeError("conexao perdida")

    monkeypatch.setattr(AlunoTopicoDominioRepository, "upsert", fake_upsert)

    await atualizar_memoria(
        object(),
        aluno_id="aluno-1",
        topico_id=10,
        performance_resumo={"dominio_estimado": 0.8, "tendencia": "ascendente", "confianca": 0.7},
    )
    # nao levanta - sucesso do teste e nao ter lancado
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && python -m pytest tests/test_memoria_aluno.py -k atualizar_memoria -v`
Expected: FAIL — `ImportError: cannot import name 'atualizar_memoria'`.

- [ ] **Step 3: Implement**

Adicione ao final de `api/app/services/memoria_aluno.py`:

```python
async def atualizar_memoria(
    session: AsyncSession,
    *,
    aluno_id: str,
    topico_id: int | None,
    performance_resumo: dict[str, Any] | None,
) -> None:
    """So cuida do dominio por topico (novo). O estado mental ja e gravado
    por MentalStateHistoryRepository.registrar() em analysis_runner.py - nao
    duplica essa escrita. Nunca levanta - mesmo padrao do bloco de
    mental-state ja existente em analysis_runner.py (log + segue)."""
    if topico_id is None or not performance_resumo:
        return
    try:
        await AlunoTopicoDominioRepository(session).upsert(
            aluno_id=aluno_id,
            topico_id=topico_id,
            dominio_estimado=float(performance_resumo.get("dominio_estimado", 0)),
            tendencia=str(performance_resumo.get("tendencia") or "estavel"),
            confianca=float(performance_resumo.get("confianca", 0)),
        )
    except Exception as exc:
        logger.warning("Falha ao persistir aluno_topico_dominio (aluno=%s, topico=%s): %s", aluno_id, topico_id, exc)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && python -m pytest tests/test_memoria_aluno.py -v`
Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add api/app/services/memoria_aluno.py api/tests/test_memoria_aluno.py
git commit -m "feat(api): atualizar_memoria persiste dominio por topico apos cada ciclo"
```

---

## Task 7: Propagar `memoria_aluno` em `build_initial_state`

**Files:**
- Modify: `api/app/services/state_builder.py`
- Test: `api/tests/test_state_builder.py` (novo)

- [ ] **Step 1: Write the failing test**

Crie `api/tests/test_state_builder.py`:

```python
import pytest

from app.schemas.api import AnalisarPayload
from app.schemas.memoria_aluno import MemoriaAluno, MentalStateRecorrente
from app.services import state_builder
from app.services.state_builder import build_initial_state


class _FakeContextRepo:
    def __init__(self, _session) -> None:
        pass

    async def fetch_aluno_context(self, aluno_id, classe_id):
        return {
            "aluno": {"nome": "Aluno Teste", "email": "a@teste.com", "modo_operacao": "imediato", "modo_resposta": "imediato"},
            "perfil_brainhex": [],
            "historico_eventos": [],
            "progresso_trilha": {},
            "desempenho_recente": {"media_acertos": 80, "topico_recente_id": None, "topico_concluido": False},
            "trilha_atual": None,
            "ia_descricao_atual": None,
        }

    async def resolve_conteudo_foco_id(self, **kwargs):
        return None


@pytest.mark.asyncio
async def test_build_initial_state_propaga_memoria_aluno(monkeypatch) -> None:
    async def fake_ler_memoria(_session, *, aluno_id, classe_id):
        return MemoriaAluno(
            dominio_por_topico={},
            mental_state_recorrente=MentalStateRecorrente(recorrente=True, kind="frustrated", ocorrencias=3),
        )

    monkeypatch.setattr(state_builder, "ler_memoria", fake_ler_memoria)

    payload = AnalisarPayload(classe_id=32, modo="estudo", eventos_novos=[])
    state = await build_initial_state(
        object(), "aluno-1", payload, context_repository_factory=_FakeContextRepo
    )

    assert state["memoria_aluno"]["mental_state_recorrente"]["recorrente"] is True
    assert state["memoria_aluno"]["mental_state_recorrente"]["kind"] == "frustrated"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && python -m pytest tests/test_state_builder.py -v`
Expected: FAIL — `state["memoria_aluno"]` não existe (`KeyError`).

- [ ] **Step 3: Implement**

Em `api/app/services/state_builder.py`, adicione o import e a chamada:

```python
from app.repositories.context import ContextRepository
from app.schemas.api import AnalisarPayload
from app.services.memoria_aluno import ler_memoria
```

```python
async def build_initial_state(
    session: AsyncSession,
    aluno_id: str,
    payload: AnalisarPayload,
    context_repository_factory: type[ContextRepository] = ContextRepository,
) -> dict:
    context_repo = context_repository_factory(session)
    context = await context_repo.fetch_aluno_context(aluno_id=aluno_id, classe_id=payload.classe_id)
    memoria = await ler_memoria(session, aluno_id=aluno_id, classe_id=payload.classe_id)
    aluno = context["aluno"]
    desempenho = context["desempenho_recente"]
    conteudo_foco_id = await context_repo.resolve_conteudo_foco_id(
        topico_id=payload.topico_id,
        atividade_id=payload.atividade_id,
        fallback_topico_id=desempenho.get("topico_recente_id"),
    )
    gerar_materiais = bool(
        payload.modo == "prova"
        or float(desempenho.get("media_acertos", 100)) < 50
        or bool(desempenho.get("topico_concluido"))
    )

    return {
        "aluno_id": aluno_id,
        "classe_id": payload.classe_id,
        "nome_aluno": aluno["nome"],
        "email_aluno": aluno["email"],
        "modo_operacao": aluno.get("modo_operacao") or "imediato",
        "modo_resposta": aluno.get("modo_resposta") or "imediato",
        "perfil_brainhex": context["perfil_brainhex"],
        "historico_eventos": context["historico_eventos"],
        "progresso_trilha": context["progresso_trilha"],
        "desempenho_recente": context["desempenho_recente"],
        "trilha_atual": context["trilha_atual"],
        "ia_descricao_atual": context["ia_descricao_atual"],
        "memoria_aluno": memoria.model_dump(mode="json"),
        "emocao_atual": None,
        "emocao_historico": [],
        "frame_b64": payload.frame_b64,
        "eventos_novos": [evento.model_dump(mode="json") for evento in payload.eventos_novos],
        "payload_topico_id": payload.topico_id,
        "payload_atividade_id": payload.atividade_id,
        "payload_modo": payload.modo,
        "conteudo_foco_id": conteudo_foco_id,
        "perfil_update": None,
        "trilha_config": None,
        "conteudo_adaptado": None,
        "materiais_gerados": None,
        "gerar_materiais": gerar_materiais,
        "materiais_cache_hit": False,
        "notificacao_payload": None,
        "ui_config": None,
        "textos_gerados": [],
        "next": [],
        "ciclo_id": str(uuid4()),
        "acoes_aplicadas": [],
        "completed_nodes": [],
        "messages": [],
        "erros": [],
        "review_decision": None,
        "review_feedback": None,
    }
```

(Único trecho novo: a linha `memoria = await ler_memoria(...)` e a chave
`"memoria_aluno": memoria.model_dump(mode="json")` no dict retornado — o
resto do corpo da função não muda.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && python -m pytest tests/test_state_builder.py -v`
Expected: 1 passed.

- [ ] **Step 5: Rodar a suíte que já cobre `build_initial_state` indiretamente**

Run: `cd api && python -m pytest tests/test_api.py tests/test_repositories.py -v`
Expected: todos passam (nenhum teste existente fazia snapshot exato das
chaves de `build_initial_state`, então adicionar uma chave nova não quebra
nada).

- [ ] **Step 6: Commit**

```bash
git add api/app/services/state_builder.py api/tests/test_state_builder.py
git commit -m "feat(api): build_initial_state propaga memoria_aluno pro state do grafo"
```

---

## Task 8: Persistir domínio após cada ciclo de análise

**Files:**
- Modify: `api/app/services/analysis_runner.py`
- Test: `api/tests/test_mental_state.py` (ou novo bloco em `test_api.py`, conforme step abaixo)

- [ ] **Step 1: Write the failing test**

Adicione ao topo de `api/tests/test_mental_state.py` os imports que faltam,
e o teste ao final do arquivo:

```python
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.repositories.aluno_topico_dominio import AlunoTopicoDominioRepository
from app.services import analysis_runner
```

```python
@pytest.mark.asyncio
async def test_run_analysis_persiste_dominio_por_topico_apos_o_ciclo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    upsert_mock = AsyncMock()
    monkeypatch.setattr(AlunoTopicoDominioRepository, "upsert", upsert_mock)
    monkeypatch.setattr(
        "app.repositories.evento.EventoRepository.log", AsyncMock()
    )
    monkeypatch.setattr(
        "app.repositories.mental_state.MentalStateHistoryRepository.registrar",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "app.repositories.ia_decision_logs.IADecisionLogRepository.log", AsyncMock()
    )

    async def fake_build_initial_state(session, aluno_id, payload, **kwargs):
        return {
            "ciclo_id": "ciclo-1",
            "aluno_id": aluno_id,
            "classe_id": payload.classe_id,
            "desempenho_recente": {"topico_recente_id": 10},
            "payload_topico_id": payload.topico_id,
        }

    class _FakeOrchestrator:
        async def run(self, **kwargs):
            state = kwargs["state"]
            state["ai_patch"] = {
                "mentalState": {"kind": "focused", "intensity": 0.5, "confidence": 0.6, "reason": "ok"}
            }
            state["pipeline_stage_outputs"] = {
                "performance": {"dominio_estimado": 0.81, "tendencia": "ascendente", "confianca": 0.7}
            }
            return state

    monkeypatch.setattr(analysis_runner, "build_initial_state", fake_build_initial_state)
    monkeypatch.setattr(
        analysis_runner, "build_linear_analysis_orchestrator", lambda _settings: _FakeOrchestrator()
    )

    session = RecordingSession()
    app = SimpleNamespace(state=SimpleNamespace(settings=SimpleNamespace(default_checkpoint_ns="test")))

    await analysis_runner.run_analysis(
        request=SimpleNamespace(app=app),
        session=session,
        aluno_id="aluno-1",
        classe_id=32,
        topico_id=None,
        atividade_id=None,
        frame_b64=None,
        eventos_novos=[],
        modo="estudo",
    )

    upsert_mock.assert_awaited_once_with(
        aluno_id="aluno-1",
        topico_id=10,
        dominio_estimado=0.81,
        tendencia="ascendente",
        confianca=0.7,
    )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && python -m pytest tests/test_mental_state.py -k persiste_dominio -v`
Expected: FAIL — `atualizar_memoria` ainda não é chamado, `chamadas_upsert` fica vazio.

- [ ] **Step 3: Implement**

Em `api/app/services/analysis_runner.py`, adicione o import:

```python
from app.services import memoria_aluno
```

Logo após o bloco existente que persiste `MentalStateHistoryRepository`
(o bloco `if mental_state is not None: ... except Exception as exc: ...`),
adicione, usando `result` (o `state` retornado por `orchestrator.run`, já em
escopo nesse ponto da função):

```python
    performance_resumo = (result.get("pipeline_stage_outputs") or {}).get("performance")
    topico_id_efetivo = topico_id or (result.get("desempenho_recente") or {}).get("topico_recente_id")
    if performance_resumo:
        try:
            await memoria_aluno.atualizar_memoria(
                session,
                aluno_id=aluno_id,
                topico_id=topico_id_efetivo,
                performance_resumo=performance_resumo,
            )
        except Exception as exc:  # pragma: no cover
            await session.rollback()
            logger.warning("Falha ao persistir memoria de dominio: %s", exc)
```

Insira esse trecho imediatamente depois do bloco `if mental_state is not None:`
existente (antes do bloco `try: await IADecisionLogRepository(session).log(...)`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && python -m pytest tests/test_mental_state.py -v`
Expected: todos passam.

- [ ] **Step 5: Rodar a suíte completa de `analysis_runner`**

Run: `cd api && python -m pytest tests/ -k "analysis_runner or telemetria" -v`
Expected: todos passam (nenhum teste existente faz snapshot exato do corpo
da função a ponto de quebrar com uma chamada adicional que so ocorre quando
`performance_resumo` existe).

- [ ] **Step 6: Commit**

```bash
git add api/app/services/analysis_runner.py api/tests/test_mental_state.py
git commit -m "feat(api): analysis_runner persiste dominio por topico apos cada ciclo"
```

---

## Task 9: `DeepKnowledgeTracingAnalyzer` usa domínio persistido como semente

**Files:**
- Modify: `api/app/services/linear_analysis_pipeline.py`
- Test: `api/tests/test_linear_analysis_pipeline.py` (já existe — importa `DeepKnowledgeTracingAnalyzer` e `Evento`)

- [ ] **Step 1: Write the failing test**

Adicione `import asyncio` ao topo de `api/tests/test_linear_analysis_pipeline.py`
(os demais imports usados abaixo já existem no arquivo) e os testes ao final:

```python
def test_deep_knowledge_tracing_usa_dominio_persistido_como_semente() -> None:
    analyzer = DeepKnowledgeTracingAnalyzer()
    state = {
        "payload_topico_id": 10,
        "desempenho_recente": {"media_acertos": 20},  # seria base_mastery baixo se usado
        "memoria_aluno": {
            "dominio_por_topico": {
                "10": {"dominio_estimado": 0.9, "tendencia": "ascendente", "confianca": 0.7}
            }
        },
    }

    resultado = asyncio.run(analyzer.analyze(eventos_novos=[], state=state))

    # com semente 0.9 (persistida) em vez de 0.2 (flat), o dominio final
    # fica bem mais alto mesmo sem eventos no lote.
    assert resultado.dominio_estimado > 0.8


def test_deep_knowledge_tracing_cai_no_flat_quando_sem_dominio_persistido() -> None:
    analyzer = DeepKnowledgeTracingAnalyzer()
    state = {
        "payload_topico_id": 10,
        "desempenho_recente": {"media_acertos": 80},
        "memoria_aluno": {"dominio_por_topico": {}},
    }

    resultado = asyncio.run(analyzer.analyze(eventos_novos=[], state=state))

    assert resultado.dominio_estimado == 0.8
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && python -m pytest tests/test_linear_analysis_pipeline.py -k deep_knowledge -v`
Expected: a primeira falha (`dominio_estimado` fica baixo, seguindo o flat de 20%).

- [ ] **Step 3: Implement**

Em `api/app/services/linear_analysis_pipeline.py`, troque o corpo de
`DeepKnowledgeTracingAnalyzer.analyze`:

```python
class DeepKnowledgeTracingAnalyzer:
    provider_name = "deep_knowledge_tracing"

    async def analyze(
        self,
        *,
        eventos_novos: list[Evento],
        state: dict[str, Any],
    ) -> PerformanceStageResult:
        counts = Counter(evento.tipo for evento in eventos_novos)
        desempenho = state.get("desempenho_recente", {}) or {}
        topico_id = state.get("payload_topico_id") or desempenho.get("topico_recente_id")
        memoria = state.get("memoria_aluno") or {}
        dominio_persistido = (
            (memoria.get("dominio_por_topico") or {}).get(str(topico_id))
            if topico_id is not None
            else None
        )
        if dominio_persistido:
            base_mastery = _safe_float(dominio_persistido.get("dominio_estimado"), 0.5)
        else:
            base_mastery = _safe_float(desempenho.get("media_acertos"), 50.0) / 100.0
        correct = counts.get("atividade_acertada", 0)
        wrong = counts.get("atividade_errada", 0)
        delta = (correct * 0.08) - (wrong * 0.07)
        dominio = min(0.98, max(0.05, base_mastery + delta))

        tendencia = "estavel"
        if dominio >= 0.72:
            tendencia = "ascendente"
        elif dominio < 0.45:
            tendencia = "risco"

        return PerformanceStageResult(
            provider_name=self.provider_name,
            dominio_estimado=round(dominio, 2),
            tendencia=tendencia,
            confianca=0.66,
            resumo={
                "media_acertos_base": round(base_mastery, 2),
                "acertos_lote": correct,
                "erros_lote": wrong,
            },
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && python -m pytest tests/test_linear_analysis_pipeline.py -v`
Expected: todos passam.

- [ ] **Step 5: Rodar a suíte completa do pipeline linear**

Run: `cd api && python -m pytest tests/ -k linear_analysis -v`
Expected: todos passam (mudança é aditiva — sem `memoria_aluno` no state,
`memoria.get(...)` devolve `{}` e o comportamento antigo é preservado).

- [ ] **Step 6: Commit**

```bash
git add api/app/services/linear_analysis_pipeline.py api/tests/test_linear_analysis_pipeline.py
git commit -m "feat(api): DeepKnowledgeTracingAnalyzer usa dominio persistido como semente"
```

---

## Task 10: `checar_evidencia_dominio` usa domínio persistido por tópico

**Files:**
- Modify: `api/app/agent/graph/guardrails.py`
- Test: `api/tests/test_guardrails.py`

- [ ] **Step 1: Write the failing tests**

Adicione a `api/tests/test_guardrails.py`:

```python
def test_checar_evidencia_dominio_usa_dominio_persistido_do_topico() -> None:
    trilha = TrilhaConfig(
        classe_id=1,
        topico_foco=10,
        proximos_topicos=[],
        ajustes=["avancar sem reforco"],
        justificativa="x",
    )
    # media_acertos geral da classe e baixa, mas o dominio PERSISTIDO desse
    # topico especifico e alto - deve prevalecer o dado mais preciso.
    contexto = {
        "desempenho_recente": {"media_acertos": 20},
        "dominio_por_topico": {"10": {"dominio_estimado": 0.9}},
    }

    assert checar_evidencia_dominio(trilha, contexto) is None


def test_checar_evidencia_dominio_rejeita_com_dominio_persistido_baixo() -> None:
    trilha = TrilhaConfig(
        classe_id=1,
        topico_foco=10,
        proximos_topicos=[],
        ajustes=["avancar sem reforco"],
        justificativa="x",
    )
    contexto = {
        "desempenho_recente": {"media_acertos": 90},
        "dominio_por_topico": {"10": {"dominio_estimado": 0.3}},
    }

    violacao = checar_evidencia_dominio(trilha, contexto)

    assert violacao is not None
    assert violacao.regra == "evidencia_dominio"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && python -m pytest tests/test_guardrails.py -k dominio_persistido -v`
Expected: FAIL — hoje a função só olha `desempenho_recente`, ignora `dominio_por_topico`.

- [ ] **Step 3: Implement**

Em `api/app/agent/graph/guardrails.py`, substitua `checar_evidencia_dominio`:

```python
def checar_evidencia_dominio(
    trilha: TrilhaConfig, contexto: dict[str, Any]
) -> GuardrailViolation | None:
    """'ajustes' e vocabulario controlado (ver trilha_config.txt) — o unico
    jeito de dispensar reforco e o valor exato 'avancar sem reforco'. Prefere
    o dominio PERSISTIDO do topico especifico (memoria_aluno, mais preciso)
    quando existe; cai pro media_acertos flat da classe so quando o aluno
    ainda nao tem registro de dominio pro topico."""
    if "avancar sem reforco" not in trilha.ajustes:
        return None

    dominio_por_topico = contexto.get("dominio_por_topico") or {}
    registro_topico = (
        dominio_por_topico.get(str(trilha.topico_foco))
        if trilha.topico_foco is not None
        else None
    )
    if registro_topico is not None:
        dominio_pct = float(registro_topico.get("dominio_estimado", 0)) * 100
        if dominio_pct < 50:
            return GuardrailViolation(
                regra="evidencia_dominio",
                mensagem=(
                    f"ajuste 'avancar sem reforco' sem evidencia de dominio persistido "
                    f"pro topico {trilha.topico_foco} (dominio_estimado={dominio_pct:.0f}%)"
                ),
            )
        return None

    desempenho = contexto.get("desempenho_recente", {})
    media_acertos = float(desempenho.get("media_acertos", 100))
    if media_acertos < 50:
        return GuardrailViolation(
            regra="evidencia_dominio",
            mensagem=(
                f"ajuste 'avancar sem reforco' sem evidencia de desempenho "
                f"(media_acertos={media_acertos})"
            ),
        )
    return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && python -m pytest tests/test_guardrails.py -v`
Expected: todos passam, incluindo os 2 testes já existentes de
`checar_evidencia_dominio` (que não passam `dominio_por_topico` no contexto —
`{}.get(...)` devolve `None`, cai no caminho antigo do `media_acertos`,
comportamento preservado).

- [ ] **Step 5: Commit**

```bash
git add api/app/agent/graph/guardrails.py api/tests/test_guardrails.py
git commit -m "feat(api): checar_evidencia_dominio prefere dominio persistido por topico"
```

---

## Task 11: `agente_trilha` passa `dominio_por_topico` no contexto do guardrail

**Files:**
- Modify: `api/app/agent/graph/nodes/agente_trilha.py`
- Test: `api/tests/test_graph_nodes.py`

- [ ] **Step 1: Write the failing test**

Adicione a `api/tests/test_graph_nodes.py`:

```python
@pytest.mark.asyncio
async def test_agente_trilha_passa_dominio_por_topico_da_memoria_no_contexto(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.agent.graph import guardrails as guardrails_module

    monkeypatch.setattr(
        ConteudoClasseRepository,
        "listar_topicos_classe",
        AsyncMock(return_value=[{"id": 10, "ordem": 1}]),
    )

    contextos_recebidos = []
    gerar_validado_original = guardrails_module.gerar_validado

    async def spy_gerar_validado(llm, **kwargs):
        contextos_recebidos.append(kwargs.get("contexto"))
        return await gerar_validado_original(llm, **kwargs)

    monkeypatch.setattr(
        "app.agent.graph.nodes.agente_trilha.gerar_validado", spy_gerar_validado
    )

    settings = Settings(openai_api_key=None)
    await agente_trilha(
        {
            "aluno_id": "aluno-1",
            "classe_id": 1,
            "progresso_trilha": {},
            "desempenho_recente": {"media_acertos": 80},
            "memoria_aluno": {
                "dominio_por_topico": {"10": {"dominio_estimado": 0.9}},
                "mental_state_recorrente": {"recorrente": False},
            },
        },
        settings=settings,
        session_factory=_FakeSessionFactory(),
    )

    assert contextos_recebidos[0]["dominio_por_topico"] == {"10": {"dominio_estimado": 0.9}}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && python -m pytest tests/test_graph_nodes.py -k passa_dominio_por_topico -v`
Expected: FAIL — `contexto` hoje não tem a chave `dominio_por_topico`.

- [ ] **Step 3: Implement**

Em `api/app/agent/graph/nodes/agente_trilha.py`, no dict `contexto=` passado
pra `gerar_validado`, adicione a chave:

```python
            contexto={
                "topicos_classe": topicos_classe,
                "progresso_trilha": state.get("progresso_trilha", {}),
                "desempenho_recente": state.get("desempenho_recente", {}),
                "dominio_por_topico": (state.get("memoria_aluno") or {}).get("dominio_por_topico", {}),
            },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && python -m pytest tests/test_graph_nodes.py -v`
Expected: todos passam.

- [ ] **Step 5: Commit**

```bash
git add api/app/agent/graph/nodes/agente_trilha.py api/tests/test_graph_nodes.py
git commit -m "feat(api): agente_trilha repassa dominio_por_topico da memoria pro guardrail"
```

---

## Task 12: `agente_ui` força tema de suporte com frustração recorrente

**Files:**
- Modify: `api/app/agent/graph/nodes/agente_ui.py`
- Test: `api/tests/test_graph_nodes.py`

- [ ] **Step 1: Write the failing test**

Adicione a `api/tests/test_graph_nodes.py`:

```python
@pytest.mark.asyncio
async def test_agente_ui_forca_tema_de_suporte_com_frustracao_recorrente() -> None:
    from app.agent.graph.nodes.agente_ui import agente_ui

    settings = Settings(openai_api_key=None)
    result = await agente_ui(
        {
            "emocao_atual": {"emocao_primaria": "concentrado"},  # ponto atual neutro
            "perfil_brainhex": [],
            "desempenho_recente": {},
            "memoria_aluno": {
                "mental_state_recorrente": {"recorrente": True, "kind": "frustrated", "ocorrencias": 3}
            },
        },
        settings=settings,
    )

    assert result["ui_config"]["tema"] == "focus"
    assert result["ui_config"]["tom_feedbacks"] == "suporte"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && python -m pytest tests/test_graph_nodes.py -k forca_tema_de_suporte -v`
Expected: FAIL — hoje `agente_ui` ignora `memoria_aluno`, usa só a emoção
pontual (`concentrado` → tema `dark`, não `focus`).

- [ ] **Step 3: Implement**

Em `api/app/agent/graph/nodes/agente_ui.py`, troque o final da função:

```python
async def agente_ui(state: dict[str, Any], settings: Settings) -> dict[str, Any]:
    llm = JsonLLMService(settings)
    try:
        ui_config = await llm.ainvoke_structured(
            prompt_name="ui_adaptativa.txt",
            payload={
                "emocao": state.get("emocao_atual"),
                "perfil": state.get("perfil_brainhex", []),
                "desempenho": state.get("desempenho_recente", {}),
            },
            schema=UIConfig,
        )
    except StructuredOutputError:
        ui_config = UIConfig.model_validate(_fallback_ui(state))

    memoria = state.get("memoria_aluno") or {}
    recorrencia = memoria.get("mental_state_recorrente") or {}
    if recorrencia.get("recorrente"):
        # recorrencia (varios ciclos) pesa mais que o instante do ciclo
        # atual - forca o mesmo preset de suporte que EMOCAO_TEMA usa pra
        # 'frustrado', mesmo que a emocao pontual pareca neutra.
        suporte = EMOCAO_TEMA["frustrado"]
        ui_config = ui_config.model_copy(
            update={
                "tema": suporte["tema"],
                "ritmo_conteudo": suporte["ritmo_conteudo"],
                "tom_feedbacks": suporte["tom_feedbacks"],
            }
        )

    return {
        "ui_config": ui_config.model_dump(mode="json"),
        "completed_nodes": ["agente_ui"],
        "messages": [f"ui adaptada com tema {ui_config.tema}"],
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && python -m pytest tests/test_graph_nodes.py -v`
Expected: todos passam.

- [ ] **Step 5: Commit**

```bash
git add api/app/agent/graph/nodes/agente_ui.py api/tests/test_graph_nodes.py
git commit -m "feat(api): agente_ui forca tema de suporte quando ha frustracao recorrente"
```

---

## Task 13: Suíte completa e finalização

**Files:** nenhum arquivo novo — apenas verificação.

- [ ] **Step 1: Rodar a suíte inteira da API**

Run: `cd api && python -m pytest -q`
Expected: 0 failures.

- [ ] **Step 2: Lint**

Run: `cd api && python -m ruff check .`
Expected: 0 erros. Se houver erro de ordenação de import, rode
`python -m ruff check . --fix`, re-rode a suíte e comite o ajuste.

- [ ] **Step 3: Revisão final do diff**

Run: `git diff main --stat` (a partir da worktree, comparando com a base)
Expected: só os arquivos listados nas tasks acima aparecem alterados.

- [ ] **Step 4: Finalizar**

Anuncie: "Usando a skill finishing-a-development-branch para concluir este
trabalho." e siga essa skill (verificar testes → apresentar as 4 opções →
executar a escolha → limpar a worktree).
