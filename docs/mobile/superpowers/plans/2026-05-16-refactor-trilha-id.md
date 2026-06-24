# Refatoração de `trilha/[id].tsx` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduzir `src/app/(tabs)/trilha/[id].tsx` de 2.853 linhas para ~1.100 linhas extraindo helpers puros, styles e 6 custom hooks, sem alterar comportamento.

**Architecture:** Extração mecânica em camadas. Primeiro helpers stateless (zero risco), depois styles, depois hooks de uma responsabilidade cada, na ordem em que aparecem no componente para preservar a sequência de execução de efeitos React.

**Tech Stack:** React Native 0.81, React 19, TypeScript 5.9 strict, Expo Router 6, path alias `@/*`.

**Validação:** Não há testes automatizados nesta frente (escopo separado). Cada task valida com `npm run lint` + smoke manual no Expo Go (abrir uma trilha, navegar entre blocos, completar atividade, fechar/reabrir e checar retomada).

---

## Estrutura de arquivos resultante

**Criados:**
- `src/utils/trilhaBlocks.ts`
- `src/utils/personalizedFlow.ts`
- `src/app/(tabs)/trilha/[id].styles.ts`
- `src/hooks/trilha/types.ts`
- `src/hooks/trilha/usePersonalizedFlow.ts`
- `src/hooks/trilha/useCheckpointResume.ts`
- `src/hooks/trilha/useStudyTimeTracking.ts`
- `src/hooks/trilha/useTelemetryHandlers.ts`
- `src/hooks/trilha/useTopicoCompletion.ts`
- `src/hooks/trilha/usePersonalizationRefresh.ts`

**Modificado:**
- `src/app/(tabs)/trilha/[id].tsx` (reduz para ~1.100 linhas)

---

## Task 0: Preparação — branch de trabalho

**Files:** nenhum

- [ ] **Step 1: Verificar working tree**

```bash
git status
```

Esperado: branch `base-teste` com o commit do spec (`9b64f2a`) presente. Pode haver 20 arquivos modificados pendentes — eles **NÃO** vão para esta refatoração; o usuário decidirá em separado.

- [ ] **Step 2: Decidir destino dos arquivos pendentes (ação do usuário)**

Stash recomendado (preserva sem misturar):

```bash
git stash push -m "WIP base-teste antes do refactor trilha/[id]" -- $(git diff --name-only)
```

Alternativa: commitar em `base-teste` se as mudanças estiverem prontas. Se o usuário pedir para deixar como está, prossiga (mas há risco de conflito na hora de mover hooks).

- [ ] **Step 3: Criar branch de refactor**

```bash
git checkout -b refactor/trilha-id-extract
```

- [ ] **Step 4: Baseline de lint**

```bash
npm run lint
```

Esperado: PASS (ou os mesmos warnings que já existem na main — anote-os para comparar depois).

---

## Task 1: Extrair helpers puros para `src/utils/trilhaBlocks.ts`

**Files:**
- Create: `src/utils/trilhaBlocks.ts`
- Modify: `src/app/(tabs)/trilha/[id].tsx` (remover helpers L69–L332, ajustar imports)

- [ ] **Step 1: Criar `src/utils/trilhaBlocks.ts` com o conteúdo abaixo**

```ts
import { ModoApresentacao } from "@/utils/presentationOrder";
import { ContentBlock } from "@/interfaces/componentes_simples/IContentBlock";
import { buildPrimaryMaterialContext } from "@/utils/telemetryMetrics";

export type Conteudo = any;
export type Atividade = any;

export type Block =
  | { kind: "conteudo"; id: string | number; conteudo: Conteudo }
  | {
      kind: "atividade";
      id: string | number;
      atividade: Atividade;
      vinculadoConteudoId?: number;
    };

export type AtividadeResolvida = {
  correto: boolean;
  acertosPercentual: number;
  revisao?: boolean;
};

export function groupAtividadesByConteudo(
  atividades: Atividade[] = [],
  conteudos: Conteudo[] = []
) {
  const orderMap = new Map<number, number>();
  conteudos.forEach((c, idx) => orderMap.set(Number(c.id), idx));

  type Linked = {
    atividade: Atividade;
    vinculadoConteudoId: number | null;
    anchorIndex: number;
    ordem: number;
  };

  const linkedList: Linked[] = atividades.map((a, idx) => {
    const rawIds =
      Array.isArray(a.conteudo_ids) && a.conteudo_ids.length > 0
        ? a.conteudo_ids
        : a.conteudo_id
        ? [a.conteudo_id]
        : [];

    const anchorId =
      rawIds
        .map((cid: any) => Number(cid))
        .filter((cid: any) => orderMap.has(cid))
        .sort(
          (a: number, b: number) =>
            (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0)
        )[0] ?? null;

    const anchorIndex =
      anchorId != null ? orderMap.get(anchorId)! : Number.MAX_SAFE_INTEGER;

    return { atividade: a, vinculadoConteudoId: anchorId, anchorIndex, ordem: idx };
  });

  const byConteudo = new Map<number, Linked[]>();
  const unanchored: Linked[] = [];

  for (const item of linkedList) {
    if (item.vinculadoConteudoId == null) {
      unanchored.push(item);
      continue;
    }
    const arr = byConteudo.get(item.vinculadoConteudoId) ?? [];
    arr.push(item);
    byConteudo.set(item.vinculadoConteudoId, arr);
  }

  return { byConteudo, unanchored, linkedList };
}

export function buildBlocksForTopico(
  conteudos: Conteudo[],
  atividades: Atividade[],
  modo: ModoApresentacao
): Block[] {
  const blocks: Block[] = [];
  const { byConteudo, unanchored, linkedList } = groupAtividadesByConteudo(
    atividades,
    conteudos
  );

  const pushAtividades = (
    items: { atividade: Atividade; vinculadoConteudoId: number | null }[]
  ) => {
    items.forEach((item) =>
      blocks.push({
        kind: "atividade",
        id: `a-${item.atividade.id}`,
        atividade: item.atividade,
        vinculadoConteudoId: item.vinculadoConteudoId ?? undefined,
      })
    );
  };

  conteudos.forEach((c, idx) => {
    const cid = Number(c.id);
    const vinculadas = byConteudo.get(cid) ?? [];

    switch (modo) {
      case "atividade_primeiro":
        pushAtividades(vinculadas);
        blocks.push({ kind: "conteudo", id: `c-${cid}`, conteudo: c });
        break;
      case "conteudo_primeiro":
        blocks.push({ kind: "conteudo", id: `c-${cid}`, conteudo: c });
        pushAtividades(vinculadas);
        break;
      case "misto": {
        if (vinculadas.length === 0) {
          blocks.push({ kind: "conteudo", id: `c-${cid}`, conteudo: c });
          break;
        }
        const [first, ...rest] = vinculadas;
        if (idx % 2 === 0) {
          blocks.push({ kind: "conteudo", id: `c-${cid}`, conteudo: c });
          pushAtividades([first, ...rest]);
        } else {
          pushAtividades([first]);
          blocks.push({ kind: "conteudo", id: `c-${cid}`, conteudo: c });
          pushAtividades(rest);
        }
        break;
      }
      case "atividade_fim":
      default:
        blocks.push({ kind: "conteudo", id: `c-${cid}`, conteudo: c });
        break;
    }
  });

  if (modo === "atividade_fim") {
    const ordered = [...linkedList]
      .sort((a, b) => {
        if (a.anchorIndex !== b.anchorIndex) {
          return a.anchorIndex - b.anchorIndex;
        }
        return a.ordem - b.ordem;
      })
      .map((item) => ({
        atividade: item.atividade,
        vinculadoConteudoId: item.vinculadoConteudoId,
      }));
    pushAtividades(ordered);
  } else if (unanchored.length) {
    pushAtividades(unanchored);
  }

  return blocks;
}

export function calcularPosicaoInicial(blocks: Block[]): number {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    if (block.kind === "conteudo") {
      const status = String(block.conteudo.status ?? "").toLowerCase();
      const pct = Number(block.conteudo.percentual_concluido ?? 0);
      const concluido = status.includes("concl") || pct >= 100;
      if (!concluido) return i;
    } else if (block.kind === "atividade") {
      const status = String(block.atividade.status ?? "").toLowerCase();
      const concluido = status.includes("concl");
      if (!concluido) return i;
    }
  }
  return blocks.length > 0 ? blocks.length - 1 : 0;
}

export function isConteudoConcluido(
  conteudo: Conteudo,
  conteudosVistosLocal: Set<number>
) {
  const status = String(conteudo?.status ?? "").toLowerCase();
  const pct = Number(conteudo?.percentual_concluido ?? 0);
  return (
    status.includes("concl") ||
    pct >= 100 ||
    conteudosVistosLocal.has(Number(conteudo?.id))
  );
}

export function isAtividadeConcluida(
  atividade: Atividade,
  atividadesResolvidasLocal: Map<number, AtividadeResolvida>
) {
  const status = String(atividade?.status ?? "").toLowerCase();
  const pct = Number(atividade?.percentual_concluido ?? 0);
  const tentativaAtividade =
    atividade?.resposta_aluno != null ||
    Number(atividade?.ultima_tentativa ?? 0) > 0;
  const questoes = Array.isArray((atividade as any)?.questoes)
    ? (atividade as any).questoes
    : [];
  const tentativaQuestao = questoes.some(
    (questao: any) =>
      questao?.resposta_aluno != null ||
      Number(questao?.ultima_tentativa ?? 0) > 0
  );
  return (
    status.includes("concl") ||
    pct >= 100 ||
    tentativaAtividade ||
    tentativaQuestao ||
    atividadesResolvidasLocal.has(Number(atividade?.id))
  );
}

export function resolveLegacyStartPosition(
  blocks: Block[],
  ultimaAtividadeId?: number | null
) {
  if (ultimaAtividadeId != null) {
    const activityIndex = blocks.findIndex(
      (block) =>
        block.kind === "atividade" &&
        Number(block.atividade.id) === Number(ultimaAtividadeId)
    );
    if (activityIndex >= 0) {
      return activityIndex;
    }
  }

  return calcularPosicaoInicial(blocks);
}

export function resolveCheckpointPosition(
  blocks: Block[],
  blockKind?: "conteudo" | "atividade" | null,
  blockId?: number | null
) {
  if (!blockKind || blockId == null) return -1;

  return blocks.findIndex((block) => {
    if (block.kind !== blockKind) return false;
    const currentId =
      block.kind === "conteudo"
        ? Number(block.conteudo.id)
        : Number(block.atividade.id);
    return currentId === Number(blockId);
  });
}

export function resolveConteudoMaterialContext(
  blocks: ContentBlock[],
  conteudoId: number | null,
  itemKey: string | null
) {
  return buildPrimaryMaterialContext({
    blocks,
    conteudoId,
    itemKey,
  });
}

export function buildStableNegativeId(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const normalized = Math.abs(hash || 1);
  return -(normalized % 1_000_000_000) - 1;
}

export function normalizeModuleDifficulty(
  value: unknown
): "facil" | "medio" | "dificil" {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_");

  if (["facil", "easy", "iniciante", "beginner"].includes(normalized)) {
    return "facil";
  }
  if (["dificil", "hard", "avancado", "advanced"].includes(normalized)) {
    return "dificil";
  }
  return "medio";
}
```

