export type DeckCardIdentity = {
  id?: unknown;
  frente?: string | null;
};

/**
 * Identidade do baralho, para saber quando ele deixou de ser o mesmo.
 *
 * A lista de blocos usa `block.id` como key, entao trocar de conteudo remonta o
 * componente. O que NAO remonta e o mesmo bloco receber um baralho novo -- que e
 * exatamente o que acontece quando a personalizacao regenera o material. Sem
 * comparar o CONTEUDO, o componente segue com o indice e a face do baralho
 * anterior, e o card novo abre com a resposta a mostra.
 *
 * Compara valor e nao referencia: `normalizeCards` devolve objetos novos a cada
 * render do payload, entao comparar referencia zeraria o card do aluno a toda
 * re-renderizacao.
 */
export function assinaturaDoDeck(cards: DeckCardIdentity[]): string {
  return (cards ?? [])
    .map((card) => String(card?.id ?? card?.frente ?? ""))
    .join("|");
}
