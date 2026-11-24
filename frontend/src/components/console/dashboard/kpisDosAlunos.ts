import { mediaDosPreenchidos } from "./medias";

type AlunoComKpi = {
  notaMedia: number;
  temNota: boolean;
  porcentagemConcluida: number;
  acertosPercentual: number;
  temAcertos: boolean;
};

export type KpisDosAlunos = {
  totalAlunos: number;
  mediaNotas: number | null;
  mediaConclusao: number;
  mediaAcertos: number | null;
};

/**
 * Os cartões principais a partir da lista de alunos que a tabela mostra. A conta é uma só para a
 * turma de verdade e para a de exemplo: o total é o tamanho da lista, nota e acertos ignoram quem
 * não tem o dado (sem nota não é nota zero) e a conclusão conta todo mundo (quem não começou está
 * em 0%).
 */
export function kpisDosAlunos(alunos: readonly AlunoComKpi[]): KpisDosAlunos {
  const totalAlunos = alunos.length;
  return {
    totalAlunos,
    mediaNotas: mediaDosPreenchidos(alunos.map((a) => (a.temNota ? a.notaMedia : null))),
    mediaConclusao:
      alunos.reduce((acc, a) => acc + (isNaN(a.porcentagemConcluida) ? 0 : a.porcentagemConcluida), 0) / (totalAlunos || 1),
    mediaAcertos: mediaDosPreenchidos(alunos.map((a) => (a.temAcertos ? a.acertosPercentual : null))),
  };
}
