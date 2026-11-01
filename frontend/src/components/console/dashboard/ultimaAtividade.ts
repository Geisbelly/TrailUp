import { diasDesde } from "./risco";

// Substitui a coluna "Abandono" (F5): a taxa antiga media "ainda não terminou" e marcava "crítico"
// quem estava no meio da trilha. O que o professor precisa é quando o aluno estudou pela última vez.
export function rotuloDaUltimaAtividade(iso: string | null | undefined, hoje: Date): string {
  if (!iso) return "sem dado";
  const dias = diasDesde(iso, hoje);
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}
