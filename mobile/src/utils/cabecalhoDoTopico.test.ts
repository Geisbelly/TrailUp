import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { larguraMaximaDoTitulo, reservaDoChipDeBatalha } from "./cabecalhoDoTopico";

const aqui = dirname(fileURLToPath(import.meta.url));

test("sem chip de batalha a barra não guarda espaço à direita", () => {
  assert.equal(reservaDoChipDeBatalha(0), 0);
  assert.equal(reservaDoChipDeBatalha(Number.NaN), 0);
});

test("com chip a reserva cobre a largura medida, a distância da borda e a folga", () => {
  assert.equal(reservaDoChipDeBatalha(120), 144);
  assert.equal(reservaDoChipDeBatalha(120.4), 145);
});

test("o título usa o que sobra na tela e não some nas telas estreitas", () => {
  assert.equal(larguraMaximaDoTitulo(412), 204);
  assert.equal(larguraMaximaDoTitulo(360), 152);
  assert.equal(larguraMaximaDoTitulo(280), 112);
});

test("a tela do Tópico mede o chip em vez de reservar um valor fixo", () => {
  const tela = readFileSync(resolve(aqui, "../app/(tabs)/trilha/[id].tsx"), "utf8");
  assert.match(tela, /reservaDireita=\{reservaDoChipDeBatalha\(/);
  assert.doesNotMatch(tela, /reservaDireita=\{[^}]*\? 96/);
});

test("o cabeçalho do Tópico alinha o título à esquerda", () => {
  const layout = readFileSync(resolve(aqui, "../app/(tabs)/trilha/_layout.tsx"), "utf8");
  assert.match(layout, /return \{\s*headerTitleAlign: "left" as const,/);
});
