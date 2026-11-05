// Busca, filtro e ordem da lista de turmas. Conta pura sobre o que a tela já leu.
import { normalizar } from "./matriculas";
import type { ResumoDaTurma } from "./resumo";

export type TurmaDaLista = { id: number; nome: string; materia: string | null; criadaEm: string | null; resumo: ResumoDaTurma };

export type FiltroDeTurma = "todas" | "com_trilha" | "sem_trilha" | "sem_alunos";
export type OrdemDeTurma = "recentes" | "nome" | "mais_alunos" | "menor_conclusao";
export type Visualizacao = "cartoes" | "lista";

export const ORDENS: { value: OrdemDeTurma; label: string }[] = [
  { value: "recentes", label: "Mais recentes" },
  { value: "nome", label: "Nome" },
  { value: "mais_alunos", label: "Mais alunos" },
  { value: "menor_conclusao", label: "Menor conclusão" },
];

const passa = (t: TurmaDaLista, filtro: FiltroDeTurma) => {
  if (filtro === "com_trilha") return t.resumo.topicos > 0;
  if (filtro === "sem_trilha") return t.resumo.topicos === 0;
  if (filtro === "sem_alunos") return t.resumo.alunos === 0;
  return true;
};

export function contarPorFiltro(turmas: TurmaDaLista[]): Record<FiltroDeTurma, number> {
  return {
    todas: turmas.length,
    com_trilha: turmas.filter((t) => passa(t, "com_trilha")).length,
    sem_trilha: turmas.filter((t) => passa(t, "sem_trilha")).length,
    sem_alunos: turmas.filter((t) => passa(t, "sem_alunos")).length,
  };
}

/** Em "menor conclusão", turma sem aluno não tem conclusão e vai para o fim: `null` não é 0%. */
export function organizarTurmas(turmas: TurmaDaLista[], termo: string, filtro: FiltroDeTurma, ordem: OrdemDeTurma): TurmaDaLista[] {
  const t = normalizar(termo);
  const porNome = (a: TurmaDaLista, b: TurmaDaLista) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base", numeric: true });
  const filtradas = turmas.filter((x) => passa(x, filtro) && (!t || normalizar(x.nome).includes(t) || normalizar(x.materia).includes(t)));
  return filtradas.sort((a, b) => {
    if (ordem === "nome") return porNome(a, b);
    if (ordem === "mais_alunos") return b.resumo.alunos - a.resumo.alunos || porNome(a, b);
    if (ordem === "menor_conclusao") {
      const ca = a.resumo.conclusaoPct;
      const cb = b.resumo.conclusaoPct;
      if (ca === null || cb === null) return Number(ca === null) - Number(cb === null) || porNome(a, b);
      return ca - cb || porNome(a, b);
    }
    return (b.criadaEm ?? "").localeCompare(a.criadaEm ?? "") || b.id - a.id;
  });
}

const CHAVE = "trailup.console.turmas.visualizacao";

/** Preferência deste navegador. Sem storage, a tela funciona igual, nos cartões. */
export function lerVisualizacao(): Visualizacao {
  try {
    return window.localStorage.getItem(CHAVE) === "lista" ? "lista" : "cartoes";
  } catch {
    return "cartoes";
  }
}

export function gravarVisualizacao(v: Visualizacao): void {
  try {
    window.localStorage.setItem(CHAVE, v);
  } catch {
    // Só uma conveniência: sem storage, a escolha vale até sair da tela.
  }
}
