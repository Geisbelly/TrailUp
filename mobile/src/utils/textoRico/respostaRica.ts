/**
 * Resposta de múltipla escolha em questão rica (spec A, `20261108_03`).
 *
 * O build novo manda a **letra** da alternativa, não o texto: `fn_texto_comparavel` empata o que só
 * difere em maiúscula (`\ce{CO}` × `\ce{Co}`), e o banco resolve a letra pela posição em
 * `questoes.alternativas`, que já está gravada na ordem que o aluno vê (o gatilho
 * `trg_questoes_alternativas_canonicas` grava a ordem sorteada). O app 1.0.x continua mandando o
 * texto, e o banco aceita os dois.
 */

import { matematicaLegivel } from "../matematicaLegivel";
import { prepararTextoRico } from "./prepararTextoRico";

export function letraDaAlternativa(indice: number): string {
  return String.fromCharCode(65 + indice);
}

/**
 * O texto da alternativa a mostrar para uma resposta gravada. Texto exato vence (é o que o app
 * antigo gravou e a mesma ordem que o banco usa); depois, letra dentro da lista.
 */
export function alternativaDaResposta(resposta: unknown, alternativas: unknown[]): string | null {
  if (resposta == null) return null;
  const valor = String(resposta).trim();
  if (valor === "") return null;
  const textos = alternativas.map((alt) => String(alt ?? ""));
  const exata = textos.find((alt) => alt.trim() === valor);
  if (exata !== undefined) return exata;
  if (/^[A-Za-z]$/.test(valor)) {
    const indice = valor.toUpperCase().charCodeAt(0) - 65;
    if (indice < textos.length) return textos[indice];
  }
  return valor;
}

/** Texto rico em uma linha legível, para leitor de tela e para onde não cabe markdown. */
export function textoRicoLegivel(texto: unknown): string {
  if (typeof texto !== "string") return "";
  return matematicaLegivel(prepararTextoRico(texto))
    .replace(/\\\$/g, "$")
    .replace(/```\w*\n?|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
