// Sanitiza texto para o subconjunto Latin-1 (U+0000-U+00FF) suportado pelas
// fontes built-in do jsPDF. Latin-1 ja cobre todos os acentos do PT-BR
// (a, e, i, o, u, ao, ca, etc.), portanto so substituimos os caracteres
// tipograficos fora desse range.
//
// Aceita null/undefined retornando string vazia, evitando crashes em
// callers que recebem campos opcionais do Gemini.

const SINGLE_QUOTE = String.fromCharCode(0x27);
const DOUBLE_QUOTE = String.fromCharCode(0x22);

export function sanitizeLatin1(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/’|‘|ʼ/g, SINGLE_QUOTE) // curly apostrophes
    .replace(/“|„/g, DOUBLE_QUOTE)        // curly open quote
    .replace(/”/g, DOUBLE_QUOTE)               // curly close quote
    .replace(/–/g, "-")                        // en-dash
    .replace(/—|―/g, "-")                 // em-dash
    .replace(/…/g, "...")                      // ellipsis
    .replace(/•/g, "·")                   // bullet -> middle dot
    .replace(/[^\x00-\xFF]/g, " ")                  // strip qualquer coisa fora de Latin-1
    .trim();
}
