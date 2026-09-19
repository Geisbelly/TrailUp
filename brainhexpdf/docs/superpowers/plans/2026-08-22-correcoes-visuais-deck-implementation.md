# Correções visuais rápidas do deck — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir 4 bugs visuais/comportamentais confirmados no deck exportado do BrainHexPDF: badge de ambiente que colapsa para "R…", badge "OBJ:" que corta no meio da palavra, espaço vazio em slides com pouco conteúdo, e resposta certa do quiz sempre na 1ª posição.

**Architecture:** Todas as mudanças ficam em `src/utils/deckExportUtils.ts` (markup/CSS do slide exportado) e `src/utils/quizSanitize.ts` (nova função `shuffleQuizOptions`, no mesmo arquivo de sanitização pós-geração já usado pelo `sanitizeQuizContent`). Sem novas dependências, sem mudança de schema/tipos.

**Tech Stack:** TypeScript, `node:test` + `node:assert/strict` (mesmo runner usado no resto do projeto).

**Worktree:** `.worktrees/correcoes-visuais-deck` (branch `fix/correcoes-visuais-deck`), já criada com `npm install` rodado e baseline de 65/65 testes passando.

---

### Task 1: Remover o badge de ambiente (bug do "R…")

**Files:**
- Modify: `src/utils/deckExportUtils.ts:224-236`
- Test: `src/utils/deckExportUtils.test.ts:41-68` (substitui o teste existente, que valida o comportamento antigo do badge removido)

- [ ] **Step 1: Atualizar o teste existente para o novo comportamento**

Substitua o teste `'HTML exportado limita o contexto imersivo sem esmagar a fala do mentor'` (linhas 41-68 de `src/utils/deckExportUtils.test.ts`) por:

```typescript
test('HTML exportado não renderiza mais o badge de ambiente (colapsava para "R…" sob pressão de espaço)', () => {
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [
      {
        ...minimalDeck.slides[0],
        type: 'concept_breakdown',
        thematicStorytelling: {
          storyArcPhase: 'Fase de teste',
          environmentSetting: 'Descrição de ambiente deliberadamente extensa para validar que não aparece mais como badge truncado.',
          voiceTone: 'Objetivo',
          narrativeBeat: 'Narrativa de teste.',
        },
        characterGuide: {
          name: 'Mentor',
          speechText: 'Esta fala precisa continuar aparecendo normalmente.',
          analogy: 'Uma analogia de teste',
        },
      },
    ],
  });

  assert.doesNotMatch(html, /immersion-environment/);
  assert.doesNotMatch(html, /Descrição de ambiente deliberadamente extensa/);
  assert.match(html, /Esta fala precisa continuar aparecendo normalmente\./);
  assert.match(html, /💡 Analogia/);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test 2>&1 | grep -A 15 "renderiza mais o badge de ambiente"`
Expected: FAIL — `immersion-environment` ainda aparece no HTML (o badge antigo ainda existe).

- [ ] **Step 3: Remover o badge de ambiente do markup**

Em `src/utils/deckExportUtils.ts`, no bloco `<!-- Right: Environment / Analogy Badges -->` (linhas 224-236), remova o bloco do badge de ambiente, mantendo só o de Analogia:

```typescript
        <!-- Right: Analogy Badge -->
        <div class="immersion-context flex flex-wrap sm:flex-nowrap items-center gap-1.5 self-stretch sm:self-center min-w-0">
          ${s.characterGuide?.analogy ? `
            <span class="shrink-0 text-[9px] font-mono px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/40 text-amber-200" title="Analogia: ${escapeHtmlAttribute(s.characterGuide.analogy)}">
              💡 Analogia
            </span>
          ` : ''}
        </div>
```

