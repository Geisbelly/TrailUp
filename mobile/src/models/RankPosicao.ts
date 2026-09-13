export class RankPosicao {
  constructor(
    public rank_id: number,
    public classe_id: number,
    public posicao: number | null,
    public id_aluno: string,
    public nome_aluno: string,
    public pontuacao: number | null,
    public progresso: number | null,
    public medalha: string | null
  ) {}
}