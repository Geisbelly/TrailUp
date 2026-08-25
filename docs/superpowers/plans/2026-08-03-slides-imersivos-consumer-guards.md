# Slides Imersivos — Guardas nos Consumidores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a lacuna documentada em `docs/superpowers/specs/2026-08-03-slides-imersivos-html-ia-design.md` ("Pré-requisito antes de ligar o flag em produção"): 3 consumidores de `materiais.apresentacao.payload.slides` (2 no mobile, 1 na API) hoje assumem sempre o formato antigo (`SlideContent[]` estruturado) e leriam o formato novo (`[{index, html}]`, gravado quando `metadata.engine_variant === "immersive"`) de forma silenciosamente corrompida — sem checar o discriminador que já existe no metadata.

**Architecture:** Nenhum dos 3 consumidores precisa aprender a *renderizar* o formato imersivo — o mobile já tem um caminho alternativo (WebView via `arquivo_url`) que serve exatamente esse propósito, e a API simplesmente não suporta ainda regenerar 1 slide desse formato. A correção é sempre "detectar e desviar/rejeitar com clareza", não "aprender o formato novo".

**Tech Stack:** TypeScript (mobile, Expo/React Native — testes via `node:test`/`tsx`, mesmo padrão do microservice, sem script `npm test` central), Python (api, pytest — já em uso extensivamente neste repo).

**Spec:** `docs/superpowers/specs/2026-08-03-slides-imersivos-html-ia-design.md` (seção "Pré-requisito antes de ligar o flag em produção")

---

## Task A: Mobile não sintetiza o bloco nativo quando o material é imersivo

**Files:**
- Modify: `mobile/src/utils/personalization.ts`
- Modify: `mobile/src/components/PresentationSlidesBlock.tsx`
- Test: `mobile/src/utils/personalization.multicontent.test.ts`

### Contexto de como funciona hoje (confirmado por leitura direta do código)

Em `normalizeMediaBlocks()` (`mobile/src/utils/personalization.ts:815-829`), a variável `metadata` (linha 886) já é montada como `{...inheritedMetadata, ...metadataFromRaw, ...metadataFromPayload, ...}`, onde `metadataFromRaw = asLooseRecord(rawObject.metadata)` — ou seja, `metadata.engine_variant` já reflete `materiais.apresentacao.metadata.engine_variant` sem precisar de nenhum acesso novo.

No branch `if (tipo === "apresentacao")` (linha 1280), o código hoje é:

```typescript
const richSlides = normalizeRichPresentationSlides(payload.slides ?? rawObject.slides);
const hasInlineSlides = richSlides.length > 0;
```

`hasInlineSlides` decide um `if/else` mutuamente exclusivo: quando `true`, o material vira um bloco `apresentacao-slides` (renderizado nativamente por `PresentationSlidesBlock`, linha 1369-1384); quando `false`, cai nos ramos que usam `arquivo_url`/Storage (WebView, linhas 1291-1364) — **nunca os dois ao mesmo tempo**. Como o formato imersivo (`{index, html}`) não tem nenhum dos campos que `normalizeRichPresentationSlides` lê (`titulo`/`title`, `pontos`/`points`/`bullets`/`topics`, etc.), cada slide vira `{title: "Slide N", points: [], explanation: null, ...}` — passa pelo guard de descarte (que nunca dispara, porque o fallback de título é sempre truthy) e produz `hasInlineSlides = true`, sintetizando um bloco nativo **totalmente vazio de conteúdo real**, em vez de cair no caminho WebView que já existe e já serve exatamente este propósito.

- [x] **Step 1: Escrever o teste que falha**

Abra `mobile/src/utils/personalization.multicontent.test.ts` e leia o topo do arquivo pra confirmar o padrão de import/mock já usado (mock de `@/database/supabase` via `require.cache`, import de funções de `@/utils/personalization` — mantenha esse mesmo padrão). Adicione ao final do arquivo:

