# Rotação de Modelos Gemini Free-Tier por Qualidade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando a saída do Gemini falha o gate de qualidade (não
disponibilidade) nas tentativas do modelo primário, tentar os demais modelos
Gemini free-tier (1 tentativa cada) antes de exigir a OpenAI como fallback
obrigatório — hoje uma única falha de qualidade repetida no modelo primário
já derruba a geração inteira quando a conta OpenAI está sem crédito, mesmo
com o Gemini saudável e outros modelos do mesmo tier disponíveis.

**Architecture:** `generateStructuredContentWithFallback`
(`contentGenerationService.ts`) ganha uma nova fase entre o esgotamento das
tentativas de qualidade do modelo primário e o fallback obrigatório da
OpenAI: itera por uma lista de modelos injetada pelo chamador
(`options.geminiFallbackModels`), tentando cada um 1 vez. O chamador real
(`geminiService.ts`) injeta a lista já existente `resolveGeminiTextFallback
Models()`, reaproveitada — e ampliada de 5 para 11 modelos — sem duplicar
config. Erros de disponibilidade durante essa nova fase abortam direto pra
OpenAI (o mesmo modelo já esgotou toda cascata de chaves+fallback no nível
de transporte antes de propagar; repetir não ajudaria).

**Tech Stack:** TypeScript, Node `node:test` + `node:assert/strict` (via
`npx tsx --test <file>`), sem framework de teste externo.

---

### Task 1: Extrair helper compartilhado `generateAndValidateContent`

O laço do modelo primário (dentro de `generateStructuredContentWithFallback`)
e o laço da OpenAI (dentro de `generateAfterPrimaryGeminiFailure`) já têm a
mesma lógica duplicada: chamar o gerador, validar o resultado, e envolver
falha de validação em `ContentGenerationQualityError`. Extrair um helper de
módulo evita triplicar essa lógica quando a Task 2 adicionar o novo laço de
modelos fallback.

**Files:**
- Modify: `microservice/src/services/contentGenerationService.ts:410-475` (função `generateAfterPrimaryGeminiFailure`, remove o helper local `generateAndValidate`)
- Modify: `microservice/src/services/contentGenerationService.ts:490-588` (função `generateStructuredContentWithFallback`, usa o novo helper)
- Test: `microservice/src/services/contentGenerationService.test.ts` (suite existente cobre esse refactor — nenhum comportamento observável muda)

- [ ] **Step 1: Confirmar a suíte atual passa antes do refactor (baseline)**

Run: `cd microservice && npx tsx --test src/services/contentGenerationService.test.ts`
Expected: todos os testes existentes passam (baseline antes de qualquer mudança).

- [ ] **Step 2: Adicionar o helper de módulo `generateAndValidateContent`**

Logo após a definição da classe `ContentGenerationQualityError` (por volta da
linha 193, antes de `getOpenAI`), adicionar:

```ts
async function generateAndValidateContent(
  generator: StructuredContentGenerator,
  call: StructuredContentGenerationCall,
  provider: ContentGenerationProvider,
  validateResult?: StructuredContentGenerationOptions["validateResult"],
): Promise<unknown> {
  const value = await generator(call);
  try {
    validateResult?.(value, provider);
  } catch (error) {
    throw new ContentGenerationQualityError(provider, error);
  }
  return value;
}
```

- [ ] **Step 3: Usar o helper em `generateAfterPrimaryGeminiFailure`**

Dentro de `generateAfterPrimaryGeminiFailure`, remover a função local
`generateAndValidate` (linhas 419-431) e trocar a chamada em
`generateAndValidate(options.generateWithOpenAI, currentCall, "openai")`
(linha ~458-462) por:

```ts
try {
  return {
    value: await generateAndValidateContent(
      options.generateWithOpenAI,
      currentCall,
      "openai",
      options.validateResult,
    ),
    provider: "openai",
    model: call.openaiModel,
    fallbackFrom: "gemini",
    fallbackReason: reason,
  };
} catch (openaiError) {
  lastOpenAIError = openaiError;
  if (!(openaiError instanceof ContentGenerationQualityError)) {
    break;
  }
  previousQualityReason = errorDetails(openaiError).slice(0, 500);
}
```

- [ ] **Step 4: Usar o helper no laço do modelo primário**

Em `generateStructuredContentWithFallback`, dentro do `for` de
`maxQualityAttempts` (linhas ~534-545), trocar:

```ts
try {
  const value = await options.generateWithGemini(currentCall);
  try {
    options.validateResult?.(value, "gemini");
  } catch (error) {
    throw new ContentGenerationQualityError("gemini", error);
  }
  return {
    value,
    provider: "gemini",
    model: call.geminiModel,
  };
} catch (error) {
```

por:

```ts
try {
  const value = await generateAndValidateContent(
    options.generateWithGemini,
    currentCall,
    "gemini",
    options.validateResult,
  );
  return {
    value,
    provider: "gemini",
    model: call.geminiModel,
  };
} catch (error) {
```

- [ ] **Step 5: Rodar a suíte e confirmar que nada mudou de comportamento**

Run: `cd microservice && npx tsx --test src/services/contentGenerationService.test.ts`
Expected: os mesmos testes do baseline (Step 1) continuam passando, sem
alteração de contagens de chamadas nem de mensagens.

- [ ] **Step 6: Commit**

```bash
git add microservice/src/services/contentGenerationService.ts
git commit -m "refactor(microservice): extrai generateAndValidateContent compartilhado entre Gemini e OpenAI"
```

---

### Task 2: Adicionar rotação por modelos fallback na falha de qualidade

**Files:**
- Modify: `microservice/src/services/contentGenerationService.ts:55-64` (interface `StructuredContentGenerationOptions`)
- Modify: `microservice/src/services/contentGenerationService.ts:490-588` (função `generateStructuredContentWithFallback`)
- Test: `microservice/src/services/contentGenerationService.test.ts`

- [ ] **Step 1: Escrever os testes que falham (TDD)**

Adicionar ao final de `microservice/src/services/contentGenerationService.test.ts`
(antes do último teste `"reconhece indisponibilidade transitória..."`, ou
depois — ordem não importa, `node:test` não depende de ordem):

