# Profundidade dos Blocos de Conteúdo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Blocos de conteúdo mais profundos e menos rasos: libera orçamento de tokens hoje gasto num campo `slides` morto, eleva os dois pisos mínimos de expansão/cobertura, e permite complementação curricular ancorada no objetivo do tópico quando o material do professor for escasso.

**Architecture:** Duas mudanças independentes no mesmo pipeline sequencial (API Python enriquece → microservice gera markdown/áudio a partir do enriquecido). Nenhuma mudança de schema de banco, nenhuma mudança de contrato externo (`POST /personalizar` continua igual).

**Tech Stack:** Python (pytest, `content_enrichment.py`), TypeScript (`node --test`, `geminiService.ts`).

**Design doc:** `docs/superpowers/specs/2026-08-20-blocos-conteudo-profundidade-design.md`

---

## Achado adicional durante o mapeamento de arquivos

Um comentário já existente em `geminiBlockBatches.test.ts:311-316` confirma de forma independente o achado da spec: *"payload.slides nunca sai do servidor (ver comentário em archiveMultiPartToSupabase)"* — um code review anterior já tinha identificado que o array `slides` gerado pela chamada de conteúdo é morto, e já removeu os subcampos `imagePrompt`/`iconPrompts` do schema por esse motivo, mas deixou o array `slides` em si. Este plano completa essa remoção.

**Decisão de escopo (menor risco):** em vez de apagar o campo `slides` de todos os tipos TypeScript (`GeneratedBlockChapter`, `ContentPart`, `ProcessedContent` — usado por `consolidateBlockBatchGenerations`, `mergeContentBlocksIntoOne`, `splitProcessedContentIntoParts` e pelo `server.ts`), este plano **para de pedir e gerar `slides`** (schema, prompt, chamada OpenAI de fallback) mas **mantém o campo tipado, sempre vazio (`[]`)**. Isso preserva a compatibilidade estrutural de tudo que já lê `.slides` (incluindo o fallback `?? class_name` na rota legada `/api/v1/archive`, que continua funcionando sem nenhuma mudança) e evita um refactor de tipos com risco desproporcional ao ganho. `microservice/server.ts` **não precisa de nenhuma mudança** neste plano.

---

## File Structure

| Arquivo | Mudança |
|---|---|
| `api/app/services/content_enrichment.py` | Modify — pisos, limiar de escassez, flag `escasso`, instruções |
| `api/tests/test_content_enrichment.py` | Modify — pisos atualizados, fixture robusta a piso, testes de `escasso` |
| `microservice/src/services/geminiService.ts` | Modify — remove `slides` do schema/prompt/fallback, eleva pisos e teto |
| `microservice/src/services/geminiBlockBatches.test.ts` | Modify — remove asserções de `slides` real, ajusta pisos |
| `microservice/src/server.archive.test.ts`, `src/server.pipeline.test.ts`, `src/server.test.ts` | Modify (se necessário) — ajusta fixtures que hoje incluem `slides` na resposta simulada do Gemini |

---

### Task 1: Eleva os pisos de expansão e marca blocos escassos (`content_enrichment.py`)

**Files:**
- Modify: `api/app/services/content_enrichment.py`

- [ ] **Step 1: Atualiza as constantes de piso e adiciona o limiar de escassez**

Em `api/app/services/content_enrichment.py`, encontre (linhas 51–52):

```python
_MIN_EXPANSION_CHARS = 200
_MIN_EXPANSION_RATIO = 0.30
```

Substitua por:

```python
_MIN_EXPANSION_CHARS = 350
_MIN_EXPANSION_RATIO = 0.50
# Bloco cujo conteudo_base fica abaixo deste limiar e marcado "escasso" na
# chamada de enriquecimento — ver _ENRICHMENT_INSTRUCTIONS item 5. So esses
# blocos recebem permissao de complementar com conceitos curriculares alem
# da fonte literal, ancorados no objetivo do topico.
_SCARCE_BLOCK_CHARS_THRESHOLD = 800
```

- [ ] **Step 2: Atualiza `_ENRICHMENT_INSTRUCTIONS` com os novos números e a nova instrução de escassez**

Encontre (linhas 107–125):

```python
_ENRICHMENT_INSTRUCTIONS = f"""
Você é o professor-editor responsável pela etapa obrigatória de enriquecimento
curricular da TrailUp. Esta etapa ocorre na API, antes da geração de materiais.

Os blocos-base já foram separados pela API antes desta chamada. Para cada bloco:
1. Preserve exatamente o id e devolva exatamente um bloco para cada id pedido.
2. Não funda, divida, remova nem reordene blocos. Classifique cada um com tema,
   tópico e objetivos específicos, preservando o fio condutor entre eles.
3. Defina termos, explique relações, causas e consequências e acrescente contexto
   correto e exemplos aplicados, sem fugir do assunto.
4. Faça conteudo_aprofundado ficar pelo menos 30% e 200 caracteres maior que
   conteudo_base, sem repetição, paráfrase vazia ou enchimento. NÃO ultrapasse
   {_MAX_EXPANDED_CHARS} caracteres no total — a geração de materiais que
   consome este texto tem teto de tokens de saída; prefira aprofundar com
   precisão a aprofundar com volume.
5. Inclua objetivos, ao menos dois conceitos-chave, exemplos e ponte pedagógica.
6. Não aplique perfil BrainHex; a personalização acontece depois.
7. Escreva em português brasileiro e não mencione estas instruções.
""".strip()
```

Substitua por:

