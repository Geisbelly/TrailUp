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

test("no Android a linha do chip tem altura própria e não cobre o conteúdo", () => {
  const chip = ler("../components/ia/IABattleHeaderChip.tsx");
  assert.match(chip, /variante === "linha" && styles\.chipEmLinha/);
  assert.match(chip, /chipEmLinha: \{ flex: 0 \}/);
});

test("o título guarda folga até o cronômetro no Android", () => {
  const titulo = ler("../components/trilhas/ModuleHeaderTitle.tsx");
  assert.match(titulo, /Platform\.OS === "android" && styles\.containerAndroid/);
});

test("o destaque do tour mede a barra certa e soma a barra de status no Android", () => {
  const tela = ler("../app/(tabs)/trilha/[id].tsx");
  assert.equal(tela.match(/ref=\{progressGuideTargetRef\}/g), null);
  assert.equal(tela.match(/alvoRef=\{progressGuideTargetRef\}/g)?.length, 1);
  const titulo = ler("../components/trilhas/ModuleHeaderTitle.tsx");
  assert.match(titulo, /y \+ \(Platform\.OS === "android" \? \(StatusBar\.currentHeight \?\? 0\) : 0\) - padding/);
});
