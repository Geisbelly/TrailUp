const DIA_MS = 86_400_000;

/** Dias inteiros desde o cadastro (por data de calendário local, nunca negativo). */
export function diasAguardando(criadoEm: string, agora: Date = new Date()): number {
  const d = new Date(criadoEm);
  if (Number.isNaN(d.getTime())) return 0;
  const a = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const b = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(0, Math.round((a - b) / DIA_MS));
}

export function rotuloEspera(dias: number): string {
  if (dias === 0) return "aguardando desde hoje";
  return `aguardando ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

/** A partir de quantos dias a espera ganha destaque âmbar (protótipo: 8 dias é urgente, 3 não). */
export const DIAS_URGENTE = 7;

/** "instituição · disciplina", omitindo o que faltar. */
export function resumoProfessor(instituicao: string | null, disciplina: string | null): string {
  return [instituicao, disciplina].map((x) => x?.trim()).filter(Boolean).join(" · ") || "Instituição não informada";
}

export function dataCurta(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}
