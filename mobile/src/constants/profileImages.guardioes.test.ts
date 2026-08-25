import assert from "node:assert/strict";
import test from "node:test";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// profileImages.ts usa require() de PNG e importa react-native, entao nao carrega
// no harness do node. O que da pra travar aqui e o CONTRATO com os arquivos: um
// require apontando pra asset inexistente derruba a tela em runtime e nao
// aparece em typecheck.
//
// Comparacao por substring, nao regex: o arquivo esta em CRLF e a fonte tem
// aspas e barras por toda parte -- montar regex disso e mais frageis que o que
// se quer proteger.
const CONSTANTES = join(process.cwd(), "src", "constants");
const ROSTOS = join(process.cwd(), "src", "assets", "guardioes", "rosto");
const fonte = readFileSync(join(CONSTANTES, "profileImages.ts"), "utf8");

const PERFIS = [
  "seeker",
  "survivor",
  "daredevil",
  "mastermind",
  "conqueror",
  "socializer",
  "achiever",
] as const;

test("todo perfil tem rosto de guardiao no mapa", () => {
  for (const perfil of PERFIS) {
    assert.ok(
      fonte.includes(`${perfil}: require("@/assets/guardioes/rosto/`),
      `perfil sem entrada em guardianFaceImages: ${perfil}`
    );
  }
});

test("todo arquivo referenciado existe em disco", () => {
  const referencias = [...fonte.matchAll(/@\/assets\/guardioes\/rosto\/([\w.-]+\.png)/g)].map(
    (achado) => achado[1]
  );

  assert.ok(referencias.length >= PERFIS.length);
  for (const arquivo of referencias) {
    assert.ok(existsSync(join(ROSTOS, arquivo)), `asset ausente: ${arquivo}`);
  }
});

test("o Socializador usa o par, nao um guardiao so", () => {
  // E o unico perfil com dois guardioes, e e isso que faz o audio dele ser
  // dialogo. Mostrar so um contradiria o material que o aluno recebe.
  assert.ok(
    fonte.includes('socializer: require("@/assets/guardioes/rosto/socializer-duo.png")')
  );
});

test("brainHexConfig.image aponta pro guardiao, nao pro simbolo", () => {
  assert.equal(fonte.includes("image: bannerImages["), false);
  for (const perfil of PERFIS) {
    assert.ok(
      fonte.includes(`image: guardianFaceImages.${perfil},`),
      `brainHexConfig.${perfil}.image nao aponta pro guardiao`
    );
  }
});

test("imagemIndex sobreviveu, porque banner nao e a mesma coisa que guia", () => {
  const ocorrencias = [...fonte.matchAll(/imagemIndex: \d+,/g)];
  assert.equal(ocorrencias.length, PERFIS.length);
});
