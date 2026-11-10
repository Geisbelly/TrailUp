// Material personalizado só aparece depois que o professor aprova (migração 20261110_09).
//
// A RLS já não devolve registro pendente ou recusado, mas o app guarda o último material visto
// (estado e AsyncStorage) e, até aqui, só ACRESCENTAVA tópicos ao que já tinha. Um material que o
// professor recusou, ou que a IA regerou e voltou a esperar aprovação, continuaria na tela pelo
// cache. Quando a resposta do servidor é completa, ela é a palavra final: tópico sem registro
// visível sai, e o aluno volta ao material do professor, como quando a personalização não existe.

/**
 * Tira de `atual` os tópicos consultados que vieram sem material.
 *
 * Devolve o MESMO objeto quando nada sai, para não disparar re-render à toa.
 * Só chame com resposta completa: lista cortada pelo limite não prova que o tópico ficou vazio.
 */
export function semTopicosSemMaterial<T>(
  atual: Record<number, T>,
  topicosConsultados: Iterable<number>,
  topicosComMaterial: ReadonlySet<number>,
): Record<number, T> {
  let proximo: Record<number, T> | null = null;
  for (const topicoId of topicosConsultados) {
    if (topicosComMaterial.has(topicoId) || !(topicoId in atual)) continue;
    proximo ??= { ...atual };
    delete proximo[topicoId];
  }
  return proximo ?? atual;
}

/** A listagem veio inteira? Menos itens do que o limite pedido quer dizer que acabou. */
export function respostaCompleta(itensRecebidos: number, limitePedido: number): boolean {
  return itensRecebidos < limitePedido;
}
