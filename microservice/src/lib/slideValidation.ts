export interface SlideValidationResult {
  valid: boolean;
  reason?: string;
}

export const MAX_SLIDE_HTML_CHARS = 24_000;

// Padrões que indicariam o slide tentando sair do sandbox (rede, storage,
// navegação pro topo/pai, execução dinâmica de string). O sandbox do iframe
// e o CSP do mini-documento já bloqueiam isso na prática — esta checagem é
// defesa em profundidade: pega cedo, sem depender só do runtime do browser.
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /fetch\s*\(/i, label: "fetch(...)" },
  { pattern: /XMLHttpRequest/i, label: "XMLHttpRequest" },
  { pattern: /document\.cookie/i, label: "document.cookie" },
  { pattern: /localStorage/i, label: "localStorage" },
  { pattern: /sessionStorage/i, label: "sessionStorage" },
  { pattern: /window\.top/i, label: "window.top" },
  { pattern: /window\.parent/i, label: "window.parent" },
  { pattern: /<script[^>]*\bsrc\s*=/i, label: "<script src=...> externo" },
  { pattern: /\beval\s*\(/i, label: "eval(...)" },
  { pattern: /new\s+Function\s*\(/i, label: "new Function(...)" },
];

export function validateSlideHtml(
  html: string,
  maxChars: number = MAX_SLIDE_HTML_CHARS,
): SlideValidationResult {
  if (!html || !html.trim()) {
    return { valid: false, reason: "HTML do slide está vazio" };
  }
  if (html.length > maxChars) {
    return {
      valid: false,
      reason: `HTML do slide excede o limite de ${maxChars} caracteres (${html.length})`,
    };
  }
  for (const { pattern, label } of DANGEROUS_PATTERNS) {
    if (pattern.test(html)) {
      return { valid: false, reason: `HTML do slide contém padrão não permitido: ${label}` };
    }
  }
  return { valid: true };
}
