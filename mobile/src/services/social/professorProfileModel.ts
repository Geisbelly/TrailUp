export type TurmaComProfessor = {
  classeId: number;
  nome: string | null;
  materia: string | null;
};

/** O que o aluno vê do professor: sem e-mail, sem dado da conta e sem nada de jogo. */
export type ProfessorProfile = {
  nome: string;
  fotoUrl: string | null;
  descricao: string | null;
  instituicao: string | null;
  disciplina: string | null;
  turmas: TurmaComProfessor[];
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeProfessorProfile(row: Record<string, unknown> | null | undefined): ProfessorProfile | null {
  const nome = text(row?.nome);
  if (!row || !nome) return null;
  const turmas = Array.isArray(row.turmas) ? row.turmas : [];
  return {
    nome,
    fotoUrl: text(row.foto_url),
    descricao: text(row.descricao),
    instituicao: text(row.instituicao),
    disciplina: text(row.disciplina),
    turmas: turmas
      .map((item) => {
        const turma = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return { classeId: Number(turma.classe_id) || 0, nome: text(turma.nome), materia: text(turma.materia) };
      })
      .filter((turma) => turma.classeId > 0),
  };
}