```python
_ENRICHMENT_INSTRUCTIONS = f"""
Você é o professor-editor responsável pela etapa obrigatória de enriquecimento
curricular da TrailUp. Esta etapa ocorre na API, antes da geração de materiais.

Os blocos-base já foram separados pela API antes desta chamada. Para cada bloco:
1. Preserve exatamente o id e devolva exatamente um bloco para cada id pedido.
2. Não funda, divida, remova nem reordene blocos. Classifique cada um com tema,
   tópico e objetivos específicos, preservando o fio condutor entre eles.
3. Defina termos, explique relações, causas e consequências e acrescente contexto
   correto e exemplos aplicados, sem fugir do assunto.
4. Faça conteudo_aprofundado ficar pelo menos 50% e 350 caracteres maior que
   conteudo_base, sem repetição, paráfrase vazia ou enchimento. NÃO ultrapasse
   {_MAX_EXPANDED_CHARS} caracteres no total — a geração de materiais que
   consome este texto tem teto de tokens de saída; prefira aprofundar com
   precisão a aprofundar com volume.
5. Cada bloco-base traz um campo "escasso" (true/false). Quando "escasso" for
   true, você pode complementar conteudo_aprofundado com conceitos curriculares
   padrão sobre o tema — além do que está literalmente em conteudo_base — desde
   que sirvam diretamente ao objetivo do tópico (ver TEMA.objetivo). Nunca
   contradiga ou substitua o que já está em conteudo_base; apenas preencha
   lacunas na mesma direção. Quando "escasso" for false, mantenha fidelidade
   estrita: só aprofunde o que já está no material, sem adicionar conceitos que
   não vieram dele.
6. Inclua objetivos, ao menos dois conceitos-chave, exemplos e ponte pedagógica.
7. Não aplique perfil BrainHex; a personalização acontece depois.
8. Escreva em português brasileiro e não mencione estas instruções.
""".strip()
```

- [ ] **Step 3: Marca cada bloco com `escasso` em `_group_segments`**

Encontre, dentro de `_group_segments` (linhas 497–517):

```python
    blocks: list[dict[str, Any]] = []
    for index, group in enumerate(groups, start=1):
        titles = _unique_texts([item.get("source_title") for item in group])
        source_ids = _unique_texts([item.get("source_id") for item in group])
        base_parts: list[str] = []
        for segment in group:
            label = _text(segment.get("source_title"))
            order = int(segment.get("source_order") or 1)
            base_parts.append(f"[{label} — trecho {order}]\n{str(segment.get('text') or '').strip()}")
        blocks.append(
            {
                "id": f"bloco-{index:02d}",
                "ordem": index,
                "tema": theme,
                "topico": " + ".join(titles) or f"Bloco {index}",
                "objetivos": [objective] if objective else [],
                "conteudo_base": "\n\n".join(base_parts),
                "source_ids": source_ids,
                "segment_ids": [str(item["segment_id"]) for item in group],
            }
        )
    return blocks
```

Substitua por:

```python
    blocks: list[dict[str, Any]] = []
    for index, group in enumerate(groups, start=1):
        titles = _unique_texts([item.get("source_title") for item in group])
        source_ids = _unique_texts([item.get("source_id") for item in group])
        base_parts: list[str] = []
        for segment in group:
            label = _text(segment.get("source_title"))
            order = int(segment.get("source_order") or 1)
            base_parts.append(f"[{label} — trecho {order}]\n{str(segment.get('text') or '').strip()}")
        base_content = "\n\n".join(base_parts)
        blocks.append(
            {
                "id": f"bloco-{index:02d}",
                "ordem": index,
                "tema": theme,
                "topico": " + ".join(titles) or f"Bloco {index}",
                "objetivos": [objective] if objective else [],
                "conteudo_base": base_content,
                "escasso": len(base_content) < _SCARCE_BLOCK_CHARS_THRESHOLD,
                "source_ids": source_ids,
                "segment_ids": [str(item["segment_id"]) for item in group],
            }
        )
    return blocks
```

(`escasso` é lido pelo prompt via `json.dumps(blocks)` em `_generate_gemini_batch`/`_generate_openai_batch` — nenhuma mudança extra necessária ali. `_validate_enrichment_response` só copia campos conhecidos pro resultado normalizado, então `escasso` não vaza pro `conteudo_aprofundado` final.)

- [ ] **Step 4: Roda a suíte de testes de `content_enrichment` para ver o que quebra com os novos pisos**

Run: `cd api && python -m pytest tests/test_content_enrichment.py -v`
Expected: várias falhas em testes que usam `_rich_response` (fixture com expansão de tamanho fixo, calibrada pro piso antigo de 200 chars — abaixo do novo piso absoluto de 350). A Task 2 corrige isso.

- [ ] **Step 5: Commit**

```bash
cd api
git add app/services/content_enrichment.py
git commit -m "feat: eleva pisos de expansao e permite complementacao curricular em blocos escassos"
```

---

### Task 2: Corrige os testes de `content_enrichment.py` para os novos pisos

**Files:**
- Modify: `api/tests/test_content_enrichment.py`

- [ ] **Step 1: Torna `_rich_response` robusta a qualquer piso (não mais um texto de tamanho fixo)**

Encontre (linhas 79–103, o corpo de `_rich_response`):

