# Refatoração de `src/app/(tabs)/trilha/[id].tsx`

**Data:** 2026-05-16
**Status:** Aprovado para planejamento
**Branch alvo:** `refactor/trilha-id-extract` (criada a partir de `base-teste`)

## Motivação

O arquivo `src/app/(tabs)/trilha/[id].tsx` tem 2.853 linhas, sendo o maior módulo do app. Concentra:

- ~411 linhas de helpers puros e normalizadores no topo
- ~2.135 linhas do componente `TrilhaConteudoScreen` (state, refs, memos, effects, handlers e JSX)
- ~300 linhas de styles

O tamanho dificulta navegação, revisão e testes. Como a branch `base-teste` está adicionando segurança RLS e novas telas (biblioteca de conquistas), é o momento de criar costuras antes da próxima onda de mudanças.

## Objetivo

Reduzir `[id].tsx` para algo entre 900 e 1.300 linhas sem alterar comportamento visual, fluxo de telemetria ou regras de progresso. Criar pontos de extensão testáveis (hooks isolados) que servirão de base para a frente de testes automatizados.

## Não-objetivos

- Adicionar testes automatizados (frente separada)
- Decompor o JSX em subcomponentes (deixado para futura iteração apoiada em testes)
- Refatorar arquivos vizinhos (`ContentRenderer`, `ActivityRenderer`, contextos)
- Mudar contratos com Supabase ou serviços
- Resolver os 20 arquivos modificados pendentes na `base-teste` (escopo separado)

## Estrutura de arquivos resultante

```
src/app/(tabs)/trilha/
  [id].tsx                       ~1100 linhas (composição: hooks + JSX)
  [id].styles.ts                 StyleSheet extraído

src/utils/
  trilhaBlocks.ts                Helpers puros de blocos
  personalizedFlow.ts            Normalizadores de step personalizado
  trilhaCheckpoint.ts            (já existe, sem mudança)

src/hooks/trilha/
  useCheckpointResume.ts
  useStudyTimeTracking.ts
  useTelemetryHandlers.ts
  useTopicoCompletion.ts
  usePersonalizationRefresh.ts
  usePersonalizedFlow.ts
```

## Helpers extraídos para `src/utils/trilhaBlocks.ts`

Todas funções stateless, exportadas com tipos públicos:

| Símbolo | Origem | Responsabilidade |
|---|---|---|
| `type Block` | L72 | União discriminada conteúdo \| atividade |
| `groupAtividadesByConteudo` | L86 | Agrupa atividades por conteúdo âncora |
| `buildBlocksForTopico` | L139 | Interleavea conteúdos e atividades em sequência |
| `calcularPosicaoInicial` | L219 | Índice do primeiro bloco não concluído |
| `isConteudoConcluido` | L237 | Predicate de conclusão de conteúdo |
| `isAtividadeConcluida` | L243 | Predicate de conclusão de atividade |
| `resolveLegacyStartPosition` | L265 | Posição inicial via `ultima_atividade` |
| `resolveCheckpointPosition` | L281 | Posição inicial via checkpoint persistido |
| `resolveConteudoMaterialContext` | L296 | Material primário para telemetria |
| `buildStableNegativeId` | L308 | Hash determinístico de string para id negativo |
| `normalizeModuleDifficulty` | L317 | Normaliza `"facil" \| "medio" \| "dificil"` |

## Helpers extraídos para `src/utils/personalizedFlow.ts`

| Símbolo | Origem | Responsabilidade |
|---|---|---|
| `normalizePersonalizedStepContent` | L334 | Converte step personalizado em `Conteudo` |
| `normalizePersonalizedStepActivity` | L370 | Converte step personalizado em `Atividade` + questões |

## Custom hooks

### `usePersonalizedFlow`
Encapsula o `useMemo` atual `personalizedFlow` (L485) e a derivação de `conteudos`/`atividades` combinados com o fluxo acadêmico.

