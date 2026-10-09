/**
 * Referência do evento de atividade (issue #186).
 *
 * A atividade do professor tem linha em `atividades`, então a referência é
 * `atividade:<id>` e a dedup do gatilho — que zera o valor quando já existe
 * `(aluno_id, tipo, referencia)` — funciona.
 *
 * A personalizada é sintetizada de JSONB e não tem linha em `atividades`. A
 * referência caía em `topico:<id>`, o que deixava a dedup sem granularidade:
 * ou não dedupava (o tipo não estava na lista), ou dedupava o tópico inteiro e
 * quatro acertos pagariam um.
 *
 * `item:<topico_id>:<chave>` resolve as duas coisas de uma vez:
 *
 * - CLASSE, pelo `topico_id` no segundo segmento. Evento sem classe é zerado
 *   pelo gatilho, então resolver a classe é pré-requisito para pagar;
 * - GRANULARIDADE, pela referência completa: dedup por item.
 *
 * O id do tópico vem no SEGUNDO segmento, e não no fim, porque a chave pode
 * conter `:` e letras — e o resolvedor do banco extrai dígitos do fim quando
 * não reconhece o prefixo, o que devolveria a chave em vez do tópico.
 */

export type ReferenciaDeAtividade = {
  tipo: string;
  referencia: string;
};

/**
 * `tipoBase` é `atividade_acertada` | `atividade_errada` | `atividade_revisada`.
 * O prefixo `topico_` é mantido no caminho personalizado para não quebrar o que
 * já lê esses tipos — o que muda é a referência, que é onde mora a dedup.
 */
export function referenciaDeAtividade(params: {
  tipoBase: string;
  atividadeId: number | null | undefined;
  topicoId: number | null | undefined;
  itemKey: string | null | undefined;
  personalizada: boolean;
}): ReferenciaDeAtividade {
  const { tipoBase, personalizada } = params;
  const atividadeId = Number(params.atividadeId);
  const topicoId = Number(params.topicoId);
  const itemKey = String(params.itemKey ?? "").trim();

  const temAtividadeReal =
    !personalizada && Number.isInteger(atividadeId) && atividadeId > 0;

  if (temAtividadeReal) {
    return { tipo: tipoBase, referencia: `atividade:${atividadeId}` };
  }

  const topicoValido = Number.isInteger(topicoId) && topicoId > 0;

  // Sem chave do item não dá para distinguir uma atividade personalizada da
  // outra. Cair para `topico:` preserva o comportamento antigo em vez de
  // inventar uma chave — que viraria dedup errada, pior que dedup ausente.
  if (!itemKey || !topicoValido) {
    return {
      tipo: `topico_${tipoBase}`,
      referencia: topicoValido ? `topico:${topicoId}` : "",
    };
  }

  return {
    tipo: `topico_${tipoBase}`,
    referencia: `item:${topicoId}:${sanitizarChave(itemKey)}`,
  };
}

/**
 * A chave entra na referência, que é comparada como texto pela dedup. Normaliza
 * para que a mesma atividade não gere duas referências diferentes por
 * espaço ou caixa — o que faria a dedup falhar justamente onde deveria agir.
 */
function sanitizarChave(chave: string): string {
  return chave.trim().toLowerCase().replace(/\s+/g, "-");
}
