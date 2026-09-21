export type GraphNodeAccessInput = {
  remoteCompleted: boolean;
  remoteLocked: boolean;
  localCompleted: boolean;
  locallyUnlocked: boolean;
};

export type GraphNodeAccess = {
  completed: boolean;
  locked: boolean;
};

export function resolveGraphNodeAccess(input: GraphNodeAccessInput): GraphNodeAccess {
  // O grafo remoto é uma sugestão da IA; a classe local vem do Supabase.
  const completed = input.localCompleted;
  return {
    completed,
    locked: completed ? false : !input.locallyUnlocked,
  };
}
