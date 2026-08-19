# Structured Output + Guardrails no grafo LangGraph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nenhuma chamada LLM nos nós do grafo (nem no chat do mentor) pode
derrubar a invocação do grafo com uma exceção crua; 5 guardrails de negócio
passam a ser verificados em código, não só prometidos em prompt.

**Architecture:** Duas camadas — `JsonLLMService.ainvoke_structured` (geração
com schema nativo via `.with_structured_output()`, reutilizável em todo nó) e
`app/agent/graph/guardrails.py` (`gerar_validado`, orquestra: gera → valida
schema → roda guardrails de negócio → 1 retry com correção → fallback
determinístico). Ver spec completa em
`docs/superpowers/specs/2026-08-19-structured-output-guardrails-design.md`.

**Tech Stack:** Python, FastAPI, LangGraph, Pydantic, langchain-google-genai/langchain-openai, pytest, pytest-asyncio.

---

## Task 1: `StructuredOutputError` + `JsonLLMService.ainvoke_structured`

**Files:**
- Modify: `api/app/services/llm.py`
- Test: `api/tests/test_llm_service.py`

- [ ] **Step 1: Write the failing tests**

Adicione ao final de `api/tests/test_llm_service.py`:

```python
from pydantic import BaseModel

from app.services.llm import StructuredOutputError


class _FakeSchema(BaseModel):
    titulo: str
    prioridade: int


def test_ainvoke_structured_gemini_returns_validated_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    class _FakeStructuredClient:
        async def ainvoke(self, _messages):
            return {"titulo": "Reforcar bases", "prioridade": 2}

    class _FakeGeminiClientWithSchema:
        def with_structured_output(self, schema):
            captured["schema"] = schema
            return _FakeStructuredClient()

    def factory(*, model: str, temperature: float, google_api_key: str):
        return _FakeGeminiClientWithSchema()

    monkeypatch.setattr(llm_module, "ChatGoogleGenerativeAI", factory)
    monkeypatch.setattr(llm_module, "load_prompt", lambda _name: "instrucoes")

    settings = _settings(gemini_api_key="key-1", openai_api_key="")
    service = JsonLLMService(settings)

    result = asyncio.run(
        service.ainvoke_structured(
            prompt_name="trilha_config.txt",
            payload={"classe_id": 1},
            schema=_FakeSchema,
        )
    )

    assert result == _FakeSchema(titulo="Reforcar bases", prioridade=2)
    assert captured["schema"] == _FakeSchema.model_json_schema()


def test_ainvoke_structured_raises_typed_error_when_shape_is_wrong(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _FakeStructuredClient:
        async def ainvoke(self, _messages):
            return {"titulo": "sem prioridade"}

    class _FakeGeminiClientWithSchema:
        def with_structured_output(self, _schema):
            return _FakeStructuredClient()

    monkeypatch.setattr(
        llm_module,
        "ChatGoogleGenerativeAI",
        lambda *, model, temperature, google_api_key: _FakeGeminiClientWithSchema(),
    )
    monkeypatch.setattr(llm_module, "load_prompt", lambda _name: "instrucoes")

    settings = _settings(gemini_api_key="key-1", openai_api_key="")
    service = JsonLLMService(settings)

    with pytest.raises(StructuredOutputError):
        asyncio.run(
            service.ainvoke_structured(
                prompt_name="trilha_config.txt",
                payload={"classe_id": 1},
                schema=_FakeSchema,
            )
        )


def test_ainvoke_structured_raises_typed_error_when_no_provider_available() -> None:
    settings = _settings(gemini_api_key="", openai_api_key="")
    service = JsonLLMService(settings)

    with pytest.raises(StructuredOutputError):
        asyncio.run(
            service.ainvoke_structured(
                prompt_name="trilha_config.txt",
                payload={"classe_id": 1},
                schema=_FakeSchema,
            )
        )
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && python -m pytest tests/test_llm_service.py -k ainvoke_structured -v`
Expected: FAIL com `AttributeError: 'JsonLLMService' object has no attribute 'ainvoke_structured'` (e outro erro de import de `StructuredOutputError`).

- [ ] **Step 3: Implement `StructuredOutputError` e `ainvoke_structured`**

Em `api/app/services/llm.py`, adicione `TypeVar`/`BaseModel` ao topo:

```python
from typing import Any, Callable, TypeVar

from pydantic import BaseModel
```

Refatore `_ainvoke_gemini_with_rotation` para aceitar um schema opcional
(mantendo 100% do comportamento atual de `ainvoke_json`, que continua
chamando sem esse parâmetro):

```python
    async def _ainvoke_gemini_with_rotation(
        self,
        *,
        messages: list[Any],
        primary_model: str,
        structured_schema: dict[str, Any] | None = None,
    ) -> Any | None:
        """Tenta o modelo principal em todas as chaves configuradas
        (round-robin); se TODAS esgotarem a cota (ou o modelo estiver
        aposentado/indisponivel), passa pro proximo modelo candidato — mesma
        logica de content_enrichment.py e do microservice."""
        api_keys = _parse_gemini_keys(str(self.settings.gemini_api_key or ""))
        if not api_keys or ChatGoogleGenerativeAI is None:
            return None

        candidate_models = [primary_model] + [
            item for item in self._gemini_fallback_models() if item != primary_model
        ]
        last_exc: Exception | None = None
        for model in candidate_models:
            for _ in range(len(api_keys)):
                key = _pick_available_gemini_key(api_keys, model)
                if key is None:
                    break
                client = self._get_gemini_client(model, key)
                if structured_schema is not None:
                    client = client.with_structured_output(structured_schema)
                try:
                    return await client.ainvoke(messages)
                except Exception as exc:
                    last_exc = exc
                    if (
                        _is_gemini_quota_error(exc)
                        or _is_gemini_model_unavailable_error(exc)
                        or _is_gemini_transient_error(exc)
                    ):
                        _gemini_key_unavailable_until[(key, model)] = time.time() + _GEMINI_KEY_QUOTA_COOLDOWN_SEC
                        continue
                    raise
        if last_exc is not None:
            raise last_exc
        return None
```

Adicione ao final da classe `JsonLLMService`:

```python
    async def ainvoke_structured(
        self,
        *,
        prompt_name: str,
        payload: dict[str, Any],
        schema: type[T],
        model: str | None = None,
        provider: str | None = None,
    ) -> T:
        normalized_payload = dict(payload)
        normalized_payload.setdefault("idioma", "português brasileiro")
        normalized_payload.setdefault("locale", "pt-BR")
        normalized_payload.setdefault("linguagem", "português brasileiro")
        messages = [
            SystemMessage(content=load_prompt(prompt_name)),
            HumanMessage(
                content=json.dumps(normalized_payload, ensure_ascii=False, default=str)
            ),
        ]

        effective_provider = provider or self.settings.llm_provider
        effective_model = model or self._active_default(provider)
        json_schema = schema.model_json_schema()

        try:
            if effective_provider == "gemini":
                response = await self._ainvoke_gemini_with_rotation(
                    messages=messages,
                    primary_model=effective_model,
                    structured_schema=json_schema,
                )
            else:
                client = self._get_client(effective_model, provider=provider)
                response = (
                    await client.with_structured_output(json_schema).ainvoke(messages)
                    if client is not None
                    else None
                )
        except Exception as exc:
            raise StructuredOutputError(
                f"Falha ao gerar saida estruturada para {prompt_name}: {exc}"
            ) from exc

        if response is None:
            raise StructuredOutputError(
                f"Nenhum provedor LLM disponivel para {prompt_name}"
            )

        raw = response if isinstance(response, dict) else extract_json(
            getattr(response, "content", response)
        )
        try:
            return schema.model_validate(raw)
        except Exception as exc:
            raise StructuredOutputError(
                f"Saida de {prompt_name} nao bateu com o schema {schema.__name__}: {exc}"
            ) from exc
```

