import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import tinycolor from "tinycolor2";

import { coresDoDetalheDaNotificacao } from "./notificacaoDetalheCores";
import { buildProfileShellPaletteFromAccent, resolveSystemVisualTheme } from "./profileShellPalette";

/**
 * O detalhe da notificação é pintado pela paleta do perfil, e os tons translúcidos
 * (`textMuted`, `textSubtle`, `accentMuted`) só têm contraste depois de compostos sobre o
 * fundo em que aparecem. Aqui cada par texto × fundo da tela é conferido nos 7 perfis.
 *
 * As cores-assinatura são lidas da fonte, como em `paletaPorPerfil.test.ts`:
 * `profileImages.ts` não carrega no harness do node.
 */
const PERFIS = ["seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever"] as const;

const fonte = readFileSync(join(process.cwd(), "src", "constants", "profileImages.ts"), "utf8");
const blocoDeConfig = fonte.slice(fonte.indexOf("export const brainHexConfig"));

function paletaDe(perfil: string) {
  const achado = new RegExp(`${perfil}:\\s*\\{\\s*color:\\s*"([^"]+)"`).exec(blocoDeConfig);
  assert.ok(achado, `perfil ${perfil} sem cor-assinatura em brainHexConfig`);
  return buildProfileShellPaletteFromAccent(achado[1], resolveSystemVisualTheme(perfil));
}

/** Compõe uma cor (possivelmente translúcida) sobre um fundo opaco. */
function sobre(cor: string, fundo: string): string {
  const frente = tinycolor(cor).toRgb();
  const atras = tinycolor(fundo).toRgb();
  const a = frente.a;
  return tinycolor({
    r: frente.r * a + atras.r * (1 - a),
    g: frente.g * a + atras.g * (1 - a),
    b: frente.b * a + atras.b * (1 - a),
  }).toHexString();
}

function contraste(texto: string, fundo: string, base: string): number {
  const fundoOpaco = sobre(fundo, base);
  return tinycolor.readability(sobre(texto, fundoOpaco), fundoOpaco);
}

for (const perfil of PERFIS) {
  for (const lida of [false, true]) {
    test(`detalhe da notificação tem contraste legível: ${perfil}, ${lida ? "lida" : "nova"}`, () => {
      const p = paletaDe(perfil);
      const c = coresDoDetalheDaNotificacao(p, lida);
      // [rótulo, texto, fundo, mínimo]. 7:1 é AAA de texto corrido; 4.5:1 é AAA de texto
      // grande/negrito e o mínimo AA de texto comum.
      const pares: [string, string, string, number][] = [
        ["mensagem", c.texto, c.cartao, 7],
        ["título", c.titulo, c.cartao, 7],
        ["hora", c.textoMudo, c.cartao, 4.5],
        ["data completa", c.textoSutil, c.cartao, 4.5],
        ["rótulo MENSAGEM", c.textoSutil, c.cartao, 4.5],
        ["ícone do tipo", c.icone, c.iconeFundo, 4.5],
        ["selo", c.seloTexto, c.seloFundo, 4.5],
        ["botão de ação", c.acaoTexto, c.acaoFundo, 4.5],
        ["botão não lida", c.texto, c.cartao, 7],
        ["botão excluir", c.perigoTexto, c.fundo, 4.5],
        ["botão excluir pressionado", c.perigoTexto, c.cartao, 4.5],
      ];
      for (const [rotulo, texto, fundo, minimo] of pares) {
        const razao = contraste(texto, fundo, c.cartao);
        assert.ok(razao >= minimo, `${perfil} (${rotulo}): ${razao.toFixed(2)}:1 < ${minimo}:1`);
      }
    });
  }
}

test("excluir não herda a cor do perfil", () => {
  const vermelhos = new Set(PERFIS.map((perfil) => coresDoDetalheDaNotificacao(paletaDe(perfil), false).perigoTexto));
  assert.equal(vermelhos.size, 1);
});
