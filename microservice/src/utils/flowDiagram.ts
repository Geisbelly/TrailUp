// Converte os "diagramas" em arte ASCII que o Gemini escreve dentro de blocos
// de codigo no markdown - do tipo
//
//   [ Aplicacao ] ---> [ Send Buffer (SO) ] === (Segmentos TCP) ===> [ Destino ]
//
// - em um diagrama SVG de verdade (caixas, setas, rotulos), embutido no proprio
// markdown como data URI de imagem.
//
// Por que SVG embutido no markdown, e nao um bloco pro cliente renderizar:
// o mesmo markdown e consumido por tres superficies diferentes (console web,
// app mobile em React Native e o deck HTML do BrainHexPDF). Uma imagem
// funciona nas tres sem biblioteca nova em nenhuma; um bloco ```mermaid``` (ou
// a propria arte ASCII) exigiria renderizador em cada uma - e no mobile, onde
// nao ha DOM, viraria texto cru na cara do aluno.
//
// Layout vertical de proposito (mobile-first): a largura e fixa e a altura
// cresce, entao rotulo longo nunca fica ilegivel numa tela de celular - um
// fluxo horizontal de 4 caixas com texto comprido vira tipografia de 4px
// quando a imagem encolhe pra largura do telefone.

export interface FlowNode {
  label: string;
}

export interface FlowStage {
  /** Caixas lado a lado nesta etapa (fan-in: varias origens pro mesmo destino). */
  nodes: FlowNode[];
  /** Rotulo da seta que ENTRA nesta etapa (ex.: "Segmentos TCP"). */
  edgeLabel?: string;
}

export interface FlowSpec {
  stages: FlowStage[];
  /** Desdobramento pendurado abaixo do fluxo (o "|" seguido de caixas na arte ASCII). */
  branch?: { label?: string; nodes: FlowNode[] };
  /** Linhas numeradas de apoio ("1. Executa flush...") viram um painel de etapas. */
  notes: string[];
}

// Linha que so tem tracos/barras/setas, sem conteudo: e a "cola" visual da arte
// ASCII (|, v-----v, ---, \, /) e nao carrega informacao nenhuma.
const CONNECTOR_ONLY_RE = /^[\s|v^\\/<>=+~.-]*$/;
const ARROW_RE = /(-{1,}>|={1,}>|→|-{2,}\\|-{2,}\/)/;
const NUMBERED_NOTE_RE = /^\s*\d+[.)]\s+/;
// Varre a linha da esquerda pra direita: "[...]" e "(...)" na ordem em que
// aparecem. Escanear em sequencia (em vez de dois regex separados) e o que faz
// "[ Send Buffer (SO) ]" ser UMA caixa, e nao uma caixa + um rotulo de seta -
// o "[" vem primeiro e consome os parenteses de dentro.
const BOX_OR_LABEL_RE = /\[([^[\]]*)\]|\(([^()]*)\)/g;
const MIN_BOXES_FOR_DIAGRAM = 2;

interface LineTokens {
  boxes: string[];
  /** edgeLabels[i] = rotulo que aparece imediatamente antes de boxes[i]. */
  edgeLabels: Array<string | undefined>;
  hasArrow: boolean;
}

function tokenizeLine(line: string): LineTokens {
  const boxes: string[] = [];
  const edgeLabels: Array<string | undefined> = [];
  let pendingLabel: string | undefined;

  for (const match of line.matchAll(BOX_OR_LABEL_RE)) {
    const [, boxContent, labelContent] = match;
    if (boxContent !== undefined) {
      boxes.push(boxContent.trim());
      edgeLabels.push(pendingLabel);
      pendingLabel = undefined;
    } else if (labelContent !== undefined) {
      const limpo = labelContent.trim();
      if (limpo) pendingLabel = limpo;
    }
  }

  return { boxes, edgeLabels, hasArrow: ARROW_RE.test(line) };
}

/**
 * Interpreta um bloco de arte ASCII como fluxo. Devolve null quando nao da pra
 * afirmar que aquilo e um fluxo (menos de duas caixas) - nesse caso quem chama
 * deixa o bloco de codigo como estava, sem inventar diagrama.
 */
