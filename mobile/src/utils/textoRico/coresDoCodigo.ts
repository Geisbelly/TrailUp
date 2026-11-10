/**
 * Cores do realce de código para a paleta do perfil, todas com contraste AAA (7:1) sobre o fundo
 * do bloco (spec A, 08/11).
 *
 * Palavra-chave usa o accent do perfil; o resto tem matiz fixo (verde para texto, laranja para
 * número…), como todo editor, para o aluno reconhecer o papel pela cor em qualquer perfil. O ajuste
 * sobe só a luminosidade (`ensureMinContrast`), como o accent: misturar com branco apagaria a cor.
 */

import tinycolor from "tinycolor2";

import { ensureMinContrast, type ProfileShellPalette } from "@/utils/profileShellPalette";

import type { PapelDoTrecho } from "./tokensDoCodigo";

export const CONTRASTE_DO_CODIGO = 7;

const MATIZES: Record<Exclude<PapelDoTrecho, "palavra" | "simples" | "operador" | "pontuacao">, string> = {
  comentario: "#8b949e",
  texto: "#56d364",
  numero: "#f0883e",
  funcao: "#58a6ff",
  classe: "#e3b341",
  tag: "#ff7b72",
  atributo: "#bc8cff",
};

export type CoresDoCodigo = { fundo: string; borda: string; numeroDaLinha: string } & Record<PapelDoTrecho, string>;

export function coresDoCodigo(paleta: Pick<ProfileShellPalette, "background" | "accent" | "text" | "border">): CoresDoCodigo {
  const fundo = paleta.background;
  const ajustar = (cor: string) => ensureMinContrast(cor, fundo, CONTRASTE_DO_CODIGO);
  const texto = ajustar(tinycolor(paleta.text).setAlpha(1).toHexString());
  return {
    fundo,
    borda: paleta.border,
    // O número da linha é decoração (o leitor de tela não o lê): 4.5:1 basta e o deixa recuado.
    numeroDaLinha: ensureMinContrast(MATIZES.comentario, fundo, 4.5),
    simples: texto,
    operador: texto,
    pontuacao: texto,
    palavra: ajustar(paleta.accent),
    comentario: ajustar(MATIZES.comentario),
    texto: ajustar(MATIZES.texto),
    numero: ajustar(MATIZES.numero),
    funcao: ajustar(MATIZES.funcao),
    classe: ajustar(MATIZES.classe),
    tag: ajustar(MATIZES.tag),
    atributo: ajustar(MATIZES.atributo),
  };
}
