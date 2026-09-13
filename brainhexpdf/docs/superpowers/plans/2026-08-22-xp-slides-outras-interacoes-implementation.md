# XP de slides — demais interações (D1b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** As 5 interações restantes do deck (boss battle, checklist, takeaway, interação livre, decisão) reportam XP pro app hospedeiro, reaproveitando a ponte `postMessage` já validada no D1a.

**Architecture:** Mesmo `reportProgressToHost` já existente (D1a, `src/utils/deckExportUtils.ts`) — só adiciona a chamada dentro do bloco condicional de "primeira vez que ganha XP" que cada função já tem. Sem mudança nenhuma no TrailUp/mobile (o handler já é genérico). Ver spec em `docs/superpowers/specs/2026-08-22-xp-slides-outras-interacoes-design.md`.

**Tech Stack:** TypeScript, `node:test`/`node:assert/strict`.

**Worktree:** `.worktrees/xp-slides-outras-interacoes` (branch `feature/xp-slides-outras-interacoes`, a partir de `origin/main`, baseline 78/78 testes).

---

### Task 1: `attackBoss`

**Files:** Modify `src/utils/deckExportUtils.ts`; Test `src/utils/deckExportUtils.test.ts`

- [ ] **Step 1**: Adicionar teste (após o último teste do arquivo):

```typescript
test('attackBoss reporta XP pro host so no golpe final (bossHp chega a 0)', () => {
  const html = generateInteractiveHtml(minimalDeck);
  assert.match(html, /if \(currentBossHp === 0\) \{[\s\S]*?reportProgressToHost\('slide:' \+ currentIndex \+ ':boss', 500, 500\);[\s\S]*?\}/);
});
```

- [ ] **Step 2**: Rodar (`npm test 2>&1 | grep -A 8 "attackBoss reporta"`), confirmar FAIL.
- [ ] **Step 3**: Em `attackBoss`, localizar:

```typescript
        if (currentBossHp === 0) {
          playAudio('victory');
          totalXp += 500;
          updateXpDisplay();
```

Substituir por:

```typescript
        if (currentBossHp === 0) {
          playAudio('victory');
          totalXp += 500;
          updateXpDisplay();
          reportProgressToHost('slide:' + currentIndex + ':boss', 500, 500);
```

- [ ] **Step 4**: Rodar, confirmar PASS.
- [ ] **Step 5**: Commit:

```bash
git add src/utils/deckExportUtils.ts src/utils/deckExportUtils.test.ts
git commit -m "feat: reporta XP de boss battle pro host (D1b)"
```

---

### Task 2: `toggleChecklistItem`

**Files:** Modify `src/utils/deckExportUtils.ts`; Test `src/utils/deckExportUtils.test.ts`

- [ ] **Step 1**: Adicionar teste:

```typescript
test('toggleChecklistItem reporta XP pro host so ao marcar, nunca ao desmarcar', () => {
  const html = generateInteractiveHtml(minimalDeck);
  // "marcar" (ganha XP): totalXp += ... e imediatamente seguido do report
  assert.match(html, /totalXp \+= \(xp \|\| 50\);\s*\n\s*reportProgressToHost\('slide:' \+ currentIndex \+ ':checklist:' \+ realItemId, xp \|\| 50, xp \|\| 50\);/);
  // "desmarcar" (perde XP): a linha que subtrai NUNCA e seguida do report
  assert.doesNotMatch(html, /totalXp = Math\.max\(0, totalXp - \(xp \|\| 50\)\);\s*\n\s*reportProgressToHost/);
});
```

- [ ] **Step 2**: Rodar, confirmar FAIL.
- [ ] **Step 3**: Em `toggleChecklistItem`, localizar:

```typescript
        el.classList.remove('border-stone-800', 'bg-stone-900/70');
        el.classList.add('border-emerald-500', 'bg-emerald-950/60', 'ring-1', 'ring-emerald-400', 'pop-success');
        if (statusBox) {
          statusBox.classList.remove('bg-stone-800', 'text-stone-400');
          statusBox.classList.add('bg-emerald-500', 'text-black');
        }
      }
      updateXpDisplay();
    }
```

