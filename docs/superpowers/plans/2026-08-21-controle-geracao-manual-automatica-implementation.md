# Controle de geração manual/automática de personalização — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o professor desligue os disparos automáticos de
`class_delta_sync` (por edição de tópico/conteúdo) e acione a geração
manualmente — por perfil individual num tópico/conteúdo, ou para todos os
tópicos de uma turma num único perfil.

**Architecture:** Nova coluna `professor.geracao_automatica` (default
`true`). O backend passa a resolver o `professor_id` da `classe_id` e
recusar (no-op) jobs `class_delta_sync` quando essa coluna for `false` —
`enqueue_personalizacao_job` ganha esse portão. Dois novos job kinds
(`manual_profile_generate`, `manual_profile_generate_all`) não passam pelo
portão e reaproveitam toda a lógica de "só preenche o que falta" que já
existe (`buscar_mais_recente_por_perfil` por `source_hash`). `_build_targets`
ganha um filtro opcional de perfil, usado só pelos dois kinds novos. Frontend
ganha um `Switch` em "Meus Dados" (escrita direta via Supabase, mesmo padrão
já usado ali) e dois controles novos na aba "Personalizações" → "Por perfil"
(botão individual por card de perfil + controle "gerar tudo" por turma).

**Tech Stack:** FastAPI + SQLAlchemy (async) + Alembic no backend;
React + TypeScript + Vitest no frontend; Supabase Postgres.

---

## Task 1: Migration — coluna `geracao_automatica` em `professor`

**Files:**
- Create: `api/alembic/versions/20260821_01_professor_geracao_automatica.py`

- [ ] **Step 1: Escrever a migration**

```python
"""professor.geracao_automatica - controle manual/automatico de personalizacao

Adiciona a coluna que liga/desliga os disparos automaticos de
class_delta_sync (edicao de topico/conteudo). Default true preserva o
comportamento atual para todo professor existente. Ver
docs/superpowers/specs/2026-08-21-controle-geracao-manual-automatica-design.md.

Revision ID: 20260821_01
Revises: 20260819_01
Create Date: 2026-08-21
"""

from alembic import op

revision = "20260821_01"
down_revision = "20260819_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE professor
          ADD COLUMN IF NOT EXISTS geracao_automatica boolean NOT NULL DEFAULT true
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE professor DROP COLUMN IF EXISTS geracao_automatica")
```

- [ ] **Step 2: Verificar que essa migration é o único head e que o SQL offline renderiza idempotente**

Run: `cd api && python -m pytest tests/test_migrations.py -q`
Expected: PASS (os testes já existentes de "único head"/"SQL offline
idempotente" cobrem migrations novas automaticamente — não precisam de
alteração).

- [ ] **Step 3: Commit**

```bash
git add api/alembic/versions/20260821_01_professor_geracao_automatica.py
git commit -m "feat(api): adiciona coluna professor.geracao_automatica"
```

---

## Task 2: `ProfessorRepository`

**Files:**
- Create: `api/app/repositories/professor.py`

- [ ] **Step 1: Escrever o repositório**

```python
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class ProfessorRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def buscar_geracao_automatica_por_classe(self, classe_id: int) -> bool:
        """True (default seguro) quando a classe/professor nao for
        encontrado - nunca bloqueia geracao por ausencia de dado, so quando
        o professor desligou explicitamente."""
        result = await self.session.execute(
            text(
                """
                SELECT p.geracao_automatica
                FROM classe c
                JOIN professor p ON p.id = c.professor_id
                WHERE c.id = :classe_id
                """
            ),
            {"classe_id": classe_id},
        )
        value = result.scalar()
        return True if value is None else bool(value)
```

Não precisa de teste unitário dedicado para este método (consulta SQL crua
simples) — é exercitado via mock no Task 4, mesmo padrão já usado para
`PersonalizacaoJobsRepository.find_open_job_by_payload`/
`list_open_jobs_by_payload` nos testes de `enqueue_personalizacao_job`.

- [ ] **Step 2: Commit**

```bash
git add api/app/repositories/professor.py
git commit -m "feat(api): adiciona ProfessorRepository.buscar_geracao_automatica_por_classe"
```

---

## Task 3: Filtro de perfil em `_build_targets`

**Files:**
- Modify: `api/app/services/personalizacao_jobs.py:661-799` (`_build_targets`)
- Test: `api/tests/test_personalizacao_jobs_loop.py`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final do bloco de testes de `_build_targets` (depois de
`test_build_targets_generates_seven_profiles_for_each_content`, por volta da
linha 657):

```python
@pytest.mark.asyncio
async def test_build_targets_filters_by_brainhex_profile_keys_when_informado(monkeypatch) -> None:
    """manual_profile_generate/manual_profile_generate_all passam um unico
    perfil - _build_targets deve gerar targets so pra esse perfil, nao os 7."""
    student_id = "b49f2e21-a6f9-4c8d-9533-5a32bb219754"
    monkeypatch.setattr(
        "app.repositories.conteudo_classe.ConteudoClasseRepository.listar_alunos_classe_com_perfil_dominante",
        AsyncMock(return_value=[{"aluno_id": student_id, "perfil_dominante": "seeker"}]),
    )
    monkeypatch.setattr(
        "app.repositories.conteudo_classe.ConteudoClasseRepository.mapear_todos_conteudos_por_topicos",
        AsyncMock(return_value={117: [125]}),
    )

    targets, topics, profile_map = await _build_targets(
        session=object(),
        kind="manual_profile_generate",
        classe_id=32,
        topico_ids=[117],
        brainhex_profile_keys=["achiever"],
    )

    assert topics == [117]
    assert len(targets) == 1
    assert targets[0]["brainhex_profile_key"] == "achiever"
    assert len(profile_map) == 1
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd api && python -m pytest tests/test_personalizacao_jobs_loop.py::test_build_targets_filters_by_brainhex_profile_keys_when_informado -q`
Expected: FAIL (`TypeError: _build_targets() got an unexpected keyword
argument 'brainhex_profile_keys'` — o kind `manual_profile_generate` também
ainda não existe no branch de kinds elegíveis).