```typescript
test("normalizeMediaBlocks nao sintetiza apresentacao-slides quando engine_variant e immersive", () => {
  const blocks = normalizeMediaBlocks(
    "apresentacao",
    {
      arquivo_url: "https://cdn.exemplo/deck.html",
      metadata: { engine_variant: "immersive", status: "completed" },
      payload: {
        slides: [
          { index: 0, html: "<section>slide 0</section>" },
          { index: 1, html: "<section>slide 1</section>" },
        ],
      },
    },
    "apresentacao-1"
  );

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].tipo, "apresentacao");
  assert.notEqual(blocks[0].tipo, "apresentacao-slides");
});

test("normalizeMediaBlocks continua sintetizando apresentacao-slides sem engine_variant (formato antigo)", () => {
  const blocks = normalizeMediaBlocks(
    "apresentacao",
    {
      metadata: { status: "completed" },
      payload: {
        slides: [
          { titulo: "Slide 1", pontos: ["a", "b"] },
        ],
      },
    },
    "apresentacao-2"
  );

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].tipo, "apresentacao-slides");
});
```

Ajuste os nomes exatos importados (`normalizeMediaBlocks` pode não estar exportado diretamente — se não estiver, confira como os testes existentes neste arquivo chegam até essa lógica, ex.: via uma função pública de nível mais alto como `normalizePersonalizedTopicPayload`, e adapte os 2 testes acima pra chamar através dessa função pública em vez de `normalizeMediaBlocks` direto. Não exporte `normalizeMediaBlocks` só para o teste se ele não é hoje exportado — use o caminho público já testado pelos outros testes deste arquivo).

- [x] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd mobile && npx tsx --test src/utils/personalization.multicontent.test.ts`
Expected: o novo teste "nao sintetiza apresentacao-slides quando engine_variant e immersive" FALHA (o código atual ainda produz `tipo: "apresentacao-slides"`); o segundo teste (formato antigo) já passa mesmo sem nenhuma mudança de código (serve de guarda de regressão).

- [x] **Step 3: Implementar a correção em `personalization.ts`**

Troque:
```typescript
    const richSlides = normalizeRichPresentationSlides(payload.slides ?? rawObject.slides);
    const hasInlineSlides = richSlides.length > 0;
```
por:
```typescript
    // materiais.apresentacao.payload.slides pode vir em 2 formatos, segundo
    // metadata.engine_variant: SlideContent estruturado (formato antigo,
    // ausente/undefined) ou [{index, html}] (motor imersivo). O segundo
    // formato nao tem nenhum campo que normalizeRichPresentationSlides
    // entenda - sintetizar um bloco nativo a partir dele produziria slides
    // "vazios" (titulo generico, sem pontos/explicacao/imagem). Quando
    // imersivo, pula a sintese e deixa cair nos ramos abaixo que usam
    // arquivo_url/WebView - que ja sabem renderizar o deck completo.
    const isImmersiveEngine = metadata.engine_variant === "immersive";
    const richSlides = isImmersiveEngine
      ? []
      : normalizeRichPresentationSlides(payload.slides ?? rawObject.slides);
    const hasInlineSlides = richSlides.length > 0;
```

- [x] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd mobile && npx tsx --test src/utils/personalization.multicontent.test.ts`
Expected: PASS (os 3 testes já existentes + os 2 novos = 5 testes)

- [x] **Step 5: Defesa em profundidade em `PresentationSlidesBlock.tsx`**

Mesmo com o Step 3 corrigindo a causa raiz, adicione um filtro que descarta slides sem nenhum conteúdo substantivo — protege contra qualquer outro caminho (atual ou futuro) que produza um `RichPresentationSlide` vazio, não só este bug específico.

Abra `mobile/src/components/PresentationSlidesBlock.tsx`, localize `normalizePayload` (linhas ~26-38):

```typescript
function normalizePayload(payload: ContentBlockPayload): {
  title?: string | null;
  abertura?: string | null;
  slides: RichPresentationSlide[];
} {
  if (!payload || typeof payload !== "object") {
    return { title: null, abertura: null, slides: [] };
  }
  return {
    title: payload.title ?? null,
    abertura: payload.abertura ?? null,
    slides: Array.isArray(payload.slides) ? payload.slides : [],
  };
}
```

Troque o `return` final por:

```typescript
  const rawSlides: RichPresentationSlide[] = Array.isArray(payload.slides) ? payload.slides : [];
  // Descarta slides sem nenhum conteudo substantivo (titulo generico
  // "Slide N" sozinho nao conta - ver comentario em personalization.ts
  // sobre por que isso pode acontecer). Protege a UI de mostrar cards
  // vazios mesmo se algum caminho upstream produzir um RichPresentationSlide
  // degenerado.
  const slides = rawSlides.filter(
    (slide) =>
      (slide.points?.length ?? 0) > 0 ||
      Boolean(slide.explanation) ||
      Boolean(slide.characterQuote) ||
      Boolean(slide.imagemReferencia)
  );
  return {
    title: payload.title ?? null,
    abertura: payload.abertura ?? null,
    slides,
  };
}
```

