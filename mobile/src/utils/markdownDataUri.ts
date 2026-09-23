// Politica de data URI do markdown no app.
//
// O diagrama de fluxo chega no markdown como SVG embutido em data URI (gerado
// no microservice a partir da arte ASCII do Gemini — ver
// microservice/src/utils/flowDiagram.ts). O markdown-it, que e' o parser por
// baixo do react-native-markdown-display, sanitiza TODA url com `validateLink`,
// e o padrao dele e':
//
//   BAD_PROTO_RE  = /^(vbscript|javascript|file|data):/
//   GOOD_DATA_RE  = /^data:image\/(gif|png|jpeg|webp);/
//
// `svg+xml` nao esta na lista — e a regra ainda exige `;` logo depois do tipo,
// onde a nossa URI tem `,` (ela e' percent-encoded, nao base64). Os dois
// motivos batem, entao a imagem era **descartada no parser**, antes de qualquer
// regra de renderizacao.
//
// O sintoma nao era "diagrama em branco": sem token de imagem, o markdown-it
// devolve o trecho como TEXTO literal, entao o aluno via
// `![Diagrama de fluxo: ...](data:image/svg+xml,%3Csvg%20xmlns%3D...` — alguns
// kilobytes de percent-encoding no meio da leitura. E `decodeInlineSvgDataUri`
// + `SvgXml` no MarkdownBlock nunca chegavam a rodar: eram codigo morto.
//
// A liberacao aqui cobre so os formatos de imagem que o pipeline realmente
// produz, igual ao console
// (frontend/src/components/console/personalizacoes/markdownUrlTransform.ts).
// Tudo o mais que o markdown-it barra continua barrado — `data:text/html` num
// link, `javascript:`, `file:`.
//
// Sobre risco: no navegador a regra existe porque SVG pode carregar script. No
// React Native o SVG e' desenhado pelo react-native-svg, que pinta num canvas
// nativo e nao tem DOM nem interpretador de JS. O vetor que justifica a regra
// nao existe neste cliente.

export const PREFIXOS_DE_IMAGEM_EMBUTIDA = [
  "data:image/png",
  "data:image/jpeg",
  "data:image/webp",
  "data:image/gif",
  "data:image/bmp",
  "data:image/svg+xml",
];

export function permiteImagemEmbutida(url: string): boolean {
  if (typeof url !== "string") return false;
  const limpo = url.trim().toLowerCase();
  return PREFIXOS_DE_IMAGEM_EMBUTIDA.some((prefixo) => limpo.startsWith(prefixo));
}

/** Recebe a instancia do markdown-it e amplia `validateLink` — nao substitui:
 *  o que ja passava continua passando, e o que ele barra segue barrado. */
export function liberarImagensEmbutidas<T extends { validateLink: (url: string) => boolean }>(
  md: T,
): T {
  const padrao = md.validateLink.bind(md);
  md.validateLink = (url: string) => permiteImagemEmbutida(url) || padrao(url);
  return md;
}

/** O parser entrega o bloco de codigo com um "\n" a mais no fim; renderizar
 *  esse sobra vira uma linha vazia dentro da moldura. Mesmo tratamento que a
 *  regra `fence` da biblioteca faz, preservado porque a nossa regra a
 *  substitui. */
export function conteudoDeBloco(content: unknown): string {
  if (typeof content !== "string") return "";
  return content.endsWith("\n") ? content.slice(0, -1) : content;
}
