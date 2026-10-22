import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import tinycolor from "tinycolor2";

import { buildProfileShellPaletteFromAccent, resolveSystemVisualTheme } from "./profileShellPalette";

/**
 * A tela do aluno — inclusive o player de mídia — é pintada pela paleta do perfil BrainHex.
 * Aqui se trava o que o CLAUDE.md exige da derivação e que nenhum teste cobria por perfil:
 *
 * - o accent tem contraste AAA (>= 4.5:1) sobre a superfície MAIS CLARA em que aparece;
 * - a correção de contraste sobe só a LUMINOSIDADE: matiz e saturação ficam intactos. Misturar
 *   com branco também passaria no contraste e apagaria a cor-assinatura do perfil — é
 *   exatamente o erro que a regra proíbe, e ele é invisível num teste que só olhe contraste;
 * - os 7 perfis continuam distinguíveis entre si.
 *
 * `profileImages.ts` não carrega no harness do node (`require` de PNG e import de react-native),
 * então as cores são lidas da fonte — mesma técnica de `profileImages.guardioes.test.ts`.
 */
const PERFIS = [
  "seeker",
  "survivor",
  "daredevil",
  "mastermind",
  "conqueror",
  "socializer",
  "achiever",
] as const;

const fonte = readFileSync(join(process.cwd(), "src", "constants", "profileImages.ts"), "utf8");
const blocoDeConfig = fonte.slice(fonte.indexOf("export const brainHexConfig"));

function corAssinatura(perfil: string): string {
  const achado = new RegExp(`${perfil}:\\s*\\{\\s*color:\\s*"([^"]+)"`).exec(blocoDeConfig);
  assert.ok(achado, `perfil ${perfil} sem cor-assinatura em brainHexConfig`);
  return achado[1];
}

const paletas = PERFIS.map((perfil) => ({
  perfil,
  assinatura: corAssinatura(perfil),
  paleta: buildProfileShellPaletteFromAccent(corAssinatura(perfil), resolveSystemVisualTheme(perfil)),
}));

test("todo perfil tem cor-assinatura valida", () => {
  for (const { perfil, assinatura } of paletas) {
    assert.ok(tinycolor(assinatura).isValid(), `${perfil}: "${assinatura}" nao e cor valida`);
  }
});

test("o accent de cada perfil passa AAA sobre a superficie mais clara", () => {
  for (const { perfil, paleta } of paletas) {
    const razao = tinycolor.readability(paleta.accent, paleta.surfaceElevated);
    assert.ok(
      razao >= 4.5,
      `${perfil}: accent ${paleta.accent} sobre ${paleta.surfaceElevated} da' ${razao.toFixed(2)}:1`
    );
  }
});

test("o icone do controle principal e legivel sobre o accent", () => {
  // O botao de play/pause e' `backgroundColor: palette.accent` com o icone em
  // `palette.background`. Perfil cujo accent escurecesse engoliria o icone.
  for (const { perfil, paleta } of paletas) {
    const razao = tinycolor.readability(paleta.background, paleta.accent);
    assert.ok(razao >= 4.5, `${perfil}: icone sobre o accent da' so ${razao.toFixed(2)}:1`);
  }
});

test("a correcao de contraste nao desatura a cor-assinatura", () => {
  for (const { perfil, assinatura, paleta } of paletas) {
    const original = tinycolor(assinatura).toHsl();
    const final = tinycolor(paleta.accent).toHsl();
    // Cinza (survivor) tem matiz instavel: com saturacao perto de zero o angulo nao significa
    // nada, e comparar graus ali acusaria ruido em vez de defeito.
    if (original.s > 0.1) {
      const desvio = Math.abs(original.h - final.h);
      const distancia = Math.min(desvio, 360 - desvio);
      assert.ok(distancia <= 2, `${perfil}: matiz andou ${distancia.toFixed(1)} graus`);
    }
    assert.ok(
      final.s >= original.s - 0.02,
      `${perfil}: saturacao caiu de ${original.s.toFixed(2)} para ${final.s.toFixed(2)} — ` +
        "sinal de mistura com branco, que apaga a cor do perfil"
    );
  }
});

