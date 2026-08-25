# Integração Direta ApiTraiUp → ApiBrainHex: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ApiTraiUp passa a enviar URLs brutas de fontes diretamente ao ApiBrainHex; LangGraph é removido do caminho de personalização; cards são gerados via chamada LLM direta.

**Architecture:** `_process_target` e rota `POST /personalizar` usam o fluxo: `fetch_personalizacao_context` → `gerar_cards_direto` → `salvar(plano=None)` → `disparar_brainhex_async(fontes=[...])`. ApiBrainHex baixa os arquivos, processa com Gemini (array de arquivos) e persiste mídias.

**Tech Stack:** FastAPI + asyncio (ApiTraiUp), Node.js/Express + Gemini SDK (ApiBrainHex), Supabase Storage + Postgres, Python JsonLLMService, httpx.

---

## Arquivos modificados

| Arquivo | O que muda |
|---|---|
| `ApiTraiUp/app/services/personalizacao.py` | Adiciona `fetch_personalizacao_context()` e `gerar_cards_direto()` |
| `ApiTraiUp/app/repositories/conteudo_personalizado.py` | `plano` vira `Optional[dict] = None` em `salvar()` |
| `ApiTraiUp/app/services/media_agents.py` | `disparar_brainhex_async` troca `conteudo_estudado` por `fontes: list[dict]` |
| `ApiTraiUp/app/services/personalizacao_jobs.py` | `_process_target` usa fluxo direto; remove imports do grafo |
| `ApiTraiUp/app/api/v1/personalizacao.py` | Rota `POST ""` usa fluxo direto; remove imports do grafo |
| `ApiBrainHex/src/services/geminiService.ts` | `processMediaWithGemini` aceita `fileData[]` |
| `ApiBrainHex/server.ts` | Adiciona `fetchFontesAsFileData()`; rota `/api/personalizar` aceita `fontes[]` |

---

## Task 1: fetch_personalizacao_context + gerar_cards_direto + plano opcional

**Files:**
- Modify: `ApiTraiUp/app/services/personalizacao.py`
- Modify: `ApiTraiUp/app/repositories/conteudo_personalizado.py`
- Test: `ApiTraiUp/tests/test_personalizacao_service.py`

- [ ] **Step 1: Escrever o teste (falha esperada)**

```python
# Em tests/test_personalizacao_service.py — acrescente ao final do arquivo

@pytest.mark.asyncio
async def test_fetch_personalizacao_context_retorna_campos_obrigatorios(
    monkeypatch, fake_session
):
    from app.services.personalizacao import fetch_personalizacao_context
    from unittest.mock import AsyncMock, MagicMock, patch

    fake_context = {
        "aluno": {"nome": "Ana", "modo_operacao": "imediato", "modo_resposta": "imediato"},
        "perfil_brainhex": [{"perfil": "seeker", "afinidade": 0.8}],
        "historico_eventos": [],
        "desempenho_recente": {},
    }
    fake_fontes = [
        {"arquivo_url": "https://s3.example.com/file.pdf", "mime_type": "application/pdf", "tipo": "documento"},
    ]

    with (
        patch("app.services.personalizacao.ContextRepository") as MockCtx,
        patch("app.services.personalizacao.ConteudoClasseRepository") as MockClasse,
        patch("app.services.personalizacao.FontesPersonalizacaoRepository") as MockFontes,
    ):
        ctx_inst = MagicMock()
        ctx_inst.fetch_aluno_context = AsyncMock(return_value=fake_context)
        ctx_inst.resolve_conteudo_foco_id = AsyncMock(return_value=42)
        MockCtx.return_value = ctx_inst

        classe_inst = MagicMock()
        classe_inst.buscar_topico = AsyncMock(return_value={"id": 10, "nome": "Python Básico"})
        classe_inst.buscar_conteudos_topico = AsyncMock(return_value=[])
        classe_inst.buscar_atividades_topico = AsyncMock(return_value=[])
        classe_inst.buscar_questoes_topico = AsyncMock(return_value=[])
        classe_inst.buscar_cards_topico = AsyncMock(return_value=[])
        MockClasse.return_value = classe_inst

        fontes_inst = MagicMock()
        fontes_inst.seed_from_class_content = AsyncMock(return_value={})
        fontes_inst.listar_para_contexto = AsyncMock(return_value=fake_fontes)
        MockFontes.return_value = fontes_inst

        result = await fetch_personalizacao_context(
            aluno_id="aluno-1",
            classe_id=5,
            topico_id=10,
            conteudo_id=None,
            settings=MagicMock(),
            session=fake_session,
        )

    assert "perfil_dominante" in result
    assert "fontes" in result
    assert "conteudo_classe" in result
    assert "contexto_aluno" in result
    assert "source_hash" in result
    assert "ciclo_id" in result
    assert result["perfil_dominante"] == "Seeker"
    assert len(result["fontes"]) == 1
    assert result["fontes"][0]["url"] == "https://s3.example.com/file.pdf"


@pytest.mark.asyncio
async def test_gerar_cards_direto_chama_llm_com_formatos_cards(monkeypatch):
    from app.services.personalizacao import gerar_cards_direto
    from unittest.mock import AsyncMock, MagicMock, patch

    fake_cards = [{"frente": "O que é Python?", "verso": "Linguagem interpretada", "icone": "🐍", "dificuldade": "facil", "xp": 10}]
    fake_llm_result = {"cards": {"items": fake_cards}}

    with patch("app.services.personalizacao.JsonLLMService") as MockLLM:
        llm_inst = MagicMock()
        llm_inst.ainvoke_json = AsyncMock(return_value=fake_llm_result)
        MockLLM.return_value = llm_inst

        result = await gerar_cards_direto(
            perfil="Seeker",
            conteudo_classe={
                "topico": {"nome": "Python Básico", "descricao": "Intro a Python"},
                "conteudos": [{"nome": "Variáveis"}],
                "atividades": [],
            },
            contexto_aluno={"modo_operacao": "imediato", "desempenho_recente": {}},
            perfil_brainhex=[{"perfil": "seeker", "afinidade": 0.8}],
            settings=MagicMock(),
        )

    assert result == {"items": fake_cards}
    call_kwargs = llm_inst.ainvoke_json.call_args.kwargs
    assert call_kwargs["prompt_name"] == "gerador_conteudo.txt"
    assert "cards" in call_kwargs["payload"]["formatos_solicitados"]
```

