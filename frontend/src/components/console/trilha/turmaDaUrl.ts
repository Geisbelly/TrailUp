// A trilha abre na turma de ?turma=<id> (atalho do card em Turmas —
// docs/frontend/redesign-fase-2/03-analise-turmas.md, 4.10). Id que não é de
// uma turma do professor, ou que nem é número, cai no comportamento de antes:
// a primeira turma da lista.

export const PARAMETRO_DA_TURMA = "turma";

export function turmaInicialDaTrilha(turmaNaUrl: string | null, turmas: { id: number }[]): string {
  const pedida = turmaNaUrl?.trim() ?? "";
  if (/^\d+$/.test(pedida) && turmas.some((t) => String(t.id) === String(Number(pedida)))) return String(Number(pedida));
  return turmas[0] ? String(turmas[0].id) : "";
}
