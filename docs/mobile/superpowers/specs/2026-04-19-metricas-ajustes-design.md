# Design: Ajustes de Métricas — Correções de Cálculo + Novas Seções de UI

**Data:** 2026-04-19
**Branch:** base-teste
**Escopo:** Corrigir cálculo de tempo total, adicionar métricas de tempo/boss/timer, reorganizar layout

---

## 1. Correção de Cálculo

### Bug: `tempoTotalMin` ignora atividades

**Arquivo:** `src/utils/classeMetrics.ts`

Na função `buildClasseAcademicMetrics`, a linha:
```tsx
const tempoTotalMin = roundMetric(tempoTopicoMin);
```
ignora `tempoAtividadeMin`, que é calculado mas descartado. Corrigir para:
```tsx
const tempoTotalMin = roundMetric(tempoTopicoMin + tempoAtividadeMin);
```

---

## 2. Extensão do ViewModel

### Novos campos em `ProfileMetricsViewModel`

**Arquivo:** `src/components/perfil/profileMetricsViewModel.ts`

Adicionar ao tipo `ProfileMetricsViewModel`:
```tsx
danoTotal: number | null;       // null se battle_mode não ativo
melhorTempoMin: number | null;  // null se nenhuma atividade com tempo registrado
```

### Nova entrada em `BuildMetricsViewModelParams`

```tsx
battleState?: IABattleRuntimeState | null;
```

### Cálculo de `danoTotal`

```tsx
const danoTotal = battleState?.totalDamage != null
  ? Math.round(battleState.totalDamage)
  : null;
```

### Cálculo de `melhorTempoMin`

A partir das atividades de `classeAtual` que foram concluídas e têm `tempo_gasto_min > 0`:
```tsx
const temposAtividades = (classeAtual?.topicos ?? [])
  .flatMap((t) => t.atividades)
  .filter((a) => {
    const concluida = String(a.status ?? '').toLowerCase().includes('concl') ||
      Number(a.percentual_concluido ?? 0) >= 100;
    return concluida && Number(a.tempo_gasto_min ?? 0) > 0;
  })
  .map((a) => Number(a.tempo_gasto_min));

const melhorTempoMin = temposAtividades.length > 0
  ? Math.min(...temposAtividades)
  : null;
```

---

## 3. Atualização do PerfilHome

**Arquivo:** `src/app/(tabs)/perfil/index.tsx`

Adicionar `useIA()` ao componente:
```tsx
const { getBattleState } = useIA();
```

Obter o estado de batalha antes de passar ao ViewModel:
```tsx
const battleState = getBattleState({ scope: "session" });
```

Passar `battleState` para `buildProfileMetricsViewModel`:
```tsx
buildProfileMetricsViewModel({
  classeAtual,
  conquistas,
  eventos,
  posicoesDoAluno,
  perfis: usuario?.perfis ?? [],
  lastAnalysis,
  lastBatchTimeMetrics,
  cameraOptIn,
  cameraPermission,
  battleState,
})
```

---

## 4. Novas Seções de UI

**Arquivo:** `src/components/perfil/ProfileMetricsViews.tsx`

### 4.1 Seção "Tempo de estudo"

Sempre visível. Exibe 3 cards horizontais com os tempos médios por tipo (da sessão batch):

| Card | Campo do ViewModel | Ícone |
|------|--------------------|-------|
| Tempo em tópicos | `tempoTopico` (segundos) | `timer-outline` |
| Tempo em conteúdos | `tempoConteudo` (segundos) | `book-open-outline` |
| Tempo em atividades | `tempoAtividade` (segundos) | `pencil-outline` |

Formatação: segundos → `Xmin Ys` (ex: `2min 30s`). Se zero, exibir `—`.

### 4.2 Seção "Boss" (condicional)

Visível apenas quando `vm.danoTotal !== null`.

Card com:
- Ícone `sword-cross`
- Label "Dano causado ao boss"
- Valor: `vm.danoTotal` como número inteiro (ex: `247`)

### 4.3 Seção "Melhor tempo" (condicional)

Visível apenas quando `vm.melhorTempoMin !== null`.

Card com:
- Ícone `timer-sand`
- Label "Melhor tempo em atividade"
- Valor: `vm.melhorTempoMin` formatado como `Xmin Ys`

---

## 5. Reorganização do Layout

Ordem das seções no dashboard:

1. **Hero card** — progresso, acertos, tempo total (existente, mantido)
2. **Tempo de estudo** — nova seção 4.1
3. **Boss** — nova seção 4.2 (condicional)
4. **Melhor tempo** — nova seção 4.3 (condicional)
5. **Demais seções existentes** — tópicos, conquistas, análise IA, presença, etc. (mantidas na ordem atual)

---

## 6. Arquivos Afetados

| Arquivo | Mudança |
|---------|---------|
| `src/utils/classeMetrics.ts` | Fix `tempoTotalMin` |
| `src/components/perfil/profileMetricsViewModel.ts` | Novos campos + novo param |
| `src/app/(tabs)/perfil/index.tsx` | `useIA()` + `battleState` |
| `src/components/perfil/ProfileMetricsViews.tsx` | 3 novas seções + reorganização |
