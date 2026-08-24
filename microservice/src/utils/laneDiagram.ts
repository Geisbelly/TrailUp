// Segundo formato de "diagrama" que o Gemini escreve em arte ASCII: um quadro
// de duas raias, com moldura e titulo, trocando mensagens entre os dois lados -
//
//   +------------------------------------------------+
//   |          CICLO DE VIDA DA COMUNICACAO TCP      |
//   +------------------------------------------------+
//   | SERVIDOR                             CLIENTE  |
//   | socket() -> bind() -> listen()                |
//   | accept() <--- [ Aguarda Conexao ] <--- socket()|
//   | close() <----- [ Encerramento ] -----> close() |
//   +------------------------------------------------+
//
// E um diagrama de sequencia, nao um fluxo em cadeia: o que importa e QUEM fala
// com QUEM, em que ordem e com que mensagem. Passar isso pelo parser de fluxo
// (flowDiagram) devolvia lixo - so as partes entre colchetes viravam caixa e os
// endpoints (accept(), socket(), connect(), close()) eram perdidos, junto com
// os "|" da moldura vazando pras notas.

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

export type LaneDirection = "left-to-right" | "right-to-left" | "both";

export interface LaneStep {
  /** Endpoint na raia da esquerda (ex.: "accept()"). */
  left?: string;
  /** Endpoint na raia da direita (ex.: "socket()"). */
  right?: string;
  /** Mensagem trocada, o que estava entre colchetes no meio da linha. */
  message?: string;
  /** Ausente quando o passo acontece dentro de uma raia so. */
  direction?: LaneDirection;
}

export interface LaneSpec {
  title?: string;
  lanes: [string, string];
  steps: LaneStep[];
}

const FRAME_LINE_RE = /^\s*\+[-+=\s]*\+\s*$/;
// Seta que cruza as raias: pelo menos dois tracos/iguais, com ponta em algum
// lado. Uma seta curta ("->") NAO conta - ela liga passos dentro da mesma raia
// ("socket() -> bind() -> listen()") e nao e troca de mensagem.
const LANE_ARROW_RE = /<?[-=]{2,}>?/g;
const LANE_ARROW_TEST = /(<[-=]{2,}|[-=]{2,}>)/;
const MIN_STEPS_FOR_LANE_DIAGRAM = 2;

function stripFrame(linha: string): string {
  return linha.replace(/^\s*\|/, "").replace(/\|\s*$/, "").trim();
}

function unwrapBrackets(texto: string): string {
  const match = texto.match(/^\[\s*(.*?)\s*\]$/);
  return (match ? match[1] : texto).trim();
}

function isConnectorNoise(texto: string): boolean {
  return !texto || /^[|\s^v.+-]*$/.test(texto);
}

function parseHeader(texto: string): [string, string] | null {
  // Duas etiquetas separadas por um vao largo: "SERVIDOR        CLIENTE".
  const partes = texto.split(/\s{3,}/).map((p) => p.trim()).filter(Boolean);
  if (partes.length !== 2) return null;
  if (LANE_ARROW_TEST.test(texto)) return null;
  if (partes.some((p) => p.length > 24 || /[[\]]/.test(p))) return null;
  return [partes[0], partes[1]];
}

function parseStep(texto: string): LaneStep | null {
  if (!LANE_ARROW_TEST.test(texto)) {
    // Sem seta de travessia: passo interno da raia da esquerda (o proprio
    // texto pode ter setas curtas, "socket() -> bind() -> listen()").
    const limpo = unwrapBrackets(texto);
    return limpo ? { left: limpo } : null;
  }

  const setas = texto.match(LANE_ARROW_RE) ?? [];
  const segmentos = texto
    .split(LANE_ARROW_RE)
    .map((s) => s.trim())
    .filter((s) => !isConnectorNoise(s));
  if (segmentos.length === 0) return null;

  const primeiraSeta = setas[0] ?? "";
  const ultimaSeta = setas[setas.length - 1] ?? "";
  const apontaEsquerda = primeiraSeta.startsWith("<");
  const apontaDireita = ultimaSeta.endsWith(">");
  const direction: LaneDirection =
    apontaEsquerda && apontaDireita ? "both" : apontaEsquerda ? "right-to-left" : "left-to-right";

  if (segmentos.length === 1) {
    return { left: unwrapBrackets(segmentos[0]), direction };
  }

  const left = unwrapBrackets(segmentos[0]);
  const right = unwrapBrackets(segmentos[segmentos.length - 1]);
  // Com tres ou mais segmentos, o do meio (entre colchetes na arte) e a
  // mensagem trocada; com dois, a linha so liga os dois endpoints.
  const message =
    segmentos.length > 2 ? unwrapBrackets(segmentos.slice(1, -1).join(" ")) : undefined;

  return { left, right, message, direction };
}