```python
def _rich_response(payload: dict[str, Any]) -> dict[str, Any]:
    blocks = []
    for base in payload["blocos_base"]:
        base_text = enrichment_module._text(base["conteudo_base"])
        expansion = (
            " Este aprofundamento define os termos técnicos, explica suas relações "
            "causais e conecta o conceito à arquitetura de redes. Na prática, um "
            "estudante pode observar esse processo ao abrir um endereço no navegador, "
            "comparar a resolução do nome e acompanhar a requisição até o servidor."
        )
        blocks.append(
            {
                "id": base["id"],
                "tema": base["tema"],
                "topico": base["topico"],
                "objetivos": ["Explicar e aplicar o conceito em uma situação real."],
                "conteudo_base": base_text,
                "conteudo_aprofundado": base_text + expansion,
                "conceitos_chave": ["resolução de nomes", "comunicação distribuída"],
                "exemplos_contextos": ["Abertura de um site no navegador."],
                "ponte_proximo_bloco": "O resultado prepara o próximo conceito.",
                "source_ids": base["source_ids"],
```

(o fechamento do dict/loop continua igual — só a construção de `expansion`/`conteudo_aprofundado` muda). Substitua o trecho acima por:

```python
def _rich_response(payload: dict[str, Any]) -> dict[str, Any]:
    blocks = []
    for base in payload["blocos_base"]:
        base_text = enrichment_module._text(base["conteudo_base"])
        expansion = (
            " Este aprofundamento define os termos técnicos, explica suas relações "
            "causais e conecta o conceito à arquitetura de redes. Na prática, um "
            "estudante pode observar esse processo ao abrir um endereço no navegador, "
            "comparar a resolução do nome e acompanhar a requisição até o servidor."
        )
        # Repete a frase de aprofundamento ate ultrapassar o piso minimo com
        # folga real (nao so "encostar" nele) - deixa a fixture robusta a
        # mudancas futuras no piso, em vez de recalibrar um texto de tamanho
        # fixo toda vez que _MIN_EXPANSION_RATIO/_MIN_EXPANSION_CHARS mudam.
        minimum = enrichment_module._minimum_expanded_length(base_text)
        expanded = base_text + expansion
        while len(expanded) < minimum + 50:
            expanded += expansion
        blocks.append(
            {
                "id": base["id"],
                "tema": base["tema"],
                "topico": base["topico"],
                "objetivos": ["Explicar e aplicar o conceito em uma situação real."],
                "conteudo_base": base_text,
                "conteudo_aprofundado": expanded,
                "conceitos_chave": ["resolução de nomes", "comunicação distribuída"],
                "exemplos_contextos": ["Abertura de um site no navegador."],
                "ponte_proximo_bloco": "O resultado prepara o próximo conceito.",
                "source_ids": base["source_ids"],
```

- [ ] **Step 2: Roda a suíte de novo, confirma que a fixture robusta resolveu a maior parte das falhas**

Run: `cd api && python -m pytest tests/test_content_enrichment.py -v`
Expected: só devem restar as falhas esperadas em `test_minimum_expanded_length_requires_at_least_30_percent_and_200_chars` e `test_enrichment_rejects_response_expanded_below_new_30_percent_floor` (hardcodam os números antigos) — corrigidas nos próximos steps. Se sobrar qualquer outra falha, ela é fallout real (ex.: algum teste com um base muito grande cujo `conteudo_aprofundado` ultrapassou `_MAX_EXPANDED_CHARS=12_000` com o piso novo) — investigue e ajuste o teste especificamente antes de prosseguir.

- [ ] **Step 3: Atualiza o teste do piso mínimo com os novos números**

Encontre (linhas 378–390):

```python
def test_minimum_expanded_length_requires_at_least_30_percent_and_200_chars() -> None:
    # Piso antigo era 15%/80 chars - baixo demais: producao mostrou blocos
    # "aprofundados" que so raspavam esse piso e depois nunca alcancavam a
    # cobertura minima exigida pelo microservice na geracao de materiais
    # (ver geminiService.ts). O prompt de enriquecimento (_ENRICHMENT_
    # INSTRUCTIONS) ja promete pelo menos 30%/200 chars ao modelo; o
    # validador ficava mais frouxo que a propria instrucao.
    long_base = "x" * 1_000
    assert enrichment_module._minimum_expanded_length(long_base) == 1_000 + 300

    short_base = "x" * 100
    assert enrichment_module._minimum_expanded_length(short_base) == 100 + 200
```

Substitua por:

```python
def test_minimum_expanded_length_requires_at_least_50_percent_and_350_chars() -> None:
    # Piso subiu de 30%/200 chars para 50%/350 chars: o piso antigo, mesmo
    # ja mais alto que o original de 15%/80, ainda deixava blocos "aprofundados"
    # curtos demais depois de somado ao piso de cobertura do microservice
    # (ver geminiService.ts) - ver docs/superpowers/specs/
    # 2026-08-20-blocos-conteudo-profundidade-design.md.
    long_base = "x" * 1_000
    assert enrichment_module._minimum_expanded_length(long_base) == 1_000 + 500

    short_base = "x" * 100
    assert enrichment_module._minimum_expanded_length(short_base) == 100 + 350
```

- [ ] **Step 4: Atualiza o teste de rejeição de expansão abaixo do piso**

Encontre (linhas 392–423):

```python
@pytest.mark.asyncio
async def test_enrichment_rejects_response_expanded_below_new_30_percent_floor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Expansao de 20% fica entre o piso antigo (15%, passava) e o novo piso
    # (30%, deve falhar) - prova que o piso mais alto rejeita blocos que
    # antes eram aceitos "de raspao".
    def borderline(payload: dict[str, Any]) -> dict[str, Any]:
        response = _rich_response(payload)
        for block in response["blocos"]:
            base = block["conteudo_base"]
            extra_len = math.ceil(len(base) * 0.20)
            block["conteudo_aprofundado"] = base + ("x" * extra_len)
        return response
```

Substitua por:

```python
@pytest.mark.asyncio
async def test_enrichment_rejects_response_expanded_below_new_50_percent_floor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Expansao de 40% fica entre o piso anterior (30%, passava) e o piso
    # atual (50%, deve falhar) - prova que o piso mais alto rejeita blocos
    # que antes eram aceitos "de raspao".
    def borderline(payload: dict[str, Any]) -> dict[str, Any]:
        response = _rich_response(payload)
        for block in response["blocos"]:
            base = block["conteudo_base"]
            extra_len = math.ceil(len(base) * 0.40)
            block["conteudo_aprofundado"] = base + ("x" * extra_len)
        return response
```

(o resto da função, a partir de `monkeypatch.setattr(...)`, continua igual — 40% de um base de 1.000 chars dá 400 chars extra, abaixo do novo piso absoluto de `max(350, 500) = 500`, então a asserção `pytest.raises(...)` continua válida sem mais mudanças.)

- [ ] **Step 5: Roda a suíte completa de novo**

Run: `cd api && python -m pytest tests/test_content_enrichment.py -v`
Expected: `PASSED` em todos os testes.

- [ ] **Step 6: Escreve os testes novos da flag `escasso`**

Adicione ao final de `api/tests/test_content_enrichment.py`:

```python
def test_group_segments_marca_bloco_como_escasso_abaixo_do_limiar() -> None:
    context = {"conteudo_classe": {"topico": {"nome": "Redes"}}}
    segments = [
        {
            "segment_id": "segmento-0001",
            "source_id": "conteudo:1",
            "source_title": "Aula",
            "source_order": 1,
            "text": "Texto curto de origem.",
        }
    ]

    groups = enrichment_module._group_segments(context, segments)

    assert len(groups) == 1
    assert groups[0]["escasso"] is True


def test_group_segments_nao_marca_bloco_rico_como_escasso() -> None:
    context = {"conteudo_classe": {"topico": {"nome": "Redes"}}}
    segments = [
        {
            "segment_id": "segmento-0001",
            "source_id": "conteudo:1",
            "source_title": "Aula",
            "source_order": 1,
            "text": "T" * 900,
        }
    ]

    groups = enrichment_module._group_segments(context, segments)

    assert len(groups) == 1
    assert groups[0]["escasso"] is False


@pytest.mark.asyncio
async def test_enrichment_envia_flag_escasso_no_payload_enviado_ao_modelo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    monkeypatch.setattr(
        enrichment_module,
        "_gemini_client",
        _gemini_factory(_rich_response, captured),
    )

    context = _context(paragraphs=1)
    context["conteudo_classe"]["conteudos"][0]["conteudo"] = "Texto curto."

    await enrich_content_blocks(context=context, settings=_settings())

    submitted_blocks = captured["payload"]["blocos_base"]
    assert all("escasso" in block for block in submitted_blocks)
```

(A fixture `_gemini_factory` e o padrão de `captured["payload"]` já são usados em outros testes deste arquivo — ex.: `test_enrichment_groups_every_source_segment_without_truncation` na linha 279 — siga exatamente o mesmo padrão de chamada; se o nome exato da chave capturada (`captured["payload"]`) for diferente do usado ali, ajuste para bater com o padrão real do arquivo.)

- [ ] **Step 7: Roda a suíte completa de `content_enrichment` uma última vez**

Run: `cd api && python -m pytest tests/test_content_enrichment.py -v`
Expected: todos os testes `PASSED`, incluindo os 3 novos.

- [ ] **Step 8: Roda a suíte completa da API pra garantir que nada mais quebrou**

Run: `cd api && python -m pytest -q`
Expected: `0 failed`.

- [ ] **Step 9: Commit**

```bash
cd api
git add tests/test_content_enrichment.py
git commit -m "test: atualiza pisos de expansao e cobre a flag escasso em content_enrichment"
```

---

### Task 3: Para de gerar `slides` na chamada principal de conteúdo (`geminiService.ts`)

**Files:**
- Modify: `microservice/src/services/geminiService.ts`

- [ ] **Step 1: Remove `slides` do schema de resposta do Gemini**

Encontre (dentro de `GEMINI_CONTENT_GENERATION_RESPONSE_SCHEMA`, propriedades de `chapters.items`):

```ts
          blockId: { type: Type.STRING },
          markdown: { type: Type.STRING },
          audioScript: { type: Type.STRING },
          slides: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                topics: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                explanation: { type: Type.STRING },
                visualDescription: { type: Type.STRING },
                characterQuote: { type: Type.STRING },
                characterAction: {
                  type: Type.STRING,
                  description:
                    "Ação: explaining, celebrating, thinking ou warning",
                },
                sourceIds: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: [
                "title",
                "topics",
                "explanation",
                "visualDescription",
                "characterQuote",
                "characterAction",
                "sourceIds",
              ],
            },
          },
        },
        required: ["blockId", "markdown", "audioScript", "slides"],
```

Substitua por:

```ts
          blockId: { type: Type.STRING },
          markdown: { type: Type.STRING },
          audioScript: { type: Type.STRING },
        },
        required: ["blockId", "markdown", "audioScript"],
```

- [ ] **Step 2: Relaxa a validação de `slides` em `validateBlockBatchGeneration`**

Encontre:

```ts
    if (!Array.isArray(chapter.slides) || chapter.slides.length === 0) {
      throw new Error(`Gerador não produziu slides para o bloco ${blockId}.`);
    }
    return {
      blockId,
      markdown,
      audioScript,
      slides: chapter.slides.map((slide, slideIndex) =>
        validateSlideForBlock(slide, {
          blockId,
          batchIds: batchIdSet,
          slideIndex,
        })
      ),
    };
```

