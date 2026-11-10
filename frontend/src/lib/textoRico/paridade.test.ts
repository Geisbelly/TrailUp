/**
 * O console e o app preparam o texto rico do mesmo jeito (spec A). Os dois pacotes têm o seu
 * `casos.json`, e eles são o mesmo arquivo, byte a byte. Quando o app já tem o texto rico (PR 2),
 * o `prepararTextoRico` e o `matematicaLegivel` dele também são conferidos: mesmo código.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";

import casos from "./casos.json";
import { corpoDaFormula, matematicaLegivel } from "./matematicaLegivel";
import { prepararTextoRico } from "./prepararTextoRico";

const DO_APP = join(__dirname, "../../../../mobile/src/utils");
const CASOS_DO_APP = join(DO_APP, "textoRico/casos.json");
const temApp = existsSync(CASOS_DO_APP);

const EXTRAS = [
  "Quanto vale \\(\\frac{3}{4} + \\frac{1}{8}\\)?",
  "A combustão de \\(\\ce{CH4}\\) custa R$ 50, e $$E = mc^2$$",
  "```python\nprint('$x$')\n```\ne $y$",
  "paguei $5 e $8, e $x = 2$",
];

test.skipIf(!temApp)("casos.json é o mesmo nos dois pacotes, byte a byte", () => {
  assert.equal(readFileSync(join(__dirname, "casos.json"), "utf8"), readFileSync(CASOS_DO_APP, "utf8"));
});

/** O código sem o comentário de cabeçalho, que diz de onde é a cópia e por isso difere. */
function semCabecalho(caminho: string): string {
  return readFileSync(caminho, "utf8")
    .replace(/^\/\*\*[\s\S]*?\*\/\n/, "")
    .replace('from "../matematicaLegivel"', 'from "./matematicaLegivel"');
}

// O código do app não roda aqui (o vitest do console leria o `tsconfig` do Expo, que não está
// instalado neste pacote), então a comparação é do código-fonte, fora o cabeçalho.
test.skipIf(!temApp)("prepararTextoRico e matematicaLegivel são o mesmo código nos dois pacotes", () => {
  assert.equal(
    semCabecalho(join(__dirname, "prepararTextoRico.ts")),
    semCabecalho(join(DO_APP, "textoRico/prepararTextoRico.ts")),
  );
  assert.equal(semCabecalho(join(__dirname, "matematicaLegivel.ts")), semCabecalho(join(DO_APP, "matematicaLegivel.ts")));
});

test.skipIf(!temApp)("os dialetos de SQL são o mesmo código nos dois pacotes", () => {
  assert.equal(semCabecalho(join(__dirname, "dialetosSql.ts")), semCabecalho(join(DO_APP, "textoRico/dialetosSql.ts")));
});

test("as saídas de referência continuam as mesmas", () => {
  assert.equal(prepararTextoRico(EXTRAS[1]), "A combustão de $\\ce{CH4}$ custa R\\$ 50, e $$E = mc^2$$");
  assert.equal(corpoDaFormula("\\ce{2H2 + O2 -> 2H2O}"), "2H₂ + O₂ → 2H₂O");
  assert.equal(matematicaLegivel("se $x^2 = 4$"), "se x² = 4");
});

test.runIf(!temApp)("sem o app (PR 2 ainda não entrou): a paridade fica para quando ele entrar", () => {
  assert.ok(!temApp);
});