- [ ] **Step 2: Rodar os testes para confirmar falha**

```bash
cd C:\Users\geisb\Downloads\ApiTraiUp
python -m pytest tests/test_personalizacao_service.py::test_fetch_personalizacao_context_retorna_campos_obrigatorios tests/test_personalizacao_service.py::test_gerar_cards_direto_chama_llm_com_formatos_cards -v
```

Esperado: FAIL com `ImportError: cannot import name 'fetch_personalizacao_context'`

- [ ] **Step 3: Tornar `plano` opcional em `salvar()`**

Em `app/repositories/conteudo_personalizado.py`, linha 152:
```python
# ANTES:
plano: dict[str, Any],
# DEPOIS:
plano: dict[str, Any] | None = None,
```

- [ ] **Step 4: Implementar `fetch_personalizacao_context` em `personalizacao.py`**

Adicione ao final de `app/services/personalizacao.py` (antes de `build_personalizacao_state`):

```python
async def fetch_personalizacao_context(
    *,
    aluno_id: str,
    classe_id: int,
    topico_id: int,
    conteudo_id: int | None,
    settings: Settings,
    session: AsyncSession,
) -> dict[str, Any]:
    from uuid import uuid4

    ciclo_id = str(uuid4())
    context_repo = ContextRepository(session)
    classe_repo = ConteudoClasseRepository(session)
    fontes_repo = FontesPersonalizacaoRepository(session)

    context = await context_repo.fetch_aluno_context(aluno_id=aluno_id, classe_id=classe_id)

    if conteudo_id is None:
        conteudo_id = await context_repo.resolve_conteudo_foco_id(
            topico_id=topico_id, atividade_id=None, fallback_topico_id=None
        )

    await fontes_repo.seed_from_class_content(
        classe_id=classe_id, topico_ids=[topico_id]
    )
    fontes_raw = await fontes_repo.listar_para_contexto(
        classe_id=classe_id,
        topico_id=topico_id,
        conteudo_id=conteudo_id,
        aluno_id=aluno_id,
    )
    fontes = [
        {
            "url": str(f.get("arquivo_url") or f.get("url") or "").strip(),
            "mime_type": str(f.get("mime_type") or "").strip(),
            "tipo": str(f.get("tipo") or "documento").strip(),
        }
        for f in fontes_raw
        if (f.get("arquivo_url") or f.get("url") or "").strip()
    ]

    topico = await classe_repo.buscar_topico(topico_id)
    conteudos = await classe_repo.buscar_conteudos_topico(topico_id)
    atividades = await classe_repo.buscar_atividades_topico(topico_id)
    questoes = await classe_repo.buscar_questoes_topico(topico_id)
    cards_topico = await classe_repo.buscar_cards_topico(topico_id)

    source_hash = _build_source_hash(
        classe_id=classe_id,
        topico_id=topico_id,
        conteudo_id=conteudo_id,
        materiais_origem=[],
        cards_topico=cards_topico,
        atividades_topico=atividades,
        questoes_topico=questoes,
    )

    perfil_brainhex = context.get("perfil_brainhex") or []
    perfil_dominante = _perfil_dominante(perfil_brainhex)

    return {
        "perfil_dominante": perfil_dominante,
        "perfil_brainhex": perfil_brainhex,
        "fontes": fontes,
        "conteudo_classe": {
            "topico": topico or {},
            "conteudos": conteudos,
            "atividades": atividades,
        },
        "contexto_aluno": {
            "modo_operacao": context["aluno"].get("modo_operacao"),
            "modo_resposta": context["aluno"].get("modo_resposta"),
            "historico_eventos": context.get("historico_eventos") or [],
            "desempenho_recente": context.get("desempenho_recente") or {},
        },
        "source_hash": source_hash,
        "ciclo_id": ciclo_id,
    }
```

