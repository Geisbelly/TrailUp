import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const source = readFileSync(
  resolve(process.cwd(), "src", "app", "(tabs)", "perfil", "index.tsx"),
  "utf8",
);

test("botão da Bag tem alvo próprio na linha de atalhos do perfil compacto", () => {
  assert.match(
    source,
    /<View[^>]*style=\{styles\.btnBagWrap\}[^>]*>[\s\S]*?accessibilityLabel="Abrir minha Bag"[\s\S]*?<\/View>/,
  );
  assert.match(
    source,
    /btnBagWrap:\s*\{[\s\S]*?position:\s*"absolute"[\s\S]*?top:\s*10[\s\S]*?right:\s*124[\s\S]*?zIndex:\s*10/,
  );
});
