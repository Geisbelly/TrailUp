const ROTULOS: Record<string, string> = {
  quiz: "Múltipla escolha",
  questao: "Múltipla escolha",
  true_false: "Verdadeiro/Falso",
  fill_blank: "Completar",
  essay: "Dissertação",
  video: "Vídeo",
  texto: "Texto",
};

/** Rótulo legível do tipo da atividade; tipo desconhecido ou vazio não quebra a lista. */
export function rotuloDoTipoDeAtividade(tipo: string | null | undefined): string {
  if (!tipo) return "Atividade";
  return ROTULOS[tipo] ?? "Atividade";
}

/** "entrega 12/10/2026" ou null (sem prazo / data inválida). */
export function prazoDaAtividade(dataEntrega: string | null | undefined): string | null {
  if (!dataEntrega) return null;
  const d = new Date(dataEntrega);
  return Number.isNaN(d.getTime()) ? null : `entrega ${d.toLocaleDateString("pt-BR")}`;
}