- [ ] **Step 5: Implementar `gerar_cards_direto` em `personalizacao.py`**

Adicione imediatamente após `fetch_personalizacao_context`:

```python
async def gerar_cards_direto(
    *,
    perfil: str,
    conteudo_classe: dict[str, Any],
    contexto_aluno: dict[str, Any],
    perfil_brainhex: list[dict[str, Any]],
    settings: Settings,
) -> dict[str, Any]:
    llm = JsonLLMService(settings)
    perfil_editorial = _build_profile_editorial_context(perfil, perfil_brainhex)

    topico = conteudo_classe.get("topico") or {}
    conteudos = conteudo_classe.get("conteudos") or []
    atividades = conteudo_classe.get("atividades") or []

    conteudo_estudado = {
        "tema_central": str(topico.get("nome") or topico.get("title") or "").strip(),
        "objetivo_pedagogico": str(topico.get("objetivo") or topico.get("descricao") or "").strip(),
        "conceitos_nucleares": [
            str(c.get("nome") or c.get("titulo") or "").strip()
            for c in conteudos
            if (c.get("nome") or c.get("titulo") or "").strip()
        ],
        "atividades": [
            str(a.get("enunciado") or a.get("titulo") or "").strip()
            for a in atividades
            if (a.get("enunciado") or a.get("titulo") or "").strip()
        ],
        "contexto_aluno": {
            "modo_operacao": contexto_aluno.get("modo_operacao") or "imediato",
            "desempenho": contexto_aluno.get("desempenho_recente") or {},
        },
    }

    modelo_editorial = {
        "perfil_dominante": perfil,
        "personalizacao_brainhex": {
            "perfil": perfil,
            "guia_nome": perfil_editorial.get("guia_nome"),
            "framing_narrativo": perfil_editorial.get("framing_narrativo"),
        },
    }

    result = await llm.ainvoke_json(
        prompt_name="gerador_conteudo.txt",
        payload={
            "modelo_editorial": modelo_editorial,
            "conteudo_estudado": conteudo_estudado,
            "perfil_editorial": perfil_editorial,
            "formatos_solicitados": ["cards"],
            "metas_tamanho_adaptativas": {"cards_min": 5, "cards_max": 15},
        },
    )

    if not isinstance(result, dict):
        raise ValueError(f"gerar_cards_direto: LLM retornou tipo inesperado {type(result)}")
    cards_payload = result.get("cards")
    if not cards_payload:
        raise ValueError("gerar_cards_direto: LLM nao retornou campo 'cards'")
    return cards_payload
```

- [ ] **Step 6: Rodar os testes para confirmar que passam**

```bash
python -m pytest tests/test_personalizacao_service.py::test_fetch_personalizacao_context_retorna_campos_obrigatorios tests/test_personalizacao_service.py::test_gerar_cards_direto_chama_llm_com_formatos_cards -v
```

Esperado: PASS

- [ ] **Step 7: Commit**

```bash
cd C:\Users\geisb\Downloads\ApiTraiUp
git add app/services/personalizacao.py app/repositories/conteudo_personalizado.py tests/test_personalizacao_service.py
git commit -m "feat: add fetch_personalizacao_context + gerar_cards_direto; make plano optional"
```

---

## Task 2: Atualizar disparar_brainhex_async (fontes em vez de conteudo_estudado)

**Files:**
- Modify: `ApiTraiUp/app/services/media_agents.py`
- Test: `ApiTraiUp/tests/test_api.py`

- [ ] **Step 1: Escrever o teste (falha esperada)**

```python
# Em tests/test_api.py — acrescente ao final

@pytest.mark.asyncio
async def test_disparar_brainhex_async_envia_fontes(respx_mock):
    import respx
    import httpx
    from app.services.media_agents import disparar_brainhex_async
    from unittest.mock import MagicMock

    settings = MagicMock()
    settings.brainhex_api_url = "http://brainhex.local"

    respx_mock.post("http://brainhex.local/api/personalizar").mock(
        return_value=httpx.Response(202)
    )

    result = await disparar_brainhex_async(
        settings=settings,
        perfil="seeker",
        fontes=[{"url": "https://s3.example.com/file.pdf", "mime_type": "application/pdf", "tipo": "documento"}],
        personalizacao_id=99,
        aluno_id="aluno-1",
        classe_id=5,
        topico_id=10,
        ciclo_id="abc123",
    )

    assert result is True
    request_body = respx_mock.calls[0].request
    import json as _json
    body = _json.loads(request_body.content)
    assert "fontes" in body
    assert body["fontes"][0]["url"] == "https://s3.example.com/file.pdf"
    assert "conteudo_estudado" not in body
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
python -m pytest tests/test_api.py::test_disparar_brainhex_async_envia_fontes -v
```