/**
 * Interpreta o bloco como diagrama de duas raias. Devolve null quando o texto
 * nao tem essa forma (sem cabecalho de duas etiquetas, ou sem troca de
 * mensagem suficiente) - quem chama entao tenta o parser de fluxo.
 */
export function parseLaneDiagram(block: string): LaneSpec | null {
  const linhas = block.split(/\r?\n/);

  const molduras = linhas.filter((l) => FRAME_LINE_RE.test(l)).length;
  const conteudo: string[] = [];
  let title: string | undefined;
  let lanes: [string, string] | null = null;

  for (const linha of linhas) {
    if (!linha.trim() || FRAME_LINE_RE.test(linha)) continue;
    const texto = stripFrame(linha);
    if (isConnectorNoise(texto)) continue;

    if (!lanes) {
      const cabecalho = parseHeader(texto);
      if (cabecalho) {
        lanes = cabecalho;
        continue;
      }
      // Antes do cabecalho, linha unica e centralizada e o titulo do quadro.
      if (!title && molduras >= 2 && !LANE_ARROW_TEST.test(texto)) {
        title = texto;
        continue;
      }
    }

    conteudo.push(texto);
  }

  if (!lanes) return null;

  const steps = conteudo.map(parseStep).filter((s): s is LaneStep => s !== null);
  const travessias = steps.filter((s) => s.direction && s.right).length;
  if (steps.length < MIN_STEPS_FOR_LANE_DIAGRAM || travessias === 0) return null;

  return { title, lanes, steps };
}

// --- Render ----------------------------------------------------------------

const SVG_WIDTH = 760;
const PADDING = 22;
const LANE_BOX_WIDTH = 250;
const LANE_LEFT_CENTER = PADDING + LANE_BOX_WIDTH / 2;
const LANE_RIGHT_CENTER = SVG_WIDTH - PADDING - LANE_BOX_WIDTH / 2;
const HEADER_HEIGHT = 34;
const ENDPOINT_HEIGHT = 26;
const STEP_GAP = 20;
const BOX_PADDING_X = 10;

function endpointBox(cx: number, y: number, texto: string, accent: string): string {
  const largura = Math.min(LANE_BOX_WIDTH, texto.length * 7.2 + BOX_PADDING_X * 2);
  const x = cx - largura / 2;
  return (
    `<rect x="${x}" y="${y}" width="${largura}" height="${ENDPOINT_HEIGHT}" rx="7" fill="${DIAGRAM_SURFACE}" stroke="${accent}" stroke-width="1.4" />` +
    `<text x="${cx}" y="${y + ENDPOINT_HEIGHT / 2 + 4}" fill="${TEXT_COLOR}" font-family="${FONT_STACK}" font-size="12" font-weight="600" text-anchor="middle">${escapeXml(texto)}</text>`
  );
}

