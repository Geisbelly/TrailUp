/**
 * Deixa um texto rico (`formato_texto = 'rico'`) pronto para o markdown (spec A, 08/11).
 *
 * Duas coisas, nesta ordem, fora de código:
 *
 * 1. **Delimitadores.** `\( … \)` vira `$…$` e `\[ … \]` vira `$$…$$`. O console insere os de
 *    barra (não têm ambiguidade com dinheiro), e o modelo e quem já escreve LaTeX usam cifrão.
 *    Depois disto, o plugin de fórmula só precisa conhecer cifrão.
 * 2. **Dinheiro.** Todo `$` que não abre uma fórmula vira `\$`. A regra de "é fórmula" é a de
 *    `pareceMatematica` (#522): restritiva, e `R$` nunca abre fórmula. Na dúvida, o texto fica
 *    como texto: mostrar `$x$` é feio, transformar "R$ 1.200" em fórmula é errado.
 *
 * Bloco cercado (```) e código inline (`) não mudam: `$` em código é código.
 *
 * Puro e igual ao do app (`mobile/src/utils/textoRico/prepararTextoRico.ts`). Os dois passam
 * pelos mesmos `casos.json`.
 */

import { pareceMatematica } from "./matematicaLegivel";

const CODIGO = /(```[\s\S]*?```|`[^`\n]*`)/g;

// Em ordem de prioridade: delimitadores explícitos primeiro (sempre fórmula), depois `$$`, depois
// `$` — senão o `$` casaria metade de um `$$`.
// O miolo aceita qualquer caractere escapado (`\$` é cifrão literal dentro da fórmula).
const FORMULA = /\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<!\\)\$\$((?:\\[\s\S]|[^$\\])+?)\$\$|(?<![R\\$])\$(?!\$)((?:\\.|[^$\\\n])+?)\$(?!\$)/g;

/** `$` solto (não escapado) vira `\$`. */
function escaparCifroes(texto: string): string {
  return texto.replace(/(?<!\\)\$/g, "\\$");
}

function prepararForaDeCodigo(texto: string): string {
  let saida = "";
  let ultimo = 0;
  for (const m of texto.matchAll(FORMULA)) {
    const inicio = m.index ?? 0;
    const [todo, colchetes, parenteses, duplo, simples] = m;
    let formula: string | null = null;
    if (colchetes !== undefined) formula = `$$${colchetes}$$`;
    else if (parenteses !== undefined) formula = `$${parenteses}$`;
    else if (duplo !== undefined) formula = pareceMatematica(duplo) ? todo : null;
    else formula = pareceMatematica(simples ?? "") ? todo : null;
    if (formula === null) continue; // fica no trecho de texto, e o cifrão é escapado com ele
    saida += escaparCifroes(texto.slice(ultimo, inicio)) + formula;
    ultimo = inicio + todo.length;
  }
  return saida + escaparCifroes(texto.slice(ultimo));
}

export function prepararTextoRico(texto: string | null | undefined): string {
  if (typeof texto !== "string" || texto === "") return "";
  return texto
    .split(CODIGO)
    .map((parte, indice) => (indice % 2 === 1 ? parte : prepararForaDeCodigo(parte)))
    .join("");
}