export function parseAsciiFlow(block: string): FlowSpec | null {
  const linhas = block.split(/\r?\n/);

  const comCaixa: Array<LineTokens & { ordem: number }> = [];
  const notas: string[] = [];
  const rotulosSoltos: string[] = [];

  linhas.forEach((linha, ordem) => {
    if (!linha.trim()) return;
    const tokens = tokenizeLine(linha);
    if (tokens.boxes.length > 0) {
      comCaixa.push({ ...tokens, ordem });
      return;
    }
    if (CONNECTOR_ONLY_RE.test(linha)) return;
    if (NUMBERED_NOTE_RE.test(linha)) {
      notas.push(linha.trim().replace(NUMBERED_NOTE_RE, ""));
      return;
    }
    // Texto solto e curto entre as caixas e rotulo de transicao (ex.: a linha
    // "accept()" entre o "|" de cima e as caixas de baixo); texto longo e nota.
    const limpo = linha.trim();
    if (limpo.length <= 40) rotulosSoltos.push(limpo);
    else notas.push(limpo);
  });

  const totalCaixas = comCaixa.reduce((soma, l) => soma + l.boxes.length, 0);
  if (totalCaixas < MIN_BOXES_FOR_DIAGRAM) return null;

  // A "espinha" do fluxo e a linha com mais caixas - as outras sao ou origens
  // convergindo pra ela (fan-in, quando trazem seta) ou desdobramentos
  // pendurados abaixo (quando nao trazem).
  let espinha = comCaixa[0];
  for (const linha of comCaixa) {
    if (linha.boxes.length > espinha.boxes.length) espinha = linha;
  }

  const stages: FlowStage[] = espinha.boxes.map((label, i) => ({
    nodes: [{ label }],
    edgeLabel: espinha.edgeLabels[i],
  }));

  const branchNodes: FlowNode[] = [];
  for (const linha of comCaixa) {
    if (linha === espinha) continue;
    if (linha.hasArrow) {
      // Origem paralela: entra na primeira etapa, na ordem do texto.
      const posicao = linha.ordem < espinha.ordem ? "antes" : "depois";
      const nos = linha.boxes.map((label) => ({ label }));
      if (posicao === "antes") stages[0].nodes.unshift(...nos);
      else stages[0].nodes.push(...nos);
    } else {
      branchNodes.push(...linha.boxes.map((label) => ({ label })));
    }
  }

  const spec: FlowSpec = { stages, notes: notas };
  if (branchNodes.length > 0) {
    spec.branch = { nodes: branchNodes };
    if (rotulosSoltos.length > 0) spec.branch.label = rotulosSoltos[rotulosSoltos.length - 1];
  } else if (rotulosSoltos.length > 0) {
    // Sem desdobramento, rotulo solto ainda e informacao: vira nota em vez de
    // ser descartado.
    spec.notes = [...rotulosSoltos, ...spec.notes];
  }

  return spec;
}

// --- Cor -------------------------------------------------------------------

const DIAGRAM_BG = "#161a27";
const DIAGRAM_SURFACE = "#1e2334";
const TEXT_COLOR = "#f3f1ed";
const MUTED_TEXT_COLOR = "#d4d4d8";

