import { useMemo } from "react";

import { useConquistaRank } from "@/context/ConquistaRankContext";
import {
  criteriosDoRanking,
  extrairPontuacao,
  type PontuacaoDoAluno,
} from "@/utils/pontuacaoDoAluno";

/**
 * A pontuação do aluno na turma atual, pronta para a tela.
 *
 * Existe para que trilha e perfil mostrem o MESMO número. As posições chegam
 * todas no campo `pontuacao`, em unidades diferentes conforme o critério do
 * rank -- 794 pontos, 2,37 minutos, 99,06 por cento --, e escolher a linha
 * errada faz a trilha exibir minuto com rótulo de ponto. `extrairPontuacao`
 * resolve isso pelo critério, e este hook garante que ninguém refaça a escolha
 * por conta própria.
 *
 * A fonte é sempre `vw_rank_posicoes_por_classe`, via `ConquistaRankContext` --
 * a mesma view que decide posição, medalha e corte de visibilidade.
 */
export function usePontuacaoDoAluno(): PontuacaoDoAluno {
  const { ranking, posicoesDoAluno } = useConquistaRank();

  const criterios = useMemo(() => criteriosDoRanking(ranking), [ranking]);

  return useMemo(
    () => extrairPontuacao(posicoesDoAluno, criterios),
    [criterios, posicoesDoAluno],
  );
}