- [ ] **Step 3: Implementar**

Em `api/app/services/personalizacao_jobs.py`, adicionar as duas constantes de
kind logo depois de `JOB_KIND_CLASS_THEME` (linha 61):

```python
JOB_KIND_CLASS_THEME = "class_theme_sync"
JOB_KIND_MANUAL_PROFILE_GENERATE = "manual_profile_generate"
JOB_KIND_MANUAL_PROFILE_GENERATE_ALL = "manual_profile_generate_all"
```

Assinatura de `_build_targets` (linha 661-669) ganha o novo parâmetro:

```python
async def _build_targets(
    *,
    session: AsyncSession,
    kind: str,
    classe_id: int,
    aluno_id: str | None = None,
    topico_ids: list[int] | None = None,
    conteudo_ids: list[int] | None = None,
    brainhex_profile_keys: list[str] | None = None,
) -> tuple[list[dict[str, Any]], list[int], dict[str, str]]:
```

O bloco de kinds elegíveis (linha 749-754) passa a incluir os dois novos:

```python
    if kind in {
        JOB_KIND_ENROLLMENT,
        JOB_KIND_CLASS_DELTA,
        JOB_KIND_FULL_SYNC,
        JOB_KIND_MANUAL_RETRY,
        JOB_KIND_MANUAL_PROFILE_GENERATE,
        JOB_KIND_MANUAL_PROFILE_GENERATE_ALL,
    }:
```

E o loop de perfis dentro desse bloco (linha 760, dentro do
`representative_by_profile` e do loop principal em 773-787) troca
`_BRAINHEX_PROFILE_KEYS` pelo filtro quando informado. Duas ocorrências:

```python
        representative_by_profile: dict[str, str] = {}

        for profile_key in (brainhex_profile_keys or _BRAINHEX_PROFILE_KEYS):
            candidate = next(
                (
                    aluno
                    for aluno in alunos
                    if profile_by_aluno.get(aluno) == profile_key
                ),
                None,
            )
            if candidate is None:
                candidate = str(aluno_id) if aluno_id and str(aluno_id) in alunos else alunos[0]
            representative_by_profile[profile_key] = candidate

        for current_topico_id in resolved_topicos:
            scoped_conteudo_ids: list[int | None] = list(
                conteudos_por_topico.get(current_topico_id) or [None]
            )
            for current_conteudo_id in scoped_conteudo_ids:
                for profile_key in (brainhex_profile_keys or _BRAINHEX_PROFILE_KEYS):
                    owner_aluno_id = representative_by_profile.get(profile_key)
                    if not owner_aluno_id:
                        continue
                    _append_target(
                        owner_aluno_id=owner_aluno_id,
                        topico_id=current_topico_id,
                        conteudo_id=current_conteudo_id,
                        profile_key=profile_key,
                    )
        return targets, resolved_topicos, target_profile_map
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd api && python -m pytest tests/test_personalizacao_jobs_loop.py -q`
Expected: PASS (todos os testes, incluindo o novo).

- [ ] **Step 5: Commit**

```bash
git add api/app/services/personalizacao_jobs.py api/tests/test_personalizacao_jobs_loop.py
git commit -m "feat(api): _build_targets aceita filtro opcional de perfis BrainHex"
```

---

## Task 4: Portão de modo manual + novos kinds em `enqueue_personalizacao_job`

**Files:**
- Modify: `api/app/services/personalizacao_jobs.py:808-830` (`enqueue_personalizacao_job`)
- Test: `api/tests/test_personalizacao_jobs_loop.py`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar depois de `test_enqueue_job_does_not_reuse_open_job_from_different_topico`:

```python
@pytest.mark.asyncio
async def test_enqueue_class_delta_no_op_quando_professor_em_modo_manual(monkeypatch) -> None:
    """Professor com geracao_automatica=False: class_delta_sync (disparo por
    edicao de topico/conteudo) nao deve criar job nenhum."""
    build_targets_mock = AsyncMock()
    create_mock = AsyncMock()
    monkeypatch.setattr(jobs_module, "_build_targets", build_targets_mock)
    monkeypatch.setattr(
        "app.repositories.professor.ProfessorRepository.buscar_geracao_automatica_por_classe",
        AsyncMock(return_value=False),
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.criar_job_com_targets",
        create_mock,
    )

    result = await jobs_module.enqueue_personalizacao_job(
        session=object(),
        kind="class_delta_sync",
        classe_id=32,
        trigger_source="web_console",
        topico_ids=[117],
    )

    assert result == {"skipped": True, "reason": "geracao_manual_ativa"}
    assert build_targets_mock.await_count == 0
    assert create_mock.await_count == 0


@pytest.mark.asyncio
async def test_enqueue_manual_profile_generate_ignora_modo_manual(monkeypatch) -> None:
    """Os kinds manuais (gerar individual/gerar tudo) nunca passam pelo
    portao de geracao_automatica - sao a propria acao manual."""
    target = {
        "aluno_id": "b49f2e21-a6f9-4c8d-9533-5a32bb219754",
        "topico_id": 117,
        "conteudo_id": 125,
        "brainhex_profile_key": "achiever",
        "is_profile_template": False,
    }
    monkeypatch.setattr(
        jobs_module,
        "_build_targets",
        AsyncMock(return_value=([target], [117], {target["aluno_id"]: "achiever"})),
    )
    professor_pref_mock = AsyncMock(return_value=False)
    monkeypatch.setattr(
        "app.repositories.professor.ProfessorRepository.buscar_geracao_automatica_por_classe",
        professor_pref_mock,
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.list_open_jobs_by_payload",
        AsyncMock(return_value=[]),
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.criar_job_com_targets",
        AsyncMock(return_value={"id": "job-manual"}),
    )
    monkeypatch.setattr(
        jobs_module,
        "get_job_detail",
        AsyncMock(return_value={"job": {"id": "job-manual"}, "targets": [target]}),
    )

    result = await jobs_module.enqueue_personalizacao_job(
        session=object(),
        kind="manual_profile_generate",
        classe_id=32,
        trigger_source="web_console",
        topico_ids=[117],
        conteudo_ids=[125],
        brainhex_profile_keys=["achiever"],
    )

    assert result["job"]["id"] == "job-manual"
    assert professor_pref_mock.await_count == 0
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `cd api && python -m pytest tests/test_personalizacao_jobs_loop.py::test_enqueue_class_delta_no_op_quando_professor_em_modo_manual tests/test_personalizacao_jobs_loop.py::test_enqueue_manual_profile_generate_ignora_modo_manual -q`
Expected: FAIL (`kind="manual_profile_generate"` ainda não passa
`brainhex_profile_keys` adiante; o portão de modo manual ainda não existe).

- [ ] **Step 3: Implementar**

No topo de `api/app/services/personalizacao_jobs.py`, adicionar o import do
novo repositório (junto dos outros imports de `app.repositories.*`):

```python
from app.repositories.professor import ProfessorRepository
```

`enqueue_personalizacao_job` (linha 808-830) ganha o parâmetro
`brainhex_profile_keys` e o portão de modo manual:

```python
async def enqueue_personalizacao_job(
    *,
    session: AsyncSession,
    kind: str,
    classe_id: int,
    trigger_source: str,
    aluno_id: str | None = None,
    topico_ids: list[int] | None = None,
    conteudo_ids: list[int] | None = None,
    brainhex_profile_keys: list[str] | None = None,
    reason: str | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    repo = PersonalizacaoJobsRepository(session)
    scoped_aluno_id = aluno_id if kind in {JOB_KIND_ENROLLMENT, JOB_KIND_CLEANUP} else None

    # Portao de modo manual: so afeta class_delta_sync (disparo automatico
    # por edicao de topico/conteudo). Matricula/limpeza continuam sempre
    # automaticas, e os kinds manual_profile_generate* SAO a propria acao
    # manual - nunca passam por aqui, entao nao existe risco de o professor
    # ficar sem conseguir gerar nada em modo manual.
    if kind == JOB_KIND_CLASS_DELTA:
        professor_repo = ProfessorRepository(session)
        geracao_automatica = await professor_repo.buscar_geracao_automatica_por_classe(classe_id)
        if not geracao_automatica:
            return {"skipped": True, "reason": "geracao_manual_ativa"}

    targets, resolved_topicos, target_profile_map = await _build_targets(
        session=session,
        kind=kind,
        classe_id=classe_id,
        aluno_id=aluno_id,
        topico_ids=topico_ids,
        conteudo_ids=conteudo_ids,
        brainhex_profile_keys=brainhex_profile_keys,
    )
```

(o restante da função continua exatamente igual — o resto do corpo já lido
em Task 3/PR anteriores não muda).

- [ ] **Step 4: Endpoint `criar_job_class_delta` precisa lidar com a resposta de skip**

`enqueue_personalizacao_job` agora pode devolver `{"skipped": True, "reason":
"geracao_manual_ativa"}` (sem chave `"job"`) quando `kind ==
JOB_KIND_CLASS_DELTA` e o professor está em modo manual. O endpoint
existente `criar_job_class_delta` (`api/app/api/v1/personalizacao.py:2374-
2399`) faz `**_to_job_response(detail["job"]).model_dump()` sem checar isso
antes — quebraria com `KeyError` no primeiro professor em modo manual que
editar um tópico. Ajustar:

```python
@router.post("/jobs/class-delta", response_model=None, status_code=status.HTTP_201_CREATED)
async def criar_job_class_delta(
    payload: PersonalizacaoJobPayload,
    user: UserContext = Depends(require_professor),
    session: AsyncSession = Depends(get_session),
) -> PersonalizacaoJobDetailResponse | dict[str, Any]:
    access_repo = AccessRepository(session)
    owns_class = await access_repo.professor_owns_classe(user.professor_id or user.user_id, payload.classe_id)
    if not owns_class:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Professor sem permissao para esta classe.",
        )
    detail = await enqueue_personalizacao_job(
        session=session,
        kind=JOB_KIND_CLASS_DELTA,
        classe_id=payload.classe_id,
        trigger_source=payload.trigger_source,
        topico_ids=payload.topico_ids,
        conteudo_ids=payload.conteudo_ids,
        reason=payload.reason,
    )
    if detail.get("skipped"):
        return {"skipped": True, "reason": detail.get("reason")}
    return PersonalizacaoJobDetailResponse(
        **_to_job_response(detail["job"]).model_dump(),
        targets=[_to_job_target_response(item) for item in detail["targets"]],
    )