- [ ] **Step 2: Em `[id].tsx`, deletar as linhas L69–L332** (tipos `Conteudo`/`Atividade`/`Block` e funções `groupAtividadesByConteudo` até `normalizeModuleDifficulty`)

Manter `loadWebView`, `WebView`, `ACTIVE_STUDY_FLUSH_INTERVAL_MS` (L76–L84) onde estão.

Manter `normalizePersonalizedStepContent` e `normalizePersonalizedStepActivity` (L334–L406) — sairão na próxima task.

- [ ] **Step 3: Adicionar import no topo de `[id].tsx`** (logo após `buildContentBlocks`)

```ts
import {
  buildBlocksForTopico,
  buildStableNegativeId,
  calcularPosicaoInicial,
  isAtividadeConcluida,
  isConteudoConcluido,
  normalizeModuleDifficulty,
  resolveCheckpointPosition,
  resolveConteudoMaterialContext,
  resolveLegacyStartPosition,
  type Atividade,
  type AtividadeResolvida,
  type Block,
  type Conteudo,
} from "@/utils/trilhaBlocks";
```

Remover o import duplicado de `buildPrimaryMaterialContext` se ele ficou só por causa de `resolveConteudoMaterialContext`.

- [ ] **Step 4: Substituir todas as referências do tipo inline `{ correto: boolean; acertosPercentual: number; revisao?: boolean }` por `AtividadeResolvida`**

Procurar em `[id].tsx` por esse literal (aparece em L245, L780, L783, L968) e trocar pelo tipo importado.

- [ ] **Step 5: Lint**

```bash
npm run lint
```

Esperado: PASS, sem novos warnings.

- [ ] **Step 6: Smoke**

Abrir o Expo Go, navegar até uma trilha e verificar que os blocos renderizam na mesma ordem.

- [ ] **Step 7: Commit**

```bash
git add src/utils/trilhaBlocks.ts "src/app/(tabs)/trilha/[id].tsx"
git commit -m "refactor(trilha): extrai helpers puros para utils/trilhaBlocks"
```

---

## Task 2: Extrair normalizadores para `src/utils/personalizedFlow.ts`

**Files:**
- Create: `src/utils/personalizedFlow.ts`
- Modify: `src/app/(tabs)/trilha/[id].tsx` (remover L334–L406 e ajustar imports)

- [ ] **Step 1: Criar `src/utils/personalizedFlow.ts`**

```ts
import { PersonalizedTopicPayload } from "@/interfaces/personalizacao/IPersonalizedTopic";
import { buildStableNegativeId, type Conteudo, type Atividade } from "@/utils/trilhaBlocks";

export function normalizePersonalizedStepContent(
  topicoId: number,
  step: PersonalizedTopicPayload["steps"][number],
  index: number
): Conteudo {
  const firstBlockType =
    (step.blocks?.[0]?.tipo as string | undefined) ?? "markdown";
  const personalizedKind = firstBlockType === "cards" ? "cards" : "content";
  const contentId = buildStableNegativeId(
    `topico:${topicoId}:content:${step.item_key}:${index}`
  );

  return {
    id: contentId,
    titulo: step.title || `Conteudo personalizado ${index + 1}`,
    tipo: firstBlockType,
    conteudo: null,
    ordem: 10_000 + index,
    metadata: {
      ...(step.metadata ?? {}),
      itemKey: step.item_key,
      source: "personalizado",
      personalized: true,
    },
    blocks: Array.isArray(step.blocks) ? step.blocks : [],
    midias: [],
    status: null,
    percentual_concluido: 0,
    tempo_gasto_min: 0,
    ultima_visualizacao: null,
    isPersonalizedLocal: true,
    personalizationKey: step.item_key,
    personalizationTitle: step.title || `Conteudo personalizado ${index + 1}`,
    personalizationKind: personalizedKind as "content" | "cards",
  };
}

export function normalizePersonalizedStepActivity(
  topicoId: number,
  step: PersonalizedTopicPayload["steps"][number],
  index: number
): Atividade | null {
  const activity =
    step.activity && typeof step.activity === "object" ? step.activity : null;
  if (!activity) return null;

  const activityId = buildStableNegativeId(
    `topico:${topicoId}:activity:${step.item_key}:${index}`
  );

  const questoes = Array.isArray((activity as any).questoes)
    ? (activity as any).questoes.map((questao: any, questionIndex: number) => {
        const questionId = buildStableNegativeId(
          `topico:${topicoId}:activity:${step.item_key}:question:${questionIndex}`
        );

        return {
          ...questao,
          id:
            Number(questao?.id) > 0
              ? questionId
              : Number(questao?.id ?? questionId),
          isPersonalizedLocal: true,
        };
      })
    : [];

  return {
    ...activity,
    id:
      Number(activity?.id) > 0 ? activityId : Number(activity?.id ?? activityId),
    topico_id: topicoId,
    questoes,
    isPersonalizedLocal: true,
    personalizationKey: step.item_key,
    personalizationTitle:
      step.title || (activity as any)?.titulo || "Atividade personalizada",
    personalizationKind: "activity" as const,
  };
}
```

- [ ] **Step 2: Em `[id].tsx`, deletar L334–L406** (as duas funções `normalizePersonalizedStep*`)

