/**
 * Remapeamento das referências entre tópicos ao duplicar uma turma.
 *
 * `topicos.next` e `topicos.depende` são colunas `json` com ids de OUTROS
 * tópicos. Ao duplicar a turma, cada id tem de virar o id do tópico copiado —
 * senão o grafo da cópia aponta para a turma original.
 *
 * O bug que isto corrige: o remapeamento era `mapa[n] || n`, ou seja, id que
 * não estivesse no mapa era **mantido**. Como o mapa cobre, por construção,
 * todos os tópicos da turma que está sendo copiada, um id ausente só pode ser
 * de fora dela — e mantê-lo fazia a trilha nova referenciar tópico da turma
 * velha. Referência pendurada é pior que referência ausente: o grafo do aluno
 * passa a atravessar turmas.
 */

/** Mapa `id antigo -> id novo`, preenchido tópico a tópico na duplicação. */
export type MapaDeTopicos = Record<number, number>;

/**
 * Converte o valor cru de `next`/`depende` numa lista de números.
 *
 * A coluna é `json`, então o driver normalmente já entrega array. Mas há dado
 * antigo gravado como string JSON (`"[1,2]"`), e `JSON.parse` solto aqui
 * derrubava a duplicação inteira num `catch` genérico. Valor que não dá para
 * interpretar vira lista vazia, que é o estado seguro: tópico sem aresta.
 */
export function lerReferencias(valor: unknown): number[] {
  let bruto = valor;
  if (typeof bruto === "string") {
    const texto = bruto.trim();
    if (!texto) return [];
    try {
      bruto = JSON.parse(texto);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((n) => (typeof n === "number" ? n : Number(n)))
    .filter((n) => Number.isFinite(n));
}

/**
 * Traduz as referências para os ids da turma nova, DESCARTANDO o que não
 * estiver no mapa. Preserva a ordem e remove repetição.
 */
export function remapearReferencias(valor: unknown, mapa: MapaDeTopicos): number[] {
  const vistos = new Set<number>();
  const saida: number[] = [];
  for (const antigo of lerReferencias(valor)) {
    const novo = mapa[antigo];
    if (novo === undefined || vistos.has(novo)) continue;
    vistos.add(novo);
    saida.push(novo);
  }
  return saida;
}
