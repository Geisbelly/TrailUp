// Ponto de entrada dos diagramas: varre os blocos de codigo do markdown e troca
// por SVG o que der pra ler como diagrama. Cada bloco passa pelos formatos
// conhecidos, do mais especifico pro mais generico:
//
//   1. laneDiagram  - quadro emoldurado de duas raias (diagrama de sequencia);
//   2. flowDiagram  - cadeia de caixas ligadas por setas.
//
// Nao reconhecido = bloco fica exatamente como estava. Melhorar o que da sem
// destruir codigo de exemplo nem inventar diagrama de algo que nao e diagrama.

import { describeFlow, parseAsciiFlow, renderFlowDiagramSvg } from "./flowDiagram";
import { describeLaneDiagram, parseLaneDiagram, renderLaneDiagramSvg } from "./laneDiagram";
import { svgToDataUri } from "./diagramTheme";

// Bloco de codigo cercado por ``` (com ou sem linguagem declarada).
const FENCED_BLOCK_RE = /```([^\n`]*)\n([\s\S]*?)```/g;

// Linguagens em que o bloco e codigo de verdade e nunca deve ser convertido -
// "[ ... ]" ali e array/indice, nao caixa de diagrama.
const REAL_CODE_LANGUAGES = new Set([
  "python",
  "py",
  "js",
  "javascript",
  "ts",
  "typescript",
  "java",
  "c",
  "cpp",
  "csharp",
  "cs",
  "go",
  "rust",
  "php",
  "ruby",
  "sql",
  "bash",
  "sh",
  "shell",
  "json",
  "yaml",
  "yml",
  "html",
  "css",
  "xml",
]);

// Linha de moldura ASCII ("+-----+"). Bloco emoldurado que o parser de raias
// nao entendeu NAO desce pro parser de fluxo: os "|" das bordas viram caixas e
// notas falsas, e o resultado e um diagrama errado - pior que o texto original.
const FRAME_LINE_RE = /^\s*\+[-+=\s]*\+\s*$/m;

function hasFrame(corpo: string): boolean {
  return (corpo.split(/\r?\n/).filter((l) => FRAME_LINE_RE.test(l)).length ?? 0) >= 2;
}

export function replaceAsciiDiagramsWithSvg(
  markdown: string,
  options?: { accentColor?: string },
): string {
  if (!markdown) return markdown;

  return markdown.replace(FENCED_BLOCK_RE, (original, linguagem: string, corpo: string) => {
    const lang = (linguagem || "").trim().toLowerCase();
    if (lang && REAL_CODE_LANGUAGES.has(lang)) return original;

    const lane = parseLaneDiagram(corpo);
    if (lane) {
      return `![${describeLaneDiagram(lane)}](${svgToDataUri(renderLaneDiagramSvg(lane, options))})`;
    }

    if (hasFrame(corpo)) return original;

    const flow = parseAsciiFlow(corpo);
    if (flow) {
      return `![${describeFlow(flow)}](${svgToDataUri(renderFlowDiagramSvg(flow, options))})`;
    }

    return original;
  });
}
