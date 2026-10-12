// Card de conquistas em destaque no Perfil da web em tela larga (#346,
// protótipo v4, revisao-03-loja/telas/08-perfil-hub.md §3). Função pura sobre
// os itens da Biblioteca de conquistas (`Conquista.fetchBibliotecaForAluno`),
// para os números baterem com os de lá.

type Item = {
  status: "concluida" | "em_progresso" | "bloqueada";
  progressoPercentual: number;
  conquista: { conquista_id: number; data_conquista?: string | null };
};

export function resumirConquistas<T extends Item>(itens: readonly T[]) {
  const concluidas = itens.filter((i) => i.status === "concluida");
  const total = itens.length;
  const quando = (i: T) => {
    const t = new Date(i.conquista.data_conquista ?? "").getTime();
    return Number.isFinite(t) ? t : 0;
  };
  return {
    concluidas: concluidas.length,
    total,
    /** Concluídas ÷ total, como na Biblioteca. */
    percentual: total ? Math.round((concluidas.length / total) * 100) : 0,
    recentes: [...concluidas].sort((a, b) => quando(b) - quando(a)).slice(0, 4),
    quaseLa: itens
      .filter((i) => i.status === "em_progresso")
      .sort((a, b) => b.progressoPercentual - a.progressoPercentual)
      .slice(0, 3),
  };
}

/** "14 set" — dia e mês curto, como no protótipo. */
export function dataCurta(iso: string | null | undefined): string {
  const d = new Date(iso ?? "");
  if (!Number.isFinite(d.getTime())) return "";
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${String(d.getDate()).padStart(2, "0")} ${meses[d.getMonth()]}`;
}