```

`response_model=None` é necessário porque a rota agora pode devolver dois
formatos diferentes — sem isso o FastAPI tenta validar o dict de skip contra
`PersonalizacaoJobDetailResponse` e falha. `dict`/`Any` já devem estar
disponíveis via `from typing import Any` (checar import no topo do arquivo;
adicionar se faltar).

Escrever um teste cobrindo esse caminho, junto dos outros testes de rota
já existentes em `api/tests/test_api.py` (mesmo padrão de `TestClient` +
`FakeSession` usado em `test_personalizar_route_reaproveita_job_media_
generation_aberto_sem_reiniciar`): mockar
`enqueue_personalizacao_job` retornando `{"skipped": True, "reason":
"geracao_manual_ativa"}` e confirmar `response.status_code == 201` e
`response.json() == {"skipped": True, "reason": "geracao_manual_ativa"}`.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `cd api && python -m pytest tests/test_personalizacao_jobs_loop.py tests/test_api.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/app/services/personalizacao_jobs.py api/app/api/v1/personalizacao.py api/tests/test_personalizacao_jobs_loop.py api/tests/test_api.py
git commit -m "feat(api): portao de modo manual para class-delta + kinds manuais ignoram o portao"
```

---

## Task 5: Schemas + endpoints `manual-generate` e `manual-generate-all`

**Files:**
- Modify: `api/app/schemas/personalizacao.py:307-313` (perto de `PersonalizacaoJobPayload`)
- Modify: `api/app/api/v1/personalizacao.py:73-82` (imports) e depois da linha 2462 (`criar_job_class_theme`)

- [ ] **Step 1: Novos schemas**

Em `api/app/schemas/personalizacao.py`, logo depois de `PersonalizacaoJobPayload`
(linha 313):

```python
class PersonalizacaoManualGeneratePayload(BaseModel):
    classe_id: int
    topico_id: int
    conteudo_id: int | None = None
    brainhex_profile_key: str
    trigger_source: str = "api"


class PersonalizacaoManualGenerateAllPayload(BaseModel):
    classe_id: int
    brainhex_profile_key: str
    trigger_source: str = "api"
```

- [ ] **Step 2: Novos endpoints**

Em `api/app/api/v1/personalizacao.py`, atualizar o bloco de import (linha
73-82) para trazer os dois kinds novos e os dois schemas novos:

```python
from app.services.personalizacao_jobs import (
    JOB_KIND_CLASS_DELTA,
    JOB_KIND_CLASS_THEME,
    JOB_KIND_CLEANUP,
    JOB_KIND_ENROLLMENT,
    JOB_KIND_FULL_SYNC,
    JOB_KIND_MANUAL_PROFILE_GENERATE,
    JOB_KIND_MANUAL_PROFILE_GENERATE_ALL,
    JOB_KIND_MANUAL_RETRY,
    enqueue_personalizacao_job,
    get_job_detail,
)
```

E adicionar o import dos dois schemas novos junto de onde
`PersonalizacaoJobPayload` já é importado nesse arquivo (mesma linha/bloco de
import de `app.schemas.personalizacao`).

Logo depois de `criar_job_class_theme` (depois da linha 2462, antes de
`criar_job_student_cleanup`):

```python
@router.post("/jobs/manual-generate", response_model=PersonalizacaoJobDetailResponse, status_code=status.HTTP_201_CREATED)
async def criar_job_manual_generate(
    payload: PersonalizacaoManualGeneratePayload,
    user: UserContext = Depends(require_professor),
    session: AsyncSession = Depends(get_session),
) -> PersonalizacaoJobDetailResponse:
    """Botao 'gerar' individual na aba Personalizacoes: um topico/conteudo x
    um perfil especifico, independente do modo automatico/manual do
    professor (essa chamada E a acao manual)."""
    access_repo = AccessRepository(session)
    owns_class = await access_repo.professor_owns_classe(user.professor_id or user.user_id, payload.classe_id)
    if not owns_class:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Professor sem permissao para esta classe.",
        )
    detail = await enqueue_personalizacao_job(
        session=session,
        kind=JOB_KIND_MANUAL_PROFILE_GENERATE,
        classe_id=payload.classe_id,
        trigger_source=payload.trigger_source,
        topico_ids=[payload.topico_id],
        conteudo_ids=[payload.conteudo_id] if payload.conteudo_id is not None else None,
        brainhex_profile_keys=[payload.brainhex_profile_key],
        reason="geracao_manual_perfil_console",
    )
    return PersonalizacaoJobDetailResponse(
        **_to_job_response(detail["job"]).model_dump(),
        targets=[_to_job_target_response(item) for item in detail["targets"]],
    )


@router.post("/jobs/manual-generate-all", response_model=PersonalizacaoJobDetailResponse, status_code=status.HTTP_201_CREATED)
async def criar_job_manual_generate_all(
    payload: PersonalizacaoManualGenerateAllPayload,
    user: UserContext = Depends(require_professor),
    session: AsyncSession = Depends(get_session),
) -> PersonalizacaoJobDetailResponse:
    """Botao 'gerar tudo' na aba Personalizacoes: todos os topicos da turma
    selecionada, para um unico perfil escolhido."""
    access_repo = AccessRepository(session)
    owns_class = await access_repo.professor_owns_classe(user.professor_id or user.user_id, payload.classe_id)
    if not owns_class:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Professor sem permissao para esta classe.",
        )
    detail = await enqueue_personalizacao_job(
        session=session,
        kind=JOB_KIND_MANUAL_PROFILE_GENERATE_ALL,
        classe_id=payload.classe_id,
        trigger_source=payload.trigger_source,
        brainhex_profile_keys=[payload.brainhex_profile_key],
        reason="geracao_manual_turma_console",
    )
    return PersonalizacaoJobDetailResponse(
        **_to_job_response(detail["job"]).model_dump(),
        targets=[_to_job_target_response(item) for item in detail["targets"]],
    )