/** Desenha o diagrama de sequencia: duas raias, linhas de vida e mensagens. */
export function renderLaneDiagramSvg(spec: LaneSpec, options?: { accentColor?: string }): string {
  const accent = ensureContrast(options?.accentColor || "#5b3fd9", DIAGRAM_BG, 3);
  const partes: string[] = [];
  let y = PADDING;

  if (spec.title) {
    const linhasTitulo = wrapLabel(spec.title, SVG_WIDTH - PADDING * 2, PADDING);
    linhasTitulo.forEach((linha, i) => {
      partes.push(
        `<text x="${SVG_WIDTH / 2}" y="${y + FONT_SIZE + i * LINE_HEIGHT}" fill="${TEXT_COLOR}" font-family="${FONT_STACK}" font-size="14" font-weight="700" letter-spacing="0.4" text-anchor="middle">${escapeXml(linha)}</text>`,
      );
    });
    y += linhasTitulo.length * LINE_HEIGHT + 10;
  }

  const yCabecalho = y;
  [
    [LANE_LEFT_CENTER, spec.lanes[0]],
    [LANE_RIGHT_CENTER, spec.lanes[1]],
  ].forEach(([cx, rotulo]) => {
    const x = (cx as number) - LANE_BOX_WIDTH / 2;
    partes.push(
      `<rect x="${x}" y="${y}" width="${LANE_BOX_WIDTH}" height="${HEADER_HEIGHT}" rx="9" fill="${accent}" fill-opacity="0.22" stroke="${accent}" stroke-width="1.6" />` +
        `<text x="${cx}" y="${y + HEADER_HEIGHT / 2 + 5}" fill="${TEXT_COLOR}" font-family="${FONT_STACK}" font-size="13" font-weight="700" text-anchor="middle">${escapeXml(String(rotulo))}</text>`,
    );
  });
  y += HEADER_HEIGHT + STEP_GAP;

  const corpo: string[] = [];
  for (const step of spec.steps) {
    const cruza = Boolean(step.direction && step.right);

    if (!cruza) {
      // Passo interno: uma caixa na raia da esquerda.
      corpo.push(endpointBox(LANE_LEFT_CENTER, y, step.left ?? "", accent));
      y += ENDPOINT_HEIGHT + STEP_GAP;
      continue;
    }

    if (step.message) {
      corpo.push(
        `<text x="${SVG_WIDTH / 2}" y="${y + 11}" fill="${MUTED_TEXT_COLOR}" font-family="${FONT_STACK}" font-size="11.5" font-style="italic" text-anchor="middle">${escapeXml(step.message)}</text>`,
      );
      y += 18;
    }

    if (step.left) corpo.push(endpointBox(LANE_LEFT_CENTER, y, step.left, accent));
    if (step.right) corpo.push(endpointBox(LANE_RIGHT_CENTER, y, step.right, accent));

    const yLinha = y + ENDPOINT_HEIGHT / 2;
    const x1 = LANE_LEFT_CENTER + LANE_BOX_WIDTH / 2 - 88;
    const x2 = LANE_RIGHT_CENTER - LANE_BOX_WIDTH / 2 + 88;
    const marcadorInicio = step.direction !== "left-to-right" ? ` marker-start="url(#setaIni)"` : "";
    const marcadorFim = step.direction !== "right-to-left" ? ` marker-end="url(#seta)"` : "";
    corpo.push(
      `<line x1="${x1}" y1="${yLinha}" x2="${x2}" y2="${yLinha}" stroke="${accent}" stroke-width="1.6" stroke-dasharray="5 4"${marcadorInicio}${marcadorFim} />`,
    );
    y += ENDPOINT_HEIGHT + STEP_GAP;
  }

  const altura = y - STEP_GAP + PADDING;

  // Linhas de vida por tras de tudo: vao do cabecalho ao ultimo passo.
  const linhasDeVida = [LANE_LEFT_CENTER, LANE_RIGHT_CENTER]
    .map(
      (cx) =>
        `<line x1="${cx}" y1="${yCabecalho + HEADER_HEIGHT}" x2="${cx}" y2="${altura - PADDING}" stroke="${accent}" stroke-width="1" stroke-opacity="0.4" />`,
    )
    .join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_WIDTH} ${altura}" width="${SVG_WIDTH}" height="${altura}" role="img">` +
    arrowMarkerDefs(accent) +
    arrowMarkerDefs(accent, "setaIni").replace('refX="8"', 'refX="2"').replace('orient="auto-start-reverse"', 'orient="auto"') +
    `<rect width="${SVG_WIDTH}" height="${altura}" rx="14" fill="${DIAGRAM_BG}" />` +
    linhasDeVida +
    partes.join("") +
    corpo.join("") +
    `</svg>`
  );
}

/** Texto alternativo: quem fala com quem, em ordem. */
export function describeLaneDiagram(spec: LaneSpec): string {
  const passos = spec.steps.map((step) => {
    if (!step.right) return step.left ?? "";
    const seta = step.direction === "right-to-left" ? "←" : step.direction === "both" ? "↔" : "→";
    const mensagem = step.message ? ` (${step.message})` : "";
    return `${step.left} ${seta} ${step.right}${mensagem}`;
  });
  const titulo = spec.title ? `${spec.title}: ` : "";
  return `Diagrama de sequência ${spec.lanes[0]} / ${spec.lanes[1]} — ${titulo}${passos.join("; ")}`;
}