Adicione logo acima da classe `JsonLLMService`:

```python
class StructuredOutputError(Exception):
    """Geracao com schema nativo falhou (rede, provedor indisponivel, ou
    saida que nao bate com o schema) mesmo depois de tentar todos os
    candidatos de chave/modelo."""


T = TypeVar("T", bound=BaseModel)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && python -m pytest tests/test_llm_service.py -v`
Expected: todos os testes (os 3 novos + os pré-existentes de `ainvoke_json`) passam.

- [ ] **Step 5: Commit**

```bash
git add api/app/services/llm.py api/tests/test_llm_service.py
git commit -m "feat(api): adiciona ainvoke_structured com schema nativo no JsonLLMService"
```

---

## Task 2: Módulo de guardrails — `GuardrailViolation` e os 3 checks síncronos

**Files:**
- Create: `api/app/agent/graph/guardrails.py`
- Test: `api/tests/test_guardrails.py`

- [ ] **Step 1: Write the failing tests**

Crie `api/tests/test_guardrails.py`:

```python
from app.agent.graph.guardrails import (
    GuardrailViolation,
    checar_evidencia_dominio,
    checar_ordem_sequencial,
    checar_topicos_existem,
)
from app.schemas.trilha_config import TrilhaConfig


def _topicos():
    return [
        {"id": 10, "ordem": 1},
        {"id": 11, "ordem": 2},
        {"id": 12, "ordem": 3},
    ]


def test_checar_ordem_sequencial_detecta_pulo_de_topico_incompleto() -> None:
    trilha = TrilhaConfig(classe_id=1, topico_foco=12, proximos_topicos=[], justificativa="x")
    contexto = {
        "topicos_classe": _topicos(),
        "progresso_trilha": {"10": {"percentual_concluido": 40}},
    }

    violacao = checar_ordem_sequencial(trilha, contexto)

    assert isinstance(violacao, GuardrailViolation)
    assert violacao.regra == "ordem_sequencial"


def test_checar_ordem_sequencial_aceita_avanco_com_anteriores_completos() -> None:
    trilha = TrilhaConfig(classe_id=1, topico_foco=12, proximos_topicos=[], justificativa="x")
    contexto = {
        "topicos_classe": _topicos(),
        "progresso_trilha": {
            "10": {"percentual_concluido": 100},
            "11": {"percentual_concluido": 100},
        },
    }

    assert checar_ordem_sequencial(trilha, contexto) is None


def test_checar_topicos_existem_detecta_id_inexistente() -> None:
    trilha = TrilhaConfig(classe_id=1, topico_foco=999, proximos_topicos=[10], justificativa="x")
    contexto = {"topicos_classe": _topicos()}

    violacao = checar_topicos_existem(trilha, contexto)

    assert isinstance(violacao, GuardrailViolation)
    assert violacao.regra == "topicos_existem"


def test_checar_topicos_existem_aceita_ids_validos() -> None:
    trilha = TrilhaConfig(classe_id=1, topico_foco=10, proximos_topicos=[11, 12], justificativa="x")
    contexto = {"topicos_classe": _topicos()}

    assert checar_topicos_existem(trilha, contexto) is None


def test_checar_evidencia_dominio_rejeita_avanco_sem_reforco_com_baixo_desempenho() -> None:
    trilha = TrilhaConfig(
        classe_id=1,
        topico_foco=10,
        proximos_topicos=[],
        ajustes=["avancar sem reforco"],
        justificativa="x",
    )
    contexto = {"desempenho_recente": {"media_acertos": 30}}

    violacao = checar_evidencia_dominio(trilha, contexto)

    assert isinstance(violacao, GuardrailViolation)
    assert violacao.regra == "evidencia_dominio"


def test_checar_evidencia_dominio_aceita_avanco_sem_reforco_com_bom_desempenho() -> None:
    trilha = TrilhaConfig(
        classe_id=1,
        topico_foco=10,
        proximos_topicos=[],
        ajustes=["avancar sem reforco"],
        justificativa="x",
    )
    contexto = {"desempenho_recente": {"media_acertos": 80}}

    assert checar_evidencia_dominio(trilha, contexto) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && python -m pytest tests/test_guardrails.py -v`
Expected: FAIL com `ModuleNotFoundError: No module named 'app.agent.graph.guardrails'`.

- [ ] **Step 3: Implement o módulo**

Crie `api/app/agent/graph/guardrails.py`:

```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.schemas.trilha_config import TrilhaConfig


@dataclass
class GuardrailViolation:
    regra: str
    mensagem: str


def checar_ordem_sequencial(
    trilha: TrilhaConfig, contexto: dict[str, Any]
) -> GuardrailViolation | None:
    """Substitui 'pre-requisitos' (nao existe grafo explicito no banco hoje):
    nao recomendar avanco pra um topico cuja ordem e posterior a topicos
    ainda incompletos na mesma trilha."""
    topicos = contexto.get("topicos_classe", [])
    progresso = contexto.get("progresso_trilha", {})
    ordem_por_id = {topico["id"]: topico.get("ordem") for topico in topicos}

    if trilha.topico_foco is None:
        return None
    ordem_foco = ordem_por_id.get(trilha.topico_foco)
    if ordem_foco is None:
        return None

    incompletos_antes = [
        topico["id"]
        for topico in topicos
        if topico.get("ordem") is not None
        and topico["ordem"] < ordem_foco
        and float((progresso.get(str(topico["id"])) or {}).get("percentual_concluido", 0)) < 100
    ]
    if incompletos_antes:
        return GuardrailViolation(
            regra="ordem_sequencial",
            mensagem=(
                f"topico_foco {trilha.topico_foco} avanca antes de completar "
                f"os topicos anteriores na ordem da trilha: {incompletos_antes}"
            ),
        )
    return None


def checar_topicos_existem(
    trilha: TrilhaConfig, contexto: dict[str, Any]
) -> GuardrailViolation | None:
    """IDs de topico citados precisam existir de fato na classe — evita
    alucinacao de referencia."""
    topicos = contexto.get("topicos_classe", [])
    ids_validos = {topico["id"] for topico in topicos}

    citados = [trilha.topico_foco] if trilha.topico_foco is not None else []
    citados += trilha.proximos_topicos
    invalidos = [topico_id for topico_id in citados if topico_id not in ids_validos]

    if invalidos:
        return GuardrailViolation(
            regra="topicos_existem",
            mensagem=f"topicos citados nao existem na classe {trilha.classe_id}: {invalidos}",
        )
    return None


def checar_evidencia_dominio(
    trilha: TrilhaConfig, contexto: dict[str, Any]
) -> GuardrailViolation | None:
    """'ajustes' e vocabulario controlado (ver trilha_config.txt) — o unico
    jeito de dispensar reforco e o valor exato 'avancar sem reforco', e isso
    so e aceito com desempenho real que sustente. Mesmo limiar (50) que
    _fallback_trilha/_fallback_perfil ja usam pra 'reforcar fundamentos'."""
    desempenho = contexto.get("desempenho_recente", {})
    media_acertos = float(desempenho.get("media_acertos", 100))

    if "avancar sem reforco" in trilha.ajustes and media_acertos < 50:
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
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add api/app/agent/graph/guardrails.py api/tests/test_guardrails.py
git commit -m "feat(api): guardrails de negocio para trilha (ordem, topicos existem, evidencia de dominio)"
```