Esperado: FAIL com `TypeError: disparar_brainhex_async() got an unexpected keyword argument 'fontes'`

- [ ] **Step 3: Atualizar `disparar_brainhex_async` em `media_agents.py`**

Substitua a função inteira (linhas 205-236):

```python
async def disparar_brainhex_async(
    *,
    settings: Settings,
    perfil: str,
    fontes: list[dict[str, Any]],
    personalizacao_id: int,
    aluno_id: str = "",
    classe_id: int | None = None,
    topico_id: int | None = None,
    ciclo_id: str = "",
) -> bool:
    """Dispara BrainHex fire-and-forget com URLs brutas de fontes. Retorna True se 202."""
    brainhex_url = str(getattr(settings, "brainhex_api_url", "") or "").strip()
    if not brainhex_url:
        return False
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{brainhex_url.rstrip('/')}/api/personalizar",
                json={
                    "profile": str(perfil or "").strip().lower(),
                    "fontes": fontes,
                    "personalizacao_id": personalizacao_id,
                    "aluno_id": aluno_id,
                    "classe_id": classe_id,
                    "topico_id": topico_id,
                    "ciclo_id": ciclo_id,
                },
            )
            return response.status_code == 202
    except Exception:
        return False
```

- [ ] **Step 4: Confirmar que o teste passa**

```bash
python -m pytest tests/test_api.py::test_disparar_brainhex_async_envia_fontes -v
```

Esperado: PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/media_agents.py tests/test_api.py
git commit -m "feat: disparar_brainhex_async sends fontes[] instead of conteudo_estudado"
```

---

## Task 3: Substituir _process_target em personalizacao_jobs.py

**Files:**
- Modify: `ApiTraiUp/app/services/personalizacao_jobs.py`
- Test: `ApiTraiUp/tests/test_personalizacao_jobs_loop.py`

- [ ] **Step 1: Escrever o teste (falha esperada)**

```python
# Em tests/test_personalizacao_jobs_loop.py — acrescente ao final

@pytest.mark.asyncio
async def test_process_target_usa_fluxo_direto_sem_langgraph(monkeypatch):
    from app.services import personalizacao_jobs as pj
    from unittest.mock import AsyncMock, MagicMock, patch, call
    import asyncio

    fake_ctx = {
        "perfil_dominante": "Seeker",
        "perfil_brainhex": [{"perfil": "seeker", "afinidade": 0.8}],
        "fontes": [{"url": "https://s3.example.com/a.pdf", "mime_type": "application/pdf", "tipo": "documento"}],
        "conteudo_classe": {"topico": {"nome": "Álgebra"}, "conteudos": [], "atividades": []},
        "contexto_aluno": {"modo_operacao": "imediato", "desempenho_recente": {}},
        "source_hash": "abc123",
        "ciclo_id": "ciclo-uuid",
    }
    fake_cards = {"items": [{"frente": "Q", "verso": "A", "icone": "x", "dificuldade": "facil", "xp": 10}]}
    fake_record = {"id": 1, "aluno_id": "aluno-1", "topico_id": 10, "ciclo_id": "ciclo-uuid", "materiais": {}}

    app_mock = MagicMock()
    app_mock.state.settings = MagicMock()
    session_mock = MagicMock()
    job = {"id": 1, "classe_id": 5, "kind": "student_enrollment"}
    target = {"aluno_id": "aluno-1", "topico_id": 10, "conteudo_id": None}

    with (
        patch.object(pj, "fetch_personalizacao_context", AsyncMock(return_value=fake_ctx)),
        patch.object(pj, "gerar_cards_direto", AsyncMock(return_value=fake_cards)),
        patch.object(pj, "disparar_brainhex_async", AsyncMock(return_value=True)),
        patch("app.services.personalizacao_jobs.ConteudoPersonalizadoRepository") as MockRepo,
        patch("app.services.personalizacao_jobs._seed_progress", AsyncMock()),
        patch("asyncio.create_task") as mock_create_task,
    ):
        repo_inst = MagicMock()
        repo_inst.buscar_por_aluno = AsyncMock(return_value=[])
        repo_inst.salvar = AsyncMock(return_value=1)
        repo_inst.buscar_por_ciclo_id = AsyncMock(return_value=fake_record)
        MockRepo.return_value = repo_inst

        result = await pj._process_target(
            app=app_mock, session=session_mock, job=job, target=target
        )

    assert result["record"] == fake_record
    pj.fetch_personalizacao_context.assert_called_once()
    pj.gerar_cards_direto.assert_called_once()
    mock_create_task.assert_called_once()
    # Confirma que salvar foi chamado com status processando_midias e plano=None
    salvar_kwargs = repo_inst.salvar.call_args.kwargs
    assert salvar_kwargs["status"] == "processando_midias"
    assert salvar_kwargs["plano"] is None
    assert "cards" in salvar_kwargs["materiais"]
