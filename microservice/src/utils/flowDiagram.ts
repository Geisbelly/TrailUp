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

import {
  DIAGRAM_BG,
  DIAGRAM_SURFACE,
  FONT_SIZE,
  FONT_STACK,
  LINE_HEIGHT,
  MUTED_TEXT_COLOR,
  TEXT_COLOR,
  arrowMarkerDefs,
  ensureContrast,
  escapeXml,
  wrapLabel,
} from "./diagramTheme";

// Reexportados por compatibilidade: eram definidos aqui antes de virarem base
// compartilhada com o laneDiagram.
export { ensureContrast, svgToDataUri } from "./diagramTheme";

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

// --- Render ----------------------------------------------------------------

const SVG_WIDTH = 760;
const PADDING = 24;
const BOX_PADDING_X = 14;
const BOX_PADDING_Y = 12;
const ARROW_GAP = 34;
const STAGE_GAP = 16;
const NODE_GAP = 12;
// Teto de largura da caixa: sem ele uma etapa de um no so esticava de ponta a
// ponta e o diagrama virava uma pilha de barras, nao um fluxograma. Com teto +
// centralizacao a leitura fica igual as referencias (caixa compacta no eixo).
const MAX_NODE_WIDTH = 340;

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
        `<text x="${x + width / 2}" y="${y + BOX_PADDING_Y + LINE_HEIGHT * i + FONT_SIZE}" fill="${TEXT_COLOR}" font-family="${FONT_STACK}" font-size="${FONT_SIZE}" font-weight="600" text-anchor="middle">${escapeXml(linha)}</text>`,
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
    const linhasPorNo = nodes.map((no) => wrapLabel(no.label, largura, BOX_PADDING_X));
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
        `<text x="${meio + 12}" y="${y + ARROW_GAP / 2 + 4}" fill="${MUTED_TEXT_COLOR}" font-family="${FONT_STACK}" font-size="11.5" font-style="italic">${escapeXml(label)}</text>`,
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
        `<text x="${PADDING + BOX_PADDING_X}" y="${linhaY}" fill="${accent}" font-family="${FONT_STACK}" font-size="12" font-weight="700">${i + 1}.</text>`,
        `<text x="${PADDING + BOX_PADDING_X + 18}" y="${linhaY}" fill="${MUTED_TEXT_COLOR}" font-family="${FONT_STACK}" font-size="12">${escapeXml(nota)}</text>`,
      );
    });
    y += alturaPainel;
  }

  const altura = y + PADDING;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_WIDTH} ${altura}" width="${SVG_WIDTH}" height="${altura}" role="img">` +
    arrowMarkerDefs(accent) +
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