- [ ] **Step 3: Adicionar import em `[id].tsx`**

```ts
import {
  normalizePersonalizedStepActivity,
  normalizePersonalizedStepContent,
} from "@/utils/personalizedFlow";
```

- [ ] **Step 4: Lint + smoke + commit**

```bash
npm run lint
```

```bash
git add src/utils/personalizedFlow.ts "src/app/(tabs)/trilha/[id].tsx"
git commit -m "refactor(trilha): extrai normalizadores de step personalizado"
```

---

## Task 3: Extrair styles para `[id].styles.ts`

**Files:**
- Create: `src/app/(tabs)/trilha/[id].styles.ts`
- Modify: `src/app/(tabs)/trilha/[id].tsx` (remover bloco `const styles = StyleSheet.create({...})` e adicionar import)

- [ ] **Step 1: Localizar bloco de styles**

```bash
grep -n "^const styles = StyleSheet.create" "src/app/(tabs)/trilha/[id].tsx"
```

Esperado: linha ~2547.

- [ ] **Step 2: Criar `src/app/(tabs)/trilha/[id].styles.ts`**

Copiar o bloco `const styles = StyleSheet.create({ ... });` integralmente para o novo arquivo. Estrutura:

```ts
import { StyleSheet } from "react-native";
import { Color, FontFamily } from "@/styles/GlobalStyle";

export const styles = StyleSheet.create({
  /* … (conteúdo idêntico ao bloco original) … */
});
```

Atenção: se o bloco original referencia outros símbolos (cores customizadas, Dimensions), incluir os imports correspondentes.

- [ ] **Step 3: Em `[id].tsx`, deletar o bloco original de styles** e adicionar import logo após os imports de hooks:

```ts
import { styles } from "./[id].styles";
```

Se `StyleSheet` não for mais usado em `[id].tsx`, remover do import do `react-native`.

- [ ] **Step 4: Lint + smoke + commit**

```bash
npm run lint
```

Smoke: comparar visualmente uma tela de trilha com o estado anterior.

```bash
git add "src/app/(tabs)/trilha/[id].styles.ts" "src/app/(tabs)/trilha/[id].tsx"
git commit -m "refactor(trilha): extrai styles para [id].styles"
```

---

## Task 4: Criar `src/hooks/trilha/types.ts` com tipos compartilhados

**Files:**
- Create: `src/hooks/trilha/types.ts`

- [ ] **Step 1: Criar arquivo**

```ts
import type { ContentBlock } from "@/interfaces/componentes_simples/IContentBlock";

export type StudyBlockSnapshot = {
  key: string;
  topicoId: number;
  conteudoId: number | null;
  atividadeId: number | null;
  isPersonalizedLocal: boolean;
  itemKey: string | null;
  itemTitle: string | null;
  itemKind: "content" | "activity" | "cards";
  startedAtMs: number;
};

export type StudyBlockSignature = Omit<StudyBlockSnapshot, "startedAtMs"> & {
  signature: string;
};

export type ProgressoItemPersonalizado = {
  topicoId: number;
  itemKey: string;
  itemKind: "content" | "activity" | "cards";
  itemTitle: string;
  status: "em_andamento" | "concluido";
  percentualConcluido: number;
  tempoGastoMin: number;
  metadata?: Record<string, unknown>;
};

export type StudySessionParams = {
  classeId: number;
  topicoId: number;
  topicoInicialId: number;
  screenName: string;
  routeName: string;
};

export type { ContentBlock };
```

- [ ] **Step 2: Lint + commit**

```bash
npm run lint
```

```bash
git add src/hooks/trilha/types.ts
git commit -m "refactor(trilha): adiciona tipos compartilhados de hooks"
```

---

## Task 5: Extrair `usePersonalizedFlow`

**Files:**
- Create: `src/hooks/trilha/usePersonalizedFlow.ts`
- Modify: `src/app/(tabs)/trilha/[id].tsx` (substituir o `useMemo` em L485–L528 por chamada do hook)

- [ ] **Step 1: Criar `src/hooks/trilha/usePersonalizedFlow.ts`**

```ts
import { useMemo } from "react";

import { PersonalizedTopicPayload } from "@/interfaces/personalizacao/IPersonalizedTopic";
import {
  type Atividade,
  type Block,
  type Conteudo,
} from "@/utils/trilhaBlocks";
import {
  normalizePersonalizedStepActivity,
  normalizePersonalizedStepContent,
} from "@/utils/personalizedFlow";

type Result = {
  conteudos: Conteudo[];
  atividades: Atividade[];
  blocks: Block[];
};

export function usePersonalizedFlow(args: {
  personalizedTopic: PersonalizedTopicPayload | null;
  topicoId: number | null;
}): Result {
  const { personalizedTopic, topicoId } = args;

  return useMemo(() => {
    const empty: Result = { conteudos: [], atividades: [], blocks: [] };
    if (
      !personalizedTopic ||
      !topicoId ||
      !Array.isArray(personalizedTopic.steps)
    ) {
      return empty;
    }

    const orderedSteps = [...personalizedTopic.steps].sort(
      (left, right) => Number(left.ordem ?? 0) - Number(right.ordem ?? 0)
    );
    const conteudosPersonalizados: Conteudo[] = [];
    const atividadesPersonalizadas: Atividade[] = [];
    const blocksPersonalizados: Block[] = [];

    orderedSteps.forEach((step, index) => {
      const stepKind = String((step as any)?.kind ?? "content");
      if (stepKind === "content" || stepKind === "cards") {
        const conteudo = normalizePersonalizedStepContent(
          topicoId,
          step,
          index
        );
        conteudosPersonalizados.push(conteudo);
        blocksPersonalizados.push({
          kind: "conteudo",
          id: `pc-${conteudo.id}`,
          conteudo,
        });
        return;
      }

      if (stepKind === "activity") {
        // Regra de produto: questoes devem vir do professor.
        // Mantemos apenas conteudos personalizados neste fluxo.
        void normalizePersonalizedStepActivity(topicoId, step, index);
        return;
      }
    });

    return {
      conteudos: conteudosPersonalizados,
      atividades: atividadesPersonalizadas,
      blocks: blocksPersonalizados,
    };
  }, [personalizedTopic, topicoId]);
}
```

- [ ] **Step 2: Em `[id].tsx`, substituir L485–L528** pelo:

```ts
const personalizedFlow = usePersonalizedFlow({ personalizedTopic, topicoId });
```

- [ ] **Step 3: Adicionar import**

```ts
import { usePersonalizedFlow } from "@/hooks/trilha/usePersonalizedFlow";
```

- [ ] **Step 4: Remover imports agora não usados em `[id].tsx`**

`normalizePersonalizedStepActivity` e `normalizePersonalizedStepContent` saem dos imports do componente (continuam usados só pelo hook).

- [ ] **Step 5: Lint + smoke + commit**

```bash
npm run lint
```

Smoke: abrir uma trilha com personalização e validar que os steps personalizados aparecem.

```bash
git add src/hooks/trilha/usePersonalizedFlow.ts "src/app/(tabs)/trilha/[id].tsx"
git commit -m "refactor(trilha): extrai usePersonalizedFlow"
```

---

## Task 6: Extrair `useCheckpointResume`

**Files:**
- Modify: `src/utils/trilhaCheckpoint.ts` (exportar `TrilhaCheckpointKeyParams`)
- Create: `src/hooks/trilha/useCheckpointResume.ts`
- Modify: `src/app/(tabs)/trilha/[id].tsx` (remover useState de `index`/`mostrarResumo`/`primeiraVez`/`activityQuestionIndices`, ref `checkpointHydratedRef`, e o useEffect L906–L957; substituir por chamada do hook)

- [ ] **Step 0: Exportar `TrilhaCheckpointKeyParams` em `src/utils/trilhaCheckpoint.ts`**

No arquivo, trocar L12 de:
```ts
type TrilhaCheckpointKeyParams = {
```
para:
```ts
export type TrilhaCheckpointKeyParams = {
```

- [ ] **Step 1: Criar `src/hooks/trilha/useCheckpointResume.ts`**

