import {
  criarFiltroDeRepetidas,
  textosExistentes,
  type Existentes,
} from "../../../../supabase/functions/generate-content-ai/repetidas.ts";
import type { AiTopico } from "./proposta";

/**
 * As perguntas que a IA não pode repetir, no formato `existentes` da
 * `generate-content-ai` (ver `repetidas.ts` lá, a mesma regra de "repetida").
 *
 * - No "Sugerir cards e atividades" de um conteúdo: as questões e os cards do
 *   tópico, mais as sugestões que ainda esperam revisão na fila.
 * - Na trilha com IA: as dos outros tópicos da proposta. A trilha nova
 *   substitui a da turma, então o que está no banco não conta.
 */

export type { Existentes };

/** Enunciado em texto rico vira texto corrido: a comparação é por palavra. */
const textoCorrido = (valor: string | null | undefined) =>
  String(valor ?? "").replace(/<[^>]+>/g, " ").replace(/[*_`#>$\\]/g, " ").replace(/\s+/g, " ").trim();

/** Junta listas, sem vazio nem repetida, no teto que a função aceita. */
export function juntarExistentes(...partes: Array<Partial<Existentes> | null | undefined>): Existentes {
  return {
    questoes: textosExistentes(partes.flatMap((p) => p?.questoes ?? []).map(textoCorrido)),
    cards: textosExistentes(partes.flatMap((p) => p?.cards ?? []).map(textoCorrido)),
  };
}

/** O que vai no corpo do pedido: nada quando não há o que evitar. */
export const existentesParaOPedido = (e: Existentes): { existentes?: Existentes } =>
  e.questoes.length > 0 || e.cards.length > 0 ? { existentes: e } : {};

/** Perguntas de um tópico da proposta da trilha (nos conteúdos e no próprio tópico). */
export function perguntasDoTopicoDaProposta(t: AiTopico): Existentes {
  const conteudos = t.conteudos ?? [];
  return {
    questoes: [...conteudos.flatMap((c) => c.atividades ?? []), ...(t.atividades ?? [])].map((a) => a.enunciado),
    cards: [...conteudos.flatMap((c) => c.cards ?? []), ...(t.cards ?? [])].map((c) => c.titulo),
  };
}

/** As perguntas da proposta inteira, menos as do tópico `exceto` (a posição dele na lista). */
export function perguntasDaProposta(topicos: AiTopico[], exceto: number): Existentes {
  return juntarExistentes(...topicos.filter((_, i) => i !== exceto).map(perguntasDoTopicoDaProposta));
}

/**
 * Tira do tópico que acabou de chegar as perguntas que repetem as dos outros
 * tópicos. A função já filtra pelo que recebeu, mas dois tópicos gerados ao
 * mesmo tempo não se viram: é aqui que um deixa de repetir o outro.
 *
 * Conteúdo que fica sem pergunta continua na proposta com o texto dele: o
 * professor pede outras pelo "Sugerir cards e atividades" depois de aplicar.
 */
export function semRepetidasNoTopico(t: AiTopico, outros: Existentes): AiTopico {
  const cards = criarFiltroDeRepetidas(outros.cards);
  const questoes = criarFiltroDeRepetidas(outros.questoes);
  const conteudos = (t.conteudos ?? []).map((c) => ({
    ...c,
    cards: (c.cards ?? []).filter((card) => cards.aceitar(card.titulo)),
    atividades: (c.atividades ?? []).filter((a) => questoes.aceitar(a.enunciado)),
  }));
  const refsComCard = new Set(conteudos.flatMap((c) => c.cards ?? []).map((card) => `${card.conteudo_ref ?? ""}|${card.titulo}`));
  const refsComAtividade = new Set(
    conteudos.flatMap((c) => c.atividades ?? []).map((a) => `${a.conteudo_ref ?? ""}|${a.enunciado}`),
  );
  return {
    ...t,
    conteudos,
    // As listas do tópico são o achatado das dos conteúdos: seguem o mesmo corte.
    ...(t.cards ? { cards: t.cards.filter((card) => refsComCard.has(`${card.conteudo_ref ?? ""}|${card.titulo}`)) } : {}),
    ...(t.atividades
      ? { atividades: t.atividades.filter((a) => refsComAtividade.has(`${a.conteudo_ref ?? ""}|${a.enunciado}`)) }
      : {}),
  };
}
