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
  const completed = input.remoteCompleted || input.localCompleted;
  return {
    completed,
    locked: completed ? false : !input.locallyUnlocked,
  };
}