```ts
import {
  Dispatch,
  MutableRefObject,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  loadTrilhaCheckpoint,
  type TrilhaCheckpointKeyParams,
} from "@/utils/trilhaCheckpoint";
import {
  resolveCheckpointPosition,
  resolveLegacyStartPosition,
  type Block,
} from "@/utils/trilhaBlocks";

export function useCheckpointResume(args: {
  blocks: Block[];
  topicoId: number | null;
  topico: any;
  checkpointParams: TrilhaCheckpointKeyParams | null;
  topicoJaIniciado: boolean;
  topicoConcluido: boolean;
}): {
  index: number;
  mostrarResumo: boolean;
  primeiraVez: boolean;
  activityQuestionIndices: Record<number, number>;
  setIndex: Dispatch<SetStateAction<number>>;
  setMostrarResumo: Dispatch<SetStateAction<boolean>>;
  setPrimeiraVez: Dispatch<SetStateAction<boolean>>;
  setActivityQuestionIndices: Dispatch<
    SetStateAction<Record<number, number>>
  >;
  checkpointHydratedRef: MutableRefObject<boolean>;
} {
  const {
    blocks,
    topicoId,
    topico,
    checkpointParams,
    topicoJaIniciado,
    topicoConcluido,
  } = args;

  const [index, setIndex] = useState(-1);
  const [mostrarResumo, setMostrarResumo] = useState(true);
  const [primeiraVez, setPrimeiraVez] = useState(true);
  const [activityQuestionIndices, setActivityQuestionIndices] = useState<
    Record<number, number>
  >({});
  const checkpointHydratedRef = useRef(false);

  useEffect(() => {
    if (!primeiraVez || blocks.length === 0 || !topicoId || !checkpointParams) {
      return;
    }

    let active = true;

    async function hydrateCheckpoint() {
      checkpointHydratedRef.current = false;
      const checkpoint = await loadTrilhaCheckpoint(checkpointParams!);
      if (!active) return;

      const checkpointPosition = resolveCheckpointPosition(
        blocks,
        checkpoint?.blockKind ?? null,
        checkpoint?.blockId ?? null
      );

      if (checkpoint?.mostrarResumo) {
        setIndex(-1);
        setMostrarResumo(true);
      } else if (checkpointPosition >= 0) {
        setIndex(checkpointPosition);
        setMostrarResumo(false);

        if (
          checkpoint?.blockKind === "atividade" &&
          checkpoint.blockId != null &&
          checkpoint.questionIndex != null
        ) {
          setActivityQuestionIndices((prev) => ({
            ...prev,
            [Number(checkpoint.blockId)]: Math.max(
              0,
              checkpoint.questionIndex ?? 0
            ),
          }));
        }
      } else if (topicoJaIniciado || topicoConcluido) {
        const posicao = resolveLegacyStartPosition(
          blocks,
          topico?.ultima_atividade ?? null
        );
        setIndex(posicao);
        setMostrarResumo(false);
      } else {
        setIndex(-1);
        setMostrarResumo(true);
      }

      checkpointHydratedRef.current = true;
      setPrimeiraVez(false);
    }

    void hydrateCheckpoint();

    return () => {
      active = false;
    };
  }, [
    blocks,
    checkpointParams,
    primeiraVez,
    topico?.ultima_atividade,
    topicoConcluido,
    topicoId,
    topicoJaIniciado,
  ]);

  return {
    index,
    mostrarResumo,
    primeiraVez,
    activityQuestionIndices,
    setIndex,
    setMostrarResumo,
    setPrimeiraVez,
    setActivityQuestionIndices,
    checkpointHydratedRef,
  };
}
```

> **Nota:** o tipo certo exportado por `src/utils/trilhaCheckpoint.ts` é `TrilhaCheckpointKeyParams`. Se ele não estiver exportado nesse arquivo, exportá-lo antes de fazer o import.

- [ ] **Step 2: Em `[id].tsx`, deletar:**
  - `const [index, setIndex] = useState(-1);` (L776)
  - `const [mostrarResumo, setMostrarResumo] = useState(true);` (L777)
  - `const [primeiraVez, setPrimeiraVez] = useState(true);` (L778)
  - `const [activityQuestionIndices, setActivityQuestionIndices] = useState<Record<number, number>>({});` (L787)
  - `const checkpointHydratedRef = useRef(false);` (L793)
  - O `useEffect` L906–L957 inteiro

- [ ] **Step 3: Em `[id].tsx`, logo após `const blocks = useMemo(...)` (L772) e o cálculo de `checkpointParams` (L795), invocar o hook:**

```ts
const {
  index,
  mostrarResumo,
  primeiraVez,
  activityQuestionIndices,
  setIndex,
  setMostrarResumo,
  setPrimeiraVez,
  setActivityQuestionIndices,
  checkpointHydratedRef,
} = useCheckpointResume({
  blocks,
  topicoId,
  topico,
  checkpointParams,
  topicoJaIniciado,
  topicoConcluido,
});
```

> **Cuidado com ordem:** `topicoJaIniciado` e `topicoConcluido` são memos definidos depois do bloco que está sendo substituído (L837, L899). Mover esses memos para antes da chamada do hook, ou aceitar a reordenação. Verificar com `grep -n "topicoConcluido\|topicoJaIniciado" "src/app/(tabs)/trilha/[id].tsx"` que nada antes dessa linha depende deles.

- [ ] **Step 4: Adicionar import**

```ts
import { useCheckpointResume } from "@/hooks/trilha/useCheckpointResume";
```

- [ ] **Step 5: Remover de `[id].tsx` os imports que viraram exclusivos do hook**

`resolveCheckpointPosition`, `resolveLegacyStartPosition` e `loadTrilhaCheckpoint` provavelmente não são mais usados em `[id].tsx`. Confirmar com grep antes de remover.

- [ ] **Step 6: Lint + smoke + commit**

```bash
npm run lint
```

Smoke crítico:
1. Abrir uma trilha nunca iniciada — deve mostrar o resumo (index = -1).
2. Abrir uma trilha em andamento — deve abrir no checkpoint salvo.
3. Avançar um bloco, fechar e reabrir o app — deve retomar onde parou.

```bash
git add src/hooks/trilha/useCheckpointResume.ts "src/app/(tabs)/trilha/[id].tsx"
git commit -m "refactor(trilha): extrai useCheckpointResume"
```

---

## Task 7: Extrair `useStudyTimeTracking`

**Files:**
- Create: `src/hooks/trilha/useStudyTimeTracking.ts`
- Modify: `src/app/(tabs)/trilha/[id].tsx` (remover `activeStudyBlockRef` L551–L561, `persistElapsedStudyBlock` L608–L669, e o flush periódico — buscar `ACTIVE_STUDY_FLUSH_INTERVAL_MS` no componente para confirmar onde está o `setInterval`)

- [ ] **Step 1: Localizar todo o uso de `activeStudyBlockRef` e do intervalo de flush**

```bash
grep -n "activeStudyBlockRef\|ACTIVE_STUDY_FLUSH_INTERVAL_MS\|persistElapsedStudyBlock" "src/app/(tabs)/trilha/[id].tsx"
```

Anotar TODAS as ocorrências — o hook precisa cobrir 100% delas. Algumas referências (ex.: dentro de `useFocusEffect` L671) permanecem no componente passando o ref retornado pelo hook.

- [ ] **Step 2: Criar `src/hooks/trilha/useStudyTimeTracking.ts`**

