# Métricas — Correções de Cálculo + Novas Seções de UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o cálculo de `tempoTotalMin` que ignora atividades, adicionar os campos `danoTotal` e `melhorTempoMin` ao ViewModel, passar `battleState` do `IAContext` para o ViewModel e exibir três novas seções no dashboard de métricas (Tempo de estudo, Boss, Melhor tempo), reorganizando a ordem das seções existentes.

**Architecture:** Quatro mudanças independentes sequenciais: (1) fix no cálculo de tempo em `classeMetrics.ts`, (2) extensão do ViewModel em `profileMetricsViewModel.ts`, (3) injeção do `battleState` em `perfil/index.tsx`, (4) três novas seções de UI + reorganização em `ProfileMetricsViews.tsx`. Cada mudança é autocontida — tasks 1-3 acumulam para a task 4.

**Tech Stack:** React Native, TypeScript, `@expo/vector-icons` (MaterialCommunityIcons)

---

### Task 1: Corrigir `tempoTotalMin` em `classeMetrics.ts`

**Files:**
- Modify: `src/utils/classeMetrics.ts`

- [ ] **Step 1: Localizar o bug**

Em `src/utils/classeMetrics.ts`, linha 148, o valor atual é:

```ts
const tempoTotalMin = roundMetric(tempoTopicoMin);
```

`tempoAtividadeMin` é calculado na linha 144 mas descartado.

- [ ] **Step 2: Aplicar a correção**

Substituir a linha 148 por:

```ts
const tempoTotalMin = roundMetric(tempoTopicoMin + tempoAtividadeMin);
```

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/utils/classeMetrics.ts
git commit -m "fix(metrics): include activity time in tempoTotalMin calculation"
```

---

### Task 2: Estender `ProfileMetricsViewModel` e `buildProfileMetricsViewModel`

**Files:**
- Modify: `src/components/perfil/profileMetricsViewModel.ts`

- [ ] **Step 1: Importar `IABattleRuntimeState`**

No topo de `src/components/perfil/profileMetricsViewModel.ts`, adicionar o import:

```ts
import { IABattleRuntimeState } from "@/interfaces/personalizacao/IAContracts";
```

- [ ] **Step 2: Adicionar os novos campos ao tipo `ProfileMetricsViewModel`**

Localizar o tipo `ProfileMetricsViewModel` (linha ~17) e adicionar após `hasSessionMetrics`:

```ts
  danoTotal: number | null;
  melhorTempoMin: number | null;
```

- [ ] **Step 3: Adicionar `battleState` ao tipo `BuildMetricsViewModelParams`**

Localizar o tipo `BuildMetricsViewModelParams` (linha ~240) e adicionar:

```ts
  battleState?: IABattleRuntimeState | null;
```

- [ ] **Step 4: Receber e usar `battleState` na função `buildProfileMetricsViewModel`**

Na assinatura da função (linha ~252), adicionar `battleState` à desestruturação:

```ts
export function buildProfileMetricsViewModel({
  classeAtual,
  conquistas,
  eventos,
  posicoesDoAluno,
  perfis,
  lastAnalysis,
  lastBatchTimeMetrics,
  cameraOptIn,
  cameraPermission,
  battleState,
}: BuildMetricsViewModelParams): ProfileMetricsViewModel {
```

- [ ] **Step 5: Calcular `danoTotal` e `melhorTempoMin`**

Adicionar logo antes do `return` da função (após a linha com `const analysisView = buildAnalysisView(...)`):

```ts
  const danoTotal =
    battleState?.totalDamage != null ? Math.round(battleState.totalDamage) : null;

  const temposAtividades = (classeAtual?.topicos ?? [])
    .flatMap((t) => (t as { atividades?: { status?: string | null; percentual_concluido?: number | null; tempo_gasto_min?: number | null }[] }).atividades ?? [])
    .filter((a) => {
      const concluida =
        String(a.status ?? "").toLowerCase().includes("concl") ||
        Number(a.percentual_concluido ?? 0) >= 100;
      return concluida && Number(a.tempo_gasto_min ?? 0) > 0;
    })
    .map((a) => Number(a.tempo_gasto_min));

  const melhorTempoMin = temposAtividades.length > 0 ? Math.min(...temposAtividades) : null;
```

- [ ] **Step 6: Incluir os novos campos no objeto retornado**

No `return { ... }` da função, adicionar após `hasSessionMetrics`:

```ts
    danoTotal,
    melhorTempoMin,
```

- [ ] **Step 7: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 8: Commit**

```bash
git add src/components/perfil/profileMetricsViewModel.ts
git commit -m "feat(metrics): add danoTotal and melhorTempoMin to ProfileMetricsViewModel"
```

---

### Task 3: Injetar `battleState` em `PerfilHome`

**Files:**
- Modify: `src/app/(tabs)/perfil/index.tsx`

- [ ] **Step 1: Importar `useIA`**

No topo de `src/app/(tabs)/perfil/index.tsx`, adicionar o import:

```ts
import { useIA } from "@/context/IAContext";
```

- [ ] **Step 2: Obter `getBattleState` do hook**

Dentro do componente `PerfilHome`, após as outras chamadas de hooks (linha ~50), adicionar:

```ts
  const { getBattleState } = useIA();
```

- [ ] **Step 3: Calcular `battleState` antes do `useMemo`**

Logo após a linha anterior, adicionar:

```ts
  const battleState = getBattleState({ scope: "session" });
```

- [ ] **Step 4: Passar `battleState` para `buildProfileMetricsViewModel`**

No `useMemo` que chama `buildProfileMetricsViewModel` (linha ~100), adicionar `battleState` tanto nos argumentos quanto nas dependências:

```ts
  const metricsViewModel = useMemo(
    () =>
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
      }),
    [
      battleState,
      cameraOptIn,
      cameraPermission,
      classeAtual,
      conquistas,
      eventos,
      lastAnalysis,
      lastBatchTimeMetrics,
      posicoesDoAluno,
      usuario?.perfis,
    ],
  );