```

- [ ] **Step 2: Rodar para confirmar falha**

```bash
python -m pytest tests/test_personalizacao_jobs_loop.py::test_process_target_usa_fluxo_direto_sem_langgraph -v
```

Esperado: FAIL com `AttributeError: module 'app.services.personalizacao_jobs' has no attribute 'fetch_personalizacao_context'`

- [ ] **Step 3: Atualizar imports em `personalizacao_jobs.py`**

Substitua o bloco de imports de personalizacao/graph (linhas 17-23 do arquivo atual):

```python
# ANTES:
from app.services.personalizacao import (
    build_personalizacao_state,
    build_personalizacao_steps,
)
from app.services.graph_invocation import ainvoke_personalizacao_graph

# DEPOIS:
from app.services.personalizacao import (
    build_personalizacao_steps,
    fetch_personalizacao_context,
    gerar_cards_direto,
)
from app.services.media_agents import disparar_brainhex_async
```

- [ ] **Step 4: Substituir `_process_target`**

Substitua a função inteira `_process_target` (linhas 356-412):

```python
async def _process_target(
    *,
    app: FastAPI,
    session: AsyncSession,
    job: dict[str, Any],
    target: dict[str, Any],
) -> dict[str, Any]:
    aluno_id = str(target["aluno_id"])
    topico_id = int(target["topico_id"])
    classe_id = int(job["classe_id"])

    if job["kind"] == JOB_KIND_CLEANUP:
        return await _cleanup_target(
            session=session,
            classe_id=classe_id,
            aluno_id=aluno_id,
            topico_id=topico_id,
            settings=app.state.settings,
        )

    ctx = await fetch_personalizacao_context(
        aluno_id=aluno_id,
        classe_id=classe_id,
        topico_id=topico_id,
        conteudo_id=target.get("conteudo_id"),
        settings=app.state.settings,
        session=session,
    )

    repo = ConteudoPersonalizadoRepository(session)
    existing_records = await repo.buscar_por_aluno(
        aluno_id, classe_id=classe_id, topico_id=topico_id, limit=1
    )
    existing = existing_records[0] if existing_records else None
    if existing and str(existing.get("source_hash") or "") == str(ctx["source_hash"]):
        return {"skipped": True, "record": existing}

    cards_payload = await gerar_cards_direto(
        perfil=ctx["perfil_dominante"],
        conteudo_classe=ctx["conteudo_classe"],
        contexto_aluno=ctx["contexto_aluno"],
        perfil_brainhex=ctx["perfil_brainhex"],
        settings=app.state.settings,
    )

    materiais = {
        "cards": {
            "payload": cards_payload,
            "metadata": {"status": "completed"},
        },
    }
    record_id = await repo.salvar(
        aluno_id=aluno_id,
        classe_id=classe_id,
        topico_id=topico_id,
        conteudo_id=target.get("conteudo_id"),
        ciclo_id=ctx["ciclo_id"],
        plano=None,
        materiais=materiais,
        ai_patch=None,
        status="processando_midias",
        source_hash=ctx["source_hash"],
        formato_prioritario="cards",
        formatos_gerados=["cards"],
    )

    record = await repo.buscar_por_ciclo_id(aluno_id=aluno_id, ciclo_id=ctx["ciclo_id"]) or {}
    if not record:
        raise RuntimeError("Personalizacao nao retornou registro persistido apos salvar.")
    await _seed_progress(session=session, record=record)

    asyncio.create_task(
        disparar_brainhex_async(
            settings=app.state.settings,
            perfil=ctx["perfil_dominante"],
            fontes=ctx["fontes"],
            personalizacao_id=int(record_id),
            aluno_id=aluno_id,
            classe_id=classe_id,
            topico_id=topico_id,
            ciclo_id=ctx["ciclo_id"],
        )
    )

    return {"record": record}
