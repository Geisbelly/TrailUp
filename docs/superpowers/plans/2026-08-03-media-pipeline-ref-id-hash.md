# Hash Completo no Path do Fallback Python — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o discriminador de versão truncado (`ciclo_id[:8]`, 32 bits)
por um sha256 completo (256 bits) no `ref_id` do fallback Python
(`MultiOutputPipeline._context()`), alinhando ao esquema já usado pelo path
do microservice (`generationStorageSegment()`).

**Architecture:** Mudança cirúrgica de uma linha em
`api/app/services/media_pipeline.py`, mais o import de `hashlib`. Nenhuma
outra parte do sistema é tocada.

**Tech Stack:** Python, pytest.

---

### Task 1: Hash sha256 completo no `ref_id`

**Files:**
- Modify: `api/app/services/media_pipeline.py:4` (import) e `:419-436` (método `_context`)
- Test: `api/tests/test_media_pipeline.py`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar em `api/tests/test_media_pipeline.py`, logo após o teste
`test_multi_output_context_uses_brainhex_profile_prefix` (por volta da
linha 88):

```python
def test_multi_output_context_ref_id_uses_full_sha256_of_ciclo_id() -> None:
    pipeline = MultiOutputPipeline(
        settings=Settings(openai_api_key=None),
        state={
            "aluno_id": "a",
            "classe_id": 1,
            "payload_topico_id": 2,
            "ciclo_id": "ciclo-de-teste-123",
            "perfil_brainhex": [{"perfil": "seeker", "afinidade": 0.9}],
        },
    )
    ctx = pipeline._context()
    expected_digest = hashlib.sha256(b"ciclo-de-teste-123").hexdigest()
    assert ctx.ref_id.endswith(expected_digest)
    assert len(expected_digest) == 64
```

`hashlib` precisa estar importado no topo de `test_media_pipeline.py` — se
ainda não estiver, adicione `import hashlib` junto aos outros imports do
arquivo.

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd api && python -m pytest tests/test_media_pipeline.py::test_multi_output_context_ref_id_uses_full_sha256_of_ciclo_id -v`
Expected: FAIL — `ctx.ref_id` hoje termina em `"ciclo-de-8"` (8 primeiros
caracteres literais de `"ciclo-de-teste-123"`), não no hash sha256 completo.

- [ ] **Step 3: Importar `hashlib`**

Em `api/app/services/media_pipeline.py`, linha 3-6, adicionar `hashlib` à
lista de imports (ordem alfabética com os já existentes):

```python
import asyncio
import hashlib
import logging
import re
import unicodedata
```

- [ ] **Step 4: Trocar o cálculo de `ref_id` em `_context()`**

Em `api/app/services/media_pipeline.py`, dentro de `_context()` (por volta
da linha 421), trocar:

```python
        ref_id = f"{ref_base}_{str(self.state.get('ciclo_id') or '')[:8]}"
```

por:

```python
        ciclo_id_raw = str(self.state.get("ciclo_id") or "")
        digest = hashlib.sha256(ciclo_id_raw.encode("utf-8")).hexdigest()
        ref_id = f"{ref_base}_{digest}"
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `cd api && python -m pytest tests/test_media_pipeline.py::test_multi_output_context_ref_id_uses_full_sha256_of_ciclo_id tests/test_media_pipeline.py::test_multi_output_context_uses_brainhex_profile_prefix -v`
Expected: PASS nos dois.

- [ ] **Step 6: Rodar a suíte completa de `test_media_pipeline.py`**

Run: `cd api && python -m pytest tests/test_media_pipeline.py -v`
Expected: todos os testes do arquivo passam, sem regressão (nenhum outro
teste depende do formato antigo de `ref_id`).

- [ ] **Step 7: Rodar a suíte completa da API**

Run: `cd api && python -m pytest tests/ -q`
Expected: todos os testes passam (confirma que nada em `personalizacao.py`
ou outro lugar que usa `context.ref_id` depende do formato truncado).

- [ ] **Step 8: Commit**

```bash
git add api/app/services/media_pipeline.py api/tests/test_media_pipeline.py
git commit -m "fix(api): usa hash sha256 completo do ciclo_id no ref_id do fallback MultiOutputPipeline"
```
