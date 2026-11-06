import type { ClasseResumo } from "@/models/ClasseResumo";

type Fonte = Pick<ClasseResumo, "materia_nome" | "professor_nome"> & Partial<Pick<ClasseResumo, "classe_nome">>;

export type RotuloDaTurma = {
  /** O que vai na pílula. "Geral" é como o console chama a turma sem matéria. */
  materia: string;
  /** O título do card: o nome que o professor deu; sem ele, a matéria. */
  titulo: string;
  professor: string | null;
  /** Texto para leitor de tela: a matéria só aparece quando difere do título. */
  descricaoAcessivel: string;
};

function limpo(valor: string | null | undefined): string | null {
  const texto = valor?.trim();
  return texto ? texto : null;
}

export function rotuloDaTurma(resumo: Fonte | null | undefined): RotuloDaTurma {
  const nomeDaMateria = limpo(resumo?.materia_nome);
  const materia = nomeDaMateria ?? "Geral";
  const titulo = limpo(resumo?.classe_nome) ?? nomeDaMateria ?? "Turma";
  return {
    materia,
    titulo,
    professor: limpo(resumo?.professor_nome),
    descricaoAcessivel: titulo === materia ? titulo : `${titulo}, matéria ${materia}`,
  };
}