---

## Task 3: Orquestração `gerar_validado` (retry + fallback + auditoria)

**Files:**
- Modify: `api/app/agent/graph/guardrails.py`
- Test: `api/tests/test_guardrails.py`

- [ ] **Step 1: Write the failing tests**

Adicione a `api/tests/test_guardrails.py`:

```python
import asyncio
import inspect

import pytest

from app.agent.graph.guardrails import GuardrailViolation, gerar_validado
from app.core.settings import Settings
from app.services.llm import JsonLLMService, StructuredOutputError


class _FakeLLM:
    def __init__(self, respostas: list[object]) -> None:
        self._respostas = list(respostas)
        self.chamadas: list[dict] = []

    async def ainvoke_structured(self, *, prompt_name, payload, schema, **kwargs):
        self.chamadas.append({"prompt_name": prompt_name, "payload": payload})
        proxima = self._respostas.pop(0)
        if isinstance(proxima, Exception):
            raise proxima
        return schema.model_validate(proxima)


def test_gerar_validado_retorna_de_primeira_quando_sem_violacao() -> None:
    from app.schemas.trilha_config import TrilhaConfig

    llm = _FakeLLM([{"classe_id": 1, "topico_foco": 10, "justificativa": "ok"}])

    resultado = asyncio.run(
        gerar_validado(
            llm,
            prompt_name="trilha_config.txt",
            payload={"classe_id": 1},
            schema=TrilhaConfig,
            guardrails=[],
            fallback_factory=lambda: {"classe_id": 1, "justificativa": "fallback"},
        )
    )

    assert resultado.topico_foco == 10
    assert len(llm.chamadas) == 1


def test_gerar_validado_faz_1_retry_com_correcao_quando_guardrail_viola() -> None:
    from app.schemas.trilha_config import TrilhaConfig

    llm = _FakeLLM(
        [
            {"classe_id": 1, "topico_foco": 10, "justificativa": "primeira tentativa"},
            {"classe_id": 1, "topico_foco": 11, "justificativa": "corrigida"},
        ]
    )

    chamou = {"vezes": 0}

    def guardrail_falha_na_primeira(trilha, _contexto):
        chamou["vezes"] += 1
        if trilha.topico_foco == 10:
            return GuardrailViolation(regra="teste", mensagem="topico errado")
        return None

    resultado = asyncio.run(
        gerar_validado(
            llm,
            prompt_name="trilha_config.txt",
            payload={"classe_id": 1},
            schema=TrilhaConfig,
            guardrails=[guardrail_falha_na_primeira],
            fallback_factory=lambda: {"classe_id": 1, "justificativa": "fallback"},
        )
    )

    assert resultado.topico_foco == 11
    assert len(llm.chamadas) == 2
    assert "teste" in llm.chamadas[1]["payload"]["correcao"]


def test_gerar_validado_cai_no_fallback_apos_2_tentativas_e_avisa_violacao() -> None:
    from app.schemas.trilha_config import TrilhaConfig

    llm = _FakeLLM(
        [
            {"classe_id": 1, "topico_foco": 10, "justificativa": "1"},
            {"classe_id": 1, "topico_foco": 10, "justificativa": "2"},
        ]
    )

    def guardrail_sempre_viola(_trilha, _contexto):
        return GuardrailViolation(regra="teste", mensagem="sempre viola")

    violacoes_avisadas: list[tuple[GuardrailViolation, str]] = []

    async def on_violation(violacao, fase):
        violacoes_avisadas.append((violacao, fase))

    resultado = asyncio.run(
        gerar_validado(
            llm,
            prompt_name="trilha_config.txt",
            payload={"classe_id": 1},
            schema=TrilhaConfig,
            guardrails=[guardrail_sempre_viola],
            fallback_factory=lambda: {"classe_id": 1, "justificativa": "fallback"},
            on_violation=on_violation,
        )
    )

    assert resultado.justificativa == "fallback"
    assert len(llm.chamadas) == 2
    assert len(violacoes_avisadas) == 2
    assert violacoes_avisadas[-1][1] == "fallback_final"


def test_gerar_validado_trata_structured_output_error_como_violacao_de_schema() -> None:
    from app.schemas.trilha_config import TrilhaConfig

    llm = _FakeLLM(
        [
            StructuredOutputError("json invalido"),
            {"classe_id": 1, "topico_foco": 10, "justificativa": "corrigida"},
        ]
    )

    resultado = asyncio.run(
        gerar_validado(
            llm,
            prompt_name="trilha_config.txt",
            payload={"classe_id": 1},
            schema=TrilhaConfig,
            guardrails=[],
            fallback_factory=lambda: {"classe_id": 1, "justificativa": "fallback"},
        )
    )

    assert resultado.topico_foco == 10
    assert "json invalido" in llm.chamadas[1]["payload"]["correcao"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && python -m pytest tests/test_guardrails.py -k gerar_validado -v`
Expected: FAIL com `ImportError: cannot import name 'gerar_validado'`.

- [ ] **Step 3: Implement `gerar_validado`**

Adicione ao final de `api/app/agent/graph/guardrails.py` (ajuste os imports do
topo do arquivo):

```python
from __future__ import annotations

import inspect
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, TypeVar

from pydantic import BaseModel

from app.schemas.trilha_config import TrilhaConfig
from app.services.llm import JsonLLMService, StructuredOutputError

T = TypeVar("T", bound=BaseModel)
```

