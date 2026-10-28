// Geometria do mapa de países da Trilha na web em tela larga (#346, protótipo
// v4, `03-trilha.html`: mapLayout, mapCellPath, hexPath e a estrada) e no
// celular (mobile-v1, `layoutMapaCelular`). Puro: só números e strings de path
// SVG, para o componente desenhar.
//
// O continente é uma grade (4 colunas × N fileiras) recortada em países que
// DIVIDEM fronteira: cada borda é gerada uma vez, sempre na mesma direção, e
// usada pelos dois vizinhos — nenhum país invade o outro e não sobra buraco.
// As fileiras encolhem (140 a 228 px) para caber na altura do quadro; se o
// quadro for estreito demais, o mapa cresce para o lado e rola na horizontal.

export const MAPA_TOPO = 28;
export const MAPA_BASE = 84; // folga sob o botão do guia
const MAPA_LADO = 0.03;
const MAPA_COL_MIN = 190;
export const MAPA_COLUNAS = 4;

export type Ponto = [number, number];
export type NoMapa = { r: number; c: number; colW: number; x: number; y: number };
export type LayoutMapa = {
  largura: number;
  altura: number;
  faixa: number;
  cols: number;
  rows: number;
  x0: number;
  cw: number;
  celulas: { c: number; r: number }[];
  nos: NoMapa[];
};

const hashMapa = (a: number, b: number) => {
  const r = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return r - Math.floor(r);
};

export function layoutMapa(total: number, largura: number, altura: number): LayoutMapa {
  // Turma com menos de 4 tópicos: uma coluna por tópico. Com 4 fixas, uma turma
  // de 1 tópico virava um país e três "terras sem nome" escuras, e o mapa
  // parecia quebrado (e as terras vazias não respondiam ao clique).
  const cols = Math.min(MAPA_COLUNAS, Math.max(1, total));
  const rows = Math.max(1, Math.ceil(total / cols));
  // Numa fileira só, o país pode crescer mais (até 320 px) para ocupar o quadro.
  const faixa = Math.max(140, Math.min(rows === 1 ? 320 : 228, (altura - MAPA_TOPO - MAPA_BASE) / rows));
  const W = Math.max(largura, Math.ceil((cols * MAPA_COL_MIN) / (1 - 2 * MAPA_LADO)));
  const x0 = W * MAPA_LADO;
  const cw = (W * (1 - 2 * MAPA_LADO)) / cols;
  const H = Math.max(altura, MAPA_TOPO + rows * faixa + MAPA_BASE);
  return { largura: W, altura: H, faixa, cols, rows, x0, cw, ...grade(total, cols, rows, x0, cw, faixa, { capital: 0.36, desvioX: 0.04, desvioY: 8 }) };
}

/** Celular (mobile-v1, `03-trilha.html`: M_COLS 2, M_FAIXA 196). */
export const MAPA_FAIXA_CELULAR = 196;
// O protótipo usa .035, mas a costa ondula para fora até ~15% da borda (≈30px numa
// fileira de 196) e, no aparelho, a costa da direita saía cortada da tela.
const MAPA_LADO_CELULAR = 0.06;
const MAPA_BASE_CELULAR = 20;

/**
 * O mesmo continente no celular: 2 colunas na largura da tela, fileiras de altura
 * fixa, e o mapa cresce para baixo (rola só na vertical). Usa o mesmo
 * `caminhoCelula`, então os países continuam dividindo fronteira.
 */
export function layoutMapaCelular(total: number, largura: number): LayoutMapa {
  const cols = Math.min(2, Math.max(1, total));
  const rows = Math.max(1, Math.ceil(total / cols));
  const faixa = MAPA_FAIXA_CELULAR;
  const x0 = largura * MAPA_LADO_CELULAR;
  const cw = (largura * (1 - 2 * MAPA_LADO_CELULAR)) / cols;
  const altura = MAPA_TOPO + rows * faixa + MAPA_BASE_CELULAR;
  return { largura, altura, faixa, cols, rows, x0, cw, ...grade(total, cols, rows, x0, cw, faixa, { capital: 0.34, desvioX: 0.05, desvioY: 6 }) };
}

/** Células da grade e a capital de cada tópico, em serpentina: fileira par vai da esquerda para a direita, ímpar volta. */
function grade(
  total: number,
  cols: number,
  rows: number,
  x0: number,
  cw: number,
  faixa: number,
  { capital, desvioX, desvioY }: { capital: number; desvioX: number; desvioY: number },
): Pick<LayoutMapa, "celulas" | "nos"> {
  const celulas: { c: number; r: number }[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) celulas.push({ c, r });
  const nos = Array.from({ length: total }, (_, i) => {
    const r = Math.floor(i / cols);
    const k = i % cols;
    const c = r % 2 ? cols - 1 - k : k;
    return {
      r,
      c,
      colW: cw,
      x: x0 + cw * (c + 0.5) + Math.sin((i + 1) * 0.82) * cw * desvioX,
      y: MAPA_TOPO + faixa * r + faixa * capital + Math.cos((i + 1) * 1.3) * desvioY,
    };
  });
  return { celulas, nos };
}

