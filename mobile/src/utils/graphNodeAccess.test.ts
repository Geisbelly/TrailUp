import assert from "node:assert/strict";
import test from "node:test";

import { resolveGraphNodeAccess } from "./graphNodeAccess";

test("progresso local libera nó mesmo se a API remota devolver lock antigo", () => {
  assert.deepEqual(
    resolveGraphNodeAccess({
      remoteCompleted: false,
      remoteLocked: true,
      localCompleted: false,
      locallyUnlocked: true,
    }),
    { completed: false, locked: false },
  );
});

test("tópico ainda pendente continua bloqueado quando a dependência local não foi concluída", () => {
  assert.deepEqual(
    resolveGraphNodeAccess({
      remoteCompleted: false,
      remoteLocked: false,
      localCompleted: false,
      locallyUnlocked: false,
    }),
    { completed: false, locked: true },
  );
});
