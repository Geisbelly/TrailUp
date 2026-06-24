export class PosicaoDoAluno {
  constructor(
    public rank_id: number,
    public classe_id: number,
    public aluno_id: string,
    public posicao: number | null,
    public pontuacao: number | null,
    public progresso: number | null,
    public medalha: string | null
  ) {}
}