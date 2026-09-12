// O ranking mostra so' o topo da turma, mais a linha do proprio aluno.
//
// Quem corta e' o banco (`vw_rank_posicoes_por_classe`), nao esta funcao: cortar
// aqui seria cosmetico, porque o nome e a pontuacao dos colegas ja' teriam
// chegado ao aparelho. O que sobra para o cliente e' saber **como apresentar** o
// que chegou -- e para isso ele precisa descobrir se a propria linha veio dentro
// ou fora do corte.
//
// Nao da' para perguntar o limite ao banco sem uma consulta a mais, e nao
// precisa: a view devolve o topo mais a propria linha, entao **se a minha
// posicao e' maior que a de todo mundo que veio, eu estou fora do corte**. Com
// `dense_rank` havendo empate a posicao se repete, e o `>` continua certo: empate
// com o ultimo visivel me deixa dentro.

export interface LinhaDoRank {
  id_aluno: string;
  posicao: number | null;
}

export interface CorteDoRank<T> {
  /** O que vai para a lista. Sem a propria linha quando ela ficou fora do corte. */
  visiveis: T[];
  /** A propria linha, dentro ou fora do corte. O rodape fixo mostra sempre. */
  minhaLinha: T | null;
  /** A propria posicao ficou alem do topo mostrado. */
  foraDoCorte: boolean;
  /** Ultima posicao que a lista alcanca. `null` quando nao ha lista. */
  ultimaPosicaoVisivel: number | null;
}

export function aplicarCorteDoRank<T extends LinhaDoRank>(
  linhas: readonly T[],
  meuId: string | null | undefined,
): CorteDoRank<T> {
  const todas = [...linhas];
  const minhaLinha = meuId ? (todas.find((linha) => linha.id_aluno === meuId) ?? null) : null;
  const outras = minhaLinha ? todas.filter((linha) => linha !== minhaLinha) : todas;

  const maiorDasOutras = outras.reduce<number | null>((maior, linha) => {
    if (typeof linha.posicao !== "number") return maior;
    return maior === null || linha.posicao > maior ? linha.posicao : maior;
  }, null);

  // Sem posicao nao da' para comparar, e sem colega visivel nao ha corte de que
  // ficar de fora -- turma de um aluno, ou o proprio professor, que recebe tudo.
  const foraDoCorte =
    minhaLinha !== null &&
    typeof minhaLinha.posicao === "number" &&
    maiorDasOutras !== null &&
    minhaLinha.posicao > maiorDasOutras;

  const visiveis = foraDoCorte ? outras : todas;

  const ultimaPosicaoVisivel = visiveis.reduce<number | null>((maior, linha) => {
    if (typeof linha.posicao !== "number") return maior;
    return maior === null || linha.posicao > maior ? linha.posicao : maior;
  }, null);

  return { visiveis, minhaLinha, foraDoCorte, ultimaPosicaoVisivel };
}

/**
 * Texto que explica a lista. Sem ele o aluno em #18 ve 15 linhas e um rodape
 * dizendo #18, sem nada ligando as duas coisas.
 */
export function descreverCorte(
  corte: CorteDoRank<LinhaDoRank>,
  totalDaTurma: number | null,
): string | null {
  if (corte.ultimaPosicaoVisivel === null) return null;

  const alcanca = corte.ultimaPosicaoVisivel;
  const cabe = totalDaTurma !== null && totalDaTurma > 0 && alcanca >= totalDaTurma;
  if (cabe) return null; // a turma inteira coube; nao ha corte a explicar

  const total = totalDaTurma && totalDaTurma > 0 ? ` de ${totalDaTurma}` : "";
  return `Primeiras ${alcanca} posições${total}`;
}