```ts
function usePersonalizedFlow(args: {
  personalizedTopic: PersonalizedTopicPayload | null;
  topicoId: number | null;
}): {
  conteudosPersonalizados: Conteudo[];
  atividadesPersonalizadas: Atividade[];
  blocksPersonalizados: Block[];
};
```

### `useCheckpointResume`
Encapsula o efeito de hidratação (L906) e expõe o estado de posicionamento. Owner único do `checkpointHydratedRef` e do `primeiraVez`.

```ts
function useCheckpointResume(args: {
  blocks: Block[];
  topicoId: number | null;
  topico: any;
  checkpointParams: CheckpointParams;
  topicoJaIniciado: boolean;
  topicoConcluido: boolean;
}): {
  index: number;
  mostrarResumo: boolean;
  activityQuestionIndices: Record<number, number>;
  setIndex: (n: number) => void;
  setMostrarResumo: (b: boolean) => void;
  setActivityQuestionIndices: Dispatch<SetStateAction<Record<number, number>>>;
  primeiraVez: boolean;
  setPrimeiraVez: (b: boolean) => void;
  checkpointHydratedRef: MutableRefObject<boolean>;
};
```

### `useStudyTimeTracking`
Encapsula `activeStudyBlockRef`, `persistElapsedStudyBlock` (L608) e o flush periódico (`ACTIVE_STUDY_FLUSH_INTERVAL_MS`).

```ts
function useStudyTimeTracking(args: {
  currentStudyBlockSignature: StudyBlockSignature | null;
  isCurrentStudyBlockTrackable: boolean;
  registrarTempoTopico: (topicoId: number, min: number) => Promise<void>;
  salvarProgressoItemPersonalizado: (payload: ProgressoItemPersonalizado) => Promise<void>;
}): {
  activeStudyBlockRef: MutableRefObject<StudyBlockSnapshot | null>;
  persistElapsedStudyBlock: (snap: StudyBlockSnapshot | null) => Promise<void>;
};
```

### `useTelemetryHandlers`
Agrupa `handleTelemetryTouch` (L1243), `handleTelemetryScroll` (L1261) e `handleOverlayTimerTimeout` (L1267).

```ts
function useTelemetryHandlers(args: {
  studySessionParams: StudySessionParams | null;
  currentOverlayItemKey: string | null;
  currentTimedOutActivityId: number | null;
  emitSignal: (sig: string, payload?: any) => void;
}): {
  handleTelemetryTouch: (e: GestureResponderEvent) => void;
  handleTelemetryScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  handleOverlayTimerTimeout: () => void;
};
```

### `useTopicoCompletion`
Agrupa `areAcademicBlocksComplete` (L845), `handleConcluirTopico` (L1993) e `handlePularTrilha` (L1911).

```ts
function useTopicoCompletion(args: {
  topico: any;
  conteudos: Conteudo[];
  atividades: Atividade[];
  conteudosVistosLocal: Set<number>;
  atividadesResolvidasLocal: Map<number, AtividadeResolvida>;
  reloadConquistas: () => Promise<void>;
  reloadRanking: () => Promise<void>;
  registrarEvento: (...args: any[]) => Promise<void>;
  router: ReturnType<typeof useRouter>;
  showConfirm: ReturnType<typeof useDialog>["showConfirm"];
  showDialog: ReturnType<typeof useDialog>["showDialog"];
}): {
  areAcademicBlocksComplete: (...args: any[]) => boolean;
  handleConcluirTopico: () => Promise<void>;
  handlePularTrilha: () => Promise<void>;
};
```

### `usePersonalizationRefresh`
Encapsula o efeito (L731) que dispara re-carregamento quando `lastAnalysis.ciclo_id` muda e `refreshPolicy.triggerActions` contém alguma ação relevante.

```ts
function usePersonalizationRefresh(args: {
  personalizedTopic: PersonalizedTopicPayload | null;
  lastAnalysis: any;
  topicoId: number | null;
  carregarPersonalizacao: () => Promise<void>;
}): void;
```

## Decisões de design

