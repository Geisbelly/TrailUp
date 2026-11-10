/**
 * Questão de código (spec B, PR 3): o retorno da IA vai ao aluno sem código nenhum.
 *
 * Feedback de código sem código é a regra mais simples que impede colar a solução na próxima
 * tentativa. Sai todo bloco cercado (``` ou ~~~, fechado ou não) e todo trecho entre crases, do
 * feedback, dos pontos e da observação. Isto roda ANTES de `protegerAvaliacao`, que depois pega a
 * linha do código de referência escrita sem crase.
 */

export const FEEDBACK_SEM_CODIGO =
  "Sua resposta foi avaliada. Releia o enunciado e os critérios da questão e confira a lógica do seu código passo a passo.";
export const PONTO_SEM_CODIGO = "Revise a lógica do seu código com o enunciado.";

const BLOCO = /(```|~~~)[\s\S]*?(?:\1|$)/g;
const CRASES = /`[^`\n]*`/g;

/** O texto sem código. Sem nada a tirar, devolve o mesmo texto (com as quebras de linha). */
export function tirarCodigo(texto: string): string {
  const semBloco = texto.replace(BLOCO, " ").replace(CRASES, " ");
  if (semBloco === texto) return texto;
  return semBloco.replace(/\s+/g, " ").trim();
}

export interface AvaliacaoComTexto {
  feedback: string;
  pontos_fortes: string[];
  pontos_melhoria: string[];
  observacao?: string;
  [chave: string]: unknown;
}

/** Tira o código dos textos. Devolve quantos campos mudaram (para o log, sem o texto). */
export function semCodigo<T extends AvaliacaoComTexto>(avaliacao: T): { avaliacao: T; trocados: number } {
  let trocados = 0;
  const limpar = (texto: string) => {
    const limpo = tirarCodigo(texto);
    if (limpo !== texto) trocados += 1;
    return limpo;
  };
  const lista = (itens: string[]) => {
    const limpos = itens.map(limpar).filter((item) => item !== "");
    return limpos.length > 0 ? limpos : [PONTO_SEM_CODIGO];
  };

  const resultado: T = {
    ...avaliacao,
    feedback: limpar(avaliacao.feedback) || FEEDBACK_SEM_CODIGO,
    pontos_fortes: lista(avaliacao.pontos_fortes),
    pontos_melhoria: lista(avaliacao.pontos_melhoria),
  };
  if (typeof avaliacao.observacao === "string") {
    const observacao = limpar(avaliacao.observacao);
    if (observacao) resultado.observacao = observacao;
    else delete resultado.observacao;
  }
  // Sem nada trocado, devolve o objeto original: nenhum padrão entra onde não havia código.
  return trocados === 0 ? { avaliacao, trocados } : { avaliacao: resultado, trocados };
}