(esse trecho é o final do bloco `else` de `toggleChecklistItem` — atenção: `toggleTakeawayMastery`, na Task 3, tem uma estrutura MUITO parecida com cores diferentes (`amber` em vez de `emerald`) — usar contexto suficiente, ex. incluir a linha `spawnFloatingXp('+' + (xp || 50) + ' XP` acima, pra não confundir com a Task 3.)

Substituir por (adicionando a chamada logo após `totalXp += (xp || 50);`, que fica um pouco acima deste trecho — ver o método completo já lido durante o brainstorming, linha ~1764-1780):

```typescript
      } else {
        el.setAttribute('data-completed', 'true');
        savedData.checklist[realItemId] = true;
        totalXp += (xp || 50);
        reportProgressToHost('slide:' + currentIndex + ':checklist:' + realItemId, xp || 50, xp || 50);
        playAudio('checklist');
```

(o restante do bloco `else` fica igual)

- [ ] **Step 4**: Rodar, confirmar PASS.
- [ ] **Step 5**: Commit:

```bash
git add src/utils/deckExportUtils.ts src/utils/deckExportUtils.test.ts
git commit -m "feat: reporta XP de checklist pro host, so ao marcar (D1b)"
```

---

### Task 3: `toggleTakeawayMastery`

**Files:** Modify `src/utils/deckExportUtils.ts`; Test `src/utils/deckExportUtils.test.ts`

- [ ] **Step 1**: Adicionar teste:

```typescript
test('toggleTakeawayMastery reporta XP pro host so ao dominar, nunca ao desfazer', () => {
  const html = generateInteractiveHtml(minimalDeck);
  assert.match(html, /reportProgressToHost\('slide:' \+ currentIndex \+ ':takeaway:' \+ realKeyId, xp \|\| 75, xp \|\| 75\);/);
});
```

- [ ] **Step 2**: Rodar, confirmar FAIL.
- [ ] **Step 3**: Em `toggleTakeawayMastery`, localizar:

```typescript
      } else {
        el.setAttribute('data-mastered', 'true');
        savedData.takeaways[realKeyId] = true;
        totalXp += (xp || 75);
        playAudio('correct');
```

Substituir por:

```typescript
      } else {
        el.setAttribute('data-mastered', 'true');
        savedData.takeaways[realKeyId] = true;
        totalXp += (xp || 75);
        reportProgressToHost('slide:' + currentIndex + ':takeaway:' + realKeyId, xp || 75, xp || 75);
        playAudio('correct');
```

- [ ] **Step 4**: Rodar, confirmar PASS.
- [ ] **Step 5**: Commit:

```bash
git add src/utils/deckExportUtils.ts src/utils/deckExportUtils.test.ts
git commit -m "feat: reporta XP de dominio de conceito-chave pro host, so ao dominar (D1b)"
```

---

### Task 4: `saveUniqueInteraction`

**Files:** Modify `src/utils/deckExportUtils.ts`; Test `src/utils/deckExportUtils.test.ts`

- [ ] **Step 1**: Adicionar teste:

```typescript
test('saveUniqueInteraction reporta XP pro host so na primeira conclusao', () => {
  const html = generateInteractiveHtml(minimalDeck);
  assert.match(html, /if \(firstCompletion\) \{[\s\S]*?reportProgressToHost\('slide:' \+ slideIndex \+ ':unique', earnedXp, earnedXp\);[\s\S]*?\}/);
});
```

- [ ] **Step 2**: Rodar, confirmar FAIL.
- [ ] **Step 3**: Em `saveUniqueInteraction`, localizar:

```typescript
      if (firstCompletion) {
        const earnedXp = xpReward || 100;
        totalXp += earnedXp;
        playAudio('correct');
```

Substituir por:

```typescript
      if (firstCompletion) {
        const earnedXp = xpReward || 100;
        totalXp += earnedXp;
        reportProgressToHost('slide:' + slideIndex + ':unique', earnedXp, earnedXp);
        playAudio('correct');
```

- [ ] **Step 4**: Rodar, confirmar PASS.
- [ ] **Step 5**: Commit:

