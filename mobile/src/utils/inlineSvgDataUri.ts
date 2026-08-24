// O markdown personalizado traz diagramas de fluxo como SVG embutido em data
// URI (gerados no microservice a partir da arte ASCII do Gemini - ver
// microservice/src/utils/flowDiagram.ts). O <Image> do React Native NAO
// renderiza SVG, entao aqui o XML e recuperado da URI pra ser desenhado com
// react-native-svg.
//
// So percent-encoding e aceito, de proposito: e nesse formato que o
// microservice publica justamente porque o RN nao tem decoder de base64 nem
// dependencia que traga um. Base64 devolve null e cai no renderizador padrao
// (que vai falhar em desenhar, mas sem quebrar a tela).

const PERCENT_PREFIXES = [
  "data:image/svg+xml;utf8,",
  "data:image/svg+xml;charset=utf-8,",
  "data:image/svg+xml,",
];

const VIEW_BOX_RE = /viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i;
const DEFAULT_ASPECT_RATIO = 4 / 3;

export interface InlineSvg {
  xml: string;
  /** largura / altura, tirado do viewBox - o container usa isso pra reservar altura. */
  aspectRatio: number;
}

function aspectRatioFromViewBox(xml: string): number {
  const match = xml.match(VIEW_BOX_RE);
  if (!match) return DEFAULT_ASPECT_RATIO;
  const largura = Number(match[1]);
  const altura = Number(match[2]);
  if (!Number.isFinite(largura) || !Number.isFinite(altura) || largura <= 0 || altura <= 0) {
    return DEFAULT_ASPECT_RATIO;
  }
  return largura / altura;
}

export function decodeInlineSvgDataUri(uri: string | null | undefined): InlineSvg | null {
  if (!uri) return null;

  const prefixo = PERCENT_PREFIXES.find((p) => uri.startsWith(p));
  if (!prefixo) return null;

  let xml: string;
  try {
    xml = decodeURIComponent(uri.slice(prefixo.length));
  } catch {
    // URI truncada/malformada: nao e caso de derrubar a tela do aluno.
    return null;
  }

  if (!xml.trimStart().startsWith("<svg")) return null;

  return { xml, aspectRatio: aspectRatioFromViewBox(xml) };
}
