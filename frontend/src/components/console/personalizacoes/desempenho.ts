/** A nota vai de 0 a 10 (sem "%"); acertos e conclusão são percentuais. Sem nota é "—", não 0. */
export function valorDoDesempenho(chave: string, valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "—";
  return chave === "nota_media" ? valor.toFixed(1) : `${valor.toFixed(1)}%`;
}