- [x] **Step 6: Escrever um teste rápido pra esse filtro**

Se este arquivo já tem algum teste (`PresentationSlidesBlock.test.tsx` ou similar) — verifique antes de criar um novo. Se não houver nenhum teste de componente React Native já configurado neste projeto (Testing Library, etc.), NÃO crie a infraestrutura de teste de componente do zero só para isto — extraia `normalizePayload` como uma função exportada e teste-a isoladamente com `node:test`, no mesmo padrão do Step 1:

```typescript
// mobile/src/components/PresentationSlidesBlock.test.ts (novo arquivo, so se nao existir infra de teste de componente ja pronta)
import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePayload } from "./PresentationSlidesBlock";

test("normalizePayload descarta slides sem conteudo substantivo", () => {
  const result = normalizePayload({
    title: "Deck",
    slides: [
      { title: "Slide 1", points: ["a"] },
      { title: "Slide 2" },
    ],
  } as any);
  assert.equal(result.slides.length, 1);
  assert.equal(result.slides[0].title, "Slide 1");
});
```

Exporte `normalizePayload` de `PresentationSlidesBlock.tsx` (adicione `export` na declaração da função) só se ainda não for exportado.

Run: `cd mobile && npx tsx --test src/components/PresentationSlidesBlock.test.ts`
Expected: PASS

- [x] **Step 7: Rodar os 2 arquivos de teste modificados/criados e commitar**

Run: `cd mobile && npx tsx --test src/utils/personalization.multicontent.test.ts src/components/PresentationSlidesBlock.test.ts`
Expected: todos passam.

```bash
git add mobile/src/utils/personalization.ts mobile/src/components/PresentationSlidesBlock.tsx mobile/src/utils/personalization.multicontent.test.ts mobile/src/components/PresentationSlidesBlock.test.ts
git commit -m "fix(mobile): nao renderiza payload de slide imersivo via componente nativo"
```

(Ajuste a lista de `git add` se o Step 6 não precisou criar um arquivo novo de teste.)

---

## Task B: API rejeita regeneração de slide individual pra material imersivo

**Files:**
- Modify: `api/app/api/v1/personalizacao.py`
- Test: `api/tests/test_api.py`

### Contexto (confirmado por leitura direta do código)

Em `regenerar_slide_personalizacao` (`api/app/api/v1/personalizacao.py:2204-2263`), o trecho:

```python
materiais = record.get("materiais") if isinstance(record.get("materiais"), dict) else {}
slides_atuais = (
    (materiais.get("apresentacao") or {}).get("payload") or {}
).get("slides")
if not isinstance(slides_atuais, list) or not slides_atuais:
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Este perfil ainda nao possui apresentacao gerada para regenerar.",
    )
```

nunca lê `materiais["apresentacao"]["metadata"]` — não sabe distinguir o formato antigo (`SlideContent[]`) do novo (`[{index, html}]`, gravado quando `metadata.engine_variant == "immersive"`). Se o material for imersivo, o código segue adiante, indexa `slides_atuais[payload.slide_index]` (um dict `{index, html}`), manda pro microservice via `regenerar_slide_brainhex` (que espera um `SlideContent` e não teria como aproveitar isso) e depois faz `slide_atualizado = {**slide_atual, **(resultado.get("slide") or {})}` — misturando os dois formatos no material persistido. Regenerar slide individual em formato imersivo ainda não é suportado (fica para um plano futuro); até lá, este endpoint deve rejeitar com uma mensagem clara em vez de corromper o dado.

- [x] **Step 1: Escrever o teste que falha**

Abra `api/tests/test_api.py`, localize os testes existentes de `regenerar_slide_route_*` (ex.: `test_regenerar_slide_route_rejeita_indice_invalido`) pra seguir exatamente o mesmo padrão de fixture/mock (`FakeSession`, `professor_user`, `monkeypatch.setattr(AccessRepository, "professor_owns_classe", ...)`, `monkeypatch.setattr(ConteudoClasseRepository, "buscar_classe_id_por_topico", ...)`, `monkeypatch.setattr(ConteudoPersonalizadoRepository, "buscar_mais_recente_por_perfil", ...)`). Adicione, próximo aos outros testes de `regenerar_slide`:

