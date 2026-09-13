// Como dividir a geracao do deck em chamadas que CABEM na resposta do modelo.
//
// Historico do problema (log de producao 2026-08-24): pedir 15 slides numa
// chamada devolvia finishReason=MAX_TOKENS com candidatesTokenCount=32753 -
// ou seja, o modelo enchia todo o orcamento de saida e o JSON vinha cortado no
// meio de uma string ("Unterminated string in JSON"). O codigo entao:
//
//   1. tentava 2 blocos fixos (8 e 7 slides) - que tambem estouravam;
//   2. repetia CADA bloco com o prompt IDENTICO, esperando resultado diferente;
//   3. so entao desistia, com a mensagem "Verifique as chaves e tente
//      novamente" - culpando as chaves por um problema de tamanho.
//
// Cada repeticao inutil custava ~78k tokens de ENTRADA, o que estourava a cota
// do free tier e disparava 429 em cascata pelo resto do sistema. Ou seja: o
// truncamento nao era so uma falha, era a origem do consumo descontrolado.
//
// A correcao e estrutural: quando a resposta trunca, o unico caminho que muda o
// resultado e pedir MENOS slides por chamada. Repetir, nunca.

export interface SlideBatch {
  /** indice do primeiro slide do bloco (0-based). */
  start: number;
  /** Quantos slides pedir nesta chamada. */
  count: number;
}

export const DEFAULT_SLIDES_PER_BATCH = 4;
export const MIN_SLIDES_PER_BATCH = 1;

/** Divide o deck em blocos de no maximo `maxPerBatch` slides, na ordem. */
export function planSlideBatches(
  totalSlides: number,
  maxPerBatch: number = DEFAULT_SLIDES_PER_BATCH,
): SlideBatch[] {
  const total = Math.max(0, Math.floor(totalSlides));
  const tamanho = Math.max(MIN_SLIDES_PER_BATCH, Math.floor(maxPerBatch));
  const blocos: SlideBatch[] = [];
  for (let start = 0; start < total; start += tamanho) {
    blocos.push({ start, count: Math.min(tamanho, total - start) });
  }
  return blocos;
}

/**
 * Parte um bloco que nao coube em dois menores. Bloco de 1 slide nao tem como
 * ser dividido: devolve null, e quem chama desiste DELE (nao do deck inteiro).
 */
export function splitBatch(batch: SlideBatch): [SlideBatch, SlideBatch] | null {
  if (batch.count <= MIN_SLIDES_PER_BATCH) return null;
  const primeiro = Math.floor(batch.count / 2);
  return [
    { start: batch.start, count: primeiro },
    { start: batch.start + primeiro, count: batch.count - primeiro },
  ];
}

/**
 * A resposta veio cortada por falta de orcamento de saida?
 *
 * Duas evidencias, porque nem sempre as duas aparecem: finishReason=MAX_TOKENS
 * (quando o SDK devolve o candidato) e a mensagem do JSON.parse sobre string
 * inacabada (quando o texto truncado chega ate o parse).
 */
export function isTruncationFailure(params: {
  finishReason?: string | null;
  errorMessage?: string | null;
}): boolean {
  const motivo = String(params.finishReason ?? "").toUpperCase();
  if (motivo === "MAX_TOKENS") return true;

  const mensagem = String(params.errorMessage ?? "").toLowerCase();
  return (
    mensagem.includes("unterminated string") ||
    mensagem.includes("unexpected end of json") ||
    mensagem.includes("unterminated fractional number")
  );
}

/**
 * Mensagem de falha que diz a causa de verdade. "Verifique as chaves" mandava o
 * professor caçar um problema que nao existia.
 */
export function describeGenerationFailure(params: {
  truncou: boolean;
  cotaEsgotada: boolean;
}): string {
  if (params.truncou) {
    return (
      "A IA não conseguiu gerar os slides dentro do limite de resposta, mesmo dividindo o conteúdo " +
      "em blocos menores. Reduza o tamanho do conteúdo deste tópico ou divida-o em mais tópicos."
    );
  }
  if (params.cotaEsgotada) {
    return (
      "A cota da API de IA se esgotou durante a geração dos slides. " +
      "Aguarde a renovação do limite ou configure chaves adicionais antes de tentar de novo."
    );
  }
  return "Falha na geração dos slides com IA. Verifique a configuração das chaves e tente novamente.";
}
