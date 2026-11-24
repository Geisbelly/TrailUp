import { alunosDeExemplo } from "../dashboard/exemploDaPesquisa";
import type { Matriculado } from "./AbaNaTurma";
import type { ResumoDaTurma } from "./resumo";

/**
 * A turma de demonstração da pesquisa na aba Turmas: os mesmos 32 alunos de exemplo da Visão geral,
 * só na tela. O banco continua sem eles: nada aqui matricula, remove ou registra termo.
 */
export type ExemploNaTurma = { alunos: Matriculado[]; perfis: Map<string, string>; conclusoes: number[] };

export function exemploNaTurma(classeId: number, classeNome: string, hoje: Date): ExemploNaTurma {
  const alunos = alunosDeExemplo(classeId, classeNome, hoje);
  return {
    alunos: alunos.map((a) => ({ id: a.id, nome: a.nome, email: null, desde: a.naTurmaDesde ?? null })),
    perfis: new Map(alunos.map((a) => [a.id, a.perfilDominante ?? ""])),
    conclusoes: alunos.map((a) => a.porcentagemConcluida),
  };
}

/** Soma os alunos de exemplo ao resumo do card: a conclusão vira a média de todos, reais e de exemplo. */
export function resumoComExemplo(resumo: ResumoDaTurma, conclusoes: number[]): ResumoDaTurma {
  if (conclusoes.length === 0) return resumo;
  const somaReal = (resumo.conclusaoPct ?? 0) * resumo.alunos;
  const alunos = resumo.alunos + conclusoes.length;
  return { ...resumo, alunos, conclusaoPct: (somaReal + conclusoes.reduce((s, v) => s + v, 0)) / alunos };
}
