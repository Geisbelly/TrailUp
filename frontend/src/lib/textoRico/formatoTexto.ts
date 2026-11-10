/**
 * A marca `formato_texto` (`'texto'` | `'rico'`) de questões, atividades e cards (spec A,
 * `20261108_03`). Qualquer coisa que não seja exatamente `'rico'` é texto: é como tudo era antes da
 * marca, e é o que um registro sem a coluna devolve.
 */

export type FormatoTexto = "texto" | "rico";

export function formatoDoTexto(valor: unknown): FormatoTexto {
  return valor === "rico" ? "rico" : "texto";
}

/** O texto tem fórmula (`\(`, `\[`, `$…$`) ou bloco cercado? Decide se desligar o rico pede confirmação. */
export function temMarcacaoRica(texto: string | null | undefined): boolean {
  if (!texto) return false;
  return /\\\(|\\\[|```|\$[^$\n]+\$/.test(texto);
}
