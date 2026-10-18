import { ehTipoDeAtividade, ROTULO_DO_TIPO } from "./tiposDeAtividade";

// Tipos antigos que ainda existem em atividades já gravadas e não fazem parte da lista atual.
const ROTULOS_LEGADOS: Record<string, string> = {
  questao: "Múltipla escolha",
  video: "Vídeo",
  texto: "Texto",
};

/** Rótulo legível do tipo da atividade; tipo desconhecido ou vazio não quebra a lista. */
export function rotuloDoTipoDeAtividade(tipo: string | null | undefined): string {
  if (!tipo) return "Atividade";
  if (ehTipoDeAtividade(tipo)) return ROTULO_DO_TIPO[tipo];
  return ROTULOS_LEGADOS[tipo] ?? "Atividade";
}

/** "entrega 12/10/2026" ou null (sem prazo / data inválida). */
export function prazoDaAtividade(dataEntrega: string | null | undefined): string | null {
  if (!dataEntrega) return null;
  const d = new Date(dataEntrega);
  return Number.isNaN(d.getTime()) ? null : `entrega ${d.toLocaleDateString("pt-BR")}`;
}
