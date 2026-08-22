# XP de slides com checkpoint (D1a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando o aluno acerta um quiz num slide, o evento chega ao banco (`personalizacao_item_progresso`) de forma segura (o deck nunca tem credenciais) e idempotente (reabrir o deck não duplica pontuação).

**Architecture:** Ponte `postMessage` real entre o deck (BrainHexPDF) e o app mobile — nativo via `react-native-webview`'s `onMessage`/`window.ReactNativeWebView.postMessage`, web via `window.parent.postMessage`/`window.addEventListener('message')` com validação de `event.source`. O app reaproveita `salvarProgressoItemPersonalizado` (já exposto por `useTrilha()`) pra persistir — sem precisar de nenhum ID novo passado por props, só uma função de callback. Ver spec completa em `docs/superpowers/specs/2026-08-22-xp-slides-checkpoint-design.md`.

**Escopo desta fase**: só a interação de quiz. Demais tipos (checklist, decisão, revelação secreta, boss battle, interação única) ficam para D1b.

**Tech Stack:** TypeScript, `node:test`/`node:assert/strict` nos dois repos.

**Worktrees:**
- TrailUp: `.worktrees/xp-slides-checkpoint` (branch `feature/xp-slides-checkpoint`, a partir de `origin/main`)
- BrainHexPDF: `.worktrees/xp-slides-checkpoint` (branch `feature/xp-slides-checkpoint`, a partir de `origin/main`, baseline 77/77 testes)

---

### Task 1 (BrainHexPDF): `reportProgressToHost` no script exportado

