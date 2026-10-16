/**
 * Guard da paleta BrainHex: os espelhos nao podem dessaturar nem trocar a
 * matiz da cor-assinatura oficial.
 *
 * O CLAUDE.md descreve a regra em texto ("Correcoes de contraste AAA devem
 * sempre elevar a luminosidade HSL/HLS da cor-assinatura (nunca misturar com
 * branco), para nao desaturar o accent do perfil") e avisa que os espelhos nao
 * se atualizam sozinhos. Texto nao barra regressao: o badge de mastermind em
 * `PROFILES` perdeu 52 pontos de saturacao e ficou assim, com um comentario
 * justificando a partir de uma premissa falsa sobre a cor oficial.
 *
 * Este teste le a FONTE OFICIAL do disco — microservice/src/constants/brainHex.ts
 * — em vez de uma copia. Mudar a paleta oficial quebra aqui ate que os espelhos
 * acompanhem, que e precisamente o aviso do CLAUDE.md ("Nao assumir que mudar
 * um dos tres atualiza os outros").
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { PROFILES, type BrainHexProfileKey } from "./brainhex";
import { COR_DO_PERFIL } from "@/components/console/dashboard/perfilCores";

const FONTE_OFICIAL = fileURLToPath(
  new URL("../../../../microservice/src/constants/brainHex.ts", import.meta.url),
);

const PERFIS: BrainHexProfileKey[] = [
  "seeker",
  "survivor",
  "daredevil",
  "mastermind",
  "conqueror",
  "socializer",
  "achiever",
];

/** Le `color: "#rrggbb"` de cada bloco de perfil da fonte oficial. */
function paletaOficial(): Record<BrainHexProfileKey, string> {
  const texto = readFileSync(FONTE_OFICIAL, "utf-8");
  const fora: Partial<Record<BrainHexProfileKey, string>> = {};
  for (const perfil of PERFIS) {
    const bloco = new RegExp(`\\b${perfil}\\s*:\\s*\\{[\\s\\S]*?\\}`).exec(texto);
    const cor = bloco && /color:\s*"(#[0-9a-fA-F]{6})"/.exec(bloco[0]);
    if (cor) fora[perfil] = cor[1].toLowerCase();
  }
  return fora as Record<BrainHexProfileKey, string>;
}

function paraHsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = d / (l > 0.5 ? 2 - max - min : max + min);
  const h =
    max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60) % 360, s: s * 100, l: l * 100 };
}

function distanciaDeMatiz(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 360 - d);
}

/**
 * Excecoes deliberadas. Cada entrada EXIGE um motivo escrito — o objetivo e que
 * divergir da paleta seja uma decisao registrada, nao um acidente silencioso.
 */
const EXCECOES: Partial<Record<BrainHexProfileKey, string>> = {
  daredevil:
    "badge segue a arte (laranja-fogo), nao o hex oficial (#d7263d), por pedido " +
    "direto: na arte o cabelo, o manto e o efeito de chama compartilham a mesma " +
    "faixa de matiz+saturacao e nao foi possivel isolar so o figurino.",
  mastermind:
    "dessaturado (#827b9d, S=14.8) a partir de uma premissa falsa sobre a cor " +
    "oficial. A arte tambem esta no azul dessaturado, entao corrigir so o badge " +
    "o desalinharia dela — a decisao (recolorir a arte ou assumir a excecao) e " +
    "do time. Ver o comentario em brainhex.ts.",
};

// Folga escolhida para separar duas coisas reais, nao por gosto: as variantes
// calculadas a mao ficam a <= 6 graus da oficial (a maior e survivor, com
// exatamente 6.0 — perto demais da borda para um limite de 6, que o
// arredondamento de ponto flutuante ja derrubava), enquanto a excecao
// deliberada do daredevil esta a 22.3. Qualquer valor entre ~8 e ~20 separa as
// duas; 10 fica no meio.
const TOLERANCIA_MATIZ = 10;
// A maior queda legitima e a de seeker (-15.3), efeito de clarear em espaco RGB.
// A de mastermind, que e o acidente, e de -52.2.
const QUEDA_MAX_SATURACAO = 20;

describe("paleta BrainHex espelhada", () => {
  const oficial = paletaOficial();

  it("consegue ler os 7 perfis da fonte oficial", () => {
    // Sem isto, um regex quebrado faria todos os testes abaixo passarem vazios.
    expect(Object.keys(oficial).sort()).toEqual([...PERFIS].sort());
    expect(oficial.mastermind).toBe("#5b3fd9");
  });

  it("perfilCores.ts usa a cor oficial exata como `marca`", () => {
    for (const perfil of PERFIS) {
      expect(COR_DO_PERFIL[perfil].marca.toLowerCase(), `marca de ${perfil}`).toBe(
        oficial[perfil],
      );
    }
  });

  it("o `texto` de perfilCores.ts clareia sem dessaturar", () => {
    for (const perfil of PERFIS) {
      const base = paraHsl(oficial[perfil]);
      const claro = paraHsl(COR_DO_PERFIL[perfil].texto.toLowerCase());
      expect(distanciaDeMatiz(base.h, claro.h), `matiz de ${perfil}`).toBeLessThanOrEqual(
        TOLERANCIA_MATIZ,
      );
      expect(claro.s - base.s, `saturacao de ${perfil}`).toBeGreaterThan(-QUEDA_MAX_SATURACAO);
      expect(claro.l, `luminosidade de ${perfil}`).toBeGreaterThan(base.l);
    }
  });

  it("o badge do signup preserva matiz e saturacao, fora das excecoes escritas", () => {
    for (const perfil of PERFIS) {
      const hex = /#[0-9a-fA-F]{6}/.exec(PROFILES[perfil].color)?.[0]?.toLowerCase();
      expect(hex, `badge de ${perfil}`).toBeTruthy();

      const base = paraHsl(oficial[perfil]);
      const badge = paraHsl(hex as string);
      const dentroDaRegra =
        distanciaDeMatiz(base.h, badge.h) <= TOLERANCIA_MATIZ &&
        badge.s - base.s > -QUEDA_MAX_SATURACAO;

      if (EXCECOES[perfil]) {
        // A excecao nao pode apodrecer: se alguem corrigir a cor e esquecer de
        // tirar a entrada daqui, este teste avisa.
        expect(
          dentroDaRegra,
          `${perfil} esta dentro da regra — remova a excecao de EXCECOES`,
        ).toBe(false);
        expect(EXCECOES[perfil]!.length, `motivo de ${perfil}`).toBeGreaterThan(40);
        continue;
      }

      expect(dentroDaRegra, `badge de ${perfil} divergiu da paleta oficial`).toBe(true);
    }
  });
});