```

- [ ] **Step 5: Confirmar que o teste passa**

```bash
python -m pytest tests/test_personalizacao_jobs_loop.py::test_process_target_usa_fluxo_direto_sem_langgraph -v
```

Esperado: PASS

- [ ] **Step 6: Commit**

```bash
git add app/services/personalizacao_jobs.py tests/test_personalizacao_jobs_loop.py
git commit -m "feat: _process_target uses direct flow (no LangGraph) for personalizacao"
```

---

## Task 4: Atualizar rota POST /personalizar em personalizacao.py (API)

**Files:**
- Modify: `ApiTraiUp/app/api/v1/personalizacao.py`

- [ ] **Step 1: Atualizar imports no arquivo**

No bloco de imports de personalizacao/graph (linhas 45-59 do arquivo):

```python
# ANTES:
from app.services.personalizacao import (
    _infer_source_type,
    build_personalizacao_state,
    build_personalizacao_steps,
)
...
from app.services.graph_invocation import ainvoke_personalizacao_graph

# DEPOIS:
from app.services.personalizacao import (
    _infer_source_type,
    build_personalizacao_steps,
    fetch_personalizacao_context,
    gerar_cards_direto,
)
from app.services.media_agents import disparar_brainhex_async
```

Também remova a importação de `_graph_config` se existir:

```python
# Remover de personalizacao_jobs import:
# enqueue_personalizacao_job → manter
# (só remover graph_invocation e build_personalizacao_state)
```

- [ ] **Step 2: Substituir o handler `personalizar`**

Substitua a função `personalizar` (linhas 688-758):

```python
@router.post("", response_model=PersonalizacaoResponse, status_code=status.HTTP_201_CREATED)
async def personalizar(
    payload: PersonalizarPayload,
    request: Request,
    user: UserContext = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PersonalizacaoResponse:
    if not user.is_aluno:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas alunos podem solicitar personalizacao de conteudo.",
        )

    if payload.topico_id is None and payload.conteudo_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Informe topico_id ou conteudo_id.",
        )

    aluno_id = user.aluno_id or user.user_id
    settings = request.app.state.settings
    topico_id = payload.topico_id
    classe_id = payload.classe_id
    conteudo_id = payload.conteudo_id

    logger.info(
        "personalizacao.input=%s",
        {
            "aluno_id": aluno_id,
            **_summarize_personalizar_payload(payload),
        },
    )

    try:
        ctx = await fetch_personalizacao_context(
            aluno_id=aluno_id,
            classe_id=classe_id,
            topico_id=topico_id,
            conteudo_id=conteudo_id,
            settings=settings,
            session=session,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    cards_payload = await gerar_cards_direto(
        perfil=ctx["perfil_dominante"],
        conteudo_classe=ctx["conteudo_classe"],
        contexto_aluno=ctx["contexto_aluno"],
        perfil_brainhex=ctx["perfil_brainhex"],
        settings=settings,
    )

    materiais: dict[str, Any] = {
        "cards": {
            "payload": cards_payload,
            "metadata": {"status": "completed"},
        },
    }
    repo = ConteudoPersonalizadoRepository(session)
    record_id = await repo.salvar(
        aluno_id=aluno_id,
        classe_id=classe_id,
        topico_id=topico_id,
        conteudo_id=conteudo_id,
        ciclo_id=ctx["ciclo_id"],
        plano=None,
        materiais=materiais,
        ai_patch=None,
        status="processando_midias",
        source_hash=ctx["source_hash"],
        formato_prioritario="cards",
        formatos_gerados=["cards"],
    )

    record = await repo.buscar_por_ciclo_id(aluno_id=aluno_id, ciclo_id=ctx["ciclo_id"])
    if not record:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Personalizacao nao retornou registro persistido.",
        )

    import asyncio as _asyncio
    _asyncio.create_task(
        disparar_brainhex_async(
            settings=settings,
            perfil=ctx["perfil_dominante"],
            fontes=ctx["fontes"],
            personalizacao_id=int(record_id),
            aluno_id=aluno_id,
            classe_id=classe_id,
            topico_id=topico_id,
            ciclo_id=ctx["ciclo_id"],
        )
    )

    logger.info(
        "personalizacao.output=%s",
        {
            "aluno_id": aluno_id,
            **_summarize_personalizacao_record(record),
        },
    )
    return _to_response(record)
```

- [ ] **Step 3: Rodar a suite de testes da API**

```bash
python -m pytest tests/test_api.py -v -x
```

Esperado: sem falhas nos testes de personalização existentes

- [ ] **Step 4: Commit**

```bash
git add app/api/v1/personalizacao.py
git commit -m "feat: POST /personalizar uses direct flow, removes LangGraph dependency"
```

---

## Task 5: processMediaWithGemini aceita array em geminiService.ts

**Files:**
- Modify: `ApiBrainHex/src/services/geminiService.ts`

- [ ] **Step 1: Atualizar a assinatura e lógica de `processMediaWithGemini`**

No arquivo `src/services/geminiService.ts`, substitua a função `processMediaWithGemini` (linhas 92-...) para aceitar um array:

```typescript
export async function processMediaWithGemini(
  filesData: { data: string; mimeType: string; name: string }[],
  profile: BrainHexProfile
): Promise<ProcessedContent> {
  const config = BRAIN_HEX_CONFIG[profile];

  // Detecta família pelo primeiro arquivo não vazio
  const primary = filesData[0] ?? { data: "", mimeType: "text/plain", name: "empty.txt" };
  let family: "text" | "presentation" | "paged" | "temporal" | "markdown" | "image" = "text";
  if (primary.mimeType.includes("presentation")) family = "presentation";
  else if (primary.mimeType.includes("pdf")) family = "paged";
  else if (primary.mimeType.startsWith("audio/") || primary.mimeType.startsWith("video/")) family = "temporal";
  else if (primary.mimeType.includes("markdown") || primary.name.endsWith(".md")) family = "markdown";
  else if (primary.mimeType.startsWith("image/")) family = "image";

  // Constrói contentsParts para todos os arquivos
  const contentsParts: any[] = [];

  for (const fileData of filesData) {
    const isNative = SUPPORTED_NATIVE_MIMES.includes(fileData.mimeType);

    if (isNative) {
      contentsParts.push({
        inlineData: {
          data: fileData.data,
          mimeType: fileData.mimeType,
        },
      });
    } else {
      const binaryString = atob(fileData.data);
      const bytes = new Uint8Array(binaryString.length).map((_, i) => binaryString.charCodeAt(i));
      let extractionResult: { blocks: InternalBlock[], media: any[] } = { blocks: [], media: [] };

      const fileMimeType = fileData.mimeType;
      const fileFamilyLocal =
        fileMimeType.includes("presentation") ? "presentation" :
        fileMimeType.includes("wordprocessingml") ? "docx" : "text";

      if (fileFamilyLocal === "presentation") {
        extractionResult = await extractRawFromPPTX(bytes.buffer);
      } else if (fileFamilyLocal === "docx") {
        extractionResult = await extractRawFromDOCX(bytes.buffer);
      } else {
        const text = new TextDecoder().decode(bytes);
        extractionResult.blocks = text.split("\n").filter(t => t.trim()).map((t, i) => ({
          id: `txt-${i}`,
          kind: "paragraph" as const,
          text: t.trim(),
          source_ref: { line: i + 1 }
        }));
      }

      contentsParts.push({
        text: `### MODELO INTERNO UNIFICADO (DOC: ${fileData.name})\n\n` +
              JSON.stringify(extractionResult.blocks, null, 2)
      });

      extractionResult.media.slice(0, 8).forEach((m, i) => {
        contentsParts.push({ inlineData: { data: m.data, mimeType: m.mimeType } });
        contentsParts.push({ text: `[IMAGEM DE REFERÊNCIA ${i+1}: ENCONTRADA NO CONTEÚDO ORIGINAL]` });
      });
    }
  }

  // Se nenhum arquivo foi processado, usa texto vazio como fallback
  if (contentsParts.length === 0) {
    contentsParts.push({ text: "Conteúdo não disponível." });
  }

  // (resto da função: systemInstruction, modelo Gemini, schema, chamada, parse — não alterar)
  // ... copie o bloco de "Personalized Semantic Generation" (passo 4) sem modificações
```

> **Nota:** Mantenha todo o bloco de `systemInstruction`, `model.generateContent(...)`, schema e parse exatamente como estão. Apenas a construção de `contentsParts` muda.

- [ ] **Step 2: Verificar compilação TypeScript**

```bash
cd C:\Users\geisb\Documents\GitHub\ApiBrainHex
npx tsc --noEmit
```

Esperado: sem erros de tipo

- [ ] **Step 3: Commit**

```bash
git add src/services/geminiService.ts
git commit -m "feat: processMediaWithGemini accepts array of fileData"
```

---

## Task 6: fetchFontesAsFileData + POST /api/personalizar aceita fontes[]

**Files:**
- Modify: `ApiBrainHex/server.ts`

- [ ] **Step 1: Adicionar helper `fetchFontesAsFileData` antes de `startServer()`**

Adicione imediatamente antes da linha `async function startServer()`:

```typescript
interface FonteItem {
  url:       string;
  mime_type: string;
  tipo:      string;
}

async function fetchFontesAsFileData(
  fontes: FonteItem[]
): Promise<{ data: string; mimeType: string; name: string }[]> {
  const results: { data: string; mimeType: string; name: string }[] = [];
  for (const fonte of fontes) {
    if (!fonte.url) continue;
    try {
      const response = await fetch(fonte.url, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) {
        console.error(`[brainhex] download falhou ${response.status}: ${fonte.url}`);
        continue;
      }
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const name   = fonte.url.split("/").pop()?.split("?")[0] ?? "arquivo";
      results.push({ data: base64, mimeType: fonte.mime_type, name });
    } catch (err) {
      console.error(`[brainhex] erro ao baixar fonte ${fonte.url}:`, err);
    }
  }
  return results;
}
```

- [ ] **Step 2: Substituir o handler `POST /api/personalizar`**

Substitua a função handler inteira (linhas 250-fim do `setImmediate`):

```typescript
app.post("/api/personalizar", (req, res) => {
  const {
    profile,
    fontes,
    personalizacao_id,
    aluno_id: _aluno_id,
    classe_id,
    topico_id,
    ciclo_id,
  } = req.body;

  if (!profile || !VALID_PROFILES.includes(profile as BrainHexProfile)) {
    return res.status(400).json({ error: "profile inválido ou ausente" });
  }
  if (!Array.isArray(fontes)) {
    return res.status(400).json({ error: "fontes deve ser um array" });
  }
  if (!personalizacao_id) {
    return res.status(400).json({ error: "personalizacao_id ausente" });
  }

  const personalizacaoId = Number(personalizacao_id);
  const classeId         = String(classe_id ?? 0);
  const topicoId         = String(topico_id ?? 0);
  const cicloStr         = String(ciclo_id ?? "");
  const refId            = `${personalizacaoId}_${cicloStr.slice(0, 8)}`;
  const storagePath      = `brainhex/${profile}/classe-${classeId}/topico-${topicoId}`;
  const bucket           = "conteudo_aluno";

  // 202 imediato — processa em background
  res.status(202).json({ status: "processing", personalizacao_id: personalizacaoId });

  setImmediate(async () => {
    try {
      console.log(`[brainhex] personalizar profile=${profile} id=${personalizacaoId} fontes=${fontes.length}`);

      if (fontes.length === 0) {
        console.warn(`[brainhex] fontes vazias, abortando processamento id=${personalizacaoId}`);
        return;
      }

      // 1. Download das fontes
      const filesData = await fetchFontesAsFileData(fontes as FonteItem[]);
      if (filesData.length === 0) {
        console.warn(`[brainhex] todas as fontes falharam no download, abortando id=${personalizacaoId}`);
        return;
      }

      // 2. Texto + slides via Gemini (multi-arquivo)
      const resultado = await processMediaWithGemini(filesData, profile as BrainHexProfile);

      // 3. Áudio (wav + mp3)
      const voice = VOICE_MAP[profile as BrainHexProfile] ?? "Kore";
      let wavBase64: string | null = null;
      let mp3Base64: string | null = null;
      try {
        const a = await generateNaturalAudio(resultado.audioScript, voice);
        wavBase64 = a.wav ?? null;
        mp3Base64 = a.mp3 ?? null;
      } catch (e) {
        console.error("[brainhex] falha no áudio:", e);
      }

      // 4. Imagens dos slides
      const images           = await generateSlidesImages(resultado.slides);
      const slidesComImagens = enrichSlidesWithImages(resultado.slides, images);

      // 5. Persiste tudo no Supabase
      await archiveToSupabase({
        profile:          profile as BrainHexProfile,
        storagePath,
        bucket,
        refId,
        markdown:         resultado.markdown,
        audioScript:      resultado.audioScript,
        slides:           slidesComImagens,
        mp3Base64,
        wavBase64,
        personalizacaoId,
      });

      console.log(`[brainhex] personalizar concluído id=${personalizacaoId}`);
    } catch (err: any) {
      console.error(`[brainhex] personalizar erro id=${personalizacaoId}:`, err);
    }
  });
});
```

- [ ] **Step 3: Verificar compilação TypeScript**

```bash
cd C:\Users\geisb\Documents\GitHub\ApiBrainHex
npx tsc --noEmit
```

Esperado: sem erros de tipo

- [ ] **Step 4: Rodar o servidor localmente e testar endpoint de saúde**

```bash
npm run dev
# em outro terminal:
curl http://localhost:3000/api/health
```

Esperado: `{"status":"ok",...}`

- [ ] **Step 5: Commit**

```bash
git add server.ts
git commit -m "feat: /api/personalizar accepts fontes[], fetches files, drops conteudo_estudado"
```

---

## Verificação Final

- [ ] **Suite completa ApiTraiUp**

```bash
cd C:\Users\geisb\Downloads\ApiTraiUp
python -m pytest tests/ -v -x
```

Esperado: todos os testes passam

- [ ] **Confirmar que LangGraph não é chamado para personalização**

```bash
grep -r "ainvoke_personalizacao_graph" app/services/personalizacao_jobs.py app/api/v1/personalizacao.py
```

Esperado: sem resultados

- [ ] **Confirmar que conteudo_estudado sumiu do payload HTTP**

```bash
grep -r "conteudo_estudado" app/services/media_agents.py
```

Esperado: sem resultados

- [ ] **TypeScript ApiBrainHex compila sem erros**

```bash
cd C:\Users\geisb\Documents\GitHub\ApiBrainHex
npx tsc --noEmit
```

Esperado: sem erros