```

- [ ] **Step 3: Verificar que a API sobe sem erro de import/rota**

Run: `cd api && python -c "from app.main import app; print(sorted(r.path for r in app.routes if 'manual-generate' in r.path))"`
Expected:
```
['/api/v1/personalizar/jobs/manual-generate', '/api/v1/personalizar/jobs/manual-generate-all']
```

- [ ] **Step 4: Rodar a suíte completa da API**

Run: `cd api && python -m pytest -q`
Expected: PASS, sem regressão em nenhum teste existente.

- [ ] **Step 5: Commit**

```bash
git add api/app/schemas/personalizacao.py api/app/api/v1/personalizacao.py
git commit -m "feat(api): endpoints manual-generate e manual-generate-all"
```

---

## Task 6: Frontend — API helpers em `personalizacoesApi.ts`

**Files:**
- Modify: `frontend/src/components/console/personalizacoes/personalizacoesApi.ts`
- Test: `frontend/src/components/console/personalizacoes/personalizacoesApi.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `personalizacoesApi.test.ts`:

```typescript
import { buildManualGeneratePayload, buildManualGenerateAllPayload } from "./personalizacoesApi";

describe("buildManualGeneratePayload", () => {
  it("monta o payload do botao individual com conteudo escolhido", () => {
    expect(
      buildManualGeneratePayload({
        classeId: 32,
        topicoId: 121,
        conteudoId: 126,
        perfil: "achiever",
      })
    ).toEqual({
      classe_id: 32,
      topico_id: 121,
      conteudo_id: 126,
      brainhex_profile_key: "achiever",
    });
  });

  it("omite conteudo_id quando nao ha conteudo selecionado", () => {
    expect(
      buildManualGeneratePayload({
        classeId: 32,
        topicoId: 121,
        perfil: "achiever",
      })
    ).toEqual({
      classe_id: 32,
      topico_id: 121,
      brainhex_profile_key: "achiever",
    });
  });
});

describe("buildManualGenerateAllPayload", () => {
  it("monta o payload do botao 'gerar tudo'", () => {
    expect(buildManualGenerateAllPayload({ classeId: 32, perfil: "seeker" })).toEqual({
      classe_id: 32,
      brainhex_profile_key: "seeker",
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd frontend && npx vitest run src/components/console/personalizacoes/personalizacoesApi.test.ts`
Expected: FAIL (`buildManualGeneratePayload`/`buildManualGenerateAllPayload`
não existem ainda).

- [ ] **Step 3: Implementar**

Em `personalizacoesApi.ts`, adicionar (perto de
`regenerarDocumentoPersonalizacao`, reaproveitando o mesmo `apiRequest`
privado já existente no arquivo):

```typescript
export type PersonalizacaoJobResumo = {
  id: string;
  kind: string;
  status: string;
  total_targets: number;
  processed_targets: number;
  error_count: number;
};

// eslint-disable-next-line react-refresh/only-export-components
export function buildManualGeneratePayload(params: {
  classeId: number;
  topicoId: number;
  conteudoId?: number;
  perfil: string;
}) {
  return {
    classe_id: params.classeId,
    topico_id: params.topicoId,
    ...(params.conteudoId == null ? {} : { conteudo_id: params.conteudoId }),
    brainhex_profile_key: params.perfil,
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function buildManualGenerateAllPayload(params: { classeId: number; perfil: string }) {
  return {
    classe_id: params.classeId,
    brainhex_profile_key: params.perfil,
  };
}

export async function enqueueManualGenerateJob(
  accessToken: string,
  params: { classeId: number; topicoId: number; conteudoId?: number; perfil: string }
): Promise<PersonalizacaoJobResumo> {
  return apiRequest<PersonalizacaoJobResumo>("/api/v1/personalizar/jobs/manual-generate", accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildManualGeneratePayload(params)),
  });
}

export async function enqueueManualGenerateAllJob(
  accessToken: string,
  params: { classeId: number; perfil: string }
): Promise<PersonalizacaoJobResumo> {
  return apiRequest<PersonalizacaoJobResumo>("/api/v1/personalizar/jobs/manual-generate-all", accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildManualGenerateAllPayload(params)),
  });
}

export async function fetchPersonalizacaoJobStatus(
  accessToken: string,
  jobId: string
): Promise<PersonalizacaoJobResumo> {
  return apiRequest<PersonalizacaoJobResumo>(`/api/v1/personalizar/jobs/${jobId}`, accessToken);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd frontend && npx vitest run src/components/console/personalizacoes/personalizacoesApi.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/console/personalizacoes/personalizacoesApi.ts frontend/src/components/console/personalizacoes/personalizacoesApi.test.ts
git commit -m "feat(frontend): helpers de API para gerar manual (individual e turma toda)"
```

---

## Task 7: Toggle em "Meus Dados"

**Files:**
- Modify: `frontend/src/pages/Console.tsx:21-25` (`ProfessorUpdateData`), `:59-62` (select), `:105-112` (update)
- Modify: `frontend/src/components/console/ProfileSection.tsx`

- [ ] **Step 1: Ler o campo novo ao carregar o perfil**

Em `Console.tsx`, a interface `ProfessorUpdateData` (linha 21-25) ganha o
campo:

```typescript
export interface ProfessorUpdateData {
  nome: string;
  descricao: string;
  instituicao: string;
  disciplina: string;
  geracaoAutomatica: boolean;
}
```

O `select` que busca o professor (linha 59-62) passa a trazer a coluna nova:

```typescript
          .from("professor")
          .select("id, nome, descricao, instituicao, disciplina, geracao_automatica")
          .eq("id", user.id)
          .maybeSingle();
```

E o `setProfessorData` logo abaixo (linha 66-73) ganha o campo, com default
`true` (mesmo default seguro da coluna no banco, pro caso de o valor vir
`null` de uma linha antiga):

```typescript
        setProfessorData({
          id: user.id,
          nome: data?.nome || user.user_metadata?.nome || "Professor",
          email: user.email,
          instituicao: data?.instituicao ?? user.user_metadata?.instituicao ?? "",
          disciplina: data?.disciplina ?? user.user_metadata?.disciplina ?? "",
          descricao: data?.descricao ?? user.user_metadata?.descricao ?? "",
          geracaoAutomatica: data?.geracao_automatica ?? true,
        });
```

