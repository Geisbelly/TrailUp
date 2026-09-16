import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(
  resolve(process.cwd(), "src", "app", "(tabs)", "perfil", "index.tsx"),
  "utf8",
);

test("botão da Bag no perfil fica em uma camada absoluta própria", () => {
  assert.match(
    source,
    /<View[^>]*style=\{styles\.btnBagWrap\}[^>]*>[\s\S]*?accessibilityLabel="Abrir minha Bag"[\s\S]*?<\/View>/,
  );
  assert.match(
    source,
    /btnBagWrap:\s*\{[\s\S]*?position:\s*"absolute"[\s\S]*?right:\s*20[\s\S]*?zIndex:\s*10/,
  );
});
