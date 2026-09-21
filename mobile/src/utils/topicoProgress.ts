type ItemProgress = {
  status?: unknown;
  percentual_concluido?: unknown;
};

export type TopicoProgress = ItemProgress & {
  id?: number;
  conteudos?: ItemProgress[];
  atividades?: ItemProgress[];
};

/** Null significa ausência de projeção; zero é progresso confirmado. */
export function progressoCanonicoTopico(topico: ItemProgress | null | undefined): number | null {
  const raw = topico?.percentual_concluido;
  if (raw != null && raw !== '' && Number.isFinite(Number(raw))) {
    return Math.max(0, Math.min(100, Number(raw)));
  }
  const status = String(topico?.status ?? '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (status.includes('concl') || status.includes('finaliz') ||
      ['done', 'complete', 'finished'].includes(status)) return 100;
  return null;
}

export function isTopicoConcluido(topico: TopicoProgress | null | undefined, pendentes?: Set<number>): boolean {
  const canonico = progressoCanonicoTopico(topico);
  // A projeção do Supabase já inclui o percurso personalizado. Um cache de
  // outro guia ou ainda carregando não pode revogar a conclusão confirmada.
  if (canonico != null) return canonico >= 100;
  if (pendentes?.has(Number(topico?.id))) return false;
  const itens = [...(topico?.conteudos ?? []), ...(topico?.atividades ?? [])];
  return itens.length > 0 && itens.every((item) => progressoCanonicoTopico(item) === 100);
}

export function topicoConcluidoNaTela(params: {
  topico: TopicoProgress | null | undefined;
  personalizacaoCarregando: boolean;
  percurso: { total: number; concluidos: number };
}) {
  if (!params.topico) return false;
  const canonico = progressoCanonicoTopico(params.topico);
  if (canonico != null) return canonico >= 100;
  return !params.personalizacaoCarregando && params.percurso.total > 0 &&
    params.percurso.concluidos >= params.percurso.total;
}