- [ ] **Step 2: Persistir o campo novo ao salvar**

O `update` em `Console.tsx` (linha 105-112) ganha a coluna:

```typescript
        .from("professor")
        .update({
          nome: updatedData.nome,
          descricao: updatedData.descricao,
          instituicao: updatedData.instituicao,
          disciplina: updatedData.disciplina,
          geracao_automatica: updatedData.geracaoAutomatica,
        })
        .eq("id", professorData.id);
```

E o `setProfessorData` de confirmação logo abaixo (linha 116-120) ganha o
campo espelhado, no mesmo padrão dos outros:

```typescript
      setProfessorData((prev) =>
        prev
          ? {
              ...prev,
              nome: updatedData.nome,
              descricao: updatedData.descricao,
              instituicao: updatedData.instituicao,
              disciplina: updatedData.disciplina,
              geracaoAutomatica: updatedData.geracaoAutomatica,
            }
          : prev
      );
```

(a interface de estado `professorData` no topo de `Console.tsx` também
precisa do campo `geracaoAutomatica: boolean` — mesma forma de
`ProfessorUpdateData`.)

- [ ] **Step 3: UI do toggle em `ProfileSection.tsx`**

Adicionar o import do `Switch` (componente já existe em
`@/components/ui/switch`) e, dentro do `formData` local do componente (que
hoje espelha `nome`/`descricao`/`instituicao`/`disciplina` — mesmo padrão),
incluir `geracaoAutomatica`. No JSX, logo acima do botão "Salvar Alterações"
(linha 132-135):

```tsx
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Geração automática de personalização</p>
              <p className="text-sm text-muted-foreground">
                Quando desligado, criar/editar tópicos e conteúdos não dispara geração
                sozinho — use o botão "Gerar" na aba Personalizações.
              </p>
            </div>
            <Switch
              checked={formData.geracaoAutomatica}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, geracaoAutomatica: checked }))
              }
            />
          </div>

          <Button onClick={handleSave} className="w-full" disabled={isDisabled}>
            <Save className="h-4 w-4 mr-2" />
            Salvar Alterações
          </Button>
```

`handleSave` (linha 56-64) já espalha `...formData` no `updatedData`
enviado a `onUpdate` — não precisa de mudança adicional além de
`formData` carregar `geracaoAutomatica` desde a inicialização (a partir de
`professorData.geracaoAutomatica`, mesmo padrão dos outros campos do form).

- [ ] **Step 4: Verificação manual (sem teste automatizado — nenhum dos dois arquivos tem suíte hoje)**

Rodar o dev server (`npm run dev` na raiz, ou só o frontend), abrir "Meus
Dados", alternar o switch, salvar, recarregar a página e confirmar que o
estado persiste (chamando a mesma verificação visual já usada nesta sessão
para outras mudanças de UI).

- [ ] **Step 5: Typecheck + lint**

Run: `cd frontend && npx tsc --noEmit -p . && npx eslint src/pages/Console.tsx src/components/console/ProfileSection.tsx`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Console.tsx frontend/src/components/console/ProfileSection.tsx
git commit -m "feat(frontend): toggle de geracao automatica em Meus Dados"
```

---

## Task 8: Botão "Gerar" individual por card de perfil

**Files:**
- Modify: `frontend/src/components/console/personalizacoes/PersonalizacoesSection.tsx:866-` (`PerfilMaterialCard`)

- [ ] **Step 1: Passar `conteudoId` e `perfil` pro card**

No `map` que renderiza os cards (linha 582-593), passar `conteudoId` (hoje só
`classeId`/`topicoId`/`resolveToken`/`onRegenerated` são passados):

```tsx
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {porPerfil.perfis.map((item) => (
                  <PerfilMaterialCard
                    key={item.perfil}
                    item={item}
                    classeId={Number(classeId)}
                    topicoId={Number(topicoId)}
                    conteudoId={conteudoId ? Number(conteudoId) : undefined}
                    resolveToken={resolveToken}
                    onRegenerated={() => void loadPorPerfil({ silent: true, queueIfBusy: true })}
                  />
                ))}
              </div>
```

- [ ] **Step 2: Estado de job + botão no componente**

Em `PerfilMaterialCard` (linha 866-878), a assinatura ganha `conteudoId` e um
novo estado local de job manual:

```tsx
function PerfilMaterialCard({
  item,
  classeId,
  topicoId,
  conteudoId,
  resolveToken,
  onRegenerated,
}: {
  item: PersonalizacaoPerfilItem;
  classeId: number;
  topicoId: number;
  conteudoId?: number;
  resolveToken: () => Promise<string>;
  onRegenerated: () => void;
}) {
  const [dialogTab, setDialogTab] = useState<MaterialTipo | null>(null);
  const [manualJob, setManualJob] = useState<PersonalizacaoJobResumo | null>(null);
  const [manualJobError, setManualJobError] = useState<string | null>(null);
```

Logo depois (mesmo componente), um `useEffect` de polling enquanto o job
estiver ativo — mesma lista de status ativos já usada em
`isPersonalizacaoJobActive` no módulo de trilha (`pending`/`processing`/
`partial`), reimplementada aqui localmente pra não criar dependência
cross-pasta:

```tsx
  useEffect(() => {
    if (!manualJob || !["pending", "processing", "partial"].includes(manualJob.status)) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const token = await resolveToken();
        const updated = await fetchPersonalizacaoJobStatus(token, manualJob.id);
        if (cancelled) return;
        setManualJob(updated);
        if (!["pending", "processing", "partial"].includes(updated.status)) {
          onRegenerated();
        }
      } catch (error) {
        if (!cancelled) {
          setManualJobError(error instanceof Error ? error.message : "Falha ao consultar progresso.");
        }
      }
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [manualJob, resolveToken, onRegenerated]);

  const handleGerar = async () => {
    setManualJobError(null);
    try {
      const token = await resolveToken();
      const job = await enqueueManualGenerateJob(token, {
        classeId,
        topicoId,
        conteudoId,
        perfil: item.perfil,
      });
      setManualJob(job);
    } catch (error) {
      setManualJobError(error instanceof Error ? error.message : "Falha ao enfileirar geração.");
    }
  };
```

E no JSX do card (perto do topo, ao lado do status badge existente),
adicionar botão + indicador:

```tsx
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleGerar()}
            disabled={Boolean(manualJob && ["pending", "processing", "partial"].includes(manualJob.status))}
          >
            {manualJob && ["pending", "processing", "partial"].includes(manualJob.status)
              ? `Gerando ${manualJob.processed_targets}/${manualJob.total_targets}${
                  manualJob.error_count > 0 ? ` (${manualJob.error_count} erro(s))` : ""
                }`
              : "Gerar"}
          </Button>
          {manualJobError && <p className="text-xs text-destructive">{manualJobError}</p>}