```python
async def gerar_validado(
    llm: JsonLLMService,
    *,
    prompt_name: str,
    payload: dict[str, Any],
    schema: type[T],
    guardrails: list[Callable[[T, dict[str, Any]], Any]],
    fallback_factory: Callable[[], dict[str, Any]],
    contexto: dict[str, Any] | None = None,
    on_violation: Callable[[GuardrailViolation, str], Awaitable[None]] | None = None,
    max_tentativas: int = 2,
) -> T:
    """Gera com schema nativo (Camada 1), roda guardrails de negocio (Camada
    2). Schema invalido OU guardrail violado: 1 retry com o erro anexado ao
    payload como 'correcao'. Falhou de novo: fallback deterministico do
    proprio no, e a ultima violacao e reportada via on_violation (auditoria)."""
    contexto = contexto or {}
    tentativa_payload = dict(payload)
    ultima_violacao: GuardrailViolation | None = None

    for tentativa in range(max_tentativas):
        try:
            resultado = await llm.ainvoke_structured(
                prompt_name=prompt_name,
                payload=tentativa_payload,
                schema=schema,
            )
        except StructuredOutputError as exc:
            ultima_violacao = GuardrailViolation(regra="schema", mensagem=str(exc))
            tentativa_payload = {**payload, "correcao": ultima_violacao.mensagem}
            if on_violation is not None:
                fase = "retry" if tentativa < max_tentativas - 1 else "fallback_final"
                await on_violation(ultima_violacao, fase)
            continue

        violacao: GuardrailViolation | None = None
        for checar in guardrails:
            possivel = checar(resultado, contexto)
            if inspect.isawaitable(possivel):
                possivel = await possivel
            if possivel is not None:
                violacao = possivel
                break

        if violacao is None:
            return resultado

        ultima_violacao = violacao
        fase = "retry" if tentativa < max_tentativas - 1 else "fallback_final"
        if on_violation is not None:
            await on_violation(violacao, fase)
        tentativa_payload = {**payload, "correcao": f"{violacao.regra}: {violacao.mensagem}"}

    return schema.model_validate(fallback_factory())
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && python -m pytest tests/test_guardrails.py -v`
Expected: 10 passed (6 do Task 2 + 4 novos).

- [ ] **Step 5: Commit**

```bash
git add api/app/agent/graph/guardrails.py api/tests/test_guardrails.py
git commit -m "feat(api): gerar_validado orquestra schema + guardrails com retry e fallback"
```

---

## Task 4: `checar_grounding_chat` (guardrail assíncrono, juiz LLM)

**Files:**
- Create: `api/app/schemas/mentor_chat.py`
- Create: `api/app/agent/prompts/mentor_grounding_check.txt`
- Modify: `api/app/agent/graph/guardrails.py`
- Test: `api/tests/test_guardrails.py`

- [ ] **Step 1: Write the failing tests**

Adicione a `api/tests/test_guardrails.py`:

```python
from app.agent.graph.guardrails import checar_grounding_chat
from app.schemas.mentor_chat import MentorChatLLMResult


class _FakeJuizLLM:
    def __init__(self, resposta: dict) -> None:
        self._resposta = resposta
        self.chamadas = 0

    async def ainvoke_structured(self, *, prompt_name, payload, schema, **kwargs):
        self.chamadas += 1
        return schema.model_validate(self._resposta)


def test_checar_grounding_chat_detecta_violacao_via_juiz() -> None:
    resposta = MentorChatLLMResult(reply="A resposta certa e 42.", should_close=False, hinted_actions=[])
    juiz = _FakeJuizLLM({"viola": True, "motivo": "entrega resposta pronta"})

    violacao = asyncio.run(
        checar_grounding_chat(resposta, {"llm": juiz, "conteudo_materia": {}})
    )

    assert violacao is not None
    assert violacao.regra == "grounding_chat"
    assert juiz.chamadas == 1


def test_checar_grounding_chat_aceita_resposta_que_guia_sem_entregar() -> None:
    resposta = MentorChatLLMResult(reply="Tente revisar o passo 2 do exemplo.", should_close=False, hinted_actions=[])
    juiz = _FakeJuizLLM({"viola": False, "motivo": ""})

    violacao = asyncio.run(
        checar_grounding_chat(resposta, {"llm": juiz, "conteudo_materia": {}})
    )

    assert violacao is None


def test_checar_grounding_chat_falha_aberta_quando_juiz_indisponivel() -> None:
    resposta = MentorChatLLMResult(reply="qualquer coisa", should_close=False, hinted_actions=[])

    class _JuizQuebrado:
        async def ainvoke_structured(self, **kwargs):
            raise StructuredOutputError("juiz fora do ar")

    violacao = asyncio.run(
        checar_grounding_chat(resposta, {"llm": _JuizQuebrado(), "conteudo_materia": {}})
    )

    assert violacao is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd api && python -m pytest tests/test_guardrails.py -k grounding -v`
Expected: FAIL — `MentorChatLLMResult`/`checar_grounding_chat` não existem ainda.

- [ ] **Step 3: Implement**

Crie `api/app/schemas/mentor_chat.py`:

```python
from pydantic import BaseModel, Field


class MentorChatLLMResult(BaseModel):
    reply: str
    should_close: bool = False
    hinted_actions: list[str] = Field(default_factory=list)


class GroundingJudgment(BaseModel):
    viola: bool
    motivo: str = ""
```

Crie `api/app/agent/prompts/mentor_grounding_check.txt`:

```
Voce e um revisor. Recebe a resposta que um guia educacional deu a um aluno
e o conteudo da materia que o guia deveria usar como base.

Marque "viola": true se a resposta:
- entrega a resposta pronta/gabarito de uma atividade ou questao (em vez de
  guiar o raciocinio do aluno), OU
- usa fatos/explicacoes que nao aparecem no conteudo da materia fornecido
  (conhecimento fora da base do topico).

Caso contrario, "viola": false.

Responda somente JSON:
{
  "viola": false,
  "motivo": "texto curto explicando o motivo, vazio se viola=false"
}
```

Adicione a `api/app/agent/graph/guardrails.py` (import de
`MentorChatLLMResult` no topo, junto dos demais):

```python
from app.schemas.mentor_chat import GroundingJudgment, MentorChatLLMResult
```

```python
async def checar_grounding_chat(
    resposta: MentorChatLLMResult, contexto: dict[str, Any]
) -> GuardrailViolation | None:
    """Unica regra desta leva que precisa de julgamento sobre texto livre —
    o payload do chat nem contem gabarito pra comparar diretamente
    (buscar_questoes_topico ja filtra isso). Usa uma segunda chamada LLM
    barata como juiz. Falha aberta: se o juiz falhar, nao bloqueia o chat
    (a resposta principal ja passou pelas instrucoes de guardrail no prompt;
    o juiz e uma camada extra de verificacao, nao a unica linha de defesa)."""
    llm: JsonLLMService = contexto["llm"]
    try:
        julgamento = await llm.ainvoke_structured(
            prompt_name="mentor_grounding_check.txt",
            payload={
                "resposta": resposta.reply,
                "conteudo_materia": contexto.get("conteudo_materia", {}),
            },
            schema=GroundingJudgment,
        )
    except StructuredOutputError:
        return None

    if julgamento.viola:
        return GuardrailViolation(regra="grounding_chat", mensagem=julgamento.motivo)
    return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && python -m pytest tests/test_guardrails.py -v`
Expected: 13 passed.

- [ ] **Step 5: Commit**

```bash
git add api/app/schemas/mentor_chat.py api/app/agent/prompts/mentor_grounding_check.txt api/app/agent/graph/guardrails.py api/tests/test_guardrails.py
git commit -m "feat(api): guardrail de grounding do chat do mentor via juiz LLM"
```

---

## Task 5: Vocabulário controlado em `trilha_config.txt`

