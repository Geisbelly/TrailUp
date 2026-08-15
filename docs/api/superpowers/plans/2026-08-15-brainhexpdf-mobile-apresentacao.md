# Mobile: renderizar apresentação HTML do BrainHexPDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `mobile/` volta a renderizar o material `apresentacao` de uma personalização quando ele é uma URL `.html` (produzida pelo BrainHexPDF) — hoje esse conteúdo cai num fallback vazio e o aluno não vê nada.

**Architecture:** Adiciona um helper `isHtmlUrl()` em `contentBlocks.ts` e um branch novo em `personalization.ts`'s handler de `tipo === "apresentacao"`, antes do fallback de slides/abertura: URLs `.html` viram bloco `tipo: "embed"` em vez de `"apresentacao"` — reaproveitando o caminho de renderização de embed que já existe (`DocumentBlock.tsx` já carrega `uri` direto num WebView pra esse tipo, sem tentar Office-viewer nem parser nativo de PPTX). Nenhuma mudança em `ContentRenderer.tsx`/`DocumentBlock.tsx`/`WebContentFrame.tsx`.

**Tech Stack:** React Native (Expo), TypeScript. `mobile/` não tem infra de teste (sem jest, sem `test` script em `package.json`) — verificação é `npm run lint` (`expo lint`, baseado em `tsc`) + rastreamento manual do fluxo de dados.

**Spec:** Não há spec formal (`bounded` — mudança localizada em código já existente, design aprovado em chat). Causa raiz documentada no achado Crítico #1 do review final de `docs/api/superpowers/plans/2026-08-15-brainhexpdf-integracao.md` (branch `feature/brainhexpdf-integracao`, que trocou o material `apresentacao` de PDF pra HTML no `microservice/`).

## Global Constraints

- Não mudar `ContentRenderer.tsx`, `DocumentBlock.tsx`, ou `WebContentFrame.tsx` — o caminho `tipo: "embed"` já funciona pra URL solta, o problema é só que `personalization.ts` nunca produz um bloco `embed` a partir de `apresentacao`.
- A ordem de checks dentro do branch `apresentacao` importa: `isPdfUrl` → `isDocumentUrl` → `isPresentationUrl` → (novo) `isHtmlUrl` → fallback slides/abertura. Uma URL `.pdf`/`.docx`/`.pptx` nunca deve cair no branch novo.
- Sem infra de teste em `mobile/` — não criar jest/testing-library do zero como parte deste plano (fora de escopo, YAGNI). Verificação via `npm run lint` + leitura manual do diff contra o fluxo de renderização.

---

## Task 1: `isHtmlUrl()` + branch novo no handler de `apresentacao`

**Files:**
- Modify: `mobile/src/utils/contentBlocks.ts` (novo helper, perto de `isMarkdownUrl`)
- Modify: `mobile/src/utils/personalization.ts:20-31` (import) e `:1010-1061` (branch `apresentacao`)

**Interfaces:**
- Produces: `isHtmlUrl(url: string): boolean`, exportado de `contentBlocks.ts`, consumido só por `personalization.ts` neste plano.

- [ ] **Step 1: Adicionar `isHtmlUrl` em `contentBlocks.ts`**

Em `mobile/src/utils/contentBlocks.ts`, logo depois de `isMarkdownUrl` (linha 236-238):

```ts
export function isMarkdownUrl(url: string) {
  return /\.(md|markdown)$/i.test(cleanUrl(url)) || cleanUrl(url).includes("/raw/");
}

export function isHtmlUrl(url: string) {
  return /\.html?$/i.test(cleanUrl(url));
}
```

- [ ] **Step 2: Importar `isHtmlUrl` em `personalization.ts`**

Trocar (linhas 20-31):

```ts
import {
  buildContentBlocks,
  isUrl,
  isAudioUrl,
  isPdfUrl,
  isDocumentUrl,
  isImageUrl,
  isMarkdownUrl,
  isPresentationUrl,
  isVideoUrl,
  normalizeContentBlock,
} from "@/utils/contentBlocks";
```

por:

```ts
import {
  buildContentBlocks,
  isUrl,
  isAudioUrl,
  isPdfUrl,
  isDocumentUrl,
  isHtmlUrl,
  isImageUrl,
  isMarkdownUrl,
  isPresentationUrl,
  isVideoUrl,
  normalizeContentBlock,
} from "@/utils/contentBlocks";
```

- [ ] **Step 3: Adicionar o branch `isHtmlUrl` no handler de `apresentacao`**

Em `mobile/src/utils/personalization.ts`, dentro do bloco `if (tipo === "apresentacao") {`, depois do branch `isPresentationUrl` (linhas 1045-1060) e antes de `const presentationTitle = ...` (linha 1062):

```ts
    if (url && isPresentationUrl(url)) {
      const block = normalizeContentBlock(
        {
          id: key,
          tipo,
          url,
          title,
          metadata: {
            ...metadata,
            defaultDisplayMode: "pagina",
          },
        },
        key
      );
      return block ? [block] : [];
    }

    if (url && isHtmlUrl(url)) {
      const block = normalizeContentBlock(
        {
          id: key,
          tipo: "embed",
          url,
          title,
          metadata: {
            ...metadata,
            defaultDisplayMode: "rolagem",
          },
        },
        key
      );
      return block ? [block] : [];
    }

    const presentationTitle =
      pickString(payload.titulo, title, "Apresentacao personalizada") ??
      "Apresentacao personalizada";
```

Note que `tipo: "embed"` aqui é literal (diferente do branch `isPresentationUrl` acima, que reusa a variável `tipo` — que nesse ponto do código já vale `"apresentacao"`). Isso é intencional: é o que faz o bloco cair no caminho `DocumentBlock` de `tipo === "embed"` em vez de `tipo === "apresentacao"`.

- [ ] **Step 4: Type-check**

Run: `cd mobile && npm run lint`
Expected: sem erros novos. Se o comando falhar por motivos pré-existentes não relacionados a este diff, confirmar isso comparando com `git stash && npm run lint && git stash pop` antes de prosseguir.

- [ ] **Step 5: Verificação manual do fluxo (sem infra de teste)**

Não há test runner em `mobile/`. Verificar manualmente, lendo o código (não precisa rodar o app):

1. Confirmar em `mobile/src/utils/contentBlocks.ts` que `isHtmlUrl("https://x.supabase.co/storage/v1/object/public/conteudo_aluno/brainhex/seeker/classe-1/topico-1/apresentacao/material-123.html")` retornaria `true` (extensão `.html` bate no regex).
2. Confirmar que a mesma URL não bate em `isPdfUrl`, `isDocumentUrl`, nem `isPresentationUrl` (nenhuma extensão delas é `.html`).
3. Em `mobile/src/components/ContentRenderer.tsx:274-288`, confirmar que `block.tipo === "embed"` cai no mesmo `<DocumentBlock tipo={block.tipo} .../>` que `"apresentacao"` já usava — sem código renderer novo necessário.
4. Em `mobile/src/components/DocumentBlock.tsx:941-956` (bloco `viewer`), confirmar que pro branch `tipo === "embed"` com `sourceHtml` ausente (nosso caso — é uma URL, não HTML inline), o viewer usa `uri: resolvedUrl` — ou seja, carrega a URL do BrainHexPDF direto no WebView. Isso é o comportamento desejado (o HTML já é uma página completa e interativa gerada pelo BrainHexPDF).

- [ ] **Step 6: Commit**

```bash
cd mobile
git add src/utils/contentBlocks.ts src/utils/personalization.ts
git commit -m "fix: renderiza apresentacao HTML do BrainHexPDF via bloco embed

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
