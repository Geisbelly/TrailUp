import { formatoDaQuestao, type FormatoDaQuestao } from "./formatoDaQuestao";
import type { AiAtividade, AiCard, AiMidia, AiTopico } from "./proposta";

/**
 * O que a revisão da trilha com IA mostra de cada tópico: os conteúdos, com o texto, os cards, as
 * atividades e as mídias sugeridas, cada um no conteúdo em que VAI SER GRAVADO.
 *
 * A distribuição é a mesma de `aplicar` em `GenerateTrailDialog.tsx`: card e atividade vão para o
 * conteúdo do `conteudo_ref` dele, ou para o conteúdo onde vieram; as listas do tópico só valem
 * quando nenhum conteúdo trouxe a sua (cards no primeiro conteúdo, atividades pelo `conteudo_ref`
 * ou no primeiro). Mostrar outra coisa seria revisar uma trilha diferente da que entra.
 */

export type ConteudoDaRevisao = {
  chave: string;
  titulo: string;
  tipo: string;
  /** O texto como o aluno vai ler, com a figura do material indicada no lugar do marcador. */
  texto: string;
  cards: AiCard[];
  atividades: AiAtividade[];
  midias: AiMidia[];
};

const MARCADOR_DE_FIGURA = /\{\{figura:([^|}]+)(?:\|([^}]*))?\}\}/g;

/** O marcador de figura só vira imagem ao aplicar (a figura sai do arquivo enviado). */
export function textoParaRevisao(texto: string | null | undefined): string {
  return String(texto ?? "").replace(MARCADOR_DE_FIGURA, (_, _ref: string, legenda?: string) => {
    const l = legenda?.trim();
    return l ? `*(Figura do material: ${l})*` : "*(Figura do material)*";
  });
}

export function conteudosParaRevisao(t: AiTopico): ConteudoDaRevisao[] {
  const conteudos = t.conteudos ?? [];
  if (conteudos.length === 0) return [];
  const refs = conteudos.map((c, i) => (c.ref || `content:${i + 1}`).trim());
  const indiceDoRef = new Map(refs.map((ref, i) => [ref, i] as const));
  const destino = (ref: string | null | undefined, local: number) => indiceDoRef.get(ref ?? "") ?? local;

  const itens: ConteudoDaRevisao[] = conteudos.map((c, i) => ({
    chave: `${refs[i]}#${i}`,
    titulo: c.titulo,
    tipo: c.tipo || "texto",
    texto: textoParaRevisao(c.conteudo),
    cards: [],
    atividades: [],
    midias: c.midias ?? [],
  }));

  conteudos.forEach((c, i) => {
    for (const card of c.cards ?? []) itens[destino(card.conteudo_ref, i)].cards.push(card);
    for (const a of c.atividades ?? []) itens[destino(a.conteudo_ref, i)].atividades.push(a);
  });
  if (itens.every((x) => x.cards.length === 0)) for (const card of t.cards ?? []) itens[0].cards.push(card);
  if (conteudos.every((c) => (c.atividades?.length ?? 0) === 0)) {
    for (const a of t.atividades ?? []) itens[destino(a.conteudo_ref, 0)].atividades.push(a);
  }
  return itens;
}

const NOME_DO_FORMATO: Record<FormatoDaQuestao, string> = {
  quiz: "Múltipla escolha",
  true_false: "Verdadeiro ou falso",
  fill_blank: "Completar lacuna",
  essay: "Dissertativa",
  code: "Código",
  numeric: "Numérica",
  expression: "Expressão",
};

/** O tipo como vai ser gravado (o que o modelo escreveu passa por `formatoDaQuestao`). */
export const nomeDoTipoDaAtividade = (tipo: string | null | undefined) => NOME_DO_FORMATO[formatoDaQuestao(tipo)];

/** A alternativa certa, para marcar na lista: compara sem caixa nem espaço nas pontas. */
export function ehAlternativaCorreta(alternativa: string, resposta: string | null | undefined): boolean {
  const n = (v: string) => v.trim().toLowerCase();
  return Boolean(resposta) && n(alternativa) === n(String(resposta));
}
