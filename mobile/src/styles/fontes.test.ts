import assert from "node:assert/strict";
import test from "node:test";

import { Fontes } from "./identidade";

/* eslint-disable @typescript-eslint/no-require-imports */
// Os pacotes `@expo-google-fonts/*` exportam `require()` de arquivos .ttf, que
// o node nao carrega. Stub via require.cache, o mesmo truque documentado em
// `PresentationSlidesBlock.test.ts`. O que importa aqui nao e' o binario: sao
// as CHAVES do mapa.
for (const pacote of ["@expo-google-fonts/jost", "@expo-google-fonts/karla"]) {
  (require.cache as Record<string, unknown>)[require.resolve(pacote)] = {
    exports: { Jost_600SemiBold: 1, Karla_400Regular: 2 },
  };
}

const { FONTES_DA_IDENTIDADE } = require("./fontes") as typeof import("./fontes");

test("as chaves carregadas sao exatamente as familias declaradas", () => {
  // Uma chave errada aqui nao derruba nada: o app sobe inteiro e renderiza na
  // fonte do sistema, calado. So' aparece olhando o aparelho.
  assert.deepEqual(
    Object.keys(FONTES_DA_IDENTIDADE).sort(),
    [...Object.values(Fontes)].sort()
  );
});

test("toda familia declarada tem binario para carregar", () => {
  for (const familia of Object.values(Fontes)) {
    assert.ok(
      FONTES_DA_IDENTIDADE[familia] !== undefined,
      `${familia} esta em Fontes mas ninguem a carrega`
    );
  }
});
