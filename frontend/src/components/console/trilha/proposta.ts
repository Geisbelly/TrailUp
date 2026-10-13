export type MediaType = "video" | "audio" | "pdf" | "documento" | "apresentacao";

export type AiCard = {
  titulo: string;
  descricao: string;
  conteudo_ref?: string | null;
  conteudo_origem_ref?: string | null;
};
export type AiAtividade = {
  titulo: string;
  enunciado: string;
  tipo: string;
  alternativas: string[] | null;
  resposta_correta: string;
  conteudo_ref?: string | null;
};
export type AiMidia = {
  tipo: MediaType;
  titulo: string;
  descricao: string;
  roteiro?: string | null;
  transcricao?: string | null;
  url?: string | null;
  sourceRef?: string | null;
};
export type AiConteudo = {
  ref?: string | null;
  sourceRef?: string | null;
  titulo: string;
  tipo: string;
  conteudo: string;
  cards?: AiCard[];
  atividades?: AiAtividade[];
  midias?: AiMidia[];
};
export type AiTopico = {
  nome: string;
  descricao: string;
  ordem: number;
  depende: number[];
  next: number[];
  conteudos: AiConteudo[];
  cards?: AiCard[];
  atividades?: AiAtividade[];
};

export const contagemDaProposta = (topicos: AiTopico[]) => {
  const conteudos = topicos.reduce((s, t) => s + (t.conteudos?.length ?? 0), 0);
  const atividades = topicos.reduce(
    (s, t) => s + ((t.conteudos ?? []).reduce((a, c) => a + (c.atividades?.length ?? 0), 0) || (t.atividades?.length ?? 0)),
    0,
  );
  const cards = topicos.reduce(
    (s, t) => s + ((t.conteudos ?? []).reduce((a, c) => a + (c.cards?.length ?? 0), 0) || (t.cards?.length ?? 0)),
    0,
  );
  return { topicos: topicos.length, conteudos, atividades, cards };
};

/** "Já gerar atividades? Não": a proposta segue igual, sem as atividades. */
export const semAtividades = (topicos: AiTopico[]): AiTopico[] =>
  topicos.map((t) => ({
    ...t,
    atividades: [],
    conteudos: (t.conteudos ?? []).map((c) => ({ ...c, atividades: [] })),
  }));

/** Renumera a proposta 1..n depois de uma remoção, remapeando next/depende e descartando ligações para o que saiu. */
export const removerDaProposta = (topicos: AiTopico[], ordem: number): AiTopico[] => {
  const restantes = topicos.filter((t) => t.ordem !== ordem);
  const novoNumero = new Map(restantes.map((t, i) => [t.ordem, i + 1]));
  const remap = (lista: number[]) => (lista ?? []).map((o) => novoNumero.get(o)).filter((n): n is number => n !== undefined);
  return restantes.map((t) => ({ ...t, ordem: novoNumero.get(t.ordem)!, next: remap(t.next), depende: remap(t.depende) }));
};

/** Troca o conteúdo de um tópico preservando o lugar dele no grafo (ordem, next, depende). */
export const substituirNaProposta = (topicos: AiTopico[], ordem: number, novo: AiTopico): AiTopico[] =>
  topicos.map((t) => (t.ordem === ordem ? { ...novo, ordem: t.ordem, next: t.next, depende: t.depende } : t));