```ts
import { MutableRefObject, useCallback, useEffect, useRef } from "react";

import type {
  ProgressoItemPersonalizado,
  StudyBlockSnapshot,
  StudyBlockSignature,
} from "@/hooks/trilha/types";

const ACTIVE_STUDY_FLUSH_INTERVAL_MS = 60_000;

export function useStudyTimeTracking(args: {
  currentStudyBlockSignature: StudyBlockSignature | null;
  isCurrentStudyBlockTrackable: boolean;
  registrarTempoTopico: (topicoId: number, min: number) => Promise<void>;
  registrarTempoConteudo: (
    topicoId: number,
    conteudoId: number,
    min: number
  ) => Promise<void>;
  registrarTempoAtividade: (
    topicoId: number,
    atividadeId: number,
    min: number
  ) => Promise<void>;
  salvarProgressoItemPersonalizado: (
    payload: ProgressoItemPersonalizado
  ) => Promise<void>;
  reloadRanking: () => void;
}): {
  activeStudyBlockRef: MutableRefObject<StudyBlockSnapshot | null>;
  persistElapsedStudyBlock: (
    snap: StudyBlockSnapshot | null
  ) => Promise<void>;
} {
  const {
    currentStudyBlockSignature,
    isCurrentStudyBlockTrackable,
    registrarTempoTopico,
    registrarTempoConteudo,
    registrarTempoAtividade,
    salvarProgressoItemPersonalizado,
    reloadRanking,
  } = args;

  const activeStudyBlockRef = useRef<StudyBlockSnapshot | null>(null);

  const persistElapsedStudyBlock = useCallback(
    async (snapshot: StudyBlockSnapshot | null) => {
      if (!snapshot) return;

      const elapsedMs = Date.now() - snapshot.startedAtMs;
      if (!Number.isFinite(elapsedMs) || elapsedMs < 1_000) {
        return;
      }

      const elapsedMin = Math.max(
        0.01,
        Number((elapsedMs / 60_000).toFixed(2))
      );
      if (!Number.isFinite(elapsedMin) || elapsedMin <= 0) return;

      await registrarTempoTopico(snapshot.topicoId, elapsedMin);

      if (
        snapshot.isPersonalizedLocal &&
        snapshot.itemKey &&
        snapshot.itemTitle
      ) {
        await salvarProgressoItemPersonalizado({
          topicoId: snapshot.topicoId,
          itemKey: snapshot.itemKey,
          itemKind: snapshot.itemKind,
          itemTitle: snapshot.itemTitle,
          status: "em_andamento",
          percentualConcluido: 0,
          tempoGastoMin: elapsedMin,
          metadata: {
            source: "mobile_trilha_tempo",
            personalized: true,
          },
        });
        reloadRanking();
        return;
      }

      if (snapshot.conteudoId != null && snapshot.conteudoId > 0) {
        await registrarTempoConteudo(
          snapshot.topicoId,
          snapshot.conteudoId,
          elapsedMin
        );
      }

      if (snapshot.atividadeId != null && snapshot.atividadeId > 0) {
        await registrarTempoAtividade(
          snapshot.topicoId,
          snapshot.atividadeId,
          elapsedMin
        );
      }

      reloadRanking();
    },
    [
      registrarTempoTopico,
      registrarTempoAtividade,
      registrarTempoConteudo,
      reloadRanking,
      salvarProgressoItemPersonalizado,
    ]
  );

  // Inicia/encerra snapshot quando a "assinatura" do bloco em estudo muda
  useEffect(() => {
    if (!isCurrentStudyBlockTrackable || !currentStudyBlockSignature) {
      if (activeStudyBlockRef.current) {
        void persistElapsedStudyBlock(activeStudyBlockRef.current);
        activeStudyBlockRef.current = null;
      }
      return;
    }

    if (
      activeStudyBlockRef.current?.key === currentStudyBlockSignature.key
    ) {
      return;
    }

    if (activeStudyBlockRef.current) {
      void persistElapsedStudyBlock(activeStudyBlockRef.current);
    }

    activeStudyBlockRef.current = {
      key: currentStudyBlockSignature.key,
      topicoId: currentStudyBlockSignature.topicoId,
      conteudoId: currentStudyBlockSignature.conteudoId,
      atividadeId: currentStudyBlockSignature.atividadeId,
      isPersonalizedLocal: currentStudyBlockSignature.isPersonalizedLocal,
      itemKey: currentStudyBlockSignature.itemKey,
      itemTitle: currentStudyBlockSignature.itemTitle,
      itemKind: currentStudyBlockSignature.itemKind,
      startedAtMs: Date.now(),
    };
  }, [
    currentStudyBlockSignature,
    isCurrentStudyBlockTrackable,
    persistElapsedStudyBlock,
  ]);

  // Flush periódico do tempo decorrido
  useEffect(() => {
    if (!isCurrentStudyBlockTrackable) return;

    const interval = setInterval(() => {
      const snapshot = activeStudyBlockRef.current;
      if (!snapshot) return;
      void persistElapsedStudyBlock(snapshot);
      activeStudyBlockRef.current = {
        ...snapshot,
        startedAtMs: Date.now(),
      };
    }, ACTIVE_STUDY_FLUSH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isCurrentStudyBlockTrackable, persistElapsedStudyBlock]);

  return { activeStudyBlockRef, persistElapsedStudyBlock };
}
```

> **Cuidado:** o código atual em `[id].tsx` pode ter um `setInterval` ligeiramente diferente OU efeitos que reagem à mudança de bloco e gerenciam o ref. **Antes de escrever este hook, verifique o bloco no componente original** (entre L1035 e ~L1200) para garantir que a lógica acima reflete o comportamento existente. Se houver diferença, ajuste o hook para casar — não invente nova lógica.

- [ ] **Step 3: Em `[id].tsx`, deletar:**
  - O `useRef` de `activeStudyBlockRef` (L551–L561)
  - O `persistElapsedStudyBlock` (L608–L669)
  - Os useEffect que gerenciam o ref e o flush (identificados no Step 1)
  - A constante `ACTIVE_STUDY_FLUSH_INTERVAL_MS` (L84) — passou para o hook

- [ ] **Step 4: Em `[id].tsx`, invocar o hook após o cálculo de `currentStudyBlockSignature` e `isCurrentStudyBlockTrackable`:**

```ts
const { activeStudyBlockRef, persistElapsedStudyBlock } = useStudyTimeTracking({
  currentStudyBlockSignature,
  isCurrentStudyBlockTrackable,
  registrarTempoTopico,
  registrarTempoConteudo,
  registrarTempoAtividade,
  salvarProgressoItemPersonalizado,
  reloadRanking,
});
```

- [ ] **Step 5: Adicionar import**

```ts
import { useStudyTimeTracking } from "@/hooks/trilha/useStudyTimeTracking";
```

- [ ] **Step 6: Lint + smoke + commit**

Smoke crítico:
1. Abrir um conteúdo, esperar ~70s, fechar o app. Verificar no Supabase ou no contexto de métricas que o tempo foi gravado.
2. Abrir um conteúdo personalizado, deixar 30s, sair e voltar — deve persistir tempo do bloco anterior.

```bash
npm run lint
git add src/hooks/trilha/useStudyTimeTracking.ts "src/app/(tabs)/trilha/[id].tsx"
git commit -m "refactor(trilha): extrai useStudyTimeTracking"
```

---

## Task 8: Extrair `useTelemetryHandlers`

**Files:**
- Create: `src/hooks/trilha/useTelemetryHandlers.ts`
- Modify: `src/app/(tabs)/trilha/[id].tsx` (remover handlers L1243–L1305 e adicionar chamada do hook)

- [ ] **Step 1: Confirmar limites exatos**

```bash
grep -n "handleTelemetryTouch\|handleTelemetryScroll\|handleOverlayTimerTimeout" "src/app/(tabs)/trilha/[id].tsx"
```

- [ ] **Step 2: Criar `src/hooks/trilha/useTelemetryHandlers.ts`**