const f = (n: number) => n.toFixed(1);

/** Contorno do país na célula (c, r): bordas sinuosas compartilhadas com os vizinhos. */
export function caminhoCelula(L: LayoutMapa, c: number, r: number): string {
  const { cols, rows, x0, cw, faixa } = L;
  const vertice = (i: number, j: number): Ponto => {
    // Por dentro o vértice se desloca bastante; nas quinas da costa ele recua (continente arredondado).
    const dentroX = i > 0 && i < cols;
    const dentroY = j > 0 && j < rows;
    let x = x0 + i * cw + (dentroX ? (hashMapa(i, j) - 0.5) * cw * 0.3 : 0);
    let y = MAPA_TOPO + j * faixa + (dentroY ? (hashMapa(j + 7, i + 3) - 0.5) * faixa * 0.22 : 0);
    if (!dentroX && !dentroY) {
      x += (i ? -1 : 1) * cw * 0.16;
      y += (j ? -1 : 1) * faixa * 0.14;
    }
    return [x, y];
  };
  const borda = (A: Ponto, B: Ponto, semente: number, costa: boolean): Ponto[] => {
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const k = costa ? 1.35 : 1;
    const a = (hashMapa(semente, 1) - 0.5) * 0.22 * k;
    const b = (hashMapa(semente, 2) - 0.5) * 0.14 * k;
    const cc = (hashMapa(semente, 3) - 0.5) * 0.05 * k;
    const pts: Ponto[] = [];
    for (let n = 1; n < 16; n++) {
      const t = n / 16;
      const o = len * (a * Math.sin(Math.PI * t) + b * Math.sin(2 * Math.PI * t) + cc * Math.sin(5 * Math.PI * t));
      pts.push([A[0] + dx * t + nx * o, A[1] + dy * t + ny * o]);
    }
    return pts;
  };
  const H = (i: number, j: number) => borda(vertice(i, j), vertice(i + 1, j), i * 31 + j * 7 + 1, j === 0 || j === rows);
  const V = (i: number, j: number) => borda(vertice(i, j), vertice(i, j + 1), i * 17 + j * 43 + 5, i === 0 || i === cols);
  const pts: Ponto[] = [
    vertice(c, r),
    ...H(c, r),
    vertice(c + 1, r),
    ...V(c + 1, r),
    vertice(c + 1, r + 1),
    ...H(c, r + 1).reverse(),
    vertice(c, r + 1),
    ...V(c, r).reverse(),
  ];
  return "M" + pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(" L") + " Z";
}

/**
 * Onda do mar (um paralelo) atravessando o mapa na altura y. O "S" do SVG pede
 * quatro números (controle e ponto final); com só dois, o navegador descartava
 * o path inteiro e registrava erro no console.
 */
export function ondaMar(y: number, w: number, largura: number): string {
  return `M0 ${f(y)} C${f(largura * 0.25)} ${f(y + w)},${f(largura * 0.5)} ${f(y - w)},${f(largura * 0.75)} ${f(y + w)} S${f(largura * 0.95)} ${f(y - w)},${f(largura)} ${f(y)}`;
}

/** Trecho da estrada entre duas capitais; na virada de fileira a curva fica dentro do país. */
export function trechoEstrada(a: NoMapa, b: NoMapa): string {
  if (a.r === b.r) {
    const dx = (b.x - a.x) / 2;
    const w = (a.r % 2 ? -1 : 1) * 18;
    return `M${f(a.x)} ${f(a.y)} C${f(a.x + dx)} ${f(a.y + w)},${f(b.x - dx)} ${f(b.y - w)},${f(b.x)} ${f(b.y)}`;
  }
  const fora = (a.r % 2 ? -1 : 1) * a.colW * 0.46;
  return `M${f(a.x)} ${f(a.y)} C${f(a.x + fora)} ${f(a.y)},${f(b.x + fora)} ${f(b.y)},${f(b.x)} ${f(b.y)}`;
}

/** Hexágono de cantos arredondados (viewBox 100×100). */
export function caminhoHexagono(cx: number, cy: number, R: number, rc: number): string {
  const v: Ponto[] = [];
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI / 180) * (60 * i - 90);
    v.push([cx + R * Math.cos(ang), cy + R * Math.sin(ang)]);
  }
  let d = "";
  for (let i = 0; i < 6; i++) {
    const p = v[i];
    const pr = v[(i + 5) % 6];
    const nx = v[(i + 1) % 6];
    const t = rc / R;
    const a: Ponto = [p[0] + (pr[0] - p[0]) * t, p[1] + (pr[1] - p[1]) * t];
    const b: Ponto = [p[0] + (nx[0] - p[0]) * t, p[1] + (nx[1] - p[1]) * t];
    d += `${i ? "L" : "M"}${a[0].toFixed(2)} ${a[1].toFixed(2)} Q${p[0].toFixed(2)} ${p[1].toFixed(2)} ${b[0].toFixed(2)} ${b[1].toFixed(2)} `;
  }
  return d + "Z";
}
