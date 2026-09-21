import assert from "node:assert/strict";
import test from "node:test";

import { resolveGraphNodeAccess } from "./graphNodeAccess";

test('conclusão antiga do grafo remoto não sobrescreve projeção do Supabase', () => {
  assert.deepEqual(resolveGraphNodeAccess({ remoteCompleted: true, remoteLocked: false,
    localCompleted: false, locallyUnlocked: false }), { completed: false, locked: true });
});

test('conclusão confirmada libera o tópico mesmo com lock remoto', () => {
  assert.deepEqual(resolveGraphNodeAccess({ remoteCompleted: false, remoteLocked: true,
    localCompleted: true, locallyUnlocked: false }), { completed: true, locked: false });
});

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