Substitua por:

```ts
    return {
      blockId,
      markdown,
      audioScript,
      // O schema nao pede mais "slides" ao modelo (ver GEMINI_CONTENT_
      // GENERATION_RESPONSE_SCHEMA) - o campo continua tipado por
      // compatibilidade estrutural com ContentPart/ProcessedContent
      // (consolidateBlockBatchGenerations, splitProcessedContentIntoParts,
      // server.ts), mas sempre vazio: a apresentacao real vem inteira do
      // BrainHexPDF a partir do markdown, nao deste array.
      slides: [],
    };
```

- [ ] **Step 3: Simplifica `generateOpenAIFallbackChapters`/`mergeSplitFallbackChapters` — remove o gerador de slides**

Encontre:

```ts
export async function generateOpenAIFallbackChapters(
  expectedIds: string[],
  generators: {
    generateAudioScript: () => Promise<unknown>;
    generateMarkdown: () => Promise<unknown>;
    generateSlides: () => Promise<unknown>;
  },
): Promise<{ chapters: unknown[]; confidence: number }> {
  const tagSubCallError = (
    label: string,
    promise: Promise<unknown>,
  ): Promise<unknown> =>
    promise.catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${label}: ${message}`, { cause: error });
    });

  // markdown/slides nao tem outro fallback depois da OpenAI - se falharem, a
  // geracao do lote falhou de fato. audioScript so sai do Gemini (sem
  // fallback proprio) e ja e tratado como opcional no resto do pipeline
  // (materiais.audio pode ficar "failed" independente de markdown/
  // apresentacao) - por isso sua falha nao pode derrubar markdown/slides que
  // ja tenham sido gerados com sucesso.
  const [audioResult, textResult, slidesResult] = await Promise.allSettled([
    tagSubCallError("audioScript/Gemini", generators.generateAudioScript()),
    tagSubCallError("markdown/OpenAI", generators.generateMarkdown()),
    tagSubCallError("slides/OpenAI", generators.generateSlides()),
  ]);
  if (textResult.status === "rejected") throw textResult.reason;
  if (slidesResult.status === "rejected") throw slidesResult.reason;
  const audio = audioResult.status === "fulfilled" ? audioResult.value : null;
  return mergeSplitFallbackChapters(expectedIds, audio, textResult.value, slidesResult.value);
}