**Files:**
- Modify: `src/utils/deckExportUtils.ts` (novo helper após `persistState`, linha ~1329; chamada dentro de `handleQuizAnswer`, linha ~1641)
- Test: `src/utils/deckExportUtils.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar a `src/utils/deckExportUtils.test.ts` (após o último teste do arquivo):

```typescript
test('script exportado reporta XP de quiz pro host via postMessage, so na primeira vez que acerta', () => {
  const html = generateInteractiveHtml(minimalDeck);

  assert.match(html, /function reportProgressToHost/);
  assert.match(html, /window\.ReactNativeWebView && typeof window\.ReactNativeWebView\.postMessage === 'function'/);
  assert.match(html, /window\.parent\.postMessage\(message, '\*'\)/);
  assert.match(html, /'trailup:progress'/);
  // a chamada tem que estar DENTRO do bloco !wasAlreadyCorrect (so reporta
  // na primeira vez que acerta, nao em toda re-renderizacao)
  assert.match(html, /if \(!wasAlreadyCorrect\) \{[\s\S]*?reportProgressToHost\('slide:' \+ currentIndex \+ ':quiz', 150, 150\);[\s\S]*?\}/);
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `npm test 2>&1 | grep -A 10 "reporta XP de quiz"`
Expected: FAIL — `reportProgressToHost` não existe ainda.

- [ ] **Step 3: Implementar**

Em `src/utils/deckExportUtils.ts`, localizar (logo após `persistState`):

```typescript
    function persistState() {
      try {
        savedData.totalXp = totalXp;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedData));
      } catch (e) {
        console.warn('Could not save to localStorage:', e);
      }
    }

    function resetDeckProgress() {
```

Inserir entre as duas:

```typescript
    function persistState() {
      try {
        savedData.totalXp = totalXp;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedData));
      } catch (e) {
        console.warn('Could not save to localStorage:', e);
      }
    }

    // Reporta XP ganho pro app hospedeiro - o deck NUNCA tem acesso a
    // nenhuma credencial/sessao, so emite {itemKey, pontuacaoObtida,
    // pontuacaoMaxima}; quem grava no banco e o app (que ja tem a sessao
    // autenticada do aluno). Funciona nos dois ambientes: nativo injeta
    // window.ReactNativeWebView automaticamente (react-native-webview);
    // web usa postMessage pro parent (o deck roda num iframe).
    function reportProgressToHost(itemKey, pontuacaoObtida, pontuacaoMaxima) {
      try {
        const message = JSON.stringify({
          type: 'trailup:progress',
          itemKey: itemKey,
          pontuacaoObtida: pontuacaoObtida,
          pontuacaoMaxima: pontuacaoMaxima,
        });
        if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
          window.ReactNativeWebView.postMessage(message);
        } else if (window.parent && window.parent !== window) {
          window.parent.postMessage(message, '*');
        }
      } catch (e) {}
    }

    function resetDeckProgress() {
```

E dentro de `handleQuizAnswer`, localizar:

```typescript
        if (!wasAlreadyCorrect) {
          totalXp += 150;
          updateXpDisplay();
          triggerConfettiBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 35);
          spawnFloatingXp('+150 XP ✦', rect.left + rect.width / 2, rect.top, '#10B981');
        }
```

Substituir por:

```typescript
        if (!wasAlreadyCorrect) {
          totalXp += 150;
          updateXpDisplay();
          triggerConfettiBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 35);
          spawnFloatingXp('+150 XP ✦', rect.left + rect.width / 2, rect.top, '#10B981');
          reportProgressToHost('slide:' + currentIndex + ':quiz', 150, 150);
        }
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm test 2>&1 | grep -A 5 "reporta XP de quiz"`
Expected: PASS

- [ ] **Step 5: Rodar toda a suite e o typecheck**

Run: `npm test 2>&1 | tail -10 && npx tsc --noEmit 2>&1 | tail -20`
Expected: todos os testes passando (78 nesse ponto), sem erros de tipo.

- [ ] **Step 6: Commit**

```bash
git add src/utils/deckExportUtils.ts src/utils/deckExportUtils.test.ts
git commit -m "feat: reporta XP de quiz pro app hospedeiro via postMessage (D1a)"
```

---

### Task 2 (TrailUp/mobile): `parseDeckProgressMessage` — parsing puro e testável

**Files:**
- Create: `mobile/src/utils/deckProgressMessage.ts`
- Test: `mobile/src/utils/deckProgressMessage.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Criar `mobile/src/utils/deckProgressMessage.test.ts`:

```typescript
import assert from "node:assert/strict";
import { test } from "node:test";

import { parseDeckProgressMessage } from "./deckProgressMessage";

test("parseia uma mensagem valida de progresso", () => {
  const raw = JSON.stringify({
    type: "trailup:progress",
    itemKey: "slide:2:quiz",
    pontuacaoObtida: 150,
    pontuacaoMaxima: 150,
  });

  assert.deepEqual(parseDeckProgressMessage(raw), {
    itemKey: "slide:2:quiz",
    pontuacaoObtida: 150,
    pontuacaoMaxima: 150,
  });
});

test("retorna null pra JSON invalido", () => {
  assert.equal(parseDeckProgressMessage("isso nao e json"), null);
});

test("retorna null quando type nao e trailup:progress", () => {
  const raw = JSON.stringify({ type: "outra-coisa", itemKey: "x", pontuacaoObtida: 1, pontuacaoMaxima: 1 });
  assert.equal(parseDeckProgressMessage(raw), null);
});

test("retorna null quando itemKey esta ausente ou vazio", () => {
  assert.equal(parseDeckProgressMessage(JSON.stringify({ type: "trailup:progress", pontuacaoObtida: 1, pontuacaoMaxima: 1 })), null);
  assert.equal(parseDeckProgressMessage(JSON.stringify({ type: "trailup:progress", itemKey: "", pontuacaoObtida: 1, pontuacaoMaxima: 1 })), null);
});

test("retorna null quando pontuacaoObtida/pontuacaoMaxima nao sao numeros finitos", () => {
  assert.equal(parseDeckProgressMessage(JSON.stringify({ type: "trailup:progress", itemKey: "x", pontuacaoObtida: "150", pontuacaoMaxima: 150 })), null);
  assert.equal(parseDeckProgressMessage(JSON.stringify({ type: "trailup:progress", itemKey: "x", pontuacaoObtida: NaN, pontuacaoMaxima: 150 })), null);
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd mobile && npx tsx --test src/utils/deckProgressMessage.test.ts`
Expected: FAIL — `./deckProgressMessage` não existe ainda.

- [ ] **Step 3: Implementar**

Criar `mobile/src/utils/deckProgressMessage.ts`:

```typescript
/**
 * Evento de progresso emitido pelo deck do BrainHexPDF via postMessage
 * (ver reportProgressToHost em BrainHexPDF/src/utils/deckExportUtils.ts).
 * O deck nunca tem acesso a credenciais - so emite {itemKey, pontuacao...};
 * quem grava no banco e o app, com a sessao ja autenticada do aluno.
 */
export interface DeckProgressEvent {
  itemKey: string;
  pontuacaoObtida: number;
  pontuacaoMaxima: number;
}

export function parseDeckProgressMessage(raw: string): DeckProgressEvent | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  if (obj.type !== "trailup:progress") return null;
  if (typeof obj.itemKey !== "string" || !obj.itemKey.trim()) return null;
  if (typeof obj.pontuacaoObtida !== "number" || !Number.isFinite(obj.pontuacaoObtida)) return null;
  if (typeof obj.pontuacaoMaxima !== "number" || !Number.isFinite(obj.pontuacaoMaxima)) return null;

  return {
    itemKey: obj.itemKey,
    pontuacaoObtida: obj.pontuacaoObtida,
    pontuacaoMaxima: obj.pontuacaoMaxima,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd mobile && npx tsx --test src/utils/deckProgressMessage.test.ts`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add mobile/src/utils/deckProgressMessage.ts mobile/src/utils/deckProgressMessage.test.ts
git commit -m "feat(mobile): adiciona parseDeckProgressMessage para validar eventos de progresso do deck"
```

---

### Task 3 (TrailUp/mobile): ponte `postMessage` em `WebContentFrame.tsx`

**Files:**
- Modify: `mobile/src/components/WebContentFrame.tsx`

- [ ] **Step 1: Aplicar as mudanças**

Substituir o topo do arquivo:

```typescript
import { Color } from "@/styles/GlobalStyle";
import { getProfileShellPalette, ProfileShellPalette } from "@/utils/profileShellTheme";
import React from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Props = {
  title?: string;
  height: number;
  html?: string | null;
  uri?: string | null;
  scrollEnabled?: boolean;
  palette?: ProfileShellPalette;
  WebView?: React.ComponentType<any> | null;
};
```

por:

```typescript
import { Color } from "@/styles/GlobalStyle";
import { getProfileShellPalette, ProfileShellPalette } from "@/utils/profileShellTheme";
import { parseDeckProgressMessage, type DeckProgressEvent } from "@/utils/deckProgressMessage";
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Props = {
  title?: string;
  height: number;
  html?: string | null;
  uri?: string | null;
  scrollEnabled?: boolean;
  palette?: ProfileShellPalette;
  WebView?: React.ComponentType<any> | null;
  onProgressEvent?: (event: DeckProgressEvent) => void;
};
```

Substituir a assinatura e o corpo do componente (do `export function WebContentFrame` até o fim do branch `Platform.OS === "web"`):

```typescript
export function WebContentFrame({
  title,
  height,
  html,
  uri,
  scrollEnabled = true,
  palette = fallbackPalette,
  WebView,
}: Props) {
  if (Platform.OS === "web") {
    return html ? (
      <iframe
        title={title ?? "Visualizador"}
        srcDoc={html}
        style={{ ...webFrameStyle, height, backgroundColor: palette.surface }}
        allowFullScreen
      />
    ) : uri ? (
      <iframe
        title={title ?? "Visualizador"}
        src={uri}
        style={{ ...webFrameStyle, height, backgroundColor: palette.surface }}
        allowFullScreen
      />
    ) : null;
  }
```

por:

```typescript
export function WebContentFrame({
  title,
  height,
  html,
  uri,
  scrollEnabled = true,
  palette = fallbackPalette,
  WebView,
  onProgressEvent,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Escuta postMessage do deck (ver reportProgressToHost em
  // BrainHexPDF/src/utils/deckExportUtils.ts). window.addEventListener('message')
  // recebe mensagem de QUALQUER origem por padrao - o check de
  // event.source === iframeRef.current.contentWindow garante que a
  // mensagem veio especificamente do nosso proprio iframe, nao de outra
  // aba/origem arbitraria.
  useEffect(() => {
    if (Platform.OS !== "web" || !onProgressEvent) return;

    function handleMessage(event: MessageEvent) {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const raw = typeof event.data === "string" ? event.data : "";
      const parsed = parseDeckProgressMessage(raw);
      if (parsed) onProgressEvent!(parsed);
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onProgressEvent]);

  if (Platform.OS === "web") {
    return html ? (
      <iframe
        title={title ?? "Visualizador"}
        srcDoc={html}
        style={{ ...webFrameStyle, height, backgroundColor: palette.surface }}
        allowFullScreen
      />
    ) : uri ? (
      <iframe
        ref={iframeRef}
        title={title ?? "Visualizador"}
        src={uri}
        style={{ ...webFrameStyle, height, backgroundColor: palette.surface }}
        allowFullScreen
      />
    ) : null;
  }
```

No branch nativo, localizar o componente `<Comp ...>` (dentro de `if (WebView) { ... }`) e adicionar a prop `onMessage`:

```typescript
        <Comp
          originWhitelist={["*"]}
          source={html ? { html, baseUrl: uri ?? undefined } : { uri: uri ?? "" }}
          style={[styles.webView, { backgroundColor: palette.surface }]}
          containerStyle={[styles.webView, { backgroundColor: palette.surface }]}
          javaScriptEnabled
          domStorageEnabled
```

por:

```typescript
        <Comp
          originWhitelist={["*"]}
          source={html ? { html, baseUrl: uri ?? undefined } : { uri: uri ?? "" }}
          style={[styles.webView, { backgroundColor: palette.surface }]}
          containerStyle={[styles.webView, { backgroundColor: palette.surface }]}
          onMessage={
            onProgressEvent
              ? (event: any) => {
                  const parsed = parseDeckProgressMessage(event?.nativeEvent?.data ?? "");
                  if (parsed) onProgressEvent(parsed);
                }
              : undefined
          }
          javaScriptEnabled
          domStorageEnabled
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit 2>&1 | grep -i "WebContentFrame"`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/WebContentFrame.tsx
git commit -m "feat(mobile): implementa ponte postMessage deck-app em WebContentFrame (nativo e web)"
```

---

### Task 4 (TrailUp/mobile): repassar por `DocumentBlock.tsx` e `ContentRenderer.tsx`

**Files:**
- Modify: `mobile/src/components/DocumentBlock.tsx` (Props, linha ~37-41; as duas chamadas de `<WebContentFrame>`, linhas ~1378 e ~1447)
- Modify: `mobile/src/components/ContentRenderer.tsx` (Props, linha ~34-39; assinatura da função, linha ~173; bloco de render do `embed`, linhas ~287-301)

- [ ] **Step 1: `DocumentBlock.tsx` — Props e import**

```typescript
type Props = {
  tipo: "pdf" | "documento" | "apresentacao" | "embed";
  payload: any;
  WebView?: React.ComponentType<any> | null;
  onDeckProgressEvent?: (event: DeckProgressEvent) => void;
};
```

Adicionar o import de `DeckProgressEvent` (tipo) junto aos demais imports de `@/utils/...`:

```typescript
import type { DeckProgressEvent } from "@/utils/deckProgressMessage";
```

Atualizar a assinatura do componente (linha ~680):

```typescript
export function DocumentBlock({ tipo, payload, WebView, onDeckProgressEvent }: Props) {
```

- [ ] **Step 2: `DocumentBlock.tsx` — repassar nas duas chamadas de `WebContentFrame`**

Primeira (linha ~1378):

```typescript
          <WebContentFrame
            key={frameKey}
            title={viewer?.title}
            html={viewer?.html}
            uri={viewer?.uri}
            height={viewer?.height ?? getViewerHeight(tipo, displayMode, false, windowHeight, windowWidth)}
            scrollEnabled={frameScrollEnabled}
            palette={palette}
            WebView={WebView}
            onProgressEvent={onDeckProgressEvent}
          />
```

Segunda (linha ~1447):

```typescript
              <WebContentFrame
                key={fullscreenFrameKey}
                title={fullscreenViewer.title}
                html={fullscreenViewer.html}
                uri={fullscreenViewer.uri}
                height={fullscreenViewer.height}
                scrollEnabled={frameScrollEnabled}
                palette={palette}
                WebView={WebView}
                onProgressEvent={onDeckProgressEvent}
              />
```

- [ ] **Step 3: `ContentRenderer.tsx` — Props, import e assinatura**

```typescript
type Props = {
  blocks: ContentBlock[];
  WebView?: React.ComponentType<any> | null;
  topicoId?: number | null;
  enableItemIA?: boolean;
  onDeckProgressEvent?: (event: DeckProgressEvent) => void;
};
```

Import (junto aos demais):

```typescript
import type { DeckProgressEvent } from "@/utils/deckProgressMessage";
```

Assinatura da função (linha ~173):

```typescript
export function ContentRenderer({ blocks, WebView, onDeckProgressEvent }: Props) {
```

- [ ] **Step 4: `ContentRenderer.tsx` — repassar no bloco `embed`**

Localizar (linhas ~287-301):

```typescript
        if (
          block.tipo === "documento" ||
          block.tipo === "apresentacao" ||
          block.tipo === "embed"
        ) {
          return (
            <View key={block.id}>
              <DocumentBlock
                tipo={block.tipo}
                payload={block.payload}
                WebView={resolvedWebView}
              />
            </View>
          );
        }
```

Substituir por:

```typescript
        if (
          block.tipo === "documento" ||
          block.tipo === "apresentacao" ||
          block.tipo === "embed"
        ) {
          return (
            <View key={block.id}>
              <DocumentBlock
                tipo={block.tipo}
                payload={block.payload}
                WebView={resolvedWebView}
                onDeckProgressEvent={onDeckProgressEvent}
              />
            </View>
          );
        }
```

- [ ] **Step 5: Typecheck**

Run: `cd mobile && npx tsc --noEmit 2>&1 | grep -i "DocumentBlock\|ContentRenderer"`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/components/DocumentBlock.tsx mobile/src/components/ContentRenderer.tsx
git commit -m "feat(mobile): propaga onDeckProgressEvent por DocumentBlock e ContentRenderer"
```

---

### Task 5 (TrailUp/mobile): conectar em `app/(tabs)/trilha/[id].tsx`

**Files:**
- Modify: `mobile/src/app/(tabs)/trilha/[id].tsx` (import, linha ~1; novo `useCallback`, perto de outros handlers; chamada de `<ContentRenderer>`, linha ~1556-1560)

- [ ] **Step 1: Import**

Junto aos demais imports de `@/utils/...`:

```typescript
import type { DeckProgressEvent } from "@/utils/deckProgressMessage";
```

- [ ] **Step 2: Novo `useCallback`**

Definir próximo aos outros handlers do componente `TrilhaConteudoScreen` (após a desestruturação de `useTrilha()`, que já inclui `salvarProgressoItemPersonalizado` na linha ~152, e onde `topicoId` já estiver calculado/disponível — mesmo local de onde `topicoId` é usado na chamada de `<ContentRenderer>` hoje):

```typescript
  const handleDeckProgressEvent = useCallback(
    (event: DeckProgressEvent) => {
      if (!topicoId) return;
      void salvarProgressoItemPersonalizado({
        topicoId,
        itemKey: event.itemKey,
        itemKind: "activity",
        itemTitle: "Interação do slide",
        status: "concluido",
        percentualConcluido: 100,
        pontuacaoObtida: event.pontuacaoObtida,
        pontuacaoMaxima: event.pontuacaoMaxima,
      });
    },
    [topicoId, salvarProgressoItemPersonalizado]
  );
```

(ajustar o nome exato da variável `topicoId` conforme aparece nesse ponto do arquivo — já é usada na prop `topicoId={topicoId}` da chamada de `ContentRenderer` logo abaixo, usar a mesma variável.)

- [ ] **Step 3: Passar pro `ContentRenderer`**

Localizar (linha ~1556-1560):

```typescript
                <ContentRenderer
                  blocks={conteudoBlocks}
                  WebView={WebView}
                  topicoId={topicoId}
                />
```

Substituir por:

```typescript
                <ContentRenderer
                  blocks={conteudoBlocks}
                  WebView={WebView}
                  topicoId={topicoId}
                  onDeckProgressEvent={handleDeckProgressEvent}
                />
```

- [ ] **Step 4: Typecheck**

Run: `cd mobile && npx tsc --noEmit 2>&1 | grep -i "trilha/\[id\]"`
Expected: sem erros novos.

- [ ] **Step 5: Commit**

```bash
git add "mobile/src/app/(tabs)/trilha/[id].tsx"
git commit -m "feat(mobile): grava XP de quiz do deck em personalizacao_item_progresso"
```

---

### Task 6: verificação manual ponta a ponta (obrigatória, não é teste automatizado)

- [ ] **Step 1**: Rodar o app mobile (web ou nativo) com um tópico que tenha apresentação gerada pelo BrainHexPDF, abrir o deck, responder um quiz corretamente.
- [ ] **Step 2**: Confirmar no Supabase (`personalizacao_item_progresso`) que uma linha com `item_key` contendo `slide:...:quiz` foi criada/atualizada com `pontuacao_obtida: 150`.
- [ ] **Step 3**: Reabrir o mesmo deck e responder o mesmo quiz de novo (já estará marcado como respondido no `localStorage` do deck — não deve reenviar o evento; se reenviar, confirmar que o merge por máximo não duplica a pontuação).
- [ ] **Step 4**: Registrar no PR se o XP apareceu automaticamente no `GameHeader`/`MetaXp`/`ProgressaoPontos` ou não (achado documentado na spec como incerteza em aberto) — isso não bloqueia a entrega desta fase, mas informa o escopo de D1b/D4.

---

### Encerramento

Dois PRs separados (repositórios distintos), mesmo padrão do sub-projeto D2 (BrainHexPDF#12/TrailUp#92, TrailUp#93): **superpowers:finishing-a-development-branch** em cada worktree.
