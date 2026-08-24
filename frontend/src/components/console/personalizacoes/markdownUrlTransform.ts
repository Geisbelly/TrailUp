import { defaultUrlTransform } from "react-markdown";

// O react-markdown sanitiza toda URL do documento e o padrao dele
// (defaultUrlTransform) so aceita http, https, mailto, xmpp e irc - "data:" cai
// fora. No markdown personalizado isso apagava duas coisas legitimas:
//
// 1. imagem do professor extraida de .pptx/.docx, que viaja como data URI
//    (nao existe URL publica pra ela - os bytes vem de dentro do arquivo);
// 2. diagrama de fluxo gerado pelo pipeline, publicado como SVG em data URI
//    (ver microservice/src/utils/flowDiagram.ts).
//
// Aqui o "data:" e liberado so pra imagem, so nos formatos que o pipeline
// realmente produz, e so no atributo src. Nao vale pra href de link nem pra
// nenhum outro atributo: "data:text/html" num link seria uma porta de XSS, e
// SVG dentro de <img> nao executa script em navegador nenhum.
const ALLOWED_INLINE_IMAGE_PREFIXES = [
  "data:image/png",
  "data:image/jpeg",
  "data:image/webp",
  "data:image/gif",
  "data:image/bmp",
  "data:image/svg+xml",
];

export function markdownUrlTransform(url: string, key: string, node: unknown): string {
  if (key === "src" && ALLOWED_INLINE_IMAGE_PREFIXES.some((prefixo) => url.startsWith(prefixo))) {
    return url;
  }
  return defaultUrlTransform(url) ?? "";
}
