import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const sourcePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "TrilhaContext.tsx",
);
const source = readFileSync(sourcePath, "utf8");

test("TrilhaContext não grava progresso agregado diretamente em classe_aluno", () => {
  assert.doesNotMatch(
    source,
    /\.from\(['"]classe_aluno['"]\)\s*\.update\(/,
  );
});