```

- [ ] **Step 3: Import**

No topo de `PersonalizacoesSection.tsx`, junto dos outros imports de
`personalizacoesApi`:

```typescript
import {
  enqueueManualGenerateJob,
  fetchPersonalizacaoJobStatus,
  type PersonalizacaoJobResumo,
} from "./personalizacoesApi";
```

(mais `useEffect` no import de `react` no topo do arquivo, se ainda não
estiver importado.)

- [ ] **Step 4: Typecheck + lint**

Run: `cd frontend && npx tsc --noEmit -p . && npx eslint src/components/console/personalizacoes/PersonalizacoesSection.tsx`
Expected: sem erros.

- [ ] **Step 5: Verificação manual no browser**

Abrir a aba Personalizações → Por perfil com uma classe/tópico/conteúdo
selecionados, clicar "Gerar" num card, confirmar que o botão mostra
progresso (`X/Y`) e volta a "Gerar" quando o job termina, atualizando o
preview do card (via `onRegenerated`).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/console/personalizacoes/PersonalizacoesSection.tsx
git commit -m "feat(frontend): botao 'Gerar' individual por card de perfil"
```

---

## Task 9: Controle "Gerar tudo" (turma + perfil)

**Files:**
- Modify: `frontend/src/components/console/personalizacoes/PersonalizacoesSection.tsx`

- [ ] **Step 1: Estado novo no componente principal**

No componente que já guarda `classeId`/`topicoId`/`conteudoId`/`porPerfil`
etc. (o componente-pai que renderiza a barra de seleção, por volta da linha
447), adicionar:

```tsx
  const [perfilParaGerarTudo, setPerfilParaGerarTudo] = useState<string>("seeker");
  const [gerarTudoJob, setGerarTudoJob] = useState<PersonalizacaoJobResumo | null>(null);
  const [gerarTudoError, setGerarTudoError] = useState<string | null>(null);
```

Mesmo `useEffect` de polling do Task 8 (extraído aqui como cópia local — os
dois pontos de polling são pequenos o bastante pra não valer uma abstração
compartilhada agora; ver "Fora de escopo" na spec):

```tsx
  useEffect(() => {
    if (!gerarTudoJob || !["pending", "processing", "partial"].includes(gerarTudoJob.status)) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const token = await resolveToken();
        const updated = await fetchPersonalizacaoJobStatus(token, gerarTudoJob.id);
        if (cancelled) return;
        setGerarTudoJob(updated);
        if (!["pending", "processing", "partial"].includes(updated.status)) {
          void loadPorPerfil({ silent: true, queueIfBusy: true });
        }
      } catch (error) {
        if (!cancelled) {
          setGerarTudoError(error instanceof Error ? error.message : "Falha ao consultar progresso.");
        }
      }
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [gerarTudoJob, resolveToken, loadPorPerfil]);

  const handleGerarTudo = async () => {
    if (!classeId) return;
    setGerarTudoError(null);
    try {
      const token = await resolveToken();
      const job = await enqueueManualGenerateAllJob(token, {
        classeId: Number(classeId),
        perfil: perfilParaGerarTudo,
      });
      setGerarTudoJob(job);
    } catch (error) {
      setGerarTudoError(error instanceof Error ? error.message : "Falha ao enfileirar geração.");
    }
  };
```

- [ ] **Step 2: UI, perto da barra de seleção de turma (dentro do `Card` das linhas 456-525)**

Adicionar como um bloco novo, logo abaixo do `Button` "Atualizar" (linha
516-523), dentro do mesmo `CardContent`:

```tsx
          <div className="flex items-end gap-2 border-l pl-4 ml-2">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Gerar tudo para o perfil</p>
              <Select value={perfilParaGerarTudo} onValueChange={setPerfilParaGerarTudo}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRAINHEX_PROFILE_KEYS.map((perfil) => (
                    <SelectItem key={perfil} value={perfil}>
                      {perfil}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleGerarTudo()}
              disabled={
                !classeId ||
                Boolean(gerarTudoJob && ["pending", "processing", "partial"].includes(gerarTudoJob.status))
              }
            >
              {gerarTudoJob && ["pending", "processing", "partial"].includes(gerarTudoJob.status)
                ? `Gerando ${gerarTudoJob.processed_targets}/${gerarTudoJob.total_targets}${
                    gerarTudoJob.error_count > 0 ? ` (${gerarTudoJob.error_count} erro(s))` : ""
                  }`
                : "Gerar tudo"}
            </Button>
          </div>
          {gerarTudoError && <p className="text-xs text-destructive">{gerarTudoError}</p>}
```