```ts
test("tenta os modelos fallback (1x cada) antes de exigir a OpenAI quando o primario esgota a qualidade", async () => {
  resetGeminiContentGenerationCircuit();
  const attemptedModels: string[] = [];
  let openaiCalls = 0;

  const result = await generateStructuredContentWithFallback(call, {
    environment: { CONTENT_GENERATION_GEMINI_QUALITY_MAX_ATTEMPTS: "1" },
    geminiFallbackModels: ["gemini-fallback-1", "gemini-fallback-2"],
    generateWithGemini: async (currentCall) => {
      attemptedModels.push(currentCall.geminiModel);
      return currentCall.geminiModel === "gemini-fallback-2"
        ? { chapters: [{ blockId: "bloco-01" }] }
        : { chapters: [] };
    },
    generateWithOpenAI: async () => {
      openaiCalls += 1;
      throw new Error("nao deveria ser chamado — fallback-2 deveria resolver");
    },
    validateResult: (value) => {
      const chapters = (value as { chapters?: unknown[] }).chapters ?? [];
      if (chapters.length === 0) {
        throw new Error("Markdown abaixo do mínimo de cobertura.");
      }
    },
  });

  assert.equal(result.provider, "gemini");
  assert.equal(result.model, "gemini-fallback-2");
  assert.deepEqual(attemptedModels, [
    "gemini-primary",
    "gemini-fallback-1",
    "gemini-fallback-2",
  ]);
  assert.equal(openaiCalls, 0);
  resetGeminiContentGenerationCircuit();
});

test("recorre a OpenAI so depois que o primario E todos os modelos fallback esgotam a qualidade", async () => {
  resetGeminiContentGenerationCircuit();
  let geminiCalls = 0;
  let openaiCalls = 0;

  const result = await generateStructuredContentWithFallback(call, {
    environment: { CONTENT_GENERATION_GEMINI_QUALITY_MAX_ATTEMPTS: "1" },
    geminiFallbackModels: ["gemini-fallback-1", "gemini-fallback-2"],
    generateWithGemini: async () => {
      geminiCalls += 1;
      return { chapters: [] }; // sempre invalido, em qualquer modelo
    },
    generateWithOpenAI: async () => {
      openaiCalls += 1;
      return { chapters: [{ blockId: "bloco-01" }] };
    },
    validateResult: (value) => {
      const chapters = (value as { chapters?: unknown[] }).chapters ?? [];
      if (chapters.length === 0) {
        throw new Error("Markdown abaixo do mínimo de cobertura.");
      }
    },
  });

  assert.equal(result.provider, "openai");
  assert.equal(geminiCalls, 3); // primario + 2 fallbacks, 1 tentativa cada
  assert.equal(openaiCalls, 1);
  resetGeminiContentGenerationCircuit();
});

test("erro de disponibilidade num modelo fallback aborta direto pra OpenAI, sem tentar os candidatos restantes", async () => {
  resetGeminiContentGenerationCircuit();
  const attemptedModels: string[] = [];
  let openaiCalls = 0;

  const result = await generateStructuredContentWithFallback(call, {
    environment: { CONTENT_GENERATION_GEMINI_QUALITY_MAX_ATTEMPTS: "1" },
    geminiFallbackModels: ["gemini-fallback-1", "gemini-fallback-2"],
    generateWithGemini: async (currentCall) => {
      attemptedModels.push(currentCall.geminiModel);
      if (currentCall.geminiModel === "gemini-fallback-1") {
        const error = new Error("503 UNAVAILABLE: sobrecarregado");
        Object.assign(error, { status: 503 });
        throw error;
      }
      return { chapters: [] }; // primario: invalido (qualidade)
    },
    generateWithOpenAI: async () => {
      openaiCalls += 1;
      return { chapters: [{ blockId: "bloco-01" }] };
    },
    validateResult: (value) => {
      const chapters = (value as { chapters?: unknown[] }).chapters ?? [];
      if (chapters.length === 0) {
        throw new Error("Markdown abaixo do mínimo de cobertura.");
      }
    },
  });

  assert.equal(result.provider, "openai");
  assert.deepEqual(attemptedModels, ["gemini-primary", "gemini-fallback-1"]);
  assert.equal(openaiCalls, 1);
  resetGeminiContentGenerationCircuit();
});

test("geminiFallbackModels que repete o modelo primario nao tenta esse modelo de novo", async () => {
  resetGeminiContentGenerationCircuit();
  const attemptedModels: string[] = [];

  const result = await generateStructuredContentWithFallback(call, {
    environment: { CONTENT_GENERATION_GEMINI_QUALITY_MAX_ATTEMPTS: "1" },
    geminiFallbackModels: ["gemini-primary", "gemini-fallback-1"],
    generateWithGemini: async (currentCall) => {
      attemptedModels.push(currentCall.geminiModel);
      return currentCall.geminiModel === "gemini-fallback-1"
        ? { chapters: [{ blockId: "bloco-01" }] }
        : { chapters: [] };
    },
    generateWithOpenAI: async () => {
      throw new Error("nao deveria ser chamado");
    },
    validateResult: (value) => {
      const chapters = (value as { chapters?: unknown[] }).chapters ?? [];
      if (chapters.length === 0) {
        throw new Error("Markdown abaixo do mínimo de cobertura.");
      }
    },
  });

  assert.equal(result.model, "gemini-fallback-1");
  assert.deepEqual(attemptedModels, ["gemini-primary", "gemini-fallback-1"]);
  resetGeminiContentGenerationCircuit();
});

test("mensagem final de falha total menciona quantos modelos Gemini foram tentados", async () => {
  resetGeminiContentGenerationCircuit();

  await assert.rejects(
    generateStructuredContentWithFallback(call, {
      environment: {
        CONTENT_GENERATION_GEMINI_QUALITY_MAX_ATTEMPTS: "1",
        CONTENT_GENERATION_OPENAI_MAX_ATTEMPTS: "1",
      },
      geminiFallbackModels: ["gemini-fallback-1"],
      generateWithGemini: async () => ({ chapters: [] }),
      generateWithOpenAI: async () => {
        throw new Error("insufficient_quota");
      },
      validateResult: (value) => {
        const chapters = (value as { chapters?: unknown[] }).chapters ?? [];
        if (chapters.length === 0) {
          throw new Error("Markdown abaixo do mínimo de cobertura.");
        }
      },
    }),
    (error: Error & { cause?: { gemini?: string } }) => {
      assert.match(error.cause?.gemini ?? "", /2 modelos Gemini tentados/);
      return true;
    },
  );

  resetGeminiContentGenerationCircuit();
});
```

- [ ] **Step 2: Rodar os testes novos e confirmar que falham**

Run: `cd microservice && npx tsx --test src/services/contentGenerationService.test.ts`
Expected: os 5 testes novos falham (comportamento ainda não implementado); os
testes pré-existentes continuam passando.

- [ ] **Step 3: Adicionar `geminiFallbackModels` à interface de opções**

Em `StructuredContentGenerationOptions` (linhas 55-64), adicionar o campo:

```ts
export interface StructuredContentGenerationOptions {
  generateWithGemini: StructuredContentGenerator;
  generateWithOpenAI?: StructuredContentGenerator;
  validateResult?: (
    value: unknown,
    provider: ContentGenerationProvider,
  ) => void;
  environment?: Record<string, string | undefined>;
  now?: () => number;
  geminiFallbackModels?: string[];
}
```

