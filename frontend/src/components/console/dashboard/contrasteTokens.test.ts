import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contraste } from "./contraste";
import { COR_DO_PERFIL, PERFIS_EM_ORDEM } from "./perfilCores";

// Critério da issue #56: "o contraste dos gráficos atende AAA e a informação não
// depende só de cor". Lê os tokens do tema do console (a fonte real, não uma cópia
// à mão) e confere texto/ícone contra as duas superfícies onde os gráficos ficam.

const css = readFileSync(fileURLToPath(new URL("../../../styles/console-theme.css", import.meta.url)), "utf-8");

function token(nome: string): string {
  const m = css.match(new RegExp(String.raw`--${nome}:\s*(\d+)\s+(\d+)%\s+(\d+)%`));
  if (!m) throw new Error(`token --${nome} não encontrado em console-theme.css`);
  return hslParaHex(Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100);
}

function hslParaHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const SUPERFICIES = { card: token("card"), interna: token("muted") };

describe("tokens de texto do console (WCAG AAA, 7:1)", () => {
  const textos = ["foreground", "muted-foreground", "primary", "success", "warning", "destructive", "info"];
  for (const nome of textos) {
    for (const [onde, fundo] of Object.entries(SUPERFICIES)) {
      it(`--${nome} sobre ${onde}`, () => {
        expect(contraste(token(nome), fundo)).toBeGreaterThanOrEqual(7);
      });
    }
  }
});

describe("gráficos por perfil: a informação não depende só da cor", () => {
  for (const perfil of PERFIS_EM_ORDEM) {
    it(`${perfil}: rótulo AAA e forma distinguível do fundo`, () => {
      const { marca, texto } = COR_DO_PERFIL[perfil];
      expect(contraste(texto, SUPERFICIES.card)).toBeGreaterThanOrEqual(7);
      // Objeto gráfico precisa de 3:1 (WCAG 1.4.11): ou a própria marca, ou o contorno na variante de texto
      // (AbandonoPorPerfil.tsx desenha o contorno), além do valor escrito e do aria-label.
      expect(Math.max(contraste(marca, SUPERFICIES.card), contraste(texto, SUPERFICIES.card))).toBeGreaterThanOrEqual(3);
    });
  }
});
