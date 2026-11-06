export type ClasseResumo = {
  aluno_id: string;
  classe_id: number;
  /** Nome que o professor deu à turma (`classe.descricao`). */
  classe_nome: string | null;
  materia_nome: string | null;
  materia_descricao: string | null;
  professor_nome: string | null;
  professor_descricao: string | null;
  notaMedia: number | null;
  tempoMedioPorAtividade: number | null;
  acertosPercentual: number | null;
  porcentagemConcluida: number | null;
  ultimaAtividade: number | null;
  tempoGastoMin: number | null;
  isComplete: boolean | null;
  atividadesConcluidas: unknown | null;
  recomendacaoTrilha: string | null;
  modoOperacao: string | null;
  insights: unknown | null;
  perfisDetectados: unknown | null;
};