- [ ] **Step 4: Implementar o novo laço de rotação por qualidade**

Em `generateStructuredContentWithFallback`, entre o fim do `for` de
`maxQualityAttempts` e o `return generateAfterPrimaryGeminiFailure(...)`
final (linhas ~580-587 antes deste plano), trocar:

```ts
  const reason = errorDetails(lastQualityError).slice(0, 500);
  return generateAfterPrimaryGeminiFailure(call, reason, {
    generateWithOpenAI,
    validateResult: options.validateResult,
    environment,
  });
}
```

por:

```ts
  let triedModelsCount = 1; // o modelo primario, ja tentado no laço acima

  // O modelo primario esgotou as tentativas de qualidade (nunca disponibilidade
  // — esse caso ja retornou mais acima). Antes de exigir a OpenAI, testa os
  // demais modelos do mesmo tier free 1 vez cada: uma falha de qualidade e
  // sobre o CONTEUDO de uma resposta, nao sobre o modelo estar fora do ar, e
  // um modelo diferente pode simplesmente produzir uma cobertura melhor.
  const fallbackModels = (options.geminiFallbackModels ?? []).filter(
    (model) => model !== call.geminiModel,
  );
  for (const fallbackModel of fallbackModels) {
    triedModelsCount += 1;
    const fallbackCall = { ...call, geminiModel: fallbackModel };
    try {
      const value = await generateAndValidateContent(
        options.generateWithGemini,
        fallbackCall,
        "gemini",
        options.validateResult,
      );
      return {
        value,
        provider: "gemini",
        model: fallbackModel,
      };
    } catch (error) {
      if (!(error instanceof ContentGenerationQualityError)) {
        // Disponibilidade ou outro erro real: no nivel de transporte esse
        // modelo ja esgotou toda a cascata de chaves+fallback antes de
        // propagar (ver generateGeminiContent em geminiService.ts) —
        // continuar tentando os proximos candidatos aqui nao ajudaria.
        const reason = errorDetails(error).slice(0, 500);
        return generateAfterPrimaryGeminiFailure(call, reason, {
          generateWithOpenAI,
          validateResult: options.validateResult,
          environment,
        });
      }
      lastQualityError = error;
      previousQualityReason = errorDetails(error).slice(0, 500);
    }
  }

  const reason = triedModelsCount > 1
    ? `${errorDetails(lastQualityError).slice(0, 400)} (${triedModelsCount} modelos Gemini tentados)`
    : errorDetails(lastQualityError).slice(0, 500);
  return generateAfterPrimaryGeminiFailure(call, reason, {
    generateWithOpenAI,
    validateResult: options.validateResult,
    environment,
  });
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `cd microservice && npx tsx --test src/services/contentGenerationService.test.ts`
Expected: todos os testes (pré-existentes + os 5 novos) passam.

- [ ] **Step 6: Commit**

```bash
git add microservice/src/services/contentGenerationService.ts microservice/src/services/contentGenerationService.test.ts
git commit -m "feat(microservice): tenta modelos Gemini fallback por qualidade antes de exigir a OpenAI"
```

---

### Task 3: Injetar a lista de modelos fallback no chamador real

**Files:**
- Modify: `microservice/src/services/geminiService.ts:1584-1697` (chamada de `generateStructuredContentWithFallback` dentro de `processMediaWithGemini`)

- [ ] **Step 1: Adicionar `geminiFallbackModels` ao options object**

Em `geminiService.ts`, dentro da chamada a `generateStructuredContentWithFallback`
(por volta da linha 1584), o segundo argumento (options) já tem
`generateWithGemini`, `generateWithOpenAI` e `validateResult`. Adicionar mais
um campo, logo após `validateResult` (linhas ~1686-1695):

```ts
            validateResult: (value, provider) => {
              // audioScript so sai do Gemini (sem fallback proprio) - quando
              // a origem e o fallback OpenAI, audio vazio e esperado e nao
              // pode reprovar markdown/slides que ja foram gerados com
              // sucesso (ver generateOpenAIFallbackChapters).
              validateBlockBatchGeneration(batch, value, index + 1, {
                requireAudio: provider !== "openai",
                maxOutputTokens,
              });
            },
            geminiFallbackModels: resolveGeminiTextFallbackModels(),
          },
        );