**Files:**
- Modify: `api/app/agent/prompts/trilha_config.txt`

- [ ] **Step 1: Atualizar o prompt**

Substitua o conteúdo de `api/app/agent/prompts/trilha_config.txt`:

```
Voce recomenda a proxima configuracao de trilha para o aluno.

O campo "ajustes" so aceita os seguintes valores (use os que se aplicarem):
- "reforcar fundamentos": quando o desempenho recente indica dificuldade.
- "manter progressao": ritmo atual esta adequado.
- "avancar sem reforco": só use se o desempenho recente (media_acertos)
  demonstrar dominio real do topico atual. NUNCA use este valor sem
  evidencia de desempenho — sera rejeitado.

Responda somente JSON:
{
  "classe_id": 1,
  "topico_foco": 10,
  "proximos_topicos": [10,11,12],
  "ajustes": ["reforcar fundamentos"],
  "justificativa": "texto curto"
}
```

- [ ] **Step 2: Rodar a suíte de conteúdo relacionada pra garantir que nada mais depende do texto antigo**

Run: `cd api && python -m pytest tests/test_graph_nodes.py -k trilha -v`
Expected: passa (nenhum teste hoje faz snapshot literal do prompt).

- [ ] **Step 3: Commit**

```bash
git add api/app/agent/prompts/trilha_config.txt
git commit -m "feat(api): vocabulario controlado em ajustes da trilha para viabilizar guardrail de evidencia"
```

---

## Task 6: Migrar `agente_trilha` para `gerar_validado`

**Files:**
- Modify: `api/app/agent/graph/nodes/agente_trilha.py`
- Modify: `api/app/agent/graph/builder.py`
- Test: `api/tests/test_graph_nodes.py`

- [ ] **Step 1: Write the failing test**

Adicione a `api/tests/test_graph_nodes.py` (reaproveita `_FakeSessionFactory`
já definida no arquivo — ver linhas 216-226):

```python
from unittest.mock import AsyncMock

from app.agent.graph.nodes.agente_trilha import agente_trilha
from app.repositories.conteudo_classe import ConteudoClasseRepository


@pytest.mark.asyncio
async def test_agente_trilha_rejeita_pulo_de_ordem_e_cai_no_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        ConteudoClasseRepository,
        "listar_topicos_classe",
        AsyncMock(
            return_value=[
                {"id": 10, "ordem": 1},
                {"id": 11, "ordem": 2},
            ]
        ),
    )
    settings = Settings(openai_api_key=None)

    result = await agente_trilha(
        {
            "classe_id": 1,
            "progresso_trilha": {"10": {"percentual_concluido": 30}},
            "desempenho_recente": {"media_acertos": 40},
        },
        settings=settings,
        session_factory=_FakeSessionFactory(),
    )

    assert result["completed_nodes"] == ["agente_trilha"]
    assert result["trilha_config"]["topico_foco"] == 10
```

Esse teste passa mesmo sem API key configurada porque o próprio
`ainvoke_structured` levanta `StructuredOutputError` (nenhum provedor
disponível) e `gerar_validado` cai direto no fallback — confirma que o
fallback determinístico (que já respeita a ordem, via `_fallback_trilha`)
continua funcionando com a nova assinatura.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && python -m pytest tests/test_graph_nodes.py -k test_agente_trilha_rejeita -v`
Expected: FAIL — `agente_trilha()` ainda não aceita `session_factory`.

- [ ] **Step 3: Implement**

Substitua `api/app/agent/graph/nodes/agente_trilha.py` inteiro:

```python
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.agent.graph.guardrails import (
    checar_evidencia_dominio,
    checar_ordem_sequencial,
    checar_topicos_existem,
    gerar_validado,
)
from app.core.settings import Settings
from app.repositories.conteudo_classe import ConteudoClasseRepository
from app.repositories.ia_decision_logs import IADecisionLogRepository
from app.schemas.trilha_config import TrilhaConfig
from app.services.llm import JsonLLMService


def _fallback_trilha(state: dict[str, Any]) -> dict[str, Any]:
    progresso = state.get("progresso_trilha", {})
    ordered_ids = sorted(int(topico_id) for topico_id in progresso.keys()) if progresso else []
    incompletos = [
        topico_id
        for topico_id in ordered_ids
        if float(progresso[str(topico_id)].get("percentual_concluido", 0)) < 100
    ]
    foco = state.get("payload_topico_id") or (incompletos[0] if incompletos else None)
    proximos = incompletos[:3] if incompletos else ([foco] if foco else [])
    return {
        "classe_id": state["classe_id"],
        "topico_foco": foco,
        "proximos_topicos": proximos,
        "ajustes": ["reforcar fundamentos"] if float(state.get("desempenho_recente", {}).get("media_acertos", 100)) < 50 else ["manter progressao"],
        "justificativa": "reorganizacao baseada em progresso e perfil atualizado",
    }


async def agente_trilha(
    state: dict[str, Any],
    settings: Settings,
    session_factory: async_sessionmaker[AsyncSession],
) -> dict[str, Any]:
    llm = JsonLLMService(settings)

    async with session_factory() as session:
        topicos_classe = await ConteudoClasseRepository(session).listar_topicos_classe(
            state["classe_id"]
        )

        async def _auditar(violacao, fase) -> None:
            await IADecisionLogRepository(session).log(
                aluno_id=state["aluno_id"],
                classe_id=state["classe_id"],
                source="graph",
                stage="agente_trilha",
                trigger_event=fase,
                decision_summary=f"{violacao.regra}: {violacao.mensagem}",
            )
            await session.commit()

        trilha_config = await gerar_validado(
            llm,
            prompt_name="trilha_config.txt",
            payload={
                "classe_id": state.get("classe_id"),
                "perfil_update": state.get("perfil_update"),
                "progresso_trilha": state.get("progresso_trilha", {}),
                "desempenho_recente": state.get("desempenho_recente", {}),
            },
            schema=TrilhaConfig,
            guardrails=[checar_ordem_sequencial, checar_topicos_existem, checar_evidencia_dominio],
            fallback_factory=lambda: _fallback_trilha(state),
            contexto={
                "topicos_classe": topicos_classe,
                "progresso_trilha": state.get("progresso_trilha", {}),
                "desempenho_recente": state.get("desempenho_recente", {}),
            },
            on_violation=_auditar,
        )

    return {
        "trilha_config": trilha_config.model_dump(mode="json"),
        "completed_nodes": ["agente_trilha"],
        "messages": [trilha_config.justificativa],
    }
