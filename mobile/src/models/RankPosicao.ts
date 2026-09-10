export class RankPosicao {
  constructor(
    public rank_id: number,
    public classe_id: number,
    public posicao: number | null,
    public id_aluno: string,
    public nome_aluno: string,
    public pontuacao: number | null,
    /**
     * Quanto o aluno tem em relacao ao PRIMEIRO COLOCADO -- nao progresso na
     * trilha. O lider da 100 por construcao. Vem de
     * `vw_rank_posicoes_por_classe.percentual_do_lider`.
     */
    public percentualDoLider: number | null,
    public medalha: string | null
  ) {}
}