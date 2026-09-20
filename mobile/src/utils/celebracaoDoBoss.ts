/**
 * Quando o parabéns do boss deve aparecer.
 *
 * A regra é TRANSIÇÃO, não estado: celebra-se quando um boss que estava de pé
 * cai. Celebrar pelo estado faria a tela dar parabéns toda vez que o aluno
 * reabrisse um conteúdo já concluído — e conteúdo concluído é justamente o que
 * ele mais revisita.
 *
 * Fica fora do componente porque `IABattlePanel` importa `react-native` e não
 * carrega no harness do node. É uma regra de três linhas que erra de um jeito
 * silencioso: ninguém percebe um parabéns a mais, todo mundo percebe que o app
 * ficou irritante.
 */
export type ObservacaoDoBoss = {
  /** Qual boss estamos observando. `null` = nenhum ainda. */
  chave: string | null;
  /** Ele estava derrotado na última vez que olhamos? */
  derrotado: boolean;
};

export const NADA_OBSERVADO: ObservacaoDoBoss = { chave: null, derrotado: false };

export function proximaCelebracao(
  anterior: ObservacaoDoBoss,
  atual: { chave: string; derrotado: boolean },
): { observacao: ObservacaoDoBoss; celebrar: boolean } {
  const observacao = { chave: atual.chave, derrotado: atual.derrotado };

  // Primeiro encontro com ESTE boss: só registra. O aluno pode estar chegando
  // num conteúdo que ele já venceu ontem.
  if (anterior.chave !== atual.chave) return { observacao, celebrar: false };

  return { observacao, celebrar: atual.derrotado && !anterior.derrotado };
}