test("os 7 perfis nao colapsam na mesma cor", () => {
  const accents = new Set(paletas.map(({ paleta }) => paleta.accent));
  assert.equal(accents.size, PERFIS.length, `so ${accents.size} accents distintos entre 7 perfis`);

  // Distinto nao basta: tem de ser distinguivel a olho. Comparacao par a par do matiz, fora os
  // de saturacao baixa, onde a diferenca que o aluno ve e' o tom e nao o angulo.
  const coloridos = paletas.filter(({ paleta }) => tinycolor(paleta.accent).toHsl().s > 0.25);
  for (let i = 0; i < coloridos.length; i += 1) {
    for (let j = i + 1; j < coloridos.length; j += 1) {
      const a = tinycolor(coloridos[i].paleta.accent).toHsl().h;
      const b = tinycolor(coloridos[j].paleta.accent).toHsl().h;
      const desvio = Math.abs(a - b);
      const distancia = Math.min(desvio, 360 - desvio);
      assert.ok(
        distancia >= 10,
        `${coloridos[i].perfil} e ${coloridos[j].perfil} ficam a ${distancia.toFixed(1)} graus um do outro`
      );
    }
  }
});

test("o tema visual de cada perfil e o que o sistema define", () => {
  const esperado: Record<string, string> = {
    seeker: "magica",
    socializer: "magica",
    conqueror: "medieval",
    survivor: "medieval",
    daredevil: "medieval",
    mastermind: "real",
    achiever: "real",
  };
  for (const { perfil, paleta } of paletas) {
    assert.equal(paleta.theme, esperado[perfil], `${perfil} mudou de tema visual`);
  }
});

/**
 * `textMuted` e `textSubtle` são o `text` com alfa (0.82 e 0.62). `tinycolor.readability` IGNORA
 * o canal alfa: medir a rgba direto devolve o mesmo número do `text` opaco e dá um verde falso
 * justamente nas duas cores mais claras de passar despercebidas. Por isso o achatamento manual
 * contra o fundo — é o que o olho vê.
 */
function sobreOFundo(frente: string, fundo: string): string {
  const alfa = tinycolor(frente).getAlpha();
  const opaca = tinycolor(frente).setAlpha(1).toHexString();
  return tinycolor.mix(fundo, opaca, alfa * 100).toHexString();
}

test("todo texto do bloco passa AA sobre a superficie, nos 7 perfis", () => {
  // AA (4.5:1) e' o piso: `textSubtle` fica entre 5.2 e 6.7 hoje, com folga mas sem sobrar
  // muito. Escurecer uma superficie ou baixar o alfa derrubaria a linha do tempo do player
  // primeiro, e isso nao aparece em teste de comportamento nenhum.
  for (const { perfil, paleta } of paletas) {
    const tokens = {
      text: paleta.text,
      textMuted: paleta.textMuted,
      textSubtle: paleta.textSubtle,
      accent: paleta.accent,
    };
    for (const [nome, cor] of Object.entries(tokens)) {
      const razao = tinycolor.readability(sobreOFundo(cor, paleta.surface), paleta.surface);
      assert.ok(
        razao >= 4.5,
        `${perfil}: ${nome} sobre surface da' ${razao.toFixed(2)}:1`
      );
    }
  }
});

test("o alfa de textMuted e textSubtle continua sendo alfa", () => {
  // Se alguem trocar por hex opaco, o teste acima para de medir o que diz medir.
  for (const { perfil, paleta } of paletas) {
    for (const nome of ["textMuted", "textSubtle"] as const) {
      assert.ok(
        tinycolor(paleta[nome]).getAlpha() < 1,
        `${perfil}: ${nome} perdeu o alfa — reveja o achatamento deste teste`
      );
    }
  }
});