- [ ] **Step 3: Constante `BRAINHEX_PROFILE_KEYS` e imports**

Se o arquivo ainda não tiver a lista dos 7 perfis (`seeker`, `survivor`,
`daredevil`, `mastermind`, `conqueror`, `socializer`, `achiever`) disponível
como array, adicionar uma constante no topo do arquivo:

```typescript
const BRAINHEX_PROFILE_KEYS = [
  "seeker",
  "survivor",
  "daredevil",
  "mastermind",
  "conqueror",
  "socializer",
  "achiever",
] as const;
```

E acrescentar `enqueueManualGenerateAllJob` ao import já feito no Task 8:

```typescript
import {
  enqueueManualGenerateAllJob,
  enqueueManualGenerateJob,
  fetchPersonalizacaoJobStatus,
  type PersonalizacaoJobResumo,
} from "./personalizacoesApi";
```

- [ ] **Step 4: Typecheck + lint**

Run: `cd frontend && npx tsc --noEmit -p . && npx eslint src/components/console/personalizacoes/PersonalizacoesSection.tsx`
Expected: sem erros.

- [ ] **Step 5: Verificação manual no browser**

Selecionar uma turma, escolher um perfil no seletor novo, clicar "Gerar
tudo", confirmar progresso `X/Y` até completar e que os cards da aba
refletem o resultado depois.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/console/personalizacoes/PersonalizacoesSection.tsx
git commit -m "feat(frontend): controle 'gerar tudo' por turma e perfil"
```

---

## Task 10: Frontend — tolerar a resposta de skip nos disparos automáticos existentes

**Files:**
- Modify: `frontend/src/components/console/trilha/personalizacaoJobsApi.ts`
- Modify: `frontend/src/components/console/trilha/TopicsManager.tsx`

Com o Task 4, `POST /jobs/class-delta` agora pode devolver `{"skipped": true,
"reason": "geracao_manual_ativa"}` em vez do job normal, quando o professor
está em modo manual. `TopicsManager.tsx` é o único lugar do frontend que
lê campos do retorno dessa chamada (`ContentsManager.tsx`'s
`enqueueDeltaSafely` ignora o valor de retorno — não precisa de mudança).

- [ ] **Step 1: Tipar o retorno de `enqueueClassDeltaJob` como união**

Em `frontend/src/components/console/trilha/personalizacaoJobsApi.ts`,
alterar a assinatura (perto da linha 309-317):

```typescript
export type PersonalizacaoJobEnqueueResult =
  | PersonalizacaoJobDetail
  | { skipped: true; reason?: string };

export async function enqueueClassDeltaJob(
  accessToken: string,
  payload: PersonalizacaoJobPayload
): Promise<PersonalizacaoJobEnqueueResult> {
  return apiRequest<PersonalizacaoJobEnqueueResult>("/api/v1/personalizar/jobs/class-delta", accessToken, {
    method: "POST",
    body: JSON.stringify({ trigger_source: "web_console", ...payload }),
  });
}
```

- [ ] **Step 2: `rememberEnqueuedJob` ignora resultados de skip**

Em `frontend/src/components/console/trilha/TopicsManager.tsx`, o callback
`rememberEnqueuedJob` (perto da linha 212-225) ganha o tipo de parâmetro
união e um guard no topo:

```tsx
  const rememberEnqueuedJob = useCallback(
    (job: PersonalizacaoJobEnqueueResult) => {
      if ("skipped" in job) return;
      if (String(job.classe_id) !== selectedClassFilter) return;
      hasActiveJobsRef.current =
        isPersonalizacaoJobActive(job) || hasActiveJobsRef.current;
      setRecentJobs((current) => [
        job,
        ...current.filter((item) => item.id !== job.id),
      ].slice(0, 6));
      setJobsStatusError(null);
      setJobsRefreshRevision((revision) => revision + 1);
    },
    [selectedClassFilter]
  );
```

E o import de tipos no topo do arquivo ganha `PersonalizacaoJobEnqueueResult`
junto de `PersonalizacaoJobStatus` (já importado de `./personalizacaoJobsApi`).

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: sem erros — os 4 call sites de `enqueueClassDeltaJob` em
`TopicsManager.tsx` (criar/editar tópico, excluir tópico, reordenar, editar
dependências) só passam o resultado direto pra `rememberEnqueuedJob`, que
agora aceita a união; nenhum desses call sites acessa campos do job
diretamente.

- [ ] **Step 4: Teste**

Em `frontend/src/components/console/trilha/personalizacaoJobsApi.test.ts`,
confirmar que o teste de fixture `PersonalizacaoJobStatus` continua batendo
com o novo tipo união (não deve exigir mudança, já que
`PersonalizacaoJobEnqueueResult` é um supertipo que inclui o shape
existente). Rodar:

Run: `cd frontend && npx vitest run src/components/console/trilha`
Expected: PASS, sem regressão.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/console/trilha/personalizacaoJobsApi.ts frontend/src/components/console/trilha/TopicsManager.tsx
git commit -m "fix(frontend): tolera resposta de skip do class-delta quando professor esta em modo manual"
```

---

## Verificação final

- [ ] `cd api && python -m pytest -q` — suíte completa da API, 0 falhas.
- [ ] `cd frontend && npx vitest run && npx tsc --noEmit -p . && npx eslint .` — suíte completa do frontend, typecheck e lint limpos.
- [ ] Fluxo manual ponta a ponta no browser: desligar geração automática em
      "Meus Dados" → editar um tópico → confirmar que NENHUM job novo
      aparece na aba Trilha → ir em Personalizações → Por perfil → clicar
      "Gerar" num card → ver progresso e o material atualizar → voltar pra
      Trilha, ligar geração automática de novo, editar outro tópico →
      confirmar que O JOB volta a disparar sozinho.