export function mergeSplitFallbackChapters(
  expectedIds: string[],
  audio: unknown,
  text: unknown,
  slides: unknown,
): { chapters: unknown[]; confidence: number } {
  const chaptersById = (value: unknown): Map<string, Record<string, unknown>> => {
    const map = new Map<string, Record<string, unknown>>();
    const chapters = value && typeof value === "object"
      ? (value as Record<string, unknown>).chapters
      : null;
    if (!Array.isArray(chapters)) return map;
    for (const rawChapter of chapters) {
      if (typeof rawChapter !== "object" || rawChapter === null) continue;
      const chapter = rawChapter as Record<string, unknown>;
      const blockId = normalizedText(chapter.blockId);
      if (blockId) map.set(blockId, chapter);
    }
    return map;
  };
  const confidenceOf = (value: unknown): number => {
    const confidence = value && typeof value === "object"
      ? Number((value as Record<string, unknown>).confidence)
      : NaN;
    return Number.isFinite(confidence) ? confidence : 0;
  };

  const audioById = chaptersById(audio);
  const textById = chaptersById(text);
  const slidesById = chaptersById(slides);

  const chapters = expectedIds.map((blockId) => ({
    blockId,
    markdown: String(textById.get(blockId)?.markdown ?? ""),
    audioScript: String(audioById.get(blockId)?.audioScript ?? ""),
    slides: slidesById.get(blockId)?.slides ?? [],
  }));

  return {
    chapters,
    confidence: Math.min(confidenceOf(audio), confidenceOf(text), confidenceOf(slides)),
  };
}
```

Substitua por:

```ts
export async function generateOpenAIFallbackChapters(
  expectedIds: string[],
  generators: {
    generateAudioScript: () => Promise<unknown>;
    generateMarkdown: () => Promise<unknown>;
  },
): Promise<{ chapters: unknown[]; confidence: number }> {
  const tagSubCallError = (
    label: string,
    promise: Promise<unknown>,
  ): Promise<unknown> =>
    promise.catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${label}: ${message}`, { cause: error });
    });

  // markdown nao tem outro fallback depois da OpenAI - se falhar, a geracao
  // do lote falhou de fato. audioScript so sai do Gemini (sem fallback
  // proprio) e ja e tratado como opcional no resto do pipeline (materiais.
  // audio pode ficar "failed" independente de markdown/apresentacao) - por
  // isso sua falha nao pode derrubar markdown que ja tenha sido gerado com
  // sucesso.
  const [audioResult, textResult] = await Promise.allSettled([
    tagSubCallError("audioScript/Gemini", generators.generateAudioScript()),
    tagSubCallError("markdown/OpenAI", generators.generateMarkdown()),
  ]);
  if (textResult.status === "rejected") throw textResult.reason;
  const audio = audioResult.status === "fulfilled" ? audioResult.value : null;
  return mergeSplitFallbackChapters(expectedIds, audio, textResult.value);
}

export function mergeSplitFallbackChapters(
  expectedIds: string[],
  audio: unknown,
  text: unknown,
): { chapters: unknown[]; confidence: number } {
  const chaptersById = (value: unknown): Map<string, Record<string, unknown>> => {
    const map = new Map<string, Record<string, unknown>>();
    const chapters = value && typeof value === "object"
      ? (value as Record<string, unknown>).chapters
      : null;
    if (!Array.isArray(chapters)) return map;
    for (const rawChapter of chapters) {
      if (typeof rawChapter !== "object" || rawChapter === null) continue;
      const chapter = rawChapter as Record<string, unknown>;
      const blockId = normalizedText(chapter.blockId);
      if (blockId) map.set(blockId, chapter);
    }
    return map;
  };
  const confidenceOf = (value: unknown): number => {
    const confidence = value && typeof value === "object"
      ? Number((value as Record<string, unknown>).confidence)
      : NaN;
    return Number.isFinite(confidence) ? confidence : 0;
  };

  const audioById = chaptersById(audio);
  const textById = chaptersById(text);

  const chapters = expectedIds.map((blockId) => ({
    blockId,
    markdown: String(textById.get(blockId)?.markdown ?? ""),
    audioScript: String(audioById.get(blockId)?.audioScript ?? ""),
    // Ver comentario equivalente em validateBlockBatchGeneration: schema nao
    // pede mais slides ao modelo, campo fica vazio por compatibilidade
    // estrutural com ContentPart/ProcessedContent.
    slides: [],
  }));

  return {
    chapters,
    confidence: Math.min(confidenceOf(audio), confidenceOf(text)),
  };
}
```

- [ ] **Step 4: Atualiza o único chamador de `generateOpenAIFallbackChapters` para não passar mais `generateSlides`**

Encontre:

```ts
              return generateOpenAIFallbackChapters(expectedIds, {
                generateAudioScript: generateAudioScriptWithGemini,
                generateMarkdown: () => generateOpenAITextOnly(currentCall),
                generateSlides: () => generateOpenAISlidesOnly(currentCall),
```

Leia as ~5 linhas seguintes (fecha o objeto/chamada) para reproduzir o fechamento exato ao editar. Substitua as 4 linhas acima por:

```ts
              return generateOpenAIFallbackChapters(expectedIds, {
                generateAudioScript: generateAudioScriptWithGemini,
                generateMarkdown: () => generateOpenAITextOnly(currentCall),
```

- [ ] **Step 5: Remove o import agora não usado de `generateOpenAISlidesOnly`**

Encontre, no bloco de imports do topo do arquivo (linha ~18):

```ts
  generateOpenAISlidesOnly,
```

Remova essa linha do import (mantendo os demais nomes importados do mesmo módulo intactos). `generateOpenAISlidesOnly` continua existindo e exportada em `contentGenerationService.ts` — não é deletada (fora de escopo: função sem outro chamador vira código morto rastreável, não uma remoção obrigatória deste plano).

- [ ] **Step 6: Remove a seção de prompt "5. Slides (Visual Alchemy)" e os demais trechos que instruem o modelo a gerar slides**

Encontre e remova o bloco inteiro (da linha que começa com `5. Slides (Visual Alchemy):` até a linha em branco antes de `${contentBlocks.length > 0 ? \`` que abre a seção "LOTE DE BLOCOS PEDAGÓGICOS"):

```ts
    5. Slides (Visual Alchemy): ${contentBlocks.length > 0
      ? "Para CADA bloco deste lote, crie ao menos um slide próprio e slides adicionais quando necessários para cobrir integralmente o capítulo."
      : "Crie entre 10 e 25 slides (ou mais se necessário para cobrir 100% do conteúdo original)."
    } Crie uma estrutura ÚNICA para o perfil ${profile}, garantindo que exemplos e analogias tenham destaque visual:
       - 'mastermind': Estrutura analítica. Use analogias de "Engrenagens" e "Sistemas". Tópicos devem ser lógicos (Passo 1, Passo 2). Destaque o "Diagrama Lógico" como exemplo.
       - 'seeker': Estrutura de jornada. Tópicos como "Pista", "Rastro" ou "Horizonte". Use analogias de "Bússolas" e "Mapas". Destaque "Encontros" como exemplos.
       - 'survivor': Estrutura de alerta. Tópicos de "Atenção". Analogias de "Escudos" e "Abrigos". Destaque "Simulações de Campo" como exemplos.
       - 'daredevil': Estrutura de alta energia. Tópicos de "Desafio". Analogias de "Voo" e "Combustão". Destaque "Manobras" como exemplos.
       - 'conqueror': Estrutura de comando. Tópicos como "Domínio" e "Expansão". Analogias de "Estratégia Militar" e "Tronos". Destaque "Conquistas Reais" como exemplos.
       - 'socializer': Estrutura de diálogo. Tópicos focados em "Pessoas" e "Comunidade". Analogias de "Fogueiras" e "Banquete". Destaque "Relações" como exemplos.
       - 'achiever': Estrutura de progresso. Tópicos como "Meta" e "Recurso". Analogias de "Escadas" e "Pedras Preciosas". Destaque "Recompensas" como exemplos.
       
       RESTRIÇÕES DE TEXTO E ORGANIZAÇÃO:
       - PROIBIDO: Nunca use sintaxe de tabelas (ex: | --- |). Use listas e headings bem espaçados.
       - O texto deve ser entregue limpo, com parágrafos bem definidos e espaçamento duplo.
       - Use títulos curtos (max 6 palavras) e explicações densas porém legíveis.
       - visualDescription: Descrição de um exemplo prático ou analogia visual presente no slide.
       - characterQuote: Uma fala do guia ${config.guideName} reagindo ou explicando o conteúdo.
       - characterAction: A pose/emoção do guia ("explaining", "celebrating", "thinking", "warning").
       - A temática visual vem de "${presentationPlan.subject}"; a identidade BrainHex
         funciona como assinatura, sem substituir o assunto real da aula por fantasia genérica.

```

Em seguida, dentro do bloco `${contentBlocks.length > 0 ? \`...\` : ""}` que permanece (seção "LOTE DE BLOCOS PEDAGÓGICOS"), encontre:

```ts
    - Este lote contém ${contentBlocks.length > 1 ? "vários blocos distintos" : "um bloco"}
      do tópico (o professor organizou o material em blocos maiores — ver
      content_enrichment.py; este lote é uma fatia deles, não o tópico
      inteiro). Cada blockId listado em "IDS OBRIGATORIOS" precisa virar seu
      PRÓPRIO capítulo completo (markdown + audioScript + slides), com
      extensão proporcional ao conteúdo aprofundado DAQUELE bloco especificamente
      — nunca condense um bloco achando que outro bloco do lote (ou de fora
      dele) já cobriu um conceito parecido; cada capítulo é validado sozinho
      e precisa se sustentar sem depender de nenhum outro.
    - Ainda assim, gere ao menos um slide por assunto principal de cada
      bloco. Todo slide deve incluir o blockId do capítulo em sourceIds.
```

Substitua por:

```ts
    - Este lote contém ${contentBlocks.length > 1 ? "vários blocos distintos" : "um bloco"}
      do tópico (o professor organizou o material em blocos maiores — ver
      content_enrichment.py; este lote é uma fatia deles, não o tópico
      inteiro). Cada blockId listado em "IDS OBRIGATORIOS" precisa virar seu
      PRÓPRIO capítulo completo (markdown + audioScript), com extensão
      proporcional ao conteúdo aprofundado DAQUELE bloco especificamente
      — nunca condense um bloco achando que outro bloco do lote (ou de fora
      dele) já cobriu um conceito parecido; cada capítulo é validado sozinho
      e precisa se sustentar sem depender de nenhum outro.
```

Por fim, encontre e remova a linha de traceability de slides (fica solta perto do fim do template, antes do fechamento da string):

```ts
    Traceability: No campo slides.sourceIds, relacione os IDs dos blocos originais que fundamentaram aquele slide.
```

E encontre, na construção de `batchInput` (dentro de `mapWithConcurrency`):

```ts
        const batchInput =
          `IDS OBRIGATORIOS, NESTA ORDEM: ${JSON.stringify(expectedIds)}\n`
          + `Gere um capitulo PROPRIO para CADA um dos ${batch.length} `
          + "bloco(s) abaixo (um markdown, um audioScript e slides por "
          + "blockId) - cubra 100% dos conceitos de cada bloco individualmente, "
```

Substitua por:

```ts
        const batchInput =
          `IDS OBRIGATORIOS, NESTA ORDEM: ${JSON.stringify(expectedIds)}\n`
          + `Gere um capitulo PROPRIO para CADA um dos ${batch.length} `
          + "bloco(s) abaixo (um markdown e um audioScript por blockId) - "
          + "cubra 100% dos conceitos de cada bloco individualmente, "
```

- [ ] **Step 7: Eleva os pisos de cobertura e o teto de tokens**

Encontre:

```ts
    let minimumMarkdownLength = Math.max(
      200,
      Math.floor(normalizedText(block.conteudo_aprofundado).length * 0.55),
    );
    let minimumAudioLength = Math.max(
      160,
      Math.floor(normalizedText(block.conteudo_aprofundado).length * 0.35),
    );
```

Substitua por:

```ts
    let minimumMarkdownLength = Math.max(
      200,
      Math.floor(normalizedText(block.conteudo_aprofundado).length * 0.70),
    );
    let minimumAudioLength = Math.max(
      160,
      Math.floor(normalizedText(block.conteudo_aprofundado).length * 0.45),
    );
```

Encontre:

```ts
const DEFAULT_CONTENT_GENERATION_MAX_OUTPUT_TOKENS = 16_384;
```

Substitua por:

```ts
const DEFAULT_CONTENT_GENERATION_MAX_OUTPUT_TOKENS = 24_576;
```

- [ ] **Step 8: Roda `tsc --noEmit` pra achar todo mundo que ainda depende da assinatura antiga**

Run: `cd microservice && npx tsc --noEmit`
Expected: erros de tipo em quem ainda chama `mergeSplitFallbackChapters(..., slides)` com 4 argumentos, ou passa `generateSlides` no objeto de `generators` — inclui pelo menos `geminiBlockBatches.test.ts`. Corrigido na Task 4.

- [ ] **Step 9: Commit**

```bash
cd microservice
git add src/services/geminiService.ts
git commit -m "feat: para de gerar slides mortos na chamada de conteudo, eleva pisos de cobertura e teto de tokens"
```

---

### Task 4: Corrige os testes do microservice

**Files:**
- Modify: `microservice/src/services/geminiBlockBatches.test.ts`
- Modify (se necessário, ver Step 4): `microservice/src/server.archive.test.ts`, `microservice/src/server.pipeline.test.ts`, `microservice/src/server.test.ts`

- [ ] **Step 1: Corrige `geminiBlockBatches.test.ts` — remove asserções sobre conteúdo real de `slides`**

Abra `microservice/src/services/geminiBlockBatches.test.ts` e, guiado pelos erros do `tsc --noEmit` da Task 3 Step 8 e pela lista de referências a `slides` já levantada (linhas ~50, 140, 313-343, 372-398, 446-487, 501-538, 565-618, 623-639, 695-756):

- No teste `"valida slide sem imagePrompt/iconPrompts - campos removidos do schema (motor de imagem antigo)"` (linha ~317): este teste inteiro ficou obsoleto (não existe mais `slides` no schema pra validar) — **remova o teste completo**, incluindo o comentário que o precede.
- Em qualquer fixture que constrói uma resposta simulada do Gemini com `slides: [...]` como propriedade de um capítulo (ex.: linha ~50, ~334, ~398), **remova a propriedade `slides`** do objeto simulado — o schema não pede mais isso, então simular um Gemini que devolve `slides` não representa mais um cenário real.
- Nos testes que verificam `result.chapters[0].slides[0]...` (ex.: linha ~341-343, ~452, ~482): troque a asserção para `assert.deepEqual(result.chapters[0].slides, [])`.
- No teste `"consolida markdown, áudio e slides na ordem global com metadados dos lotes"` (linha ~501): renomeie para `"consolida markdown e áudio na ordem global com metadados dos lotes"`, remova a asserção que lê `result.slides.map(...)` (linha ~538) e qualquer fixture de slides usada só por esse teste.
- No teste `"mergeSplitFallbackChapters combina áudio (Gemini), texto e slides (OpenAI) por blockId"` (linha ~565): renomeie para `"mergeSplitFallbackChapters combina áudio (Gemini) e texto (OpenAI) por blockId"`. Remova o 3º argumento (array de slides) das chamadas a `mergeSplitFallbackChapters(...)` no corpo do teste, e troque as asserções sobre `chapters[N].slides` reais por `assert.deepEqual(chapters[N].slides, [])`.
- No teste `"generateOpenAIFallbackChapters mantém markdown/slides mesmo quando o audioScript (Gemini) falha"` (linha ~623): renomeie para `"generateOpenAIFallbackChapters mantém markdown mesmo quando o audioScript (Gemini) falha"`. Remova `generateSlides` do objeto de generators passado à função e ajuste a fixture/asserções da mesma forma que o item anterior.
- Nos testes de `splitProcessedContentIntoParts` (linha ~695-756): troque os arrays `slides: [slide(...), ...]` passados como `content.slides` por `slides: []`, e troque asserções como `parts.map((p) => p.slides.length)` esperando `[1, 1, 1]` para esperar `[0, 0, 0]` (ou remova a asserção de contagem de slides desses testes, se ela deixar de fazer sentido sem conteúdo real de slides — mantenha só a asserção de que `parts[i].slides` é um array, se algum teste depender disso estruturalmente).
- Linha ~140 (comentário sobre "markdown + audioScript + slides" calibrando 16384 tokens): atualize o comentário pra refletir "markdown + audioScript" e o novo teto de 24576, já que não é mais verdade que 3 campos dividem o orçamento.

- [ ] **Step 2: Roda a suíte desse arquivo isoladamente**

Run: `cd microservice && node --import tsx --import ./src/testSetup.ts --test src/services/geminiBlockBatches.test.ts`
Expected: `# fail 0`. Se algo além do já mapeado no Step 1 falhar, ajuste seguindo o mesmo princípio (slides sempre `[]`, sem asserções sobre conteúdo real de slide).

- [ ] **Step 3: Roda `tsc --noEmit` de novo pra confirmar que não sobrou nenhum outro chamador com assinatura antiga**

Run: `cd microservice && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Roda a suíte completa do microservice**

Run: `cd microservice && npm test`
Expected: `# fail 0`. Se `server.archive.test.ts`, `server.pipeline.test.ts` ou `server.test.ts` falharem por causa de fixtures com `slides` na resposta simulada do Gemini ou pisos de cobertura antigos (0.55/0.35) usados pra calcular um `conteudo_aprofundado` de teste sob medida, ajuste essas fixtures seguindo o mesmo princípio dos Steps 1-2 (remove `slides` das respostas simuladas / recalcula o texto de teste em função dos novos pisos 0.70/0.45, em vez de um tamanho fixo).

- [ ] **Step 5: Commit**

```bash
cd microservice
git add src/services/geminiBlockBatches.test.ts
# adicione aqui qualquer outro arquivo de teste ajustado no Step 4
git commit -m "test: remove asercoes sobre slides mortos, ajusta fixtures aos novos pisos de cobertura"
```

---

## Self-Review

**Spec coverage:**
- Orçamento de tokens gasto à toa em `slides` → Task 3 (schema, validação, fallback, prompt) + Task 4 (testes).
- Pisos de expansão/cobertura elevados → Task 1 Step 1-2 (Python) + Task 3 Step 7 (microservice).
- Teto de tokens elevado → Task 3 Step 7.
- Complementação curricular ancorada no objetivo, só para blocos escassos → Task 1 Step 1 (`_SCARCE_BLOCK_CHARS_THRESHOLD`), Step 2 (instrução), Step 3 (flag `escasso`); Task 2 Step 6 (testes).
- Contagem de blocos permanece dirigida pelo material de entrada → decisão explícita de não mudar `_group_segments`/`_MAX_BLOCKS`; nenhuma tarefa altera isso.

**Placeholder scan:** sem TBD/TODO. A Task 4 usa "run + fix, guiado pelos erros do compilador/pela lista de referências já levantada" para o fallout de testes em vez de um diff exato pré-computado — decisão deliberada (ver nota no início da Task 4), não uma lacuna: a lista de linhas afetadas já foi levantada por grep antes de escrever este plano, e o princípio de correção (slides sempre `[]`, sem asserção de conteúdo real) é o mesmo em todos os casos.

**Type consistency:** `escasso` (Python, bool) e `slides: []` (TS, sempre vazio) usados de forma consistente entre as tarefas que os introduzem e as que os consomem.
