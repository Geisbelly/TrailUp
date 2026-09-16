import assert from "node:assert/strict";
import test from "node:test";

import tinycolor from "tinycolor2";

import { Noite, Texto } from "./identidade";

/* eslint-disable @typescript-eslint/no-require-imports */
// `GlobalStyle.ts` importa react-native por causa de `Platform` (a pilha de
// fontes). Stub via require.cache, o mesmo truque documentado em
// `PresentationSlidesBlock.test.ts`.
const caminhoRN = require.resolve("react-native");
(require.cache as Record<string, unknown>)[caminhoRN] = {
  exports: { Platform: { select: (o: Record<string, string>) => o.default ?? o.ios } },
};

const { Color } = require("./GlobalStyle") as typeof import("./GlobalStyle");

const razao = (a: string, b: string) => tinycolor.readability(a, b);

test("o fundo das telas e' o chao novo, nao o #111936 antigo", () => {
  // `Color.background` pinta a pagina da trilha, do ranking, das notificacoes e
  // do topico (16 lugares). Enquanto ele nao mudasse, trocar a paleta do PERFIL
  // nao aparecia na tela: o app continuava com o chao antigo.
  assert.equal(Color.background, Noite.n900);
  assert.notEqual(Color.background.toLowerCase(), "#111936");
});

test("as superficies legadas apontam para a escada da identidade", () => {
  const daEscada = new Set<string>(Object.values(Noite));
  for (const chave of [
    "colorGray",
    "colorDarkslateblue",
    "colorMidnightblue100",
    "colorDarkslategray",
    "colorDarkslategray100",
    "colorDarkslategray200",
  ] as const) {
    assert.ok(
      daEscada.has(Color[chave]),
      `${chave} = ${Color[chave]} nao esta na escada Noite`
    );
  }
});

test("o texto secundario deixou de reprovar em contraste", () => {
  // `colorSlategray` era `#5d6579` e dava 2,96 sobre o fundo antigo, usado como
  // `color:` em 27 lugares. Reprovava em AA desde antes desta migracao.
  assert.equal(Color.colorSlategray, Texto.medio);
  assert.ok(razao("#5d6579", "#111936") < 4.5, "premissa mudou");
  assert.ok(razao(Color.colorSlategray, Color.background) >= 4.5);
});

test("todo texto legado passa em AA sobre o chao novo", () => {
  const comoTexto = [
    Color.colorAliceblue,
    Color.colorAliceblue100,
    Color.colorSlategray,
    Color.colorBlueviolet100,
    Color.colorWhite,
  ];
  for (const cor of comoTexto) {
    for (const fundo of [Color.background, Noite.n800, Noite.n700]) {
      const r = razao(cor, fundo);
      assert.ok(r >= 4.5, `${cor} da ${r.toFixed(2)} sobre ${fundo}`);
    }
  }
});

test("o accent de fallback manteve a matiz roxa, so subiu a luminosidade", () => {
  // A regra do repo e' elevar luminosidade HSL, nunca misturar com branco —
  // misturar "apaga" a cor mesmo passando no contraste.
  const antes = tinycolor("#9747ff").toHsl();
  const depois = tinycolor(Color.colorBlueviolet100).toHsl();
  assert.ok(Math.abs(antes.h - depois.h) < 2, "a matiz mudou");
  assert.ok(depois.l > antes.l, "a luminosidade deveria ter subido");
  assert.ok(depois.s > 0.5, "saturacao caiu: parece mistura com branco");
});