```

- [ ] **Step 5: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/app/(tabs)/perfil/index.tsx
git commit -m "feat(metrics): pass battleState from IAContext to metricsViewModel"
```

---

### Task 4: Novas seções de UI e reorganização do layout

**Files:**
- Modify: `src/components/perfil/ProfileMetricsViews.tsx`

Contexto: há 5 funções de dashboard (`ArenaDashboard`, `GoalsDashboard`, `MysteryDashboard`, `AnalyticsDashboard`, `SquadDashboard`). Cada uma renderiza as seções na sua própria ordem. Todas devem receber as novas seções na mesma posição relativa: após o hero card, antes das seções existentes (tópicos, conquistas, análise IA, presença etc.).

- [ ] **Step 1: Adicionar `formatSeconds` se não existir**

Verificar se a função `formatSeconds` já existe no arquivo. Se não existir, adicionar após `formatMinutes` (linha ~47):

```ts
function formatSeconds(totalSec?: number | null) {
  const sec = Math.max(0, Math.round(Number(totalSec ?? 0)));
  if (sec === 0) return "—";
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return min > 0 ? `${min}min ${rest}s` : `${rest}s`;
}
```

- [ ] **Step 2: Adicionar `formatMinutesTimer`**

Adicionar após a função acima:

```ts
function formatMinutesTimer(totalMin?: number | null) {
  if (totalMin == null) return "—";
  const totalSec = Math.round(totalMin * 60);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}min ${sec}s`;
}
```

- [ ] **Step 3: Criar o componente `TempoEstudoSection`**

Adicionar antes das funções de dashboard (antes de `ArenaDashboard`):

```tsx
function TempoEstudoSection({ vm, palette, accent }: { vm: ProfileMetricsViewModel; palette: ThemePalette; accent: string }) {
  return (
    <SurfaceCard palette={palette}>
      <SectionTitle title="Tempo de estudo" subtitle="Tempo médio ativo por tipo de conteúdo nesta sessão." icon="timer-outline" palette={palette} />
      <View style={s.statRow}>
        <StatTile
          icon="timer-outline"
          label="Em tópicos"
          value={formatSeconds(vm.tempoTopico)}
          palette={palette}
          accent={accent}
        />
        <StatTile
          icon="book-open-outline"
          label="Em conteúdos"
          value={formatSeconds(vm.tempoConteudo)}
          palette={palette}
          accent={accent}
        />
        <StatTile
          icon="pencil-outline"
          label="Em atividades"
          value={formatSeconds(vm.tempoAtividade)}
          palette={palette}
          accent={accent}
        />
      </View>
    </SurfaceCard>
  );
}
```

- [ ] **Step 4: Criar o componente `BossSection`**

Adicionar logo após `TempoEstudoSection`:

```tsx
function BossSection({ vm, palette, accent }: { vm: ProfileMetricsViewModel; palette: ThemePalette; accent: string }) {
  if (vm.danoTotal === null) return null;
  return (
    <SurfaceCard palette={palette}>
      <SectionTitle title="Boss" icon="sword-cross" palette={palette} />
      <View style={s.statRow}>
        <StatTile
          icon="sword-cross"
          label="Dano causado ao boss"
          value={String(vm.danoTotal)}
          palette={palette}
          accent={accent}
        />
      </View>
    </SurfaceCard>
  );
}
```

- [ ] **Step 5: Criar o componente `MelhorTempoSection`**

Adicionar logo após `BossSection`:

```tsx
function MelhorTempoSection({ vm, palette, accent }: { vm: ProfileMetricsViewModel; palette: ThemePalette; accent: string }) {
  if (vm.melhorTempoMin === null) return null;
  return (
    <SurfaceCard palette={palette}>
      <SectionTitle title="Melhor tempo" icon="timer-sand" palette={palette} />
      <View style={s.statRow}>
        <StatTile
          icon="timer-sand"
          label="Melhor tempo em atividade"
          value={formatMinutesTimer(vm.melhorTempoMin)}
          palette={palette}
          accent={accent}
        />
      </View>
    </SurfaceCard>
  );
}
```

- [ ] **Step 6: Inserir as novas seções em todos os dashboards**

Em cada uma das 5 funções de dashboard (`ArenaDashboard`, `GoalsDashboard`, `MysteryDashboard`, `AnalyticsDashboard`, `SquadDashboard`), inserir os três componentes logo após o hero card (o primeiro `<SurfaceCard>` de cada dashboard) e antes das seções de tópicos/conquistas/análise.

A ordem em cada dashboard deve ser:
1. Hero card (existente, inalterado)
2. `<TempoEstudoSection vm={vm} palette={palette} accent={accent} />`
3. `<BossSection vm={vm} palette={palette} accent={accent} />`
4. `<MelhorTempoSection vm={vm} palette={palette} accent={accent} />`
5. Demais seções existentes (tópicos, conquistas, análise IA, presença, etc.)

- [ ] **Step 7: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 8: Commit**

```bash
git add src/components/perfil/ProfileMetricsViews.tsx
git commit -m "feat(metrics): add study time, boss damage, and best time sections to all dashboards"
```