```ts
import {
  Dimensions,
  GestureResponderEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { Dispatch, SetStateAction, useCallback } from "react";

import {
  IATimerTimeoutAction,
} from "@/interfaces/personalizacao/IAContracts";
import type { Block } from "@/utils/trilhaBlocks";

type ShowDialog = (opts: {
  title: string;
  description: string;
  tone?: "info" | "warning";
}) => void;

export function useTelemetryHandlers(args: {
  atualBlock: Block | undefined;
  atividadeAtualResolvida: boolean;
  topicoConcluido: boolean;
  recordTouchSample: (sample: {
    x_pct: number;
    y_pct: number;
    target: "screen" | "content" | "activity";
  }) => void;
  recordScroll: (sample: { y: number }) => void;
  setActivityTimeoutMap: Dispatch<SetStateAction<Record<number, boolean>>>;
  showDialog: ShowDialog;
}) {
  const {
    atualBlock,
    atividadeAtualResolvida,
    topicoConcluido,
    recordTouchSample,
    recordScroll,
    setActivityTimeoutMap,
    showDialog,
  } = args;

  const handleTelemetryTouch = useCallback(
    (event: GestureResponderEvent) => {
      const { width, height } = Dimensions.get("window");
      const target =
        atualBlock?.kind === "atividade"
          ? "activity"
          : atualBlock?.kind === "conteudo"
          ? "content"
          : "screen";

      recordTouchSample({
        x_pct: width > 0 ? event.nativeEvent.pageX / width : 0,
        y_pct: height > 0 ? event.nativeEvent.pageY / height : 0,
        target,
      });
    },
    [atualBlock?.kind, recordTouchSample]
  );

  const handleTelemetryScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      recordScroll({ y: event.nativeEvent.contentOffset.y });
    },
    [recordScroll]
  );

  const handleOverlayTimerTimeout = useCallback(
    (action: IATimerTimeoutAction | null) => {
      if (
        atualBlock?.kind === "atividade" &&
        !atividadeAtualResolvida &&
        !topicoConcluido
      ) {
        setActivityTimeoutMap((prev) => ({
          ...prev,
          [Number(atualBlock.atividade.id)]: true,
        }));
      }

      const titulo =
        action === "pause"
          ? "Hora de pausar"
          : action === "suggest_break"
          ? "Pausa sugerida"
          : action === "end_local_attempt"
          ? "Tempo da tentativa"
          : "Tempo esgotado";
      const descricao =
        action === "pause"
          ? "O temporizador sugeriu uma pausa curta antes de seguir."
          : action === "suggest_break"
          ? "Seu ritmo caiu. Vale fazer uma pausa breve e voltar com mais foco."
          : atualBlock?.kind === "atividade"
          ? "O tempo desta atividade terminou. Você ainda pode concluir a resposta, mas a pontuação final recebe penalidade de 20%."
          : "O tempo terminou. Revise com calma e siga para a proxima acao.";

      showDialog({
        title: titulo,
        description: descricao,
        tone: action === "suggest_break" ? "warning" : "info",
      });
    },
    [
      atualBlock,
      atividadeAtualResolvida,
      setActivityTimeoutMap,
      showDialog,
      topicoConcluido,
    ]
  );

  return {
    handleTelemetryTouch,
    handleTelemetryScroll,
    handleOverlayTimerTimeout,
  };
}
```

> **Atenção:** se o `handleOverlayTimerTimeout` original tiver lógica adicional após L1302 (o que foi mostrado neste plano termina em `showDialog(...)` mas pode haver continuação até L1305 ou mais), copiar integralmente. Não cortar.

- [ ] **Step 3: Em `[id].tsx`, deletar handlers L1243–L1305** (ajustar fim conforme conferência)

- [ ] **Step 4: Em `[id].tsx`, invocar hook após `atividadeAtualResolvida` (L1084) e `topicoConcluido` (L837) estarem definidos:**

```ts
const {
  handleTelemetryTouch,
  handleTelemetryScroll,
  handleOverlayTimerTimeout,
} = useTelemetryHandlers({
  atualBlock,
  atividadeAtualResolvida,
  topicoConcluido,
  recordTouchSample,
  recordScroll,
  setActivityTimeoutMap,
  showDialog,
});
```

- [ ] **Step 5: Adicionar import**

```ts
import { useTelemetryHandlers } from "@/hooks/trilha/useTelemetryHandlers";
```

- [ ] **Step 6: Lint + smoke + commit**

Smoke: abrir uma atividade com timer, deixar estourar, validar que o dialog aparece e a UI marca timeout.

```bash
npm run lint
git add src/hooks/trilha/useTelemetryHandlers.ts "src/app/(tabs)/trilha/[id].tsx"
git commit -m "refactor(trilha): extrai useTelemetryHandlers"
```

---

## Task 9: Extrair `useTopicoCompletion`

**Files:**
- Create: `src/hooks/trilha/useTopicoCompletion.ts`
- Modify: `src/app/(tabs)/trilha/[id].tsx` (remover `areAcademicBlocksComplete` L845–L898, `handlePularTrilha` L1911–L1948, `navegarAposConclusao` L1950–L1991, `handleConcluirTopico` L1993–L2081 e o `useEffect` que sincroniza `concluirTopicoRef` L2083–L2085)

Este hook agrupa 3 funções públicas + 1 helper interno (`navegarAposConclusao`, usado só por `handleConcluirTopico`). Como a árvore de dependências é grande, o objeto de args tem 20+ campos — é o custo de extrair lógica entrelaçada sem decompor mais o componente.

- [ ] **Step 1: Criar `src/hooks/trilha/useTopicoCompletion.ts`**

