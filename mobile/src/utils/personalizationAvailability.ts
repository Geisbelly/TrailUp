function object(value: unknown): Record<string, any> {
  if (typeof value === 'string') {
    try { return object(JSON.parse(value)); } catch { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function text(value: unknown) { return typeof value === 'string' && value.trim().length > 0; }

function file(media: Record<string, any>): boolean {
  return [media.arquivo_url, media.storage_path, media.url, media.payload?.arquivo_url,
    media.payload?.storage_path, media.payload?.url].some(text) ||
    (Array.isArray(media.partes) && media.partes.some((part: unknown) => file(object(part))));
}

/** Um roteiro de TTS sem arquivo não é áudio disponível. */
export function availablePersonalizedFormats(record: { materiais?: unknown }): string[] {
  const materials = object(record.materiais);
  const formats = new Set<string>();
  for (const [rawKind, raw] of Object.entries(materials)) {
    const kind = ({ md: 'markdown', texto: 'markdown' } as Record<string, string>)[rawKind] ?? rawKind;
    if (!['markdown', 'audio', 'apresentacao', 'pdf', 'documento', 'imagem', 'video', 'quiz', 'cards'].includes(kind)) continue;
    const media = object(raw);
    const payload = object(media.payload);
    const hasFile = file(media);
    const usable = kind === 'markdown'
      ? hasFile || [payload.markdown, payload.texto, payload.conteudo, media.markdown, media.texto].some(text)
      : kind === 'apresentacao'
      ? hasFile || (Array.isArray(payload.slides) && payload.slides.length > 0)
      : kind === 'cards'
      ? (Array.isArray(media.payload) && media.payload.length > 0) || (Array.isArray(payload.cards) && payload.cards.length > 0)
      : kind === 'quiz'
      ? [media.payload, payload.questoes, payload.questions, payload.atividades, payload.activities].some((items) => Array.isArray(items) && items.length > 0)
      : hasFile;
    if (usable) formats.add(kind);
  }
  return [...formats];
}

export function personalizedAvailabilityScore(record: { materiais?: unknown }) {
  // Cards injetados da biblioteca não podem fazer um registro vazio vencer
  // aquele que contém os arquivos do percurso. Não mistura IDs de versões.
  return availablePersonalizedFormats(record).reduce((score, kind) => score + (kind === 'cards' ? 1 : 10), 0);
}