function hexToRgb(hex: string): [number, number, number] {
  const limpo = hex.replace("#", "").trim();
  const cheio = limpo.length === 3 ? limpo.split("").map((c) => c + c).join("") : limpo;
  return [
    parseInt(cheio.slice(0, 2), 16),
    parseInt(cheio.slice(2, 4), 16),
    parseInt(cheio.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex).map(canal);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function rgbToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Eleva a LUMINOSIDADE HSL da cor do perfil ate ela atingir o contraste minimo
 * contra o fundo do diagrama. Nunca mistura com branco: misturar dessatura e
 * "apaga" a cor-assinatura do perfil mesmo passando no contraste (mesma regra
 * do ajuste ciruergico de contraste do resto do sistema).
 */
export function ensureContrast(hex: string, background: string, minRatio: number): string {
  let [h, s, l] = rgbToHsl(hex);
  let atual = hex;
  // Passos de 2% de luminosidade - suficiente pra convergir sem estourar.
  for (let i = 0; i < 50 && contrastRatio(atual, background) < minRatio; i += 1) {
    l = Math.min(1, l + 0.02);
    atual = hslToHex(h, s, l);
  }
  return atual;
}

// --- Render ----------------------------------------------------------------

const SVG_WIDTH = 760;
const PADDING = 24;
const BOX_PADDING_X = 14;
const BOX_PADDING_Y = 12;
const LINE_HEIGHT = 18;
const FONT_SIZE = 13;
const CHAR_WIDTH = 6.9; // largura media de 13px sans-serif, o suficiente pro wrap
const ARROW_GAP = 34;
const STAGE_GAP = 16;
const NODE_GAP = 12;
// Teto de largura da caixa: sem ele uma etapa de um no so esticava de ponta a
// ponta e o diagrama virava uma pilha de barras, nao um fluxograma. Com teto +
// centralizacao a leitura fica igual as referencias (caixa compacta no eixo).
const MAX_NODE_WIDTH = 340;

function escapeXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapLabel(label: string, maxWidth: number): string[] {
  const maxChars = Math.max(8, Math.floor((maxWidth - BOX_PADDING_X * 2) / CHAR_WIDTH));
  const palavras = label.split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of palavras) {
    const candidato = atual ? `${atual} ${palavra}` : palavra;
    if (candidato.length <= maxChars) {
      atual = candidato;
      continue;
    }
    if (atual) linhas.push(atual);
    atual = palavra.length > maxChars ? palavra.slice(0, maxChars - 1) + "…" : palavra;
  }
  if (atual) linhas.push(atual);
  return linhas.length > 0 ? linhas : [label];
}

function renderBox(
  x: number,
  y: number,
  width: number,
  linhas: string[],
  accent: string,
): { svg: string; height: number } {
  const height = linhas.length * LINE_HEIGHT + BOX_PADDING_Y * 2;
  const textos = linhas
    .map(
      (linha, i) =>
        `<text x="${x + width / 2}" y="${y + BOX_PADDING_Y + LINE_HEIGHT * i + FONT_SIZE}" fill="${TEXT_COLOR}" font-family="Inter, system-ui, sans-serif" font-size="${FONT_SIZE}" font-weight="600" text-anchor="middle">${escapeXml(linha)}</text>`,
    )
    .join("");
  const svg =
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="10" fill="${DIAGRAM_SURFACE}" stroke="${accent}" stroke-width="1.6" />` +
    textos;
  return { svg, height };
}

/**
 * Desenha o fluxo como SVG (string, sem dependencia de DOM). Fluxo de cima pra
 * baixo, com as caixas de cada etapa lado a lado.
 */
export function renderFlowDiagramSvg(spec: FlowSpec, options?: { accentColor?: string }): string {
  const accent = ensureContrast(options?.accentColor || "#5b3fd9", DIAGRAM_BG, 3);
  const partes: string[] = [];
  let y = PADDING;

  const desenharEtapa = (nodes: FlowNode[]) => {
    const disponivel = SVG_WIDTH - PADDING * 2 - NODE_GAP * (nodes.length - 1);
    const largura = Math.min(MAX_NODE_WIDTH, disponivel / nodes.length);
    const larguraTotal = largura * nodes.length + NODE_GAP * (nodes.length - 1);
    const xInicial = (SVG_WIDTH - larguraTotal) / 2;
    const linhasPorNo = nodes.map((no) => wrapLabel(no.label, largura));
    const alturaMax = Math.max(...linhasPorNo.map((l) => l.length)) * LINE_HEIGHT + BOX_PADDING_Y * 2;
    nodes.forEach((_, i) => {
      const x = xInicial + i * (largura + NODE_GAP);
      const { svg } = renderBox(x, y, largura, linhasPorNo[i], accent);
      partes.push(svg);
    });
    y += alturaMax;
  };

  const desenharSeta = (label?: string) => {
    const meio = SVG_WIDTH / 2;
    partes.push(
      `<line x1="${meio}" y1="${y + 4}" x2="${meio}" y2="${y + ARROW_GAP - 6}" stroke="${accent}" stroke-width="1.8" marker-end="url(#seta)" />`,
    );
    if (label) {
      partes.push(
        `<text x="${meio + 12}" y="${y + ARROW_GAP / 2 + 4}" fill="${MUTED_TEXT_COLOR}" font-family="Inter, system-ui, sans-serif" font-size="11.5" font-style="italic">${escapeXml(label)}</text>`,
      );
    }
    y += ARROW_GAP;
  };

  spec.stages.forEach((stage, i) => {
    if (i > 0) desenharSeta(stage.edgeLabel);
    desenharEtapa(stage.nodes);
  });

  if (spec.branch) {
    desenharSeta(spec.branch.label);
    desenharEtapa(spec.branch.nodes);
  }

  if (spec.notes.length > 0) {
    y += STAGE_GAP;
    const alturaPainel = spec.notes.length * LINE_HEIGHT + BOX_PADDING_Y * 2;
    partes.push(
      `<rect x="${PADDING}" y="${y}" width="${SVG_WIDTH - PADDING * 2}" height="${alturaPainel}" rx="10" fill="${DIAGRAM_SURFACE}" stroke="${accent}" stroke-width="1" stroke-opacity="0.55" />`,
    );
    spec.notes.forEach((nota, i) => {
      const linhaY = y + BOX_PADDING_Y + LINE_HEIGHT * i + FONT_SIZE;
      partes.push(
        `<text x="${PADDING + BOX_PADDING_X}" y="${linhaY}" fill="${accent}" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="700">${i + 1}.</text>`,
        `<text x="${PADDING + BOX_PADDING_X + 18}" y="${linhaY}" fill="${MUTED_TEXT_COLOR}" font-family="Inter, system-ui, sans-serif" font-size="12">${escapeXml(nota)}</text>`,
      );
    });
    y += alturaPainel;
  }

  const altura = y + PADDING;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_WIDTH} ${altura}" width="100%" role="img">` +
    `<defs><marker id="seta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
    `<path d="M 0 0 L 10 5 L 0 10 z" fill="${accent}" /></marker></defs>` +
    `<rect width="${SVG_WIDTH}" height="${altura}" rx="14" fill="${DIAGRAM_BG}" />` +
    partes.join("") +
    `</svg>`
  );
}

/** Texto alternativo do diagrama: o fluxo em uma linha, pra leitor de tela. */
export function describeFlow(spec: FlowSpec): string {
  const etapas = spec.stages.map((s) => s.nodes.map((n) => n.label).join(" / "));
  if (spec.branch) etapas.push(spec.branch.nodes.map((n) => n.label).join(" / "));
  return `Diagrama de fluxo: ${etapas.join(" → ")}`;
}

/**
 * Data URI percent-encoded, nao base64. Motivo: o mobile (React Native) nao tem
 * decoder de base64 nem dependencia que traga um, e precisa do XML cru pra
 * desenhar o SVG com react-native-svg (o <Image> do RN nao renderiza SVG).
 * Percent-encoding sai de graca no cliente (decodeURIComponent) e o navegador
 * (console e deck) renderiza igual.
 *
 * Os parenteses vao escapados a mao: encodeURIComponent os preserva, e a URI
 * fica dentro de "![alt](...)" no markdown - um ")" cru ali fecharia o link no
 * meio do SVG (os rotulos tem parentese, ex.: "Buffer Unico UDP (FIFO)"). O
 * "#" (cor hex, url(#seta)) ja e escapado por encodeURIComponent, senao viraria
 * fragmento da URI.
 */
export function svgToDataUri(svg: string): string {
  const encoded = encodeURIComponent(svg).replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `data:image/svg+xml,${encoded}`;
}

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

/**
 * Troca os blocos de arte ASCII do markdown por diagramas SVG embutidos. Bloco
 * com linguagem de codigo real declarada e bloco que nao da pra ler como fluxo
 * ficam exatamente como estavam - o objetivo e melhorar o que da, nunca
 * destruir codigo de exemplo nem inventar diagrama de algo que nao e fluxo.
 */
export function replaceAsciiFlowsWithDiagrams(
  markdown: string,
  options?: { accentColor?: string },
): string {
  if (!markdown) return markdown;

  return markdown.replace(FENCED_BLOCK_RE, (original, linguagem: string, corpo: string) => {
    const lang = (linguagem || "").trim().toLowerCase();
    if (lang && REAL_CODE_LANGUAGES.has(lang)) return original;

    const spec = parseAsciiFlow(corpo);
    if (!spec) return original;

    const svg = renderFlowDiagramSvg(spec, options);
    return `![${describeFlow(spec)}](${svgToDataUri(svg)})`;
  });
}