```

`resolveGeminiTextFallbackModels` já está definida neste mesmo arquivo — sem
import adicional.

- [ ] **Step 2: Rodar a suíte do geminiService e confirmar que passa**

Run: `cd microservice && npx tsx --test src/services/geminiService.test.ts src/services/geminiBlockBatches.test.ts src/services/geminiKeyRotation.test.ts`
Expected: todos os testes existentes continuam passando (nenhum teste atual
mocka `generateStructuredContentWithFallback` verificando a ausência desse
campo, então a adição é aditiva e não quebra nada).

- [ ] **Step 3: Commit**

```bash
git add microservice/src/services/geminiService.ts
git commit -m "feat(microservice): injeta a lista de modelos Gemini fallback na geracao de conteudo por bloco"
```

---

### Task 4: Ampliar a lista de modelos fallback (+6) e atualizar docs/testes

**Files:**
- Modify: `microservice/src/services/geminiService.ts:209-215` (`DEFAULT_GEMINI_TEXT_FALLBACK_MODELS`)
- Modify: `microservice/src/services/geminiKeyRotation.test.ts:121-132`
- Modify: `microservice/.env.example:20`

- [ ] **Step 1: Atualizar o teste primeiro (TDD)**

Em `microservice/src/services/geminiKeyRotation.test.ts`, trocar (linhas
121-132):

```ts
test("resolveGeminiTextFallbackModels devolve os 5 modelos default, priorizando a serie 3.x", () => {
  // gemini-2.5-flash-lite (e outros 2.x) retornaram 404 "no longer available
  // to new users" em producao — 3.x vem primeiro por ter mais chance de
  // funcionar de fato numa conta nova.
  assert.deepEqual(resolveGeminiTextFallbackModels({}), [
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
  ]);
});
```

por:

```ts
test("resolveGeminiTextFallbackModels devolve os 11 modelos default, priorizando a serie 3.x", () => {
  // gemini-2.5-flash-lite (e outros 2.x) retornaram 404 "no longer available
  // to new users" em producao — 3.x vem primeiro por ter mais chance de
  // funcionar de fato numa conta nova. 2.5/1.5 nao-lite ficam no fim: mesma
  // familia dos ja testados, mas nao confirmados contra o mesmo bloqueio.
  assert.deepEqual(resolveGeminiTextFallbackModels({}), [
    "gemini-3.1-flash-lite",
    "gemini-3.1-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash-lite",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ]);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd microservice && npx tsx --test src/services/geminiKeyRotation.test.ts`
Expected: FALHA — o array default ainda tem só 5 modelos.

- [ ] **Step 3: Ampliar a lista default em `geminiService.ts`**

Trocar (linhas 209-215):

```ts
const DEFAULT_GEMINI_TEXT_FALLBACK_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];
```

por:

```ts
const DEFAULT_GEMINI_TEXT_FALLBACK_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.1-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd microservice && npx tsx --test src/services/geminiKeyRotation.test.ts`
Expected: PASSA.

- [ ] **Step 5: Atualizar o comentário de exemplo em `.env.example`**

Trocar (linha 20):

```
# GEMINI_TEXT_FALLBACK_MODELS=gemini-3.1-flash-lite,gemini-3.5-flash-lite,gemini-2.5-flash-lite,gemini-2.0-flash,gemini-2.0-flash-lite
```

por:

```
# GEMINI_TEXT_FALLBACK_MODELS=gemini-3.1-flash-lite,gemini-3.1-flash,gemini-3.5-flash-lite,gemini-3.6-flash-lite,gemini-2.5-flash-lite,gemini-2.5-flash,gemini-2.5-pro,gemini-2.0-flash,gemini-2.0-flash-lite,gemini-1.5-flash,gemini-1.5-pro
```

- [ ] **Step 6: Rodar a suíte completa do microservice**

Run: `cd microservice && npx tsx --test $(find src -name "*.test.ts" | tr '\n' ' ')`
(No Windows/PowerShell, equivalente: `Get-ChildItem -Recurse src -Filter *.test.ts | ForEach-Object { npx tsx --test $_.FullName }` ou usar o script de teste do projeto se existir em `package.json`.)
Expected: todos os testes passam, incluindo os das Tasks 1-3.

- [ ] **Step 7: Commit**

```bash
git add microservice/src/services/geminiService.ts microservice/src/services/geminiKeyRotation.test.ts microservice/.env.example
git commit -m "feat(microservice): amplia lista de modelos Gemini fallback de 5 para 11"
```

---

### Task 5: Relaxar o gate de cobertura mínima em `validateBlockBatchGeneration`

Investigando um projeto de referência externo que "nunca falha" nesse
cenário, a causa é que ele não valida tamanho/cobertura da resposta do
Gemini — só aceita qualquer JSON parseável no formato esperado. Mesmo com a
rotação de 11 modelos (Tasks 1-4), é possível que TODOS produzam conteúdo
tecnicamente válido porém abaixo do mínimo de cobertura exigido — e nesse
caso ainda cairíamos na exigência de OpenAI. Esta task troca as duas
checagens de TAMANHO (markdown/áudio) de `throw` pra `console.warn`,
mantendo intactas todas as checagens ESTRUTURAIS (JSON válido, `chapters`
batendo com o batch, `blockId` presente/não-duplicado, `slides` não-vazio,
`confidence` numérico) — essas continuam rejeitando por completo, pois uma
resposta malformada quebraria o resto do pipeline.

**Files:**
- Modify: `microservice/src/services/geminiService.ts:849-871` (`validateBlockBatchGeneration`)
- Test: `microservice/src/services/geminiBlockBatches.test.ts`

- [ ] **Step 1: Atualizar os testes que hoje esperam `throw` por cobertura curta**

Em `microservice/src/services/geminiBlockBatches.test.ts`, trocar o teste
(linhas 183-204):

```ts
test("recusa lote que omite bloco ou devolve texto resumido", () => {
  const batch = [block(1), block(2)];
  assert.throws(
    () => validateBlockBatchGeneration(
      batch,
      { chapters: [chapter("bloco-01", "UM")], confidence: 0.9 },
      1,
    ),
    /omitiu ou acrescentou capítulos/,
  );

  const summarized = chapter("bloco-01", "UM");
  summarized.markdown = "Resumo curto.";
  assert.throws(
    () => validateBlockBatchGeneration(
      [block(1)],
      { chapters: [summarized], confidence: 0.9 },
      1,
    ),
    /Markdown.*resumido/,
  );
});
```

por dois testes:

```ts
test("recusa lote que omite bloco (checagem estrutural, nao afetada pelo relaxamento de cobertura)", () => {
  const batch = [block(1), block(2)];
  assert.throws(
    () => validateBlockBatchGeneration(
      batch,
      { chapters: [chapter("bloco-01", "UM")], confidence: 0.9 },
      1,
    ),
    /omitiu ou acrescentou capítulos/,
  );
});

test("aceita markdown resumido com um warning em vez de recusar o lote", () => {
  const summarized = chapter("bloco-01", "UM");
  summarized.markdown = "Resumo curto.";

  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  let result;
  try {
    result = validateBlockBatchGeneration(
      [block(1)],
      { chapters: [summarized], confidence: 0.9 },
      1,
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(result.chapters[0].markdown, "Resumo curto.");
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], "[content-coverage]");
  assert.match(String(warnings[0][1]), /Markdown.*abaixo do mínimo de cobertura/);
});
```

Trocar (linhas 206-246):

```ts
test("teto de cobertura por orcamento de output evita exigir mais markdown do que uma unica chamada consegue conter", () => {
  // Reproduz o bug real: mergeContentBlocksIntoOne junta N blocos originais
  // num so ("documento-completo"), cujo conteudo_aprofundado bruto cresce
  // com N — mas markdown/audioScript/slides saem de UMA UNICA chamada com
  // orcamento de output fixo (maxOutputTokens). Sem teto, a exigencia de 75%
  // do texto-fonte supera o que a resposta consegue fisicamente conter, e o
  // lote reprova sempre, nao importa quantas vezes o Gemini tente de novo.
  const bigBlock = (index: number): EnrichedContentBlock => ({
    ...block(index),
    conteudo_aprofundado: `Conteudo aprofundado do bloco ${index}. `.repeat(120),
  });
  const merged = mergeContentBlocksIntoOne(
    Array.from({ length: 10 }, (_, i) => bigBlock(i + 1)),
  );
  const maxOutputTokens = 16_384;
  const markdownUnit =
    "Síntese coesa cobrindo os conceitos dos blocos mesclados, sem repetir "
    + "o mesmo assunto em seções diferentes. ";
  const achievableMarkdown = `## Documento completo\n\n${markdownUnit.repeat(400)}`;
  const rawResponse = {
    chapters: [{
      blockId: "documento-completo",
      markdown: achievableMarkdown,
      audioScript: "Narração completa do documento. ".repeat(450),
      slides: [chapter("documento-completo", "UM").slides[0]],
    }],
    confidence: 0.9,
  };

  // Sem o teto (maxOutputTokens omitido), a exigencia bruta de 50%/75% do
  // texto-fonte mesclado ultrapassa uma resposta ja "razoavelmente boa"
  // (aqui, o áudio é o primeiro a esbarrar nisso).
  assert.throws(
    () => validateBlockBatchGeneration([merged], rawResponse, 1),
    /resumido abaixo do mínimo de cobertura/,
  );

  // Com o teto (orcamento real da chamada), a MESMA resposta passa.
  const result = validateBlockBatchGeneration([merged], rawResponse, 1, { maxOutputTokens });
  assert.equal(result.chapters[0].blockId, "documento-completo");
});
```

por:

```ts
test("teto de cobertura por orcamento de output evita um warning desnecessario quando o orcamento real da chamada limita o texto-fonte", () => {
  // Reproduz o bug real: mergeContentBlocksIntoOne junta N blocos originais
  // num so ("documento-completo"), cujo conteudo_aprofundado bruto cresce
  // com N — mas markdown/audioScript/slides saem de UMA UNICA chamada com
  // orcamento de output fixo (maxOutputTokens). Sem teto, a exigencia de 75%
  // do texto-fonte supera o que a resposta consegue fisicamente conter, e o
  // lote sempre dispara um warning de cobertura baixa, mesmo quando a
  // resposta ja e razoavelmente boa pro orcamento real disponivel.
  const bigBlock = (index: number): EnrichedContentBlock => ({
    ...block(index),
    conteudo_aprofundado: `Conteudo aprofundado do bloco ${index}. `.repeat(120),
  });
  const merged = mergeContentBlocksIntoOne(
    Array.from({ length: 10 }, (_, i) => bigBlock(i + 1)),
  );
  const maxOutputTokens = 16_384;
  const markdownUnit =
    "Síntese coesa cobrindo os conceitos dos blocos mesclados, sem repetir "
    + "o mesmo assunto em seções diferentes. ";
  const achievableMarkdown = `## Documento completo\n\n${markdownUnit.repeat(400)}`;
  const rawResponse = {
    chapters: [{
      blockId: "documento-completo",
      markdown: achievableMarkdown,
      audioScript: "Narração completa do documento. ".repeat(450),
      slides: [chapter("documento-completo", "UM").slides[0]],
    }],
    confidence: 0.9,
  };

  const originalWarn = console.warn;

  // Sem o teto (maxOutputTokens omitido), a exigencia bruta de 50%/75% do
  // texto-fonte mesclado ultrapassa uma resposta ja "razoavelmente boa"
  // (aqui, o áudio é o primeiro a esbarrar nisso) -> dispara warning, mas
  // NAO lanca erro.
  const warningsWithoutCap: unknown[][] = [];
  console.warn = (...args: unknown[]) => { warningsWithoutCap.push(args); };
  let withoutCap;
  try {
    withoutCap = validateBlockBatchGeneration([merged], rawResponse, 1);
  } finally {
    console.warn = originalWarn;
  }

  // Com o teto (orcamento real da chamada), a MESMA resposta passa sem
  // sequer disparar o warning.
  const warningsWithCap: unknown[][] = [];
  console.warn = (...args: unknown[]) => { warningsWithCap.push(args); };
  let withCap;
  try {
    withCap = validateBlockBatchGeneration([merged], rawResponse, 1, { maxOutputTokens });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(withoutCap.chapters[0].blockId, "documento-completo");
  assert.equal(withCap.chapters[0].blockId, "documento-completo");
  assert.ok(warningsWithoutCap.length > 0, "esperava warning sem o teto de orcamento");
  assert.equal(warningsWithCap.length, 0);
});
```

Trocar (linhas 248-255):

```ts
test("recusa audioScript curto quando requireAudio nao e passado (default preserva o comportamento atual)", () => {
  const shortAudio = chapter("bloco-01", "UM");
  shortAudio.audioScript = "curto";
  assert.throws(
    () => validateBlockBatchGeneration([block(1)], { chapters: [shortAudio], confidence: 0.9 }, 1),
    /Áudio.*resumido/,
  );
});
```

por:

```ts
test("aceita audioScript curto com um warning quando requireAudio nao e passado (default so avisa, nao bloqueia)", () => {
  const shortAudio = chapter("bloco-01", "UM");
  shortAudio.audioScript = "curto";

  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  let result;
  try {
    result = validateBlockBatchGeneration([block(1)], { chapters: [shortAudio], confidence: 0.9 }, 1);
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(result.chapters[0].audioScript, "curto");
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], "[content-coverage]");
  assert.match(String(warnings[0][1]), /Áudio.*abaixo do mínimo de cobertura/);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd microservice && npx tsx --test src/services/geminiBlockBatches.test.ts`
Expected: os testes atualizados falham (o código de produção ainda lança
`throw`, não `console.warn`) — os demais testes do arquivo continuam
passando.

- [ ] **Step 3: Trocar `throw` por `console.warn` nas duas checagens de tamanho**

Em `microservice/src/services/geminiService.ts`, dentro de
`validateBlockBatchGeneration`, trocar:

```ts
    if (normalizedText(markdown).length < minimumMarkdownLength) {
      throw new Error(
        `Markdown do bloco ${blockId} foi resumido abaixo do mínimo de cobertura `
        + `(recebido=${normalizedText(markdown).length} chars, `
        + `minimo=${minimumMarkdownLength} chars, `
        + `fonte=${normalizedText(block.conteudo_aprofundado).length} chars, `
        + `maxOutputTokens=${options.maxOutputTokens ?? "n/d"}).`,
      );
    }
```

por:

```ts
    if (normalizedText(markdown).length < minimumMarkdownLength) {
      // Nao bloqueia a geracao: so registra em log. Um projeto de referencia
      // investigado nao tem esse tipo de checagem e "nunca falha" por causa
      // disso — preferimos aceitar conteudo resumido a exigir a OpenAI como
      // recuperacao obrigatoria (ver adendo na spec desta feature).
      console.warn(
        "[content-coverage]",
        `Markdown do bloco ${blockId} veio abaixo do mínimo de cobertura esperado `
        + `(recebido=${normalizedText(markdown).length} chars, `
        + `minimo=${minimumMarkdownLength} chars, `
        + `fonte=${normalizedText(block.conteudo_aprofundado).length} chars, `
        + `maxOutputTokens=${options.maxOutputTokens ?? "n/d"}).`,
      );
    }
```

E trocar:

```ts
    if (requireAudio && normalizedText(audioScript).length < minimumAudioLength) {
      throw new Error(
        `Áudio do bloco ${blockId} foi resumido abaixo do mínimo de cobertura `
        + `(recebido=${normalizedText(audioScript).length} chars, `
        + `minimo=${minimumAudioLength} chars, `
        + `fonte=${normalizedText(block.conteudo_aprofundado).length} chars, `
        + `maxOutputTokens=${options.maxOutputTokens ?? "n/d"}).`,
      );
    }
```

por:

```ts
    if (requireAudio && normalizedText(audioScript).length < minimumAudioLength) {
      console.warn(
        "[content-coverage]",
        `Áudio do bloco ${blockId} veio abaixo do mínimo de cobertura esperado `
        + `(recebido=${normalizedText(audioScript).length} chars, `
        + `minimo=${minimumAudioLength} chars, `
        + `fonte=${normalizedText(block.conteudo_aprofundado).length} chars, `
        + `maxOutputTokens=${options.maxOutputTokens ?? "n/d"}).`,
      );
    }
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd microservice && npx tsx --test src/services/geminiBlockBatches.test.ts`
Expected: todos os testes do arquivo passam.

- [ ] **Step 5: Rodar a suíte completa do microservice**

Run: `cd microservice && npx tsc --noEmit && npm test`
Expected: sem erros de tipo; suíte completa passa (nenhum outro teste
depende do `throw` removido — `contentGenerationService.test.ts` usa
funções `validateResult` mockadas próprias, não a `validateBlockBatchGeneration`
real).

- [ ] **Step 6: Commit**

```bash
git add microservice/src/services/geminiService.ts microservice/src/services/geminiBlockBatches.test.ts
git commit -m "fix(microservice): relaxa gate de cobertura minima pra warning, sem bloquear a geracao"
```

---

### Task 6: Revisão final da branch

- [ ] **Step 1: Rodar a suíte completa do microservice uma última vez**

Run: `cd microservice && npm run build` (verifica que o TypeScript compila sem
erros de tipo — `geminiFallbackModels` é opcional, então chamadores
existentes que não o passam continuam válidos) e a suíte de testes completa
usada nas tasks anteriores.

- [ ] **Step 2: Revisar o diff completo da branch contra `main`**

Run: `git diff main --stat` e `git log main..HEAD --oneline`
Expected: commits das Tasks 1-5, tocando exatamente
`contentGenerationService.ts`, `contentGenerationService.test.ts`,
`geminiService.ts`, `geminiBlockBatches.test.ts`, `geminiKeyRotation.test.ts`,
`.env.example`, `README.md`.