```ts
import { useCallback } from "react";
import type { useRouter } from "expo-router";

import {
  isAtividadeConcluida,
  isConteudoConcluido,
  type Atividade,
  type AtividadeResolvida,
  type Block,
  type Conteudo,
} from "@/utils/trilhaBlocks";
import {
  clearTrilhaCheckpoint,
  type TrilhaCheckpointKeyParams,
} from "@/utils/trilhaCheckpoint";

type ShowConfirm = (opts: {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void | Promise<void>;
}) => void;
type ShowDialog = (opts: {
  title: string;
  description: string;
  tone?: "info" | "warning" | "success";
  actions?: Array<{ label: string; onPress: () => void }>;
}) => void;

type OptimisticBlocks = {
  conteudoId?: number | null;
  atividadeId?: number | null;
  conteudoIds?: number[];
  atividadeIds?: number[];
};

export function useTopicoCompletion(args: {
  // domínio
  topico: any;
  topicoId: number | null;
  classeAtual: any;
  academicConteudos: Conteudo[];
  academicAtividades: Atividade[];
  conteudosVistosLocal: Set<number>;
  atividadesResolvidasLocal: Map<number, AtividadeResolvida>;
  blocks: Block[];
  atualBlock: Block | undefined;
  bloqueiaAvanco: boolean;
  conteudoAtualConcluido: boolean;
  atividadeAtualResolvida: boolean;
  topicoConcluido: boolean;
  todosBlocosConcluidos: boolean;
  currentContentItemKey: string | null;
  checkpointParams: TrilhaCheckpointKeyParams;
  // ações (contextos)
  marcarTopicoConcluido: (topicoId: number) => Promise<void>;
  handleMarcarConteudoVisto: (
    conteudoId: number,
    itemKey: string | null
  ) => Promise<void>;
  registrarEvento: (tipo: string, ref: string) => Promise<void>;
  reloadConquistas: () => void | Promise<void>;
  reloadRanking: () => void | Promise<void>;
  getProximosTopicos: (topicoId: number) => any[];
  flushStudyBatch: (motivo: string) => Promise<void>;
  resetBattleState: (opts: { scope: "topic"; topicoId: number }) => Promise<void>;
  recordAppEvent: (event: {
    eventGroup: string;
    eventName: string;
    topicoId: number;
  }) => void;
  // setters do componente pai
  setMostrarResumo: (b: boolean) => void;
  setPulouConteudos: (b: boolean) => void;
  setIndex: (n: number) => void;
  setModalProximos: (s: { visivel: boolean; opcoes: any[] }) => void;
  // navegação + dialogs
  router: ReturnType<typeof useRouter>;
  showConfirm: ShowConfirm;
  showDialog: ShowDialog;
}) {
  const {
    topico,
    topicoId,
    classeAtual,
    academicConteudos,
    academicAtividades,
    conteudosVistosLocal,
    atividadesResolvidasLocal,
    blocks,
    atualBlock,
    bloqueiaAvanco,
    conteudoAtualConcluido,
    atividadeAtualResolvida,
    topicoConcluido,
    todosBlocosConcluidos,
    currentContentItemKey,
    checkpointParams,
    marcarTopicoConcluido,
    handleMarcarConteudoVisto,
    registrarEvento,
    reloadConquistas,
    reloadRanking,
    getProximosTopicos,
    flushStudyBatch,
    resetBattleState,
    recordAppEvent,
    setMostrarResumo,
    setPulouConteudos,
    setIndex,
    setModalProximos,
    router,
    showConfirm,
    showDialog,
  } = args;

  const areAcademicBlocksComplete = useCallback(
    (optimistic?: OptimisticBlocks) => {
      if (!topico) return false;
      if (topicoConcluido) return true;

      const optimisticConteudoId =
        optimistic?.conteudoId != null ? Number(optimistic.conteudoId) : null;
      const optimisticAtividadeId =
        optimistic?.atividadeId != null ? Number(optimistic.atividadeId) : null;
      const optimisticConteudoIds = new Set<number>(
        [
          ...(optimistic?.conteudoIds ?? []).map(Number),
          optimisticConteudoId,
        ].filter((value): value is number => Number.isFinite(value as number))
      );
      const optimisticAtividadeIds = new Set<number>(
        [
          ...(optimistic?.atividadeIds ?? []).map(Number),
          optimisticAtividadeId,
        ].filter((value): value is number => Number.isFinite(value as number))
      );

      return (
        academicConteudos.every((conteudo) => {
          const conteudoId = Number(conteudo?.id);
          return (
            isConteudoConcluido(conteudo, conteudosVistosLocal) ||
            optimisticConteudoIds.has(conteudoId)
          );
        }) &&
        academicAtividades.every((atividade) => {
          const atividadeId = Number(atividade?.id);
          return (
            isAtividadeConcluida(atividade, atividadesResolvidasLocal) ||
            optimisticAtividadeIds.has(atividadeId)
          );
        })
      );
    },
    [
      academicAtividades,
      academicConteudos,
      atividadesResolvidasLocal,
      conteudosVistosLocal,
      topico,
      topicoConcluido,
    ]
  );

  const handlePularTrilha = useCallback(async () => {
    if (!blocks.length) return;

    const primeiraAtividadeIndex = blocks.findIndex(
      (b) => b.kind === "atividade"
    );

    if (primeiraAtividadeIndex === -1) {
      showDialog({
        title: "Sem questões",
        description: "Este módulo ainda não possui atividades para pular.",
        tone: "info",
      });
      return;
    }

    showConfirm({
      title: "Pular módulo",
      description:
        "Deseja pular o conteúdo e ir direto para as questões deste módulo?",
      confirmLabel: "Ir para as questões",
      cancelLabel: "Cancelar",
      onConfirm: async () => {
        setMostrarResumo(false);
        setPulouConteudos(true);
        setIndex(0);
        if (topicoId) {
          try {
            await registrarEvento(
              "topico_pular_conteudo",
              `topico:${topicoId}`
            );
          } catch (error) {
            console.warn(
              "[TrilhaConteudo] Falha ao registrar evento de pulo de topico:",
              error
            );
          }
        }
      },
    });
  }, [
    blocks,
    registrarEvento,
    setIndex,
    setMostrarResumo,
    setPulouConteudos,
    showConfirm,
    showDialog,
    topicoId,
  ]);

  const navegarAposConclusao = useCallback(async () => {
    if (!topicoId || !topico) return;

    const proximosDoAtual = Array.isArray(topico?.next)
      ? (topico.next as number[])
          .map(Number)
          .filter(Boolean)
          .map((id) => classeAtual?.topicos.find((t: any) => t.id === id))
          .filter((t): t is any => !!t)
      : [];

    const proximos = getProximosTopicos(topicoId);

    if (proximosDoAtual.length >= 2) {
      setModalProximos({ visivel: true, opcoes: proximosDoAtual });
      return;
    }

    if (!proximos.length) {
      showDialog({
        title: "Parabéns!",
        description: "Você concluiu este módulo.",
        tone: "success",
        actions: [{ label: "OK", onPress: () => router.back() }],
      });
      return;
    }

    if (proximos.length === 1) {
      const proximo = proximos[0];
      showConfirm({
        title: "Módulo concluído!",
        description: `Deseja ir para o próximo módulo "${proximo.nome}"?`,
        confirmLabel: "Ir para o próximo módulo",
        cancelLabel: "Ficar aqui",
        onConfirm: () => router.replace(`/trilha/${proximo.id}`),
      });
      return;
    }

    setModalProximos({ visivel: true, opcoes: proximos });
  }, [
    classeAtual?.topicos,
    getProximosTopicos,
    router,
    setModalProximos,
    showConfirm,
    showDialog,
    topico,
    topicoId,
  ]);

  const handleConcluirTopico = useCallback(async () => {
    if (!topicoId || !topico) return;

    if (bloqueiaAvanco) {
      showDialog({
        title: "Responda a atividade",
        description: "Confirme a resposta antes de avançar.",
        tone: "warning",
      });
      return;
    }

    const optimisticConteudoId =
      atualBlock?.kind === "conteudo" && !conteudoAtualConcluido
        ? Number(atualBlock.conteudo.id)
        : null;
    const optimisticAtividadeId =
      atualBlock?.kind === "atividade" && atividadeAtualResolvida
        ? Number(atualBlock.atividade.id)
        : null;

    if (optimisticConteudoId != null) {
      await handleMarcarConteudoVisto(
        optimisticConteudoId,
        currentContentItemKey
      );
    }

    const canFinalizeAcademic =
      topicoConcluido ||
      todosBlocosConcluidos ||
      areAcademicBlocksComplete({
        conteudoId: optimisticConteudoId,
        atividadeId: optimisticAtividadeId,
      });

    if (!canFinalizeAcademic) {
      showDialog({
        title: "Conclua os blocos",
        description:
          "Finalize todos os conteúdos e atividades deste módulo para avançar.",
        tone: "warning",
      });
      return;
    }

    const jaConcluido =
      String(topico.status ?? "").toLowerCase().includes("concl") ||
      Number(topico.percentual_concluido ?? 0) >= 100;

    try {
      if (!jaConcluido) {
        await marcarTopicoConcluido(topicoId);
        void reloadRanking();
        void reloadConquistas();
      }

      await clearTrilhaCheckpoint(checkpointParams);
      recordAppEvent({
        eventGroup: "navigation",
        eventName: "topic_complete",
        topicoId,
      });
      await flushStudyBatch("topic_complete");
      await resetBattleState({ scope: "topic", topicoId });
      await navegarAposConclusao();
    } catch (err) {
      console.error("[TrilhaConteudo] Erro ao concluir topico:", err);
      router.back();
    }
  }, [
    topicoId,
    topico,
    bloqueiaAvanco,
    atualBlock,
    conteudoAtualConcluido,
    atividadeAtualResolvida,
    currentContentItemKey,
    handleMarcarConteudoVisto,
    topicoConcluido,
    todosBlocosConcluidos,
    areAcademicBlocksComplete,
    marcarTopicoConcluido,
    flushStudyBatch,
    recordAppEvent,
    resetBattleState,
    reloadRanking,
    reloadConquistas,
    navegarAposConclusao,
    router,
    showDialog,
    checkpointParams,
  ]);

  return {
    areAcademicBlocksComplete,
    handlePularTrilha,
    handleConcluirTopico,
  };
}
```

- [ ] **Step 2: Em `[id].tsx`, deletar:**
  - `areAcademicBlocksComplete` (L845–L897)
  - `handlePularTrilha` (L1911–L1948)
  - `navegarAposConclusao` (L1950–L1991)
  - `handleConcluirTopico` (L1993–L2081)

  Manter o `useEffect` L2083–L2085 que sincroniza `concluirTopicoRef.current = handleConcluirTopico` (ainda é necessário se outro lugar do componente lê esse ref).

- [ ] **Step 3: Invocar o hook em `[id].tsx`** (após todos os memos derivados estarem definidos):

```ts
const {
  areAcademicBlocksComplete,
  handlePularTrilha,
  handleConcluirTopico,
} = useTopicoCompletion({
  topico,
  topicoId,
  classeAtual,
  academicConteudos,
  academicAtividades,
  conteudosVistosLocal,
  atividadesResolvidasLocal,
  blocks,
  atualBlock,
  bloqueiaAvanco,
  conteudoAtualConcluido,
  atividadeAtualResolvida,
  topicoConcluido,
  todosBlocosConcluidos,
  currentContentItemKey,
  checkpointParams,
  marcarTopicoConcluido,
  handleMarcarConteudoVisto,
  registrarEvento,
  reloadConquistas,
  reloadRanking,
  getProximosTopicos,
  flushStudyBatch,
  resetBattleState,
  recordAppEvent,
  setMostrarResumo,
  setPulouConteudos,
  setIndex,
  setModalProximos,
  router,
  showConfirm,
  showDialog,
});
```

- [ ] **Step 4: Adicionar import**

```ts
import { useTopicoCompletion } from "@/hooks/trilha/useTopicoCompletion";
```

- [ ] **Step 5: Remover imports não usados**