```bash
git add src/utils/deckExportUtils.ts src/utils/deckExportUtils.test.ts
git commit -m "feat: reporta XP de interacao livre pro host, so na primeira conclusao (D1b)"
```

---

### Task 5: `selectDecisionPath`

**Files:** Modify `src/utils/deckExportUtils.ts`; Test `src/utils/deckExportUtils.test.ts`

- [ ] **Step 1**: Adicionar teste:

```typescript
test('selectDecisionPath reporta XP pro host so na primeira escolha de cada opcao', () => {
  const html = generateInteractiveHtml(minimalDeck);
  assert.match(html, /if \(!wasAlreadyChosen\) \{\s*\n\s*totalXp \+= \(xpReward \|\| 100\);\s*\n\s*reportProgressToHost\('slide:' \+ currentIndex \+ ':decision:' \+ choiceId, xpReward \|\| 100, xpReward \|\| 100\);/);
});
```

- [ ] **Step 2**: Rodar, confirmar FAIL.
- [ ] **Step 3**: Em `selectDecisionPath`, localizar:

```typescript
      const wasAlreadyChosen = savedData.decisions[currentIndex]?.choiceId === choiceId;
      if (!wasAlreadyChosen) {
        totalXp += (xpReward || 100);
        updateXpDisplay();
      }
```

Substituir por:

```typescript
      const wasAlreadyChosen = savedData.decisions[currentIndex]?.choiceId === choiceId;
      if (!wasAlreadyChosen) {
        totalXp += (xpReward || 100);
        reportProgressToHost('slide:' + currentIndex + ':decision:' + choiceId, xpReward || 100, xpReward || 100);
        updateXpDisplay();
      }
```

- [ ] **Step 4**: Rodar, confirmar PASS.
- [ ] **Step 5**: Commit:

```bash
git add src/utils/deckExportUtils.ts src/utils/deckExportUtils.test.ts
git commit -m "feat: reporta XP de escolha de decisao pro host, por opcao escolhida (D1b)"
```

---

### Task 6: `revealSecretLore`

**Files:** Modify `src/utils/deckExportUtils.ts`; Test `src/utils/deckExportUtils.test.ts`

- [ ] **Step 1**: Adicionar teste:

```typescript
test('revealSecretLore reporta XP pro host so na primeira revelacao', () => {
  const html = generateInteractiveHtml(minimalDeck);
  assert.match(html, /if \(!wasRevealed\) \{\s*\n\s*totalXp \+= 100;\s*\n\s*updateXpDisplay\(\);\s*\n\s*reportProgressToHost\('slide:' \+ currentIndex \+ ':secret', 100, 100\);/);
});
```

- [ ] **Step 2**: Rodar, confirmar FAIL.
- [ ] **Step 3**: Em `revealSecretLore`, localizar:

```typescript
      const wasRevealed = !!savedData.secrets[currentIndex];
      if (!wasRevealed) {
        totalXp += 100;
        updateXpDisplay();
        savedData.secrets[currentIndex] = true;
        persistState();
      }
```

Substituir por:

```typescript
      const wasRevealed = !!savedData.secrets[currentIndex];
      if (!wasRevealed) {
        totalXp += 100;
        updateXpDisplay();
        reportProgressToHost('slide:' + currentIndex + ':secret', 100, 100);
        savedData.secrets[currentIndex] = true;
        persistState();
      }
```

- [ ] **Step 4**: Rodar, confirmar PASS.
- [ ] **Step 5**: Commit:

```bash
git add src/utils/deckExportUtils.ts src/utils/deckExportUtils.test.ts
git commit -m "feat: reporta XP de revelacao secreta pro host, so na primeira revelacao (D1b)"
```

---

### Encerramento

Rodar `npm test` e `npx tsc --noEmit` uma última vez, depois **superpowers:finishing-a-development-branch**. Dado que o usuário autorizou "leve direto pra main" pro D1a (mesmo repositório, mesma natureza de mudança — extensão da mesma ponte já em produção), perguntar se a mesma autorização vale aqui antes de decidir entre push direto ou PR.
