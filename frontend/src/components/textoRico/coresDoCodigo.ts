/**
 * Cores do bloco de código no console (spec A): fundo escuro fixo nos dois temas, como em todo
 * editor, e cada papel com 7:1 (AAA) sobre ele, conferido em `TextoRico.test.tsx`. O número da
 * linha é decoração (`aria-hidden`): 4,5:1 basta, como no app.
 */

import type { PapelDoTrecho } from "@/lib/textoRico/tokensDoCodigo";

export const FUNDO_DO_CODIGO = "#0d1117";
export const NUMERO_DA_LINHA = "#8b949e";

export const CORES_DO_CODIGO: Record<PapelDoTrecho, string> = {
  simples: "#e6edf3",
  operador: "#e6edf3",
  pontuacao: "#e6edf3",
  comentario: "#a8b3bf",
  palavra: "#ff9bce",
  texto: "#7ee787",
  numero: "#ffa657",
  funcao: "#9ecbff",
  classe: "#f2cc60",
  tag: "#ffa198",
  atributo: "#d2a8ff",
};
