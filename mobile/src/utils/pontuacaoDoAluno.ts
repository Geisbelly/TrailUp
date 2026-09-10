/**
 * Qual das posições do aluno é a "pontuação".
 *
 * Uma turma tem um rank por critério -- na classe de demonstração são três:
 * Pontuação, Tempo de Estudo e Percentual Concluído. As três linhas chegam ao
 * app na mesma lista, no mesmo campo `pontuacao`, em **três unidades
 * diferentes**: 122 pontos, 0,39 minuto e 75 por cento.
 *
 * Por isso escolher pela melhor posição -- que é o que `melhorPosicao` faz --
 * devolve um número de unidade imprevisível: o mesmo campo pode virar "122",
 * "0,39" ou "75" conforme em qual rank o aluno foi melhor. Ao lado do
 * percentual da trilha, isso lê como se os dois números discordassem.
 *
 * A regra aqui é explícita: pontuação é a linha do rank cujo critério É
 * `pontuacao`. Se a turma não tem esse rank, não há pontuação a mostrar -- e
 * dizer isso é melhor que mostrar minuto com rótulo de ponto.
 */

export interface PosicaoComPontuacao {
  rank_id: number;
  posicao: number | null;
  pontuacao: number | null;
}

export interface CriterioDoRank {
  rank_id: number;
  criterio: string | null;
}

export interface PontuacaoDoAluno {
  /** Pontos no rank de pontuação, ou `null` se a turma não tem esse rank. */
  pontos: number | null;
  /** Posição NESSE rank -- não a melhor posição entre todos. */
  posicao: number | null;
  /** A turma não tem rank de pontuação: não há o que mostrar. */
  semRankDePontuacao: boolean;
}

export const CRITERIO_DE_PONTUACAO = "pontuacao";

const VAZIO: PontuacaoDoAluno = {
  pontos: null,
  posicao: null,
  semRankDePontuacao: true,
};

function normalizar(criterio: string | null | undefined): string {
  return String(criterio ?? "").trim().toLowerCase();
}

export function extrairPontuacao(
  posicoes: readonly PosicaoComPontuacao[],
  criterios: readonly CriterioDoRank[],
): PontuacaoDoAluno {
  const ranksDePontuacao = new Set(
    criterios
      .filter((c) => normalizar(c.criterio) === CRITERIO_DE_PONTUACAO)
      .map((c) => c.rank_id),
  );

  if (ranksDePontuacao.size === 0) return VAZIO;

  const linha = posicoes.find((p) => ranksDePontuacao.has(p.rank_id));
  // O rank existe mas o aluno não aparece nele (fora do corte de 15 e sem a
  // própria linha, por exemplo). Não é "sem rank": é sem dado.
  if (!linha) {
    return { pontos: null, posicao: null, semRankDePontuacao: false };
  }

  return {
    pontos: Number.isFinite(Number(linha.pontuacao)) ? Number(linha.pontuacao) : 0,
    posicao: linha.posicao,
    semRankDePontuacao: false,
  };
}

/** Rótulo curto para a tela. Sem rank de pontuação, não inventa zero. */
export function rotularPontuacao(valor: PontuacaoDoAluno): string {
  if (valor.semRankDePontuacao || valor.pontos == null) return "—";
  return `${Math.round(valor.pontos)}`;
}

/** Linha de apoio: onde essa pontuação coloca o aluno. */
export function descreverPosicaoDaPontuacao(valor: PontuacaoDoAluno): string {
  if (valor.semRankDePontuacao) return "turma sem rank de pontuação";
  if (valor.pontos == null) return "sem posição no rank de pontuação";
  if (valor.posicao == null) return "pontos acumulados";
  return `${valor.posicao}º no rank de pontuação`;
}
