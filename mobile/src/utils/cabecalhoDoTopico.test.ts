import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { larguraMaximaDoTitulo } from "./cabecalhoDoTopico";

const aqui = dirname(fileURLToPath(import.meta.url));
const ler = (caminho: string) => readFileSync(resolve(aqui, caminho), "utf8");

test("o título usa o que sobra na tela e não some nas telas estreitas", () => {
  assert.equal(larguraMaximaDoTitulo(412), 220);
  assert.equal(larguraMaximaDoTitulo(360), 168);
  assert.equal(larguraMaximaDoTitulo(280), 112);
});

test("o cabeçalho do Tópico alinha o título à esquerda", () => {
  const layout = ler("../app/(tabs)/trilha/_layout.tsx");
  assert.match(layout, /return \{\s*headerTitleAlign: "left" as const,/);
});

test("no celular o chip de batalha fica em linha própria, sem disputar a barra de partes", () => {
  const tela = ler("../app/(tabs)/trilha/[id].tsx");
  assert.match(tela, /<IABattleHeaderChip variante="linha"/);
  assert.doesNotMatch(tela, /reservaDireita/);
});

test("a margem da linha só existe depois das saídas sem batalha", () => {
  const chip = ler("../components/ia/IABattleHeaderChip.tsx");
  const semBatalha = chip.indexOf("!hasBattleSignal ||");
  const margem = chip.indexOf("<View style={styles.linha}>");
  assert.ok(semBatalha > 0 && margem > semBatalha);
  assert.doesNotMatch(ler("../styles/trilhaTopicoStyles.ts"), /linhaBatalha: \{[^}]*(margin|padding|height)/);
});