```python
def test_regenerar_slide_route_rejeita_material_imersivo(app, monkeypatch) -> None:
    fake_session = FakeSession()

    async def override_session():
        yield fake_session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_current_user] = lambda: _regenerar_professor_user()
    monkeypatch.setattr(AccessRepository, "professor_owns_classe", AsyncMock(return_value=True))
    monkeypatch.setattr(ConteudoClasseRepository, "buscar_classe_id_por_topico", AsyncMock(return_value=10))
    monkeypatch.setattr(
        ConteudoPersonalizadoRepository,
        "buscar_mais_recente_por_perfil",
        AsyncMock(
            return_value=_stored_record_com_materiais(
                {
                    "apresentacao": {
                        "payload": {"slides": [{"index": 0, "html": "<section>a</section>"}]},
                        "metadata": {"engine_variant": "immersive"},
                    }
                }
            )
        ),
    )

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/personalizar/perfis/10/55/regenerar/slide",
            json={
                "brainhex_profile_key": "mastermind",
                "slide_index": 0,
                "improvement_prompt": "deixe mais visual",
            },
        )

    assert response.status_code == 409
    assert "imersivo" in response.json()["detail"].lower()
```

(Reaproveite os helpers já existentes neste arquivo `_regenerar_professor_user()` e `_stored_record_com_materiais(materiais)` — não os redefina.)

- [x] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd api && python -m pytest tests/test_api.py -q -k test_regenerar_slide_route_rejeita_material_imersivo`
Expected: FAIL (hoje o código não rejeita isso — provavelmente falha mais adiante, ex.: tentando chamar o microservice, ou passa e devolve algo diferente de 409; a asserção de status/detail não bate).

- [x] **Step 3: Implementar a checagem**

Em `api/app/api/v1/personalizacao.py`, dentro de `regenerar_slide_personalizacao`, logo depois da linha que monta `materiais` e ANTES da checagem de `slides_atuais`:

```python
    materiais = record.get("materiais") if isinstance(record.get("materiais"), dict) else {}
    apresentacao_metadata = (
        (materiais.get("apresentacao") or {}).get("metadata")
        if isinstance(materiais.get("apresentacao"), dict)
        else {}
    ) or {}
    if apresentacao_metadata.get("engine_variant") == "immersive":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Este material usa o motor imersivo de slides; regeneracao de "
                "slide individual via este endpoint ainda nao e suportada "
                "para este formato."
            ),
        )
    slides_atuais = (
        (materiais.get("apresentacao") or {}).get("payload") or {}
    ).get("slides")
```

(A linha `slides_atuais = ...` já existe — só adicione a checagem nova ANTES dela, sem duplicar a linha existente.)

- [x] **Step 4: Rodar o teste novo e confirmar que passa**

Run: `cd api && python -m pytest tests/test_api.py -q -k test_regenerar_slide_route_rejeita_material_imersivo`
Expected: PASS

- [x] **Step 5: Rodar a suíte inteira da API e commitar**

Run: `cd api && python -m pytest -q`
Expected: todos os testes passam (nenhuma regressão nos outros testes de `regenerar_slide`/`regenerar_documento`, que não têm `engine_variant` no metadata e continuam seguindo o fluxo normal).

```bash
git add api/app/api/v1/personalizacao.py api/tests/test_api.py
git commit -m "fix(api): rejeita regeneracao de slide individual pra material imersivo"
```

---

## Self-Review

- **Cobertura da spec:** os 3 consumidores citados em `docs/superpowers/specs/2026-08-03-slides-imersivos-html-ia-design.md` ("Pré-requisito antes de ligar o flag em produção") são cobertos: `mobile/src/utils/personalization.ts` (Task A Step 3), `mobile/src/components/PresentationSlidesBlock.tsx` (Task A Step 5, defesa em profundidade), `api/app/api/v1/personalizacao.py` (Task B Step 3).
- **Sem placeholders** — única ressalva deliberada: Task A Step 1 instrui a ajustar o teste pra usar uma função pública caso `normalizeMediaBlocks` não seja exportada hoje, e Task A Step 6 instrui a não criar infraestrutura de teste de componente do zero — ambas são decisões conscientes de adaptação ao que existir de fato no código, não lacunas esquecidas.
- **Consistência:** `engine_variant`/`"immersive"` é o mesmo literal usado em `microservice/server.ts` (branch `feature/slides-imersivos-wiring`, ainda não mergeada) — não inventei um nome novo.
