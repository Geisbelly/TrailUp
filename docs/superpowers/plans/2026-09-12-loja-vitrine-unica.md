# Loja Vitrine Única Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Social store modal into one readable product showcase with custom SVG icons and a complete purchase flow.

**Architecture:** Keep the existing Supabase service as the data boundary, add a small presentational SVG icon component, and make the modal render one list from the real catalog. Purchase responses will be normalized in the service so the UI can distinguish RPC/business failures from transport failures and refresh the snapshot after success.

**Tech Stack:** React Native, Expo, TypeScript, `react-native-svg`, Supabase RPC, Node test runner.

---

### Task 1: Define and test purchase response handling

**Files:**
- Modify: `mobile/src/services/loja/lojaService.ts`
- Test: `mobile/src/services/loja/storeTheme.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests for a helper that accepts the JSON returned by `loja_comprar`: `{ ok: true }` returns success, while `{ ok: false, erro: "saldo_insuficiente" }` becomes the Portuguese message `Saldo insuficiente para este item.` and unknown failures become `Não foi possível concluir a compra.`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run `cd mobile && node --import tsx --test src/services/loja/storeTheme.test.ts`.
Expected: FAIL because the purchase-result helper does not exist.

- [ ] **Step 3: Implement the minimal helper and RPC guard**

Export a pure `purchaseErrorMessage(result: unknown): string | null` helper. Return `null` for `{ ok: true }`, map `saldo_insuficiente`, `item_indisponivel`, `sem_sessao` and `idempotencia` to readable messages, and use the generic message for all other failures. Update `comprarItem` to throw an error carrying that message whenever the RPC returns `{ ok: false }`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run `cd mobile && node --import tsx --test src/services/loja/storeTheme.test.ts`.
Expected: PASS.

- [ ] **Step 5: Commit**

Run `git add mobile/src/services/loja/lojaService.ts mobile/src/services/loja/storeTheme.test.ts && git commit -m "feat: normalize store purchase results"`.

### Task 2: Add custom SVG product icons

**Files:**
- Create: `mobile/src/components/loja/StoreItemIcon.tsx`
- Test: `mobile/src/services/loja/storeTheme.test.ts`

- [ ] **Step 1: Write the failing test**

Add a pure exported `storeIconKind(effect: string | null): "deadline" | "retry" | "hint" | "format"` function and test that the four catalog effects map to the four named kinds and unknown effects map to `hint`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run `cd mobile && node --import tsx --test src/services/loja/storeTheme.test.ts`.
Expected: FAIL because `storeIconKind` is not defined.

- [ ] **Step 3: Implement the SVG component**

Create `StoreItemIcon` using `Svg`, `Path`, `Rect`, `Circle`, `Line`, and `Polygon` from `react-native-svg`. Draw four distinct line-and-fill icons: a calendar with a plus for deadline, a circular return arrow with a star for retry, a lamp and sparkle for hint, and three connected panels with arrows for format. Accept `{ effect, color, size }`, use the pure mapping helper, and provide a stable `viewBox="0 0 48 48"`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run `cd mobile && node --import tsx --test src/services/loja/storeTheme.test.ts`.
Expected: PASS.

- [ ] **Step 5: Commit**

Run `git add mobile/src/components/loja/StoreItemIcon.tsx mobile/src/services/loja/storeTheme.test.ts && git commit -m "feat: add custom svg store icons"`.

### Task 3: Replace the tabbed modal with one readable showcase

**Files:**
- Modify: `mobile/src/components/loja/StoreModal.tsx`

- [ ] **Step 1: Define the UI contract against the existing component**

Use the existing pure service tests for the data contract and inspect the modal source before editing: the final component must contain only the `ITENS` heading, must not render `COMBOS`, `BÔNUS` or `PRESENTES`, and must render product labels from the supplied snapshot. This repository has no React Native render-test dependency, so the executable UI verification is TypeScript plus the manual Expo screen check in Task 4.

- [ ] **Step 2: Record the current UI contract mismatch**

Run `rg -n "COMBOS|BÔNUS|PRESENTES|sections|section" mobile/src/components/loja/StoreModal.tsx`. Expected: the old section labels and section state are found, establishing the pre-change mismatch.

- [ ] **Step 3: Implement the single-vitrine layout**

Remove the `sections` array, section state, vertical tab rail and section parameter. Load the catalog once per modal open with `carregarLoja(alunoId, classeId, profileName)`. Render a compact header with title, balance and close button, then a scrollable list of cards. Each card must use `StoreItemIcon`, a high-contrast title/description, availability text, price pill and a full-width action button. Use `palette.text`, `palette.textMuted`, `palette.surfaceElevated`, `palette.border` and the profile accent; avoid rotated text, hard-coded low-contrast gray text and icon-font glyphs.

- [ ] **Step 4: Wire readable purchase states**

Show `Comprando...` and disable the card action while buying. On a successful response, reload the snapshot and show a short inline confirmation `Item adquirido.`. On an error, show the error message thrown by `comprarItem`, including the specific business error. Keep acquired and unavailable items visibly disabled.

- [ ] **Step 5: Run TypeScript and lint**

Run `cd mobile && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && npm run lint`.
Expected: TypeScript passes; lint has no new errors.

- [ ] **Step 6: Commit**

Run `git add mobile/src/components/loja/StoreModal.tsx && git commit -m "feat: simplify store into readable showcase"`.

### Task 4: Verify the complete mobile store flow

**Files:**
- No source changes expected.

- [ ] **Step 1: Run focused tests**

Run `cd mobile && node --import tsx --test src/services/loja/storeTheme.test.ts`.
Expected: all store tests pass.

- [ ] **Step 2: Run the full mobile typecheck and lint**

Run `cd mobile && ./node_modules/.bin/tsc --noEmit -p tsconfig.json && npm run lint`.
Expected: no TypeScript errors and no new lint errors.

- [ ] **Step 3: Verify the database contract**

Confirm the deployed environment exposes `loja_catalogo(bigint)`, `loja_saldo()` and `loja_comprar(text,bigint,text,...)`. If any RPC is absent, report the migration requirement instead of masking the error in the UI.

- [ ] **Step 4: Commit verification notes if needed**

Only commit if a source or test adjustment was required; do not include `graphify-out` generated files.

## Self-review

- Single-tab requirement is covered in Task 3.
- Four unique SVG icons are covered in Task 2.
- Readability and responsive card layout are covered in Task 3.
- Real catalog, saldo, purchase RPC, business errors and refresh are covered in Tasks 1 and 3.
- No new products or pricing rules are introduced.
- The only implementation dependency is the existing `react-native-svg` package.
