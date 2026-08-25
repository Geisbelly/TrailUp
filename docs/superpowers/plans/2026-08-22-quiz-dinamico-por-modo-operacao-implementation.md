# Quiz dinâmico por modoOperacao Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Esconder o widget de quiz ("desafios cognitivos") do deck exportado do BrainHexPDF quando o `modoOperacao` do aluno logado não for "Misto", sem regenerar o deck (compartilhado entre alunos do mesmo perfil/tópico).

**Architecture:** Um parâmetro de query booleano (`?hideQuiz=1`) é anexado à URL do deck no lado do TrailUp/mobile (onde o enum `modoOperacao` vive), e o próprio HTML exportado do BrainHexPDF lê esse parâmetro no carregamento pra decidir se esconde o widget — sem `injectedJavaScript`, sem tocar a geração do deck. Ver spec completa em `docs/superpowers/specs/2026-08-22-quiz-dinamico-por-modo-operacao-design.md`.

**Tech Stack:** TypeScript, `node:test`/`node:assert/strict` (mesmo runner usado nos dois repos para lógica pura).

**Worktrees:**
- TrailUp: `.worktrees/quiz-dinamico-modo-operacao` (branch `feature/quiz-dinamico-modo-operacao`, a partir de `origin/main`)
- BrainHexPDF: `.worktrees/quiz-dinamico-modo-operacao` (branch `feature/quiz-dinamico-modo-operacao`, a partir de `origin/main`, baseline 65/65 testes)

---

### Task 1 (BrainHexPDF): esconder `.quiz-widget-container` via `?hideQuiz=1`

