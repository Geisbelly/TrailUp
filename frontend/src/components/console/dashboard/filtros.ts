type AlunoFiltravel = { nome: string; email: string; classe_id: number };

export const TODAS_AS_TURMAS = "all";

export function alunosDaTurma<T extends AlunoFiltravel>(alunos: T[], turmaSelecionada: string): T[] {
  if (turmaSelecionada === TODAS_AS_TURMAS) return alunos;
  return alunos.filter((a) => a.classe_id.toString() === turmaSelecionada);
}

export function filtrarPorBusca<T extends AlunoFiltravel>(alunos: T[], busca: string): T[] {
  const termo = busca.trim().toLowerCase();
  if (!termo) return alunos;
  return alunos.filter((a) => a.nome.toLowerCase().includes(termo) || a.email.toLowerCase().includes(termo));
}
