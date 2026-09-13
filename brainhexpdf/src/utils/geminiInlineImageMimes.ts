// Mimes de IMAGEM que a API do Gemini aceita como inlineData multimodal.
// Imagem fora dessa lista (ex.: image/gif e image/bmp, que o TrailUp extrai
// de .pptx/.docx do professor porque renderizam bem no deck e no app) faz a
// chamada inteira falhar - e a chamada carrega o deck todo, nao so aquela
// imagem. Entao ela e omitida do payload do modelo, mas continua na lista
// numerada do prompt e na lista de attachments: o indice
// (referenceImageIndex) nao muda, e a imagem segue sendo renderavel no
// slide. O modelo so nao consegue "ver" o conteudo dela pra decidir.
const GEMINI_INLINE_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
]);

/**
 * Diz se um attachment pode ir como inlineData pro Gemini. Só restringe
 * imagens - pdf, audio, video e texto seguem pelo caminho de sempre, sem
 * mudança de comportamento.
 */
export function canSendAsGeminiInlineData(mimeType: string | undefined | null): boolean {
  if (!mimeType) return false;
  const normalizado = mimeType.trim().toLowerCase();
  if (!normalizado.startsWith('image/')) return true;
  return GEMINI_INLINE_IMAGE_MIMES.has(normalizado);
}