**Files:**
- Modify: `src/utils/deckExportUtils.ts` (novo bloco de script + chamada de inicialização, linhas ~2313-2314)
- Test: `src/utils/deckExportUtils.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar a `src/utils/deckExportUtils.test.ts` (após o último teste do arquivo):

```typescript
test('script exportado le hideQuiz da query string e esconde .quiz-widget-container', () => {
  const html = generateInteractiveHtml(minimalDeck);

  assert.match(html, /function applyQuizVisibilityFromQuery/);
  assert.match(html, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(html, /params\.get\('hideQuiz'\) !== '1'/);
  assert.match(html, /querySelectorAll\('\.quiz-widget-container'\)/);
  assert.match(html, /closest\('\.lg\\\\:col-span-7'\)/);
  assert.match(html, /querySelector\('\.lg\\\\:col-span-5'\)/);
  assert.match(html, /applyQuizVisibilityFromQuery\(\);\s*\n\s*renderBackgroundScene\(\);/);
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test 2>&1 | grep -A 10 "applyQuizVisibilityFromQuery"`
Expected: FAIL — a função não existe ainda no HTML gerado.

- [ ] **Step 3: Implementar a função no script exportado**

Em `src/utils/deckExportUtils.ts`, localizar (perto do final do `<script>`, logo antes de `renderBackgroundScene();\n    renderSlide();`):

```typescript
    renderBackgroundScene();
    renderSlide();
```

Substituir por:

```typescript
    // Esconde o(s) widget(s) de quiz ("desafios cognitivos") quando o
    // aluno que esta vendo o deck prefere um modoOperacao diferente de
    // "Misto" - decidido no lado do TrailUp/mobile (que e dono do enum
    // modoOperacao) e passado aqui so como um flag booleano na URL, ja que
    // este deck e compartilhado entre todos os alunos do mesmo perfil e
    // nao pode ser regenerado por aluno. Roda uma unica vez no carregamento
    // (o script fica no fim do <body>, entao o DOM ja esta todo presente -
    // nenhum slide e criado dinamicamente via JS, so a navegacao entre eles
    // e feita depois por renderSlide()).
    function applyQuizVisibilityFromQuery() {
      const params = new URLSearchParams(window.location.search);
      if (params.get('hideQuiz') !== '1') return;

      document.querySelectorAll('.quiz-widget-container').forEach((quizEl) => {
        const rightColumn = quizEl.closest('.lg\\:col-span-7');
        quizEl.remove();
        // O quiz era o unico conteudo da coluna direita (sem imagem de
        // referencia nesse slide) - remove a coluna vazia e expande a
        // coluna de texto pra largura cheia, senao reintroduz o mesmo bug
        // de espaco desperdicado corrigido no PR de correcoes visuais.
        // Estilo inline (nao classe Tailwind nova) pra nao depender do
        // MutationObserver do Play CDN reprocessar a classe depois do load.
        if (rightColumn && rightColumn.children.length === 0) {
          const grid = rightColumn.parentElement;
          rightColumn.remove();
          const leftColumn = grid ? grid.querySelector('.lg\\:col-span-5') : null;
          if (leftColumn) leftColumn.style.gridColumn = '1 / -1';
        }
      });
    }

    applyQuizVisibilityFromQuery();
    renderBackgroundScene();
    renderSlide();
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test 2>&1 | grep -A 5 "applyQuizVisibilityFromQuery"`
Expected: PASS

- [ ] **Step 5: Rodar toda a suite**

Run: `npm test 2>&1 | tail -10`
Expected: todos os testes passando (66 nesse ponto).

- [ ] **Step 6: Verificação visual manual**

Reaproveitar o fixture de deck usado no sub-projeto A (slide com quiz sozinho, sem parágrafos, e um slide com quiz + imagem de referência). Gerar o HTML, abrir no navegador via `claude-in-chrome` duas vezes: uma vez em `http://localhost:<porta>/` (sem parâmetro — quiz aparece normalmente) e outra em `http://localhost:<porta>/?hideQuiz=1` (quiz escondido). Confirmar visualmente: (a) o slide que só tinha quiz vira um card curto sem coluna vazia; (b) o slide com quiz + imagem mantém a imagem visível na coluna direita, só o quiz some.

- [ ] **Step 7: Commit**

```bash
git add src/utils/deckExportUtils.ts src/utils/deckExportUtils.test.ts
git commit -m "feat: esconde quiz do deck via ?hideQuiz=1 (dinamico por modoOperacao do aluno)"
```

---

### Task 2 (TrailUp/mobile): extrair `shouldHideQuiz`/`withHideQuizParam`

**Files:**
- Create: `mobile/src/utils/quizVisibility.ts`
- Test: `mobile/src/utils/quizVisibility.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `mobile/src/utils/quizVisibility.test.ts`:

```typescript
import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldHideQuiz, withHideQuizParam } from "./quizVisibility";

test("shouldHideQuiz: 'Misto' mostra o quiz (nao esconde)", () => {
  assert.equal(shouldHideQuiz("Misto"), false);
});

test("shouldHideQuiz: variacao de capitalizacao/espaco ainda conta como Misto", () => {
  assert.equal(shouldHideQuiz("  misto "), false);
  assert.equal(shouldHideQuiz("MISTO"), false);
});

test("shouldHideQuiz: qualquer outro modo esconde o quiz", () => {
  assert.equal(shouldHideQuiz("Conteúdo Primeiro"), true);
  assert.equal(shouldHideQuiz("Pergunta Primeiro"), true);
  assert.equal(shouldHideQuiz("Perguntas Final"), true);
});

test("shouldHideQuiz: sem dado (null/undefined/vazio) mostra o quiz por padrao", () => {
  assert.equal(shouldHideQuiz(null), false);
  assert.equal(shouldHideQuiz(undefined), false);
  assert.equal(shouldHideQuiz(""), false);
  assert.equal(shouldHideQuiz("   "), false);
});

test("withHideQuizParam: adiciona ?hideQuiz=1 quando hide=true e a URL nao tem query string", () => {
  assert.equal(
    withHideQuizParam("https://storage.example.com/deck.html", true),
    "https://storage.example.com/deck.html?hideQuiz=1",
  );
});

test("withHideQuizParam: usa & quando a URL ja tem query string", () => {
  assert.equal(
    withHideQuizParam("https://storage.example.com/deck.html?token=abc", true),
    "https://storage.example.com/deck.html?token=abc&hideQuiz=1",
  );
});

test("withHideQuizParam: retorna a URL sem alteracao quando hide=false", () => {
  assert.equal(
    withHideQuizParam("https://storage.example.com/deck.html?token=abc", false),
    "https://storage.example.com/deck.html?token=abc",
  );
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd mobile && npx tsx --test src/utils/quizVisibility.test.ts` (mesmo mecanismo usado por `PresentationSlidesBlock.test.ts`/`personalization.multicontent.test.ts` — `tsx` não é devDependency do mobile, `npx` baixa on-demand; confirmado funcionando durante o brainstorming)
Expected: FAIL — `./quizVisibility` não existe ainda.

- [ ] **Step 3: Implementar `mobile/src/utils/quizVisibility.ts`**

```typescript
/**
 * Decide se o quiz ("desafios cognitivos") do deck do BrainHexPDF deve ser
 * escondido pro aluno atual, com base no modoOperacao dele. O deck e
 * compartilhado entre todos os alunos do mesmo perfil/topico - essa decisao
 * NAO pode mudar o deck em si, so como ele e exibido pra este aluno
 * especifico (ver withHideQuizParam).
 *
 * "Misto" mostra o quiz normalmente; qualquer outro modo explicito esconde.
 * Sem dado (aluno sem o campo preenchido, ex. cadastro antigo) mostra por
 * padrao - fail-open, nao esconde por falta de informacao.
 */
export function shouldHideQuiz(modoOperacaoNome: string | null | undefined): boolean {
  const normalizado = (modoOperacaoNome ?? "").trim().toLowerCase();
  if (!normalizado) return false;
  return normalizado !== "misto";
}

/**
 * Anexa ?hideQuiz=1 (ou &hideQuiz=1 se a URL ja tiver query string) na URL
 * do deck quando hide=true. Retorna a URL sem alteracao quando hide=false.
 */
export function withHideQuizParam(url: string, hide: boolean): string {
  if (!hide) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}hideQuiz=1`;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd mobile && npx tsx --test src/utils/quizVisibility.test.ts`
Expected: PASS (7 testes)

- [ ] **Step 5: Commit**

```bash
git add mobile/src/utils/quizVisibility.ts mobile/src/utils/quizVisibility.test.ts
git commit -m "feat(mobile): extrai shouldHideQuiz/withHideQuizParam para decidir visibilidade do quiz por aluno"
```

---

### Task 3 (TrailUp/mobile): conectar em `DocumentBlock.tsx`

**Files:**
- Modify: `mobile/src/components/DocumentBlock.tsx` (linhas 947-962 e 965-976, útil conferir o arquivo atual antes de editar pois já foi lido nas linhas 934-976 durante o brainstorming)

- [ ] **Step 1: Adicionar o import**

No topo de `mobile/src/components/DocumentBlock.tsx`, junto aos outros imports de `@/utils/...`:

```typescript
import { shouldHideQuiz, withHideQuizParam } from "@/utils/quizVisibility";
```

- [ ] **Step 2: Aplicar no branch `tipo === "embed"`**

Substituir:

```typescript
    if (tipo === "embed" && (sourceHtml || resolvedUrl)) {
      return {
        title,
        html: sourceHtml ? wrapEmbedHtml(sourceHtml, viewerTheme.background) : null,
        uri: sourceHtml ? resolvedUrl : resolvedUrl,
        height: getViewerHeight(tipo, displayMode, false, windowHeight, windowWidth),
      };
    }
```

por:

```typescript
    if (tipo === "embed" && (sourceHtml || resolvedUrl)) {
      const embedUri = resolvedUrl
        ? withHideQuizParam(resolvedUrl, shouldHideQuiz(usuario?.modoOperacao_nome))
        : resolvedUrl;
      return {
        title,
        html: sourceHtml ? wrapEmbedHtml(sourceHtml, viewerTheme.background) : null,
        uri: embedUri,
        height: getViewerHeight(tipo, displayMode, false, windowHeight, windowWidth),
      };
    }
```

- [ ] **Step 3: Atualizar as dependências do `useMemo`**

No array de dependências do `useMemo` que envolve o bloco acima (logo depois, algo como `}, [currentPage, displayMode, effectiveUseNative, resolvedUrl, sourceHtml, tipo, title, windowHeight, ...])`), adicionar `usuario?.modoOperacao_nome`:

```typescript
  }, [
    currentPage,
    displayMode,
    effectiveUseNative,
    resolvedUrl,
    sourceHtml,
    tipo,
    title,
    usuario?.modoOperacao_nome,
    windowHeight,
    windowWidth,
    viewerTheme,
  ]);
```

(ajustar mantendo as demais dependências já existentes na lista original — só adicionar `usuario?.modoOperacao_nome`, sem remover nenhuma.)

- [ ] **Step 4: Verificar typecheck do mobile**

`mobile/package.json` não tem script de typecheck dedicado (só `"lint": "expo lint"`, focado em ESLint). Rodar o compilador TS diretamente:

Run: `cd mobile && npx tsc --noEmit`
Expected: sem erros novos (o projeto pode já ter avisos pré-existentes não relacionados — comparar com o estado antes desta mudança se aparecer algo).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/DocumentBlock.tsx
git commit -m "feat(mobile): aplica hideQuiz na URL do deck do BrainHexPDF conforme modoOperacao do aluno"
```

---

### Encerramento

Dois PRs separados (um por repositório), já que são repositórios Git distintos:
- BrainHexPDF: **superpowers:finishing-a-development-branch** na worktree `.worktrees/quiz-dinamico-modo-operacao` (mesmo padrão dos PRs #10/#11).
- TrailUp: **superpowers:finishing-a-development-branch** na worktree `.worktrees/quiz-dinamico-modo-operacao` (mesmo padrão dos PRs #89/#90/#91).

Nenhum dos dois PRs funciona sozinho de forma completa (o parâmetro só tem efeito se os dois lados estiverem no ar), mas cada um é seguro de mergear independentemente: o BrainHexPDF ignora o parâmetro quando ausente (comportamento atual preservado), e o TrailUp só passa a enviar o parâmetro quando o deck já souber interpretá-lo.