```

Em `api/app/agent/graph/builder.py`, troque a linha do `agente_trilha` (linha
31) para passar `session_factory`:

```python
    graph.add_node(
        "agente_trilha",
        partial(nodes.agente_trilha, settings=settings, session_factory=session_factory),
    )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && python -m pytest tests/test_graph_nodes.py tests/test_api.py -v`
Expected: todos passam (inclusive os testes existentes que constroem o grafo
via `build_graph`, que agora recebem o `agente_trilha` com a nova assinatura
automaticamente através do `partial`).

- [ ] **Step 5: Commit**

```bash
git add api/app/agent/graph/nodes/agente_trilha.py api/app/agent/graph/builder.py api/tests/test_graph_nodes.py
git commit -m "feat(api): agente_trilha usa gerar_validado com guardrails de ordem/existencia/evidencia"
```

---

## Task 7: Migrar `agente_perfil`, `agente_conteudo`, `agente_texto`, `agente_ui`, `agente_notificacao` para `ainvoke_structured`

**Files:**
- Modify: `api/app/agent/graph/nodes/agente_perfil.py`
- Modify: `api/app/agent/graph/nodes/agente_conteudo.py`
- Modify: `api/app/agent/graph/nodes/agente_texto.py`
- Modify: `api/app/agent/graph/nodes/agente_ui.py`
- Modify: `api/app/agent/graph/nodes/agente_notificacao.py`
- Test: `api/tests/test_graph_nodes.py`

Esses 5 nós têm o mesmo formato hoje (`ainvoke_json` + `Schema.model_validate`
manual, sem guardrail de negócio nesta leva) — cada um troca só a chamada
LLM, mantendo o resto do corpo idêntico.

- [ ] **Step 1: Confirmar que os testes existentes cobrem esses nós (baseline)**

Run: `cd api && python -m pytest tests/test_graph_nodes.py -v`
Expected: `test_agente_perfil_falls_back_without_openai` passa (baseline antes
da mudança).

- [ ] **Step 2: Migrar `agente_perfil.py`**

Em `api/app/agent/graph/nodes/agente_perfil.py`, troque o import e o corpo da
função (mantendo `_fallback_perfil` intacta):

```python
from app.services.llm import JsonLLMService, StructuredOutputError
```

```python
async def agente_perfil(state: dict[str, Any], settings: Settings) -> dict[str, Any]:
    llm = JsonLLMService(settings)
    try:
        perfil_update = await llm.ainvoke_structured(
            prompt_name="perfil_brainhex.txt",
            payload={
                "perfis_atuais": state.get("perfil_brainhex", []),
                "historico_eventos": state.get("historico_eventos", [])[-20:],
                "eventos_novos": state.get("eventos_novos", []),
                "desempenho": state.get("desempenho_recente", {}),
            },
            schema=PerfilUpdate,
        )
    except StructuredOutputError:
        perfil_update = PerfilUpdate.model_validate(_fallback_perfil(state))

    return {
        "perfil_update": perfil_update.model_dump(mode="json"),
        "completed_nodes": ["agente_perfil"],
        "messages": [perfil_update.justificativa or "perfil atualizado"],
    }
```

- [ ] **Step 3: Migrar `agente_conteudo.py`**

Mesmo padrão em `api/app/agent/graph/nodes/agente_conteudo.py`:

```python
from app.services.llm import JsonLLMService, StructuredOutputError
```

```python
async def agente_conteudo(state: dict[str, Any], settings: Settings) -> dict[str, Any]:
    llm = JsonLLMService(settings)
    try:
        conteudo = await llm.ainvoke_structured(
            prompt_name="conteudo_adaptado.txt",
            payload={
                "payload_topico_id": state.get("payload_topico_id"),
                "conteudo_foco_id": state.get("conteudo_foco_id"),
                "desempenho_recente": state.get("desempenho_recente", {}),
                "emocao_atual": state.get("emocao_atual"),
                "perfil_brainhex": state.get("perfil_brainhex", []),
            },
            schema=ConteudoAdaptado,
        )
    except StructuredOutputError:
        conteudo = ConteudoAdaptado.model_validate(_fallback_conteudo(state))

    return {
        "conteudo_adaptado": conteudo.model_dump(mode="json"),
        "completed_nodes": ["agente_conteudo"],
        "messages": [f"conteudo adaptado para topico {conteudo.topico_id}"],
    }
```

- [ ] **Step 4: Migrar `agente_texto.py`**

Mesmo padrão em `api/app/agent/graph/nodes/agente_texto.py`:

```python
from app.services.llm import JsonLLMService, StructuredOutputError
```

```python
async def agente_texto(state: dict[str, Any], settings: Settings) -> dict[str, Any]:
    llm = JsonLLMService(settings)
    try:
        texto = await llm.ainvoke_structured(
            prompt_name="texto_personalizado.txt",
            payload={
                "ui_config": state.get("ui_config"),
                "perfil_brainhex": state.get("perfil_brainhex", []),
                "emocao_atual": state.get("emocao_atual"),
                "nome_aluno": state.get("nome_aluno"),
                "notificacao_payload": state.get("notificacao_payload"),
            },
            schema=TextoGerado,
        )
    except StructuredOutputError:
        texto = TextoGerado.model_validate(_fallback_texto(state))

    return {
        "textos_gerados": [texto.model_dump(mode="json")],
        "completed_nodes": ["agente_texto"],
        "messages": [f"texto gerado: {texto.titulo}"],
    }
```

- [ ] **Step 5: Migrar `agente_ui.py`**

Mesmo padrão em `api/app/agent/graph/nodes/agente_ui.py`:

```python
from app.services.llm import JsonLLMService, StructuredOutputError
```

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

    return {
        "ui_config": ui_config.model_dump(mode="json"),
        "completed_nodes": ["agente_ui"],
        "messages": [f"ui adaptada com tema {ui_config.tema}"],
    }
```

- [ ] **Step 6: Migrar `agente_notificacao.py`**

Mesmo padrão em `api/app/agent/graph/nodes/agente_notificacao.py`:

```python
from app.services.llm import JsonLLMService, StructuredOutputError
```

```python
async def agente_notificacao(state: dict[str, Any], settings: Settings) -> dict[str, Any]:
    llm = JsonLLMService(settings)
    try:
        notificacao = await llm.ainvoke_structured(
            prompt_name="notificacao.txt",
            payload={
                "emocao_atual": state.get("emocao_atual"),
                "eventos_novos": state.get("eventos_novos", []),
                "desempenho_recente": state.get("desempenho_recente", {}),
            },
            schema=NotificacaoPayload,
        )
    except StructuredOutputError:
        notificacao = NotificacaoPayload.model_validate(_fallback_notificacao(state))

    return {
        "notificacao_payload": notificacao.model_dump(mode="json"),
        "completed_nodes": ["agente_notificacao"],
        "messages": [f"notificacao definida: {notificacao.tipo}"],
    }
```

- [ ] **Step 7: Run tests to verify everything still passes**

Run: `cd api && python -m pytest tests/test_graph_nodes.py tests/test_api.py -v`
Expected: todos passam — sem API key configurada, `ainvoke_structured` levanta
`StructuredOutputError` (mesmo caminho testado no Task 1) e cada nó cai no seu
fallback já existente, preservando o comportamento hoje coberto pelos testes.

- [ ] **Step 8: Commit**

```bash
git add api/app/agent/graph/nodes/agente_perfil.py api/app/agent/graph/nodes/agente_conteudo.py api/app/agent/graph/nodes/agente_texto.py api/app/agent/graph/nodes/agente_ui.py api/app/agent/graph/nodes/agente_notificacao.py
git commit -m "feat(api): migra 5 nos do grafo para ainvoke_structured (geracao nunca crasha o grafo)"
```

