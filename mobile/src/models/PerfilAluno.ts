export type PerfilDoAluno = {
  id: number;
  nome: string | null;
  descricao: string | null;
  caracteristicas: unknown | null;
  afinidade: number;                // 0..100
  criado_em: string | null;
  atualizado_em: string | null;
};
