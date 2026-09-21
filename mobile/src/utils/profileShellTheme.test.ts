import assert from "node:assert/strict";
import test from "node:test";

import tinycolor from "tinycolor2";

import { Aco, Noite, Texto } from "../styles/identidade";

/* eslint-disable @typescript-eslint/no-require-imports */
// `profileShellTheme` importa `@/constants/profileImages` por causa de
// `getProfileShellPalette`, e aquele modulo faz require() de PNG e importa
// react-native — nada disso carrega fora do Metro. Stubamos via require.cache,
// o mesmo truque documentado em `PresentationSlidesBlock.test.ts`. O que esta
// sendo testado (`buildProfileShellPaletteFromAccent`) nao usa o modulo stubado.
const caminhoProfileImages = require.resolve("@/constants/profileImages");
(require.cache as Record<string, unknown>)[caminhoProfileImages] = {
  exports: { getBrainHexConfig: () => ({ color: "#5b3fd9" }) },
};

const {
  buildProfileShellPaletteFromAccent,
  CONTRASTE_MINIMO,
} = require("./profileShellTheme") as typeof import("./profileShellTheme");

type ProfileShellPalette = import("./profileShellTheme").ProfileShellPalette;

// Fonte oficial: microservice/src/constants/brainHex.ts
const ASSINATURAS: Record<string, string> = {
  Seeker: "#17a398",
  Survivor: "#4e5a66",
  Daredevil: "#d7263d",
  Mastermind: "#5b3fd9",
  Conqueror: "#1e4fd6",
  Socializer: "#f4623a",
  Achiever: "#c9a227",
};

const razao = (a: string, b: string) => tinycolor.readability(a, b);

const SUPERFICIES: Array<[string, string]> = [
  ["fundo", Noite.n900],
  ["superficie", Noite.n800],
  ["elevada", Noite.n700],
];

test("o chao e' o mesmo para os sete perfis", () => {
  const paletas = Object.values(ASSINATURAS).map((cor) =>
    buildProfileShellPaletteFromAccent(cor)
  );

  for (const chave of ["background", "surface", "surfaceElevated", "border"] as const) {
    const valores = new Set(paletas.map((p) => p[chave]));
    assert.equal(
      valores.size,
      1,
      `${chave} deveria ser igual nos sete, veio ${[...valores].join(", ")}`
    );
  }
});

test("o accent de cada perfil passa no contraste sobre a superficie mais clara", () => {
  for (const [perfil, assinatura] of Object.entries(ASSINATURAS)) {
    const { accent } = buildProfileShellPaletteFromAccent(assinatura);
    const r = razao(accent, Noite.n700);
    assert.ok(
      r >= CONTRASTE_MINIMO,
      `${perfil}: accent ${accent} da ${r.toFixed(2)} sobre a elevada`
    );
  }
});

test("tres assinaturas sobrevivem sem ajuste nenhum no chao novo", () => {
  // Antes, com o chao tingido por tema, TODAS eram clareadas. Este teste e' o
  // que mede o ganho: a cor oficial do perfil chega intacta ao aluno.
  for (const perfil of ["Seeker", "Socializer", "Achiever"]) {
    const assinatura = ASSINATURAS[perfil];
    const { accent } = buildProfileShellPaletteFromAccent(assinatura);
    assert.equal(
      accent.toLowerCase(),
      assinatura.toLowerCase(),
      `${perfil} nao deveria precisar de correcao`
    );
  }
});

test("os tres niveis de texto passam nas tres superficies", () => {
  const palette = buildProfileShellPaletteFromAccent(ASSINATURAS.Mastermind);
  const niveis: Array<[string, string]> = [
    ["text", palette.text],
    ["textMuted", palette.textMuted],
    ["textSubtle", palette.textSubtle],
  ];

  for (const [nome, cor] of niveis) {
    for (const [ondeNome, onde] of SUPERFICIES) {
      const r = razao(cor, onde);
      assert.ok(
        r >= CONTRASTE_MINIMO,
        `${nome} (${cor}) da ${r.toFixed(2)} sobre a ${ondeNome}`
      );
    }
  }
});

test("o piso do texto e' corrigido, nao copiado cru da ficha", () => {
  // `#7d8794` da 4,15 sobre a elevada: passa onde foi medido e reprova onde e'
  // usado. Se alguem "simplificar" trocando o token corrigido pelo cru, este
  // teste cai.
  const palette = buildProfileShellPaletteFromAccent(ASSINATURAS.Seeker);
  assert.ok(razao(Texto.fraco, Noite.n700) < CONTRASTE_MINIMO, "premissa mudou");
  assert.notEqual(palette.textSubtle.toLowerCase(), Texto.fraco.toLowerCase());
});

test("aba inativa nao usa o Aco, que reprova como texto", () => {
  const palette = buildProfileShellPaletteFromAccent(ASSINATURAS.Conqueror);
  assert.notEqual(palette.inactive.toLowerCase(), Aco.toLowerCase());
  assert.ok(razao(palette.inactive, Noite.n900) >= CONTRASTE_MINIMO);
});

test("accent invalido cai no cinza neutro em vez de estourar", () => {
  const paletas: ProfileShellPalette[] = [
    buildProfileShellPaletteFromAccent(null),
    buildProfileShellPaletteFromAccent(""),
    buildProfileShellPaletteFromAccent("nao-e-cor"),
  ];
  for (const palette of paletas) {
    assert.ok(tinycolor(palette.accent).isValid());
    assert.ok(razao(palette.accent, Noite.n700) >= CONTRASTE_MINIMO);
  }
});
