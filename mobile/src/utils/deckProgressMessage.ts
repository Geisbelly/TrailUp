/**
 * Evento de progresso emitido pelo deck do BrainHexPDF via postMessage
 * (ver reportProgressToHost em BrainHexPDF/src/utils/deckExportUtils.ts).
 * O deck nunca tem acesso a credenciais - so emite {itemKey, pontuacao...};
 * quem grava no banco e o app, com a sessao ja autenticada do aluno.
 */
export interface DeckProgressEvent {
  itemKey: string;
  pontuacaoObtida: number;
  pontuacaoMaxima: number;
}

export function parseDeckProgressMessage(raw: string): DeckProgressEvent | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  if (obj.type !== "trailup:progress") return null;
  if (typeof obj.itemKey !== "string" || !obj.itemKey.trim()) return null;
  if (typeof obj.pontuacaoObtida !== "number" || !Number.isFinite(obj.pontuacaoObtida)) return null;
  if (typeof obj.pontuacaoMaxima !== "number" || !Number.isFinite(obj.pontuacaoMaxima)) return null;

  return {
    itemKey: obj.itemKey,
    pontuacaoObtida: obj.pontuacaoObtida,
    pontuacaoMaxima: obj.pontuacaoMaxima,
  };
}
