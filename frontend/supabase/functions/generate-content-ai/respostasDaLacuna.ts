/**
 * O gabarito da lacuna como a correção o lê: formas aceitas separadas por "|"
 * (`;` e quebra de linha também separam, como em `fn_questao_respostas_aceitas`).
 *
 * O modelo listava a mesma palavra mudando só a caixa ("CONCAT | concat"). A
 * correção já ignora caixa, acento e pontuação, então essas formas não aceitam
 * nada a mais e só poluem o gabarito que o professor revisa. Aqui elas saem,
 * e fica a primeira forma escrita.
 *
 * Sem `Deno.*` aqui dentro: o vitest do frontend testa este arquivo.
 */

/** A forma como a correção compara: sem acento, sem caixa e sem pontuação. */
function chaveDaForma(forma: string): string {
  return forma
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function respostasDaLacuna(valor: string): string {
  const vistas = new Set<string>();
  const formas: string[] = [];
  for (const parte of valor.split(/[|;\n]/)) {
    const forma = parte.trim();
    const chave = chaveDaForma(forma);
    if (!chave || vistas.has(chave)) continue;
    vistas.add(chave);
    formas.push(forma);
  }
  return formas.join(" | ");
}
