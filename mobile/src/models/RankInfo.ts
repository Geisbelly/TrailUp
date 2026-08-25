export class RankInfo {
  constructor(
    public rank_id: number,
    public classe_id: number,
    public nome_rank: string,
    public descricao: string | null,
    public criterio: string | null,
    public icone: string | null
  ) {}
}