---

## Task 8: `SupervisorDecision` e migrar `supervisor`

**Files:**
- Create: `api/app/schemas/supervisor_decision.py`
- Modify: `api/app/agent/graph/nodes/supervisor.py`
- Test: `api/tests/test_graph_nodes.py`

- [ ] **Step 1: Write the failing test**

Adicione a `api/tests/test_graph_nodes.py`:

```python
@pytest.mark.asyncio
async def test_supervisor_falls_back_to_deterministic_routing_without_llm() -> None:
    from app.agent.graph.nodes.supervisor import supervisor

    settings = Settings(openai_api_key=None)
    result = await supervisor(
        {
            "workflow_kind": "chat",
            "frame_b64": None,
            "eventos_novos": [],
            "historico_eventos": [],
            "desempenho_recente": {},
            "completed_nodes": [],
        },
        settings=settings,
    )

    assert isinstance(result["next"], list)
    assert "justificativa" not in result or isinstance(result["messages"][0], str)
```

- [ ] **Step 2: Run test to verify current behavior (this one should already pass — it's a regression guard before refactor)**

Run: `cd api && python -m pytest tests/test_graph_nodes.py -k supervisor -v`
Expected: PASS já com o código atual (é um teste de regressão, não TDD
clássico — o `supervisor` já cai em `deterministic_next` sem LLM). Serve pra
travar o comportamento antes de trocar a chamada LLM por baixo.

- [ ] **Step 3: Criar o schema e migrar**

Crie `api/app/schemas/supervisor_decision.py`:

```python
from pydantic import BaseModel, Field


class SupervisorDecision(BaseModel):
    next: list[str] = Field(default_factory=list)
    justificativa: str = ""
```

Em `api/app/agent/graph/nodes/supervisor.py`, troque o import e o trecho de
chamada LLM:

```python
from app.schemas.supervisor_decision import SupervisorDecision
from app.services.llm import JsonLLMService, StructuredOutputError
```

```python
    llm = JsonLLMService(settings)
    deterministic_next = compute_supervisor_next(state)
    summary = build_state_summary(state)

    try:
        decisao = await llm.ainvoke_structured(
            prompt_name="supervisor.txt",
            payload=summary,
            schema=SupervisorDecision,
            model=settings.active_model_supervisor,
        )
    except StructuredOutputError:
        decisao = SupervisorDecision(next=deterministic_next, justificativa="roteamento deterministico do MVP")

    next_nodes = [node for node in decisao.next if node in VALID_NEXT]
    if not next_nodes:
        next_nodes = deterministic_next

    return {
        "next": next_nodes,
        "messages": [decisao.justificativa or "supervisor executado"],
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && python -m pytest tests/test_graph_nodes.py -v`
Expected: todos passam.

- [ ] **Step 5: Commit**

```bash
git add api/app/schemas/supervisor_decision.py api/app/agent/graph/nodes/supervisor.py api/tests/test_graph_nodes.py
git commit -m "feat(api): supervisor usa ainvoke_structured com SupervisorDecision"
```

---

## Task 9: Migrar o chat do mentor para `gerar_validado` com grounding

**Files:**
- Modify: `api/app/api/v1/personalizacao.py`
- Test: `api/tests/test_api.py`

- [ ] **Step 1: Write the failing test**

Não existe hoje nenhum teste HTTP para `/chat` em `api/tests/test_api.py` —
este é o primeiro. Rota completa: `/api/v1/personalizar/chat` (prefixo
`/api/v1` do `v1_router` em `app/api/router.py` + prefixo `/personalizar` do
router de `personalizacao.py`). Use `topico_id=None` no payload pra não
precisar mockar os métodos de conteúdo de tópico (`buscar_topico`,
`buscar_conteudos_topico` etc. só são chamados quando `topico_id` não é
`None`, conforme `v1/personalizacao.py:1419-1446`). Reaproveite as fixtures
`app`, `aluno_user`, `FakeSession`, `override_session` já definidas em
`api/tests/conftest.py`, e o padrão de mockar métodos de repositório
diretamente com `AsyncMock` (visto em `test_materiais_endpoint_returns_student_materials`,
`test_api.py:303-334`).

Adicione ao final de `api/tests/test_api.py`:

```python
from unittest.mock import AsyncMock

from app.repositories.access import AccessRepository
from app.repositories.context import ContextRepository
from app.repositories.conteudo_personalizado import ConteudoPersonalizadoRepository
from app.services.llm import JsonLLMService


def test_chat_mentor_rejeita_resposta_que_entrega_gabarito(
    app, aluno_user, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake_session = FakeSession()

    async def override_session_local():
        yield fake_session

    app.dependency_overrides[get_session] = override_session_local
    app.dependency_overrides[get_current_user] = lambda: aluno_user

    monkeypatch.setattr(
        AccessRepository, "aluno_belongs_to_classe", AsyncMock(return_value=True)
    )
    monkeypatch.setattr(
        ContextRepository, "fetch_aluno_context", AsyncMock(return_value={})
    )
    monkeypatch.setattr(
        ConteudoPersonalizadoRepository, "buscar_por_aluno", AsyncMock(return_value=[])
    )

    respostas_llm = iter(
        [
            {"reply": "A resposta e 42.", "should_close": False, "hinted_actions": []},
            {"viola": True, "motivo": "entrega gabarito"},
            {"reply": "Tente revisar o passo 2.", "should_close": False, "hinted_actions": []},
            {"viola": False, "motivo": ""},
        ]
    )

    async def fake_ainvoke_structured(self, *, prompt_name, payload, schema, **kwargs):
        return schema.model_validate(next(respostas_llm))

    monkeypatch.setattr(JsonLLMService, "ainvoke_structured", fake_ainvoke_structured)

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/personalizar/chat",
            json={
                "classe_id": 1,
                "topico_id": None,
                "conteudo_id": None,
                "escopo": "trilha_home",
                "mensagem": "como resolvo a atividade 2?",
                "historico": [],
            },
        )

    assert response.status_code == 200
    assert "revisar o passo 2" in response.json()["reply"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd api && python -m pytest tests/test_api.py -k chat_mentor_rejeita -v`
Expected: FAIL — endpoint ainda usa `ainvoke_json`, sem guardrail de
grounding nem retry.

- [ ] **Step 3: Implement**

Em `api/app/api/v1/personalizacao.py`, adicione os imports:

```python
from app.agent.graph.guardrails import checar_grounding_chat, gerar_validado
from app.schemas.mentor_chat import MentorChatLLMResult
```

Troque o bloco (linhas ~1470-1530, a chamada `llm.ainvoke_json(...)` do chat)
por:

```python
    llm = JsonLLMService(request.app.state.settings)

    async def _auditar_chat(violacao, fase) -> None:
        logger.info(
            "personalizacao.chat.guardrail=%s",
            {"regra": violacao.regra, "mensagem": violacao.mensagem, "fase": fase},
        )

    mentor_result = await gerar_validado(
        llm,
        prompt_name="mentor_personalizacao_chat.txt",
        payload={
            "escopo": payload.escopo,
            "mensagem": payload.mensagem,
            "historico": [item.model_dump(mode="json") for item in payload.historico[-6:]],
            "aluno": {
                "id": aluno_id,
                "modo_operacao": (context.get("aluno") or {}).get("modo_operacao") if isinstance(context.get("aluno"), dict) else None,
                "modo_resposta": (context.get("aluno") or {}).get("modo_resposta") if isinstance(context.get("aluno"), dict) else None,
            },
            "perfil_brainhex": context.get("perfil_brainhex", [])[:4],
            "metricas_aluno": _build_student_metrics_summary(context),
            "leituras_adaptativas": _build_student_reading_summary(context),
            "topico": {
                "id": payload.topico_id,
                "nome": (topico or {}).get("nome") if isinstance(topico, dict) else None,
                "descricao": (topico or {}).get("descricao") if isinstance(topico, dict) else None,
            },
            "decisao_personalizacao": (
                ((latest_record or {}).get("plano") or {}).get("justificativa")
                if latest_record
                else None
            ),
            "conteudo_materia": {
                "conteudos": [
                    {
                        "titulo": c.get("titulo"),
                        "tipo": c.get("tipo"),
                        "resumo": str(c.get("conteudo") or "")[:600],
                        "ordem": c.get("ordem"),
                    }
                    for c in (conteudos_topico or [])[:12]
                    if isinstance(c, dict)
                ],
                "atividades": [
                    {
                        "titulo": a.get("titulo"),
                        "descricao": a.get("descricao"),
                        "tipo": a.get("tipo"),
                    }
                    for a in (atividades_topico or [])[:12]
                    if isinstance(a, dict)
                ],
                "questoes_temas": [
                    {"enunciado": q.get("enunciado"), "tipo": q.get("tipo")}
                    for q in (questoes_topico or [])[:20]
                    if isinstance(q, dict)
                ],
            },
            "guardrails": {
                "sem_gabarito": True,
                "sem_resposta_direta_atividade": True,
            },
        },
        schema=MentorChatLLMResult,
        guardrails=[checar_grounding_chat],
        fallback_factory=lambda: dict(fallback),
        contexto={"llm": llm, "conteudo_materia": {"conteudos": conteudos_topico, "atividades": atividades_topico}},
        on_violation=_auditar_chat,
        model=None,
        provider="openai",
    )

    result = mentor_result.model_dump(mode="json")
    response = MentorChatResponse(
        reply=mentor_result.reply.strip(),
        scope=payload.escopo,
        should_close=mentor_result.should_close,
        hinted_actions=[item.strip() for item in mentor_result.hinted_actions if item.strip()],
    )
```

Note: `gerar_validado` não recebe `provider=`/`model=` diretamente — esses
parâmetros pertencem a `ainvoke_structured`, chamado internamente. Ajuste
`gerar_validado` (Task 3) não precisa mudar; em vez disso, passe
`provider="openai"` via um wrapper simples: crie uma pequena função local
`_ainvoke_openai(...)` ou, mais simples, deixe `gerar_validado` aceitar
`**ainvoke_kwargs` repassados para `llm.ainvoke_structured`. Adicione esse
repasse em `api/app/agent/graph/guardrails.py`, no `gerar_validado` (Task 3),
como último ajuste desta task:

```python
async def gerar_validado(
    llm: JsonLLMService,
    *,
    prompt_name: str,
    payload: dict[str, Any],
    schema: type[T],
    guardrails: list[Callable[[T, dict[str, Any]], Any]],
    fallback_factory: Callable[[], dict[str, Any]],
    contexto: dict[str, Any] | None = None,
    on_violation: Callable[[GuardrailViolation, str], Awaitable[None]] | None = None,
    max_tentativas: int = 2,
    **ainvoke_kwargs: Any,
) -> T:
    ...
            resultado = await llm.ainvoke_structured(
                prompt_name=prompt_name,
                payload=tentativa_payload,
                schema=schema,
                **ainvoke_kwargs,
            )
    ...
```

(Essa mudança em `gerar_validado` não quebra os testes do Task 3/6, que não
passam `**ainvoke_kwargs` — comportamento aditivo.)

O restante do handler (log de auditoria em `IADecisionLogRepository`, log de
`personalizacao.chat.output`) continua igual, só trocando `result` (dict cru)
por `mentor_result.model_dump(mode="json")` onde `result` era usado antes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd api && python -m pytest tests/test_api.py tests/test_guardrails.py -v`
Expected: todos passam.

- [ ] **Step 5: Commit**

```bash
git add api/app/agent/graph/guardrails.py api/app/api/v1/personalizacao.py api/tests/test_api.py
git commit -m "feat(api): chat do mentor usa gerar_validado com guardrail de grounding real"
```

---

## Task 10: Teste de regressão do guardrail "progresso não é alterável pelo LLM"

**Files:**
- Test: `api/tests/test_graph_nodes.py`

- [ ] **Step 1: Write the test**

Adicione a `api/tests/test_graph_nodes.py`:

```python
def test_trilha_config_e_perfil_update_nao_expoe_campo_de_progresso() -> None:
    """Guardrail 'nao alterar progresso arbitrariamente' e garantido por
    construcao: os schemas que os nos de decisao preenchem nao tem campo de
    percentual/progresso — quem escreve isso e so o merge de telemetria
    (personalizacao_progresso.py). Este teste trava essa invariante."""
    from app.schemas.perfil import PerfilUpdate
    from app.schemas.trilha_config import TrilhaConfig

    campos_proibidos = {"percentual_concluido", "percentual", "progresso"}

    assert not (set(TrilhaConfig.model_fields) & campos_proibidos)
    assert not (set(PerfilUpdate.model_fields) & campos_proibidos)
```

- [ ] **Step 2: Run test to verify it passes**

Run: `cd api && python -m pytest tests/test_graph_nodes.py -k progresso -v`
Expected: PASS (documenta uma invariante já verdadeira hoje — se alguém
adicionar um desses campos no futuro sem querer, este teste quebra).

- [ ] **Step 3: Commit**

```bash
git add api/tests/test_graph_nodes.py
git commit -m "test(api): trava invariante de que schemas de decisao nao expoe campo de progresso"
```

---

## Task 11: Suíte completa e finalização

**Files:** nenhum arquivo novo — apenas verificação.

- [ ] **Step 1: Rodar a suíte inteira da API**

Run: `cd api && python -m pytest -q`
Expected: 0 failures.

- [ ] **Step 2: Rodar lint/typecheck se configurado no projeto**

Run: `cd api && ruff check .` (ou o comando de lint já usado no projeto —
conferir `api/pyproject.toml`/`Makefile` se `ruff` não estiver disponível
diretamente).
Expected: 0 erros novos introduzidos por este plano.

- [ ] **Step 3: Revisão final do diff**

Run: `git diff main --stat` (a partir da worktree, comparando com a base)
Expected: só os arquivos listados nas tasks acima aparecem alterados.

- [ ] **Step 4: Finalizar**

Anuncie: "Usando a skill finishing-a-development-branch para concluir este
trabalho." e siga essa skill (verificar testes → apresentar as 4 opções →
executar a escolha → limpar a worktree).