### Refs compartilhadas
Refs que cruzam responsabilidades (`emitSignalRef`, `lastOpenedSignalRef`, `autoViewedContentRef`) ficam no componente pai e são passadas por argumento aos hooks que precisarem. Refs internas a uma única responsabilidade (`activeStudyBlockRef`, `checkpointHydratedRef`, `analysisRefreshBaselineRef`) descem com o hook que as usa.

### Ordem de hooks no componente
A ordem de invocação no componente pai segue a sequência lógica do código atual para evitar mudar a ordem de execução de efeitos. Sequência canônica:

1. Resolução de params + contextos
2. `usePersonalizedFlow`
3. State local primário (`index`, `mostrarResumo`, etc.)
4. `useCheckpointResume`
5. Memos derivados (`displayedBlocks`, `progressoTopico`, `currentStudyBlockSignature`)
6. `useStudyTimeTracking`
7. `useTelemetryHandlers`
8. `useTopicoCompletion`
9. `usePersonalizationRefresh`
10. JSX

### Convenção de imports
Hooks importados como `import { useCheckpointResume } from "@/hooks/trilha/useCheckpointResume";` (path alias `@/*` já configurado no `tsconfig.json`).

### Tipos compartilhados
`StudyBlockSnapshot`, `StudyBlockSignature`, `CheckpointParams`, `AtividadeResolvida` são definidos uma vez em `src/hooks/trilha/types.ts` e reexportados conforme necessário.

## Plano de execução (alto nível)

1. **Pré-requisito (fora deste spec):** decidir destino dos 20 arquivos pendentes na `base-teste` (commit ou stash).
2. Criar branch `refactor/trilha-id-extract` a partir de `base-teste`.
3. Etapa 1 — Extrair helpers puros (`trilhaBlocks.ts`, `personalizedFlow.ts`). Sem mudança de comportamento. Rodar `npm run lint`.
4. Etapa 2 — Extrair styles para `[id].styles.ts`. Rodar `npm run lint`.
5. Etapa 3 — Extrair hooks na ordem: `usePersonalizedFlow` → `useCheckpointResume` → `useStudyTimeTracking` → `useTelemetryHandlers` → `useTopicoCompletion` → `usePersonalizationRefresh`. Após cada hook: `npm run lint` + smoke manual no Expo (abrir uma trilha, navegar entre blocos, completar uma atividade, fechar app, reabrir e validar resumo de retomada).
6. Abrir PR para `base-teste` (ou merge direto se a branch ainda estiver em desenvolvimento individual).

## Critérios de aceitação

- `src/app/(tabs)/trilha/[id].tsx` final entre 900 e 1.300 linhas
- Zero mudança visual ou comportamental percebível
- `npm run lint` limpo
- Cada arquivo de hook < 250 linhas
- `tsc` sem novos erros
- Smoke manual cobre: abertura de trilha personalizada, navegação entre blocos, conclusão de atividade, conclusão de tópico, retomada via checkpoint

## Riscos

| Risco | Mitigação |
|---|---|
| Mudar ordem de hooks quebra estado entre renders | Manter ordem documentada na seção "Ordem de hooks no componente" |
| Closures defasadas em handlers extraídos | Passar dependências via `useRef` quando preciso; preservar `useCallback` deps idênticas às atuais |
| Conflito de merge com `base-teste` | Trabalhar em branch separada; rebase antes de abrir PR |
| Regressão silenciosa sem testes | Smoke manual obrigatório após cada hook; lista de cenários acima |
| Tipos `any` em `topico`/`conteudo` propagam para hooks | Manter `any` por enquanto (tipagem é fora-do-escopo); adicionar TODO para frente futura |

## Próximos passos pós-refactor (fora deste spec)

- Adicionar testes para `trilhaBlocks.ts` e `personalizedFlow.ts` (helpers puros — entrada fácil para Jest)
- Adicionar testes para hooks com `@testing-library/react-hooks` (RNTL)
- Considerar decomposição do JSX em subcomponentes (opção C original)
- Tipar `topico`, `conteudo`, `atividade` removendo `any`
