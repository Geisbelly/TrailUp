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
  /** Arquivos do esqueleto para este tópico; usado ao gerar de novo o material que faltou. */
  arquivos_relacionados?: string[];
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

const ROTULO_DA_MIDIA: Record<MediaType, string> = {
  video: "Vídeo sugerido",
  audio: "Áudio sugerido",
  pdf: "PDF sugerido",
  documento: "Documento sugerido",
  apresentacao: "Apresentação sugerida",
};

/**
 * Como a mídia sugerida pela IA vira linha em `conteudos`.
 *
 * Antes, toda mídia que não fosse vídeo virava `tipo: "arquivo"` com o
 * roteiro (ou a descrição) no campo `conteudo`. Mas `arquivo` guarda o
 * CAMINHO do objeto no bucket: o console assinava a frase como objeto e o
 * Storage devolvia 400, e o professor via um "arquivo" que não existia.
 *
 * - arquivo que o professor enviou e a IA citou → `arquivo` com o caminho;
 * - link de verdade → `video` (vídeo) ou `link`;
 * - só texto (o caso comum: a IA sugere, não produz a mídia) → `texto`, com
 *   o roteiro em Markdown, que é o que o professor tem em mãos para gravar.
 */
export function conteudoDaMidia(
  midia: AiMidia,
  caminhoEnviado: string | null | undefined,
): { tipo: "arquivo" | "video" | "link" | "texto"; conteudo: string } | null {
  if (caminhoEnviado?.trim()) return { tipo: "arquivo", conteudo: caminhoEnviado.trim() };
  const url = midia.url?.trim() ?? "";
  if (/^https?:\/\//i.test(url)) return { tipo: midia.tipo === "video" ? "video" : "link", conteudo: url };

  const partes: string[] = [];
  const vistos = new Set<string>();
  const juntar = (titulo: string | null, texto: string | null | undefined) => {
    const limpo = texto?.trim();
    if (!limpo || vistos.has(limpo)) return;
    vistos.add(limpo);
    partes.push(titulo ? `### ${titulo}\n\n${limpo}` : limpo);
  };
  juntar(null, midia.descricao);
  juntar("Roteiro", midia.roteiro);
  juntar("Transcrição", midia.transcricao);
  // URL que não é link (a IA às vezes escreve o nome do arquivo ali): vira texto também.
  juntar(null, url);
  if (partes.length === 0) return null;
  return { tipo: "texto", conteudo: [`**${ROTULO_DA_MIDIA[midia.tipo] ?? "Mídia sugerida"}**`, ...partes].join("\n\n") };
}