(substitui as linhas 224-236 inteiras — remove o `${s.thematicStorytelling?.environmentSetting ? ... }` e o comentário antigo `<!-- Right: Environment / Analogy Badges -->` vira `<!-- Right: Analogy Badge -->`)

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test 2>&1 | grep -A 5 "renderiza mais o badge de ambiente"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/deckExportUtils.ts src/utils/deckExportUtils.test.ts
git commit -m "fix: remove badge de ambiente do slide (colapsava para R... sob pressao de espaco)"
```

---

### Task 2: Corrigir truncamento do badge "OBJ:"

**Files:**
- Modify: `src/utils/deckExportUtils.ts:174-178`
- Test: `src/utils/deckExportUtils.test.ts` (novo teste)

- [ ] **Step 1: Escrever o teste que falha**

Adicione a `src/utils/deckExportUtils.test.ts` (após o teste do Task 1):

```typescript
test('badge "OBJ:" trunca com reticências em vez de cortar a palavra crua', () => {
  const objetivoLongo = 'Compreender o fluxo completo de resolução recursiva de um nome de domínio, do resolvedor local até o servidor autoritativo final';
  const html = generateInteractiveHtml({
    ...minimalDeck,
    slides: [
      {
        ...minimalDeck.slides[0],
        type: 'concept_breakdown',
        pedagogicalObjective: objetivoLongo,
      },
    ],
  });

  assert.doesNotMatch(html, new RegExp(objetivoLongo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /class=\\"truncate min-w-0\\"/);
  assert.match(html, /class=\\"inline-flex items-center gap-1[^"]*min-w-0\\"/);
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test 2>&1 | grep -A 10 "badge .OBJ:. trunca"`
Expected: FAIL — o objetivo completo ainda aparece por inteiro no HTML (o texto não está de fato truncado no DOM hoje, só visualmente via CSS quebrado), e as classes `truncate min-w-0` no span interno não existem ainda.

- [ ] **Step 3: Corrigir o markup do badge**

Em `src/utils/deckExportUtils.ts`, substitua as linhas 174-178:

```typescript
            ${s.pedagogicalObjective ? `
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-[9px] font-mono max-w-[280px] min-w-0" title="${escapeHtmlAttribute(s.pedagogicalObjective)}">
                <span class="font-bold shrink-0">OBJ:</span>
                <span class="truncate min-w-0">${s.pedagogicalObjective}</span>
              </span>
            ` : ''}
```

(nota: `truncate` sai do container e vai só pro `<span>` interno do texto; `min-w-0` vai nos dois — no container, pra ele não crescer além do `max-w-[280px]` disponível, e no span do texto, pra ele efetivamente encolher em vez de manter `min-width: auto` do flexbox padrão)

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test 2>&1 | grep -A 5 "badge .OBJ:. trunca"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/deckExportUtils.ts src/utils/deckExportUtils.test.ts
git commit -m "fix: badge OBJ: trunca corretamente com reticencias (bug classico de truncamento em flexbox)"
```

---

### Task 3: Card com altura flexível (piso + teto) em vez de altura fixa

**Files:**
- Modify: `src/utils/deckExportUtils.ts:857-920`
- Test: `src/utils/deckExportUtils.test.ts` (novo teste)

- [ ] **Step 1: Escrever o teste que falha**

Adicione a `src/utils/deckExportUtils.test.ts`:

```typescript
test('deck-container usa altura flexivel (piso+teto) em vez de aspect-ratio fixo', () => {
  const html = generateInteractiveHtml(minimalDeck);

  assert.doesNotMatch(html, /\.deck-container \{[^}]*aspect-ratio/);
  assert.match(html, /\.deck-container \{[^}]*min-height: 320px;[^}]*max-height: 94vh;/);
  assert.doesNotMatch(html, /\.deck-container\.mode-portrait \{[^}]*aspect-ratio/);
  assert.match(html, /\.deck-container\.mode-portrait \{[^}]*min-height: 420px;[^}]*max-height: 94vh;/);
  assert.doesNotMatch(html, /@media \(max-width: 768px\)[\s\S]*?\.deck-container \{[^}]*\n\s*height: calc/);
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test 2>&1 | grep -A 10 "altura flexivel"`
Expected: FAIL — o CSS atual ainda tem `aspect-ratio` e `min-height: 560px`/`680px`, e o bloco `@media (max-width: 768px)` ainda força `height: calc(...)`.

- [ ] **Step 3: Ajustar o CSS**

Em `src/utils/deckExportUtils.ts`, substitua as linhas 857-920 (blocos `.deck-container`, `.deck-container.mode-portrait` e o `@media (max-width: 768px)` — `.deck-container.mode-fullscreen` no meio fica inalterado):

```css
    .deck-container {
      width: 100%;
      max-width: 1080px;
      min-height: 320px;
      max-height: 94vh;
      border-radius: 20px;
      box-shadow: 0 30px 60px -15px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.12);
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .deck-container.mode-portrait {
      max-width: 440px;
      min-height: 420px;
      max-height: 94vh;
    }

    .deck-container.mode-fullscreen {
      max-width: 100vw;
      max-width: 100dvw;
      width: 100vw;
      width: 100dvw;
      height: 100vh;
      height: 100dvh;
      max-height: 100vh;
      max-height: 100dvh;
      aspect-ratio: auto;
      border-radius: 0;
      position: fixed;
      inset: 0;
      z-index: 9999;
    }

    @media (max-width: 768px) {
      body {
        padding: 4px;
      }
      .deck-container {
        min-height: 320px;
        max-height: calc(100vh - 8px);
        max-height: calc(100dvh - 8px);
        border-radius: 14px;
      }
      .deck-container.mode-portrait {
        max-width: 100%;
        min-height: 420px;
        max-height: calc(100vh - 8px);
        max-height: calc(100dvh - 8px);
      }
    }
```

Mudanças-chave: `aspect-ratio` sai de `.deck-container` e `.deck-container.mode-portrait` (base e dentro do media query) — a altura passa a ser determinada pelo conteúdo real, limitada só pelo `min-height` (piso, bem menor que antes: 320px/420px em vez de 560px/680px) e `max-height` (teto, inalterado: `94vh` no desktop, `100vh - 8px` no mobile). O bloco mobile também para de forçar `height: calc(...)` fixo — antes disso, QUALQUER slide em tela com menos de 768px de largura (a maioria dos celulares reais) ocupava 100% da altura da viewport mesmo com pouco conteúdo, que era a causa mais provável do espaço vazio visto em produção.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test 2>&1 | grep -A 5 "altura flexivel"`
Expected: PASS

- [ ] **Step 5: Rodar toda a suite pra garantir que nada mais quebrou**

Run: `npm test 2>&1 | tail -10`
Expected: todos os testes passando (66 nesse ponto, incluindo os 2 novos e o do Task 1 já contando).

- [ ] **Step 6: Verificação visual manual**

Gerar um deck de exemplo (reaproveitar o fixture já usado no brainstorming, ou criar um novo com 1 slide curto e 1 slide denso) e abrir no navegador em modo retrato pra confirmar visualmente que o slide curto não deixa mais espaço vazio grande e o slide denso continua respeitando o teto de 94vh sem estourar a tela.

- [ ] **Step 7: Commit**

```bash
git add src/utils/deckExportUtils.ts src/utils/deckExportUtils.test.ts
git commit -m "fix: deck-container usa altura flexivel (piso+teto) em vez de aspect-ratio fixo"
```

---

### Task 4: Embaralhar a ordem das alternativas do quiz

**Files:**
- Modify: `src/utils/quizSanitize.ts`
- Modify: `server.ts:2080` (adiciona a chamada)
- Test: `src/utils/quizSanitize.test.ts` (novos testes)

- [ ] **Step 1: Escrever os testes que falham**

Adicione a `src/utils/quizSanitize.test.ts` (junto aos imports do topo, adicionar `shuffleQuizOptions` ao import de `'./quizSanitize'`):

```typescript
import {
  MAX_QUIZ_OPTION_EXPLANATION_CHARS,
  MAX_QUIZ_OPTION_TEXT_CHARS,
  MAX_QUIZ_QUESTION_CHARS,
  sanitizeQuizContent,
  shuffleQuizOptions,
} from './quizSanitize';
```

E ao final do arquivo:

```typescript
test('shuffleQuizOptions e deterministico: mesma entrada produz sempre a mesma ordem', () => {
  const slide = slideWithQuiz({
    options: [
      { id: 'a', text: 'A', isCorrect: false, explanation: '' },
      { id: 'b', text: 'B', isCorrect: true, explanation: '' },
      { id: 'c', text: 'C', isCorrect: false, explanation: '' },
      { id: 'd', text: 'D', isCorrect: false, explanation: '' },
    ],
  });

  const primeiraChamada = shuffleQuizOptions([slide])[0].quiz!.options.map((o) => o.id);
  const segundaChamada = shuffleQuizOptions([slide])[0].quiz!.options.map((o) => o.id);

  assert.deepEqual(primeiraChamada, segundaChamada);
});

test('shuffleQuizOptions preserva todas as opcoes, so muda a ordem', () => {
  const slide = slideWithQuiz({
    options: [
      { id: 'a', text: 'A', isCorrect: false, explanation: '' },
      { id: 'b', text: 'B', isCorrect: true, explanation: '' },
      { id: 'c', text: 'C', isCorrect: false, explanation: '' },
      { id: 'd', text: 'D', isCorrect: false, explanation: '' },
    ],
  });

  const resultado = shuffleQuizOptions([slide])[0].quiz!.options;

  assert.deepEqual(new Set(resultado.map((o) => o.id)), new Set(['a', 'b', 'c', 'd']));
  assert.equal(resultado.length, 4);
});

test('shuffleQuizOptions nao deixa a resposta correta sempre no indice 0 para varios slides', () => {
  const slides = Array.from({ length: 20 }, (_, i) =>
    slideWithQuiz({
      question: `Pergunta ${i}`,
      options: [
        { id: 'correta', text: 'Correta', isCorrect: true, explanation: '' },
        { id: 'errada-1', text: 'Errada 1', isCorrect: false, explanation: '' },
        { id: 'errada-2', text: 'Errada 2', isCorrect: false, explanation: '' },
        { id: 'errada-3', text: 'Errada 3', isCorrect: false, explanation: '' },
      ],
    }),
  );
  // slideWithQuiz usa sempre id 'slide-1' - precisamos de ids distintos pra
  // seeds distintas, senao todos embaralham igual.
  const slidesComIdsDistintos = slides.map((s, i) => ({ ...s, id: `slide-${i}` }));

  const resultado = shuffleQuizOptions(slidesComIdsDistintos);
  const indicesDaCorreta = resultado.map((s) => s.quiz!.options.findIndex((o) => o.id === 'correta'));

  assert.ok(indicesDaCorreta.some((idx) => idx !== 0), 'esperava que ao menos um slide tivesse a resposta correta fora do indice 0');
});

test('shuffleQuizOptions tambem embaralha interactiveElement.quizOptions', () => {
  const slide: SlideData = {
    id: 'slide-quiz-unico',
    type: 'interactive_challenge',
    title: 'Título',
    contentParagraphs: [],
    interactiveElement: {
      id: 'ie-1',
      type: 'mini_quiz',
      title: 'Desafio',
      prompt: 'Prompt',
      xpReward: 100,
      quizOptions: [
        { id: 'correta', text: 'Correta', isCorrect: true, explanation: '' },
        { id: 'errada-1', text: 'Errada 1', isCorrect: false, explanation: '' },
        { id: 'errada-2', text: 'Errada 2', isCorrect: false, explanation: '' },
      ],
    },
  } as SlideData;

  const resultado = shuffleQuizOptions([slide])[0].interactiveElement!.quizOptions!;

  assert.equal(resultado.length, 3);
  assert.deepEqual(new Set(resultado.map((o) => o.id)), new Set(['correta', 'errada-1', 'errada-2']));
});

test('shuffleQuizOptions nao mexe em slides sem quiz', () => {
  const slide: SlideData = {
    id: 'slide-1',
    type: 'concept_breakdown',
    title: 'Título',
    contentParagraphs: ['Parágrafo normal.'],
  } as SlideData;

  const [result] = shuffleQuizOptions([slide]);

  assert.equal(result, slide);
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test 2>&1 | grep -A 5 "shuffleQuizOptions"`
Expected: FAIL — `shuffleQuizOptions` não existe ainda (erro de import/undefined).

- [ ] **Step 3: Implementar `shuffleQuizOptions` em `src/utils/quizSanitize.ts`**

Adicione ao final do arquivo (após `sanitizeQuizContent`):

```typescript
// Hash simples (djb2) da string pra derivar uma seed numerica estavel a
// partir do slide.id. Precisa ser deterministico entre chamadas (o HTML
// exportado e gerado uma vez e reutilizado por todos os alunos do mesmo
// perfil/topico) - Math.random() faria a ordem mudar a cada re-render da
// mesma pagina, pior experiencia que a ordem fixa atual.
function stringToSeed(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return hash >>> 0;
}

// PRNG determinístico (mulberry32) a partir da seed - simples, sem
// dependencia externa, suficiente pra embaralhar uma lista de poucas opcoes.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  const random = mulberry32(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Embaralha a ordem de slide.quiz.options e de
 * interactiveElement.quizOptions[] de forma deterministica (seed derivada de
 * slide.id) - corrige o vies de a resposta certa vir sempre no schema/modelo
 * na primeira posicao, sem fazer a ordem mudar entre re-renders do mesmo
 * deck ja exportado.
 */
export function shuffleQuizOptions(slides: SlideData[]): SlideData[] {
  if (!Array.isArray(slides)) return slides;

  return slides.map((slide) => {
    let changed = false;
    const next: SlideData = { ...slide };
    const seed = stringToSeed(String(slide.id ?? ''));

    if (slide.quiz?.options?.length) {
      next.quiz = { ...slide.quiz, options: shuffleWithSeed(slide.quiz.options, seed) };
      changed = true;
    }

    if (slide.interactiveElement?.quizOptions?.length) {
      next.interactiveElement = {
        ...slide.interactiveElement,
        quizOptions: shuffleWithSeed(slide.interactiveElement.quizOptions, seed + 1),
      };
      changed = true;
    }

    return changed ? next : slide;
  });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test 2>&1 | grep -A 5 "shuffleQuizOptions"`
Expected: PASS (5 novos testes)

- [ ] **Step 5: Rodar toda a suite**

Run: `npm test 2>&1 | tail -10`
Expected: todos os testes passando.

- [ ] **Step 6: Conectar no pipeline do server.ts**

Em `server.ts`, atualize o import da linha 18:

```typescript
import { sanitizeQuizContent, shuffleQuizOptions } from './src/utils/quizSanitize';
```

E na linha 2080, logo após `sanitizeQuizContent`:

```typescript
    fullDeck.slides = sanitizeQuizContent(fullDeck.slides);
    fullDeck.slides = shuffleQuizOptions(fullDeck.slides);
    fullDeck.slides = paginateSlidesByDensity(fullDeck.slides);
```

- [ ] **Step 7: Rodar toda a suite mais uma vez e o typecheck**

Run: `npm test 2>&1 | tail -10 && npx tsc --noEmit`
Expected: todos os testes passando, typecheck sem erros.

- [ ] **Step 8: Commit**

```bash
git add src/utils/quizSanitize.ts src/utils/quizSanitize.test.ts server.ts
git commit -m "fix: embaralha ordem das alternativas do quiz (resposta certa nao fica mais sempre na 1a posicao)"
```

---

### Encerramento

Após os 4 tasks: rodar `npm test` e `npx tsc --noEmit` uma última vez na raiz da worktree, depois seguir para **superpowers:finishing-a-development-branch** (verificar testes, apresentar as 4 opções de finalização — mesmo padrão usado no PR #10: push + PR).