Após mover, `clearTrilhaCheckpoint` e `isConteudoConcluido`/`isAtividadeConcluida` podem não ser mais usados em `[id].tsx`. Confirmar com grep e remover.

- [ ] **Step 6: Lint + smoke + commit**

Smoke crítico:
1. Completar todos os blocos de um tópico e clicar "Concluir" — marca concluído, registra evento, navega.
2. Em uma trilha em andamento, usar "Pular" — abre modal de próximos tópicos.
3. Validar que `concluirTopicoRef.current` continua sendo setado (efeito L2083–L2085).
4. Tópico com 2+ próximos no `topico.next` — modal abre.
5. Tópico sem próximos — dialog "Parabéns!" com botão OK.

```bash
npm run lint
git add src/hooks/trilha/useTopicoCompletion.ts "src/app/(tabs)/trilha/[id].tsx"
git commit -m "refactor(trilha): extrai useTopicoCompletion"
```

---

## Task 10: Extrair `usePersonalizationRefresh`

**Files:**
- Create: `src/hooks/trilha/usePersonalizationRefresh.ts`
- Modify: `src/app/(tabs)/trilha/[id].tsx` (remover refs L545–L547, useEffects L722–L770 e adicionar chamada do hook)

- [ ] **Step 1: Criar `src/hooks/trilha/usePersonalizationRefresh.ts`**

```ts
import { useEffect, useRef } from "react";

import { PersonalizedTopicPayload } from "@/interfaces/personalizacao/IPersonalizedTopic";

export function usePersonalizationRefresh(args: {
  topicoId: number | null;
  topico: any;
  personalizedTopic: PersonalizedTopicPayload | null;
  lastAnalysis: { ciclo_id?: string | null; acoes_aplicadas?: string[] } | null;
  ensureTopicoPersonalizado: (
    topicoId: number,
    opts?: { forceRefresh?: boolean; triggerCycleId?: string }
  ) => Promise<void>;
  setPersonalizacaoCarregando: (v: boolean) => void;
}) {
  const {
    topicoId,
    topico,
    personalizedTopic,
    lastAnalysis,
    ensureTopicoPersonalizado,
    setPersonalizacaoCarregando,
  } = args;

  const latestAnalysisCycleIdRef = useRef<string | null>(null);
  const analysisRefreshBaselineRef = useRef<string | null>(null);
  const analysisRefreshAppliedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    latestAnalysisCycleIdRef.current = lastAnalysis?.ciclo_id ?? null;
  }, [lastAnalysis?.ciclo_id]);

  useEffect(() => {
    analysisRefreshBaselineRef.current = latestAnalysisCycleIdRef.current;
    analysisRefreshAppliedRef.current.clear();
  }, [topicoId]);

  useEffect(() => {
    if (!topicoId || !topico || !personalizedTopic || !lastAnalysis?.ciclo_id) {
      return;
    }

    const refreshPolicy = personalizedTopic.planMeta.refreshPolicy;
    if (refreshPolicy.mode !== "analysis") return;
    if (analysisRefreshBaselineRef.current === lastAnalysis.ciclo_id) return;

    const normalizedActions = new Set(
      (lastAnalysis.acoes_aplicadas ?? []).map((action) =>
        String(action ?? "").trim().toLowerCase()
      )
    );
    const shouldRefresh = refreshPolicy.triggerActions.some((action) =>
      normalizedActions.has(String(action).trim().toLowerCase())
    );

    if (!shouldRefresh) return;

    const refreshKey = `${topicoId}:${lastAnalysis.ciclo_id}`;
    if (analysisRefreshAppliedRef.current.has(refreshKey)) return;
    analysisRefreshAppliedRef.current.add(refreshKey);

    let ativo = true;
    setPersonalizacaoCarregando(true);

    ensureTopicoPersonalizado(topicoId, {
      forceRefresh: true,
      triggerCycleId: lastAnalysis.ciclo_id,
    })
      .catch((err) => {
        console.warn(
          "[TrilhaConteudo] Falha ao atualizar personalizacao apos analise:",
          err
        );
      })
      .finally(() => {
        if (ativo) setPersonalizacaoCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [
    ensureTopicoPersonalizado,
    lastAnalysis,
    personalizedTopic,
    setPersonalizacaoCarregando,
    topico,
    topicoId,
  ]);
}
```

- [ ] **Step 2: Em `[id].tsx`, deletar:**
  - `const analysisRefreshBaselineRef = useRef<string | null>(null);` (L545)
  - `const analysisRefreshAppliedRef = useRef<Set<string>>(new Set());` (L546)
  - `const latestAnalysisCycleIdRef = useRef<string | null>(null);` (L547)
  - Os três useEffect (L722–L770)

- [ ] **Step 3: Invocar o hook em `[id].tsx`:**

```ts
usePersonalizationRefresh({
  topicoId,
  topico,
  personalizedTopic,
  lastAnalysis,
  ensureTopicoPersonalizado,
  setPersonalizacaoCarregando,
});
```

- [ ] **Step 4: Adicionar import**

```ts
import { usePersonalizationRefresh } from "@/hooks/trilha/usePersonalizationRefresh";
```

- [ ] **Step 5: Lint + smoke + commit**

Smoke: difícil de simular sem dados reais. Validar apenas que abertura de trilha personalizada não regride.

```bash
npm run lint
git add src/hooks/trilha/usePersonalizationRefresh.ts "src/app/(tabs)/trilha/[id].tsx"
git commit -m "refactor(trilha): extrai usePersonalizationRefresh"
```

---

## Task 11: Validação final e PR

**Files:** nenhum

- [ ] **Step 1: Contar linhas**

```bash
wc -l "src/app/(tabs)/trilha/[id].tsx" src/hooks/trilha/*.ts src/utils/trilhaBlocks.ts src/utils/personalizedFlow.ts "src/app/(tabs)/trilha/[id].styles.ts"
```

Esperado: `[id].tsx` entre 900 e 1.300 linhas; cada hook < 250 linhas.

- [ ] **Step 2: Lint completo**

```bash
npm run lint
```

Esperado: sem novos warnings em relação ao baseline da Task 0.

- [ ] **Step 3: Type check**

```bash
npx tsc --noEmit
```

Esperado: sem erros novos.

- [ ] **Step 4: Smoke completo no Expo Go**

Cenários:
1. Trilha nunca iniciada → abre no resumo (intro)
2. Trilha em andamento → retoma no checkpoint
3. Avançar blocos, completar atividade → progresso persiste
4. Atividade com timer → estouro mostra dialog
5. Trilha personalizada → steps personalizados aparecem
6. Concluir trilha → modal de próximos tópicos abre, conquistas/ranking recarregam
7. Fechar app no meio de um conteúdo, reabrir → tempo de estudo registrado, posição retomada

- [ ] **Step 5: Abrir PR para `base-teste`**

```bash
git push -u origin refactor/trilha-id-extract
```

PR title: `refactor(trilha): quebra [id].tsx em hooks + helpers + styles`

Body:
- Spec: `docs/superpowers/specs/2026-05-16-refactor-trilha-id-design.md`
- Plan: `docs/superpowers/plans/2026-05-16-refactor-trilha-id.md`
- Sem mudança comportamental. Validado com smoke manual nos 7 cenários do plano.

---

## Notas finais

- **Se algum task introduzir regressão**, revert imediato (`git revert HEAD`) e replanejar. Não acumular mudanças quebradas.
- **Refs compartilhadas** (`emitSignalRef`, `lastOpenedSignalRef`, `autoViewedContentRef`, `concluirTopicoRef`, `autoViewedContentRef`, `moduleSessionStartedAtRef`): permanecem no componente. Se um hook precisar de uma, recebe via arg.
- **Ordem dos hooks no componente final** deve seguir a sequência canônica:
  1. Contextos e params
  2. `usePersonalizedFlow`
  3. Memos primários (`conteudos`, `atividades`, `blocks`, `checkpointParams`, `topicoJaIniciado`, `topicoConcluido`)
  4. `useCheckpointResume`
  5. Memos derivados (`currentStudyBlockSignature`, `isCurrentStudyBlockTrackable`, `atualBlock`, `atividadeAtualResolvida`)
  6. `useStudyTimeTracking`
  7. `useTelemetryHandlers`
  8. `useTopicoCompletion`
  9. `usePersonalizationRefresh`
  10. Demais effects e JSX
