import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

import { buildTutorialTips } from "./dicasDoTutorial";

const GLIFOS = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      "node_modules",
      "@expo",
      "vector-icons",
      "build",
      "vendor",
      "react-native-vector-icons",
      "glyphmaps",
      "MaterialCommunityIcons.json",
    ),
    "utf8",
  ),
) as Record<string, number>;

const TODAS = [
  ...buildTutorialTips("trilha_home", { hasBattle: true, hasReadingTimer: true, hasActivityTimer: true }),
  ...buildTutorialTips("modulo", { hasBattle: true, hasReadingTimer: true, hasActivityTimer: true }),
];

function arquivosDoApp(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivosDoApp(caminho);
    return /\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

test("todo chip do tutorial tem ícone que existe na fonte", () => {
  for (const dica of TODAS) {
    assert.ok(GLIFOS[dica.icon] !== undefined, `${dica.label}: ${dica.icon} não existe na fonte`);
  }
});

test("Progresso e Limites não usam mais os ícones que quebraram na web (24/11)", () => {
  const modulo = buildTutorialTips("modulo", { hasBattle: false, hasReadingTimer: false, hasActivityTimer: false });
  const porRotulo = Object.fromEntries(modulo.map((d) => [d.label, d.icon]));
  assert.equal(porRotulo.Progresso, "chart-timeline");
  assert.equal(porRotulo.Limites, "block-helper");
  // Os vizinhos que apareciam certos são do conjunto antigo da fonte; os dois novos também.
  for (const dica of modulo) {
    assert.ok(GLIFOS[dica.icon] < 0xf0a00, `${dica.label}: ${dica.icon} (${GLIFOS[dica.icon].toString(16)}) é do conjunto novo`);
  }
});

test("os chips de uma mesma fileira não repetem ícone", () => {
  for (const scope of ["modulo", "trilha_home"] as const) {
    const icones = buildTutorialTips(scope, { hasBattle: true, hasReadingTimer: true, hasActivityTimer: true }).map((d) => d.icon);
    assert.equal(new Set(icones).size, icones.length, `${scope} repete ícone`);
  }
});

test("um ícone, um significado: os ícones novos não têm outro dono no app", () => {
  const raiz = join(process.cwd(), "src");
  const proprio = join(raiz, "components", "ia", "dicasDoTutorial.ts");
  for (const icone of ["chart-timeline", "block-helper"]) {
    const donos = arquivosDoApp(raiz)
      .filter((arquivo) => arquivo !== proprio)
      .filter((arquivo) => readFileSync(arquivo, "utf8").includes(`"${icone}"`))
      .map((arquivo) => relative(raiz, arquivo));
    assert.deepEqual(donos, [], `${icone} já aparece em ${donos.join(", ")}`);
  }
});
