/**
 * Limite de tokens de saída pedido ao Gemini (`maxOutputTokens`), separado do
 * `index.ts` para ser testado no vitest. Sem `Deno.*` aqui dentro.
 *
 * Os modelos 3.x "pensam" antes de responder, e esse raciocínio sai do mesmo
 * orçamento de saída. O detalhe do tópico pedia 4096 para até 4 conteúdos,
 * cada um com texto, 2 cards, 1 atividade e mídia: o modelo gastava parte no
 * raciocínio e parava no meio do JSON (finishReason MAX_TOKENS → 422
 * `ai_truncated`, visto em produção em 10/11). O mesmo já tinha acontecido no
 * modo `description` com 700 tokens.
 *
 * O limite é teto, não custo: o modelo só cobra o que escreve. Então o
 * orçamento cresce com o tamanho pedido e, se mesmo assim cortar, a chamada é
 * repetida uma vez com o dobro.
 */

/** Teto de saída que a função pede. Bem abaixo do máximo dos modelos flash. */
export const TETO_DE_SAIDA = 32768;

/** Por conteúdo do tópico: texto, 2 cards, 1 atividade e ao menos 1 mídia. */
const SAIDA_POR_CONTEUDO = 2048;
/** Fixo do detalhe: o objeto do tópico e a folga para o raciocínio do modelo. */
const SAIDA_BASE_DO_DETALHE = 6144;

/** Orçamento de saída do detalhe de um tópico com `conteudos` conteúdos. */
export function limiteDoDetalhe(conteudos: number): number {
  const n = Math.max(1, Math.floor(conteudos) || 1);
  return Math.min(TETO_DE_SAIDA, SAIDA_BASE_DO_DETALHE + n * SAIDA_POR_CONTEUDO);
}

/**
 * Depois de um corte por MAX_TOKENS: o próximo limite a tentar, ou `null` se
 * já está no teto (aí o corte vira erro).
 */
export function limiteAposCorte(atual: number): number | null {
  const proximo = Math.min(TETO_DE_SAIDA, Math.max(1, Math.floor(atual)) * 2);
  return proximo > atual ? proximo : null;
}

/** O que o Gemini diz ter gasto, para o log e o detalhe do erro de corte. */
export function usoDeTokens(apiData: unknown): { raciocinio?: number; resposta?: number; total?: number } {
  const uso = (apiData as { usageMetadata?: Record<string, unknown> } | null)?.usageMetadata;
  const numero = (valor: unknown) => (typeof valor === "number" && Number.isFinite(valor) ? valor : undefined);
  return {
    raciocinio: numero(uso?.thoughtsTokenCount),
    resposta: numero(uso?.candidatesTokenCount),
    total: numero(uso?.totalTokenCount),
  };
}
