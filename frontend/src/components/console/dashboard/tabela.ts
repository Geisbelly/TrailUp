export const TODOS_OS_PERFIS = "todos";
export const ALUNOS_POR_PAGINA = 8;

export function filtrarPorPerfil<T extends { perfilDominante: string }>(alunos: T[], perfil: string): T[] {
  if (perfil === TODOS_OS_PERFIS) return alunos;
  return alunos.filter((a) => a.perfilDominante === perfil);
}

/** Perfis presentes na lista, em ordem alfabética, para o filtro. */
export function perfisPresentes<T extends { perfilDominante: string }>(alunos: T[]): string[] {
  return [...new Set(alunos.map((a) => a.perfilDominante))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export type Pagina<T> = {
  itens: T[];
  pagina: number;
  totalPaginas: number;
  total: number;
  primeiro: number;
  ultimo: number;
};

/** `pagina` começa em 1 e é ajustada para o intervalo válido (a lista pode ter encolhido). */
export function paginar<T>(lista: T[], pagina: number, porPagina = ALUNOS_POR_PAGINA): Pagina<T> {
  const total = lista.length;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const atual = Math.min(Math.max(1, Math.floor(pagina) || 1), totalPaginas);
  const inicio = (atual - 1) * porPagina;
  const itens = lista.slice(inicio, inicio + porPagina);
  return {
    itens,
    pagina: atual,
    totalPaginas,
    total,
    primeiro: total === 0 ? 0 : inicio + 1,
    ultimo: inicio + itens.length,
  };
}
