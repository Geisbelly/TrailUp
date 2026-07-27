import { jsPDF } from "jspdf";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { BRAIN_HEX_CONFIG, BrainHexProfile } from "../constants/brainHex";
import { sanitizeLatin1 } from "../lib/textSanitize";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Arte oficial dos guardioes (mesmos PNGs usados no app mobile,
// mobile/src/assets/guardioes/) — usada como selo/badge do guia, e como pano de
// fundo de slides quando NAO ha imagem gerada por IA para aquele slide (ver
// "Fundo do slide" abaixo).
//
// Socializer e o unico perfil com 2 guardioes (Mateo + Zuri, irmaos gemeos —
// ver geminiService.ts/generateConversationalAudio). A arte oficial do perfil
// usa a dupla junta (socializer-duo.png) em vez do Mateo solo, pra refletir a
// mesma identidade de "dialogo entre 2 vozes" que o audio tem.
const GUARDIAN_IMAGE_FILE: Partial<Record<BrainHexProfile, string>> = {
  socializer: "socializer-duo.png",
};

const guardianImageCache = new Map<BrainHexProfile, string | null>();

function getGuardianImageDataUrl(profile: BrainHexProfile): string | null {
  if (guardianImageCache.has(profile)) return guardianImageCache.get(profile) ?? null;
  try {
    const fileName = GUARDIAN_IMAGE_FILE[profile] ?? `${profile}.png`;
    const filePath = path.join(__dirname, "..", "assets", "guardioes", fileName);
    const base64 = fs.readFileSync(filePath).toString("base64");
    const dataUrl = `data:image/png;base64,${base64}`;
    guardianImageCache.set(profile, dataUrl);
    return dataUrl;
  } catch (e) {
    guardianImageCache.set(profile, null);
    return null;
  }
}

// 16:9 slide dimensions — mesma proporcao da imagem gerada por IA por slide
// (generateSlideImage pede aspectRatio "16:9"), entao a imagem cabe no slide
// INTEIRO como pano de fundo, sem distorcer.
const W = 1280;
const H = 720;
const DIVX = 560; // largura do painel esquerdo (retrato do guia) no layout sem imagem gerada

interface SlideData {
  titulo?: string;
  title?: string;
  topics?: string[];
  explanation?: string;
  characterQuote?: string;
  characterAction?: string;
  imagem_referencia?: string;
  sourceIds?: string[];
}

const SYNTHESIS_LABELS: Record<BrainHexProfile, string> = {
  mastermind: "SÍNTESE ESTRATÉGICA",
  seeker:     "ECO DA DESCOBERTA",
  survivor:   "PROTOCOLO DE SOBREVIVÊNCIA",
  daredevil:  "VISÃO DO ABISMO",
  conqueror:  "DECRETO DE VITÓRIA",
  socializer: "PACTO SOCIAL",
  achiever:   "RELATÓRIO DE CONQUISTA",
};

// Motivo decorativo de fundo por perfil — reforca a identidade visual (mesma
// linguagem das analogias de slide em geminiService.ts: engrenagens/mapas/
// escudos/chamas/estrategia militar/fogueira/escadas) quando NAO ha imagem de
// IA pra aquele slide, pra cada pagina nao parecer uma copia identica da
// anterior mesmo sem arte gerada.
type MotifKind = "grid" | "rings" | "stripes" | "flames" | "banners" | "campfire" | "stairs";

const PROFILE_MOTIF: Record<BrainHexProfile, MotifKind> = {
  mastermind: "grid",     // circuitos/logica
  seeker:     "rings",    // bussola/mapa
  survivor:   "stripes",  // alerta/faixas de risco
  daredevil:  "flames",   // combustao/impacto
  conqueror:  "banners",  // estandartes/estrategia militar
  socializer: "campfire", // fogueira/roda de comunidade
  achiever:   "stairs",   // progressao/gemas
};

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

// Fundo escuro derivado da cor-assinatura do perfil (em vez de uma tabela fixa
// escolhida a mao) — garante que o painel SEMPRE carregue o tom do guardiao
// certo (bug anterior: seeker/Amara e dourado mas o painel saia verde;
// conqueror/Amina e verde-azulado mas o painel saia roxo-azulado).
function deriveDarkBg(accent: [number, number, number]): [number, number, number] {
  return [
    Math.round(accent[0] * 0.1) + 6,
    Math.round(accent[1] * 0.1) + 6,
    Math.round(accent[2] * 0.1) + 9,
  ];
}

// Sanitize for Latin-1 (jsPDF built-in fonts) — preserves all PT-BR characters (á é ã ç ú ó etc.)
// Latin-1 covers U+0000–U+00FF which includes all Portuguese accented characters.
// We only replace typographic characters that fall outside that range.
// Mantida apenas para histórico; usa sanitizeLatin1 (testado).
// Veja src/lib/textSanitize.ts.
function ptbr(text: string): string {
  return sanitizeLatin1(text);
}

function imgFormat(dataUrl: string): "PNG" | "JPEG" {
  const m = dataUrl.match(/data:image\/(\w+);/);
  const t = m?.[1]?.toLowerCase();
  return t === "jpg" || t === "jpeg" ? "JPEG" : "PNG";
}

// Pseudo-aleatorio determinístico (mesmo slide => mesmo layout sempre, mas
// cada slide/perfil tem uma variação própria) — evita depender de uma lib de
// RNG só pra espalhar o motivo decorativo de forma nao repetitiva.
function rand01(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function withOpacity(doc: jsPDF, opacity: number, draw: () => void) {
  doc.setGState(new (doc as any).GState({ opacity }));
  draw();
  doc.setGState(new (doc as any).GState({ opacity: 1 }));
}

/** Desenha o motivo decorativo do perfil dentro da caixa (x,y,w,h), variando com `seed`. */
function drawMotif(
  doc: jsPDF,
  kind: MotifKind,
  x: number, y: number, w: number, h: number,
  color: [number, number, number],
  seed: number,
  opacity = 0.16
) {
  doc.setDrawColor(...color);
  doc.setFillColor(...color);

  withOpacity(doc, opacity, () => {
    if (kind === "grid") {
      // reticulado de nos de circuito conectados por linhas finas
      doc.setLineWidth(1);
      const cols = 5, rows = 6;
      const pts: [number, number][] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const jitterX = (rand01(seed + r * cols + c) - 0.5) * (w / cols) * 0.5;
          const jitterY = (rand01(seed + r * cols + c + 50) - 0.5) * (h / rows) * 0.5;
          pts.push([x + (c + 0.5) * (w / cols) + jitterX, y + (r + 0.5) * (h / rows) + jitterY]);
        }
      }
      pts.forEach(([px, py], i) => {
        if (i % cols < cols - 1) doc.line(px, py, pts[i + 1][0], pts[i + 1][1]);
        if (i + cols < pts.length) doc.line(px, py, pts[i + cols][0], pts[i + cols][1]);
        doc.circle(px, py, 2.4, "F");
      });
    } else if (kind === "rings") {
      // aneis de bussola/mapa concentricos, centro varia por slide
      const cx = x + w * (0.3 + rand01(seed) * 0.4);
      const cy = y + h * (0.3 + rand01(seed + 1) * 0.4);
      doc.setLineWidth(1.4);
      for (let ring = 1; ring <= 3; ring++) {
        doc.circle(cx, cy, ring * Math.min(w, h) * 0.14, "S");
      }
      // marcadores de "pista" espalhados
      for (let i = 0; i < 4; i++) {
        const px = x + rand01(seed + i * 7) * w;
        const py = y + rand01(seed + i * 7 + 3) * h;
        doc.circle(px, py, 3, "F");
      }
    } else if (kind === "stripes") {
      // faixas diagonais de alerta — finas e espacadas, pra nao competir com o texto
      doc.setLineWidth(2);
      const gap = 62;
      for (let off = -h; off < w; off += gap) {
        doc.line(x + off, y + h, x + off + h, y);
      }
    } else if (kind === "flames") {
      // triangulos ascendentes (impacto/combustao)
      const count = 5;
      for (let i = 0; i < count; i++) {
        const bx = x + (i + 0.5) * (w / count);
        const by = y + h - rand01(seed + i) * h * 0.3;
        const size = 26 + rand01(seed + i + 10) * 30;
        doc.triangle(bx - size / 2, by, bx + size / 2, by, bx, by - size * 1.4, "F");
      }
    } else if (kind === "banners") {
      // faixas horizontais tipo estandarte + acento em V (comando/estrategia) —
      // comeca depois da faixa de titulo (~35% da altura) pra nao cruzar o texto
      doc.setLineWidth(2.5);
      for (let i = 0; i < 3; i++) {
        const ly = y + h * 0.4 + i * (h * 0.16);
        doc.line(x, ly, x + w * (0.4 + rand01(seed + i) * 0.35), ly);
      }
      const cx = x + w * 0.5;
      doc.setLineWidth(3);
      doc.line(x + w * 0.4, y + h * 0.72, cx, y + h * 0.82);
      doc.line(cx, y + h * 0.82, x + w * 0.6, y + h * 0.72);
    } else if (kind === "campfire") {
      // circulos quentes se sobrepondo, irradiando de um ponto baixo (fogueira/roda)
      const cx = x + w * 0.5;
      const cy = y + h * 0.85;
      for (let i = 0; i < 5; i++) {
        const r = 24 + i * 22 + rand01(seed + i) * 10;
        doc.circle(cx, cy, r, "S");
      }
    } else if (kind === "stairs") {
      // escada ascendente + gemas (progressao/conquista)
      const steps = 5;
      const stepW = w / steps;
      for (let i = 0; i < steps; i++) {
        const sh = (i + 1) * (h / steps) * 0.7;
        doc.rect(x + i * stepW, y + h - sh, stepW * 0.82, sh, "F");
      }
      for (let i = 0; i < 3; i++) {
        const gx = x + rand01(seed + i * 3) * w;
        const gy = y + rand01(seed + i * 3 + 1) * h * 0.5;
        const s = 8;
        doc.triangle(gx - s, gy, gx, gy - s, gx + s, gy, "F");
        doc.triangle(gx - s, gy, gx, gy + s, gx + s, gy, "F");
      }
    }
  });
}

// Proporcao (largura/altura) dos retratos oficiais dos guardioes — retrato solo
// e alto e estreito (~489x1000), a dupla do Socializer e um pouco mais larga
// (~1087x1447). Fixo aqui porque os PNGs sao assets estaticos conhecidos, sem
// precisar de uma lib de imagem so pra ler as dimensoes em runtime.
const PORTRAIT_ASPECT = 0.49;

/** Selo do guia (retrato + nome) num cantinho do slide — usado quando o slide
 * tem imagem de IA de fundo, pra manter a identidade do personagem sem cobrir
 * a cena inteira como no layout sem imagem. */
function drawGuideBadge(
  doc: jsPDF,
  cfg: { guideName: string },
  leftX: number, bottomY: number, width: number,
  accent: [number, number, number],
  portraitDataUrl: string | null
) {
  const height = width / PORTRAIT_ASPECT;
  const topY = bottomY - height;

  // moldura
  withOpacity(doc, 0.85, () => {
    doc.setFillColor(14, 14, 22);
    doc.roundedRect(leftX, topY, width, height, 12, 12, "F");
  });
  doc.setDrawColor(...accent);
  doc.setLineWidth(2);
  doc.roundedRect(leftX, topY, width, height, 12, 12, "S");

  if (portraitDataUrl) {
    try {
      doc.addImage(portraitDataUrl, imgFormat(portraitDataUrl), leftX + 4, topY + 4, width - 8, height - 8, undefined, "MEDIUM");
    } catch {
      /* mantem so a moldura */
    }
  }

  // etiqueta com o nome, sobrepondo a base da moldura
  const tagW = Math.min(width + 20, 120);
  const tagX = leftX + (width - tagW) / 2;
  withOpacity(doc, 0.94, () => {
    doc.setFillColor(...accent);
    doc.roundedRect(tagX, bottomY - 16, tagW, 26, 7, 7, "F");
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(16, 16, 22);
  doc.text(ptbr(cfg.guideName), tagX + tagW / 2, bottomY + 1, { align: "center" });
}

export async function generateSlidesPDF(
  slides: SlideData[],
  profile: BrainHexProfile,
  _titulo: string = "Apresentação"
): Promise<Buffer> {
  const cfg = BRAIN_HEX_CONFIG[profile];
  const accent: [number, number, number] = hexToRgb(cfg.color);
  const bgDark: [number, number, number]    = deriveDarkBg(accent);
  const textLight: [number, number, number] = [243, 236, 218];
  const textMuted: [number, number, number] = [188, 188, 202];
  const bgCard: [number, number, number]    = [
    Math.min(255, bgDark[0] + 20),
    Math.min(255, bgDark[1] + 20),
    Math.min(255, bgDark[2] + 28),
  ];
  const motifColor: [number, number, number] = [
    Math.min(255, accent[0] + 40),
    Math.min(255, accent[1] + 40),
    Math.min(255, accent[2] + 40),
  ];
  const motifKind = PROFILE_MOTIF[profile];

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "px",
    format: [W, H],
    hotfixes: ["px_scaling"],
  });

  const total = slides.length;
  const guardianPortrait = getGuardianImageDataUrl(profile);

  for (let i = 0; i < total; i++) {
    if (i > 0) doc.addPage([W, H], "landscape");

    const s          = slides[i];
    const title      = ptbr(s.titulo || s.title || `Slide ${i + 1}`);
    const topics     = (s.topics || []).map(ptbr).filter(Boolean);
    const expText    = ptbr(s.explanation || "");
    const quote      = ptbr(s.characterQuote || "");
    const sceneImage = s.imagem_referencia && s.imagem_referencia.startsWith("data:image/")
      ? s.imagem_referencia
      : null;

    let rx: number;
    let rw: number;
    let ry = 52;

    if (sceneImage) {
      // ───── Slide COM ambiente gerado por IA para este slide especifico ─────
      // A imagem ja nasce 16:9 (generateSlideImage pede aspectRatio "16:9"),
      // igual a proporcao do slide inteiro — usa como fundo full-bleed em vez
      // de espremer num painel estreito (o que distorcia/cortava a arte).
      try {
        doc.addImage(sceneImage, imgFormat(sceneImage), 0, 0, W, H, undefined, "MEDIUM");
      } catch {
        doc.setFillColor(...bgDark);
        doc.rect(0, 0, W, H, "F");
      }

      // Scrim gradual (transparente -> solido) sobre a faixa de texto, pra
      // manter a arte visivel a esquerda e o texto legivel a direita.
      const textZoneX = Math.round(W * 0.42);
      const fadeSteps = 24;
      const fadeW = W - textZoneX;
      for (let st = 0; st < fadeSteps; st++) {
        const t = st / fadeSteps;
        withOpacity(doc, Math.min(0.97, t * 1.05), () => {
          doc.setFillColor(...bgDark);
          doc.rect(textZoneX + st * (fadeW / fadeSteps), 0, fadeW / fadeSteps + 1, H, "F");
        });
      }

      rx = textZoneX + 44;
      rw = W - rx - 44;

      // Selo do guia no canto inferior esquerdo, sobre a arte
      drawGuideBadge(doc, cfg, 28, H - 78, 86, accent, guardianPortrait);
    } else {
      // ───── Slide SEM imagem de IA (custo/rate-limit) — ambiente proprio ─────
      // Painel esquerdo com o retrato oficial do guia + motivo decorativo do
      // perfil (varia por indice do slide, entao paginas consecutivas nao
      // saem identicas mesmo sem arte gerada nova).
      doc.setFillColor(...bgDark);
      doc.rect(0, 0, DIVX, H, "F");

      if (guardianPortrait) {
        try {
          doc.addImage(guardianPortrait, imgFormat(guardianPortrait), 0, 0, DIVX, H, undefined, "MEDIUM");
        } catch {
          /* mantem o fundo solido */
        }
      }

      drawMotif(doc, motifKind, 0, 0, DIVX, H, motifColor, i * 31 + 1, 0.14);

      // Gradiente de transicao (painel esquerdo -> direito)
      const fadeW = 140;
      const steps = 14;
      for (let st = 0; st < steps; st++) {
        const ratio = st / steps;
        doc.setFillColor(
          Math.round(bgDark[0] * ratio + accent[0] * 0.15 * (1 - ratio)),
          Math.round(bgDark[1] * ratio + accent[1] * 0.15 * (1 - ratio)),
          Math.round(bgDark[2] * ratio + accent[2] * 0.15 * (1 - ratio))
        );
        doc.rect(DIVX - fadeW + st * (fadeW / steps), 0, fadeW / steps + 1, H, "F");
      }

      // Nome do guia (rotulo simples; retrato ja preenche o painel)
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(...accent);
      withOpacity(doc, 0.92, () => {
        doc.roundedRect(20, H - 56, 140, 36, 8, 8, "F");
      });
      doc.setFillColor(20, 20, 32);
      doc.text(ptbr(cfg.guideName), 40, H - 33);

      // ───────────────── RIGHT PANEL (conteúdo) ─────────────────────
      doc.setFillColor(...bgDark);
      doc.rect(DIVX, 0, W - DIVX, H, "F");
      drawMotif(doc, motifKind, DIVX, 0, W - DIVX, H, motifColor, i * 31 + 500, 0.06);

      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.4);
      doc.line(DIVX, 0, DIVX, H);

      rx = DIVX + 44;
      rw = W - DIVX - 68;
    }

    // ───────────────── Balão de fala do guia (nos 2 layouts) ───────────────
    if (quote) {
      const bw = 250;
      const qWrapped = doc.splitTextToSize(`"${quote}"`, bw - 20);
      doc.setFontSize(10);
      const visLines = qWrapped.slice(0, 6);
      const bh = 24 + visLines.length * 15 + 12;
      // No layout com imagem, o balao fica ACIMA do selo do guia (que ocupa o
      // canto inferior esquerdo) pra nao sobrepor; no layout sem imagem, fica
      // ao lado do retrato central.
      const bx = sceneImage ? 24 : Math.min(DIVX / 2 + 58, DIVX - 240);
      const by = sceneImage ? H - 96 - 176 - 16 - bh : H / 2 - 160;

      withOpacity(doc, 0.92, () => {
        doc.setFillColor(24, 24, 40);
        doc.roundedRect(bx, by, bw, bh, 10, 10, "F");
      });
      doc.setDrawColor(...accent);
      doc.setLineWidth(1.2);
      doc.roundedRect(bx, by, bw, bh, 10, 10, "S");

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...accent);
      doc.text(ptbr(cfg.guideName).toUpperCase(), bx + 10, by + 14);

      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...textLight);
      doc.text(visLines, bx + 10, by + 28);
    }

    // ───────────────── Título + tópicos + explicação (nos 2 layouts) ───────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(30);
    doc.setTextColor(...textLight);
    const titleLines = doc.splitTextToSize(title, rw);
    const visTitle   = titleLines.slice(0, 2);
    doc.text(visTitle, rx, ry + 28);
    ry += visTitle.length * 36 + 16;

    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.4);
    doc.line(rx, ry, rx + rw, ry);
    ry += 16;

    const maxTopics = Math.min(topics.length, 5);
    for (let j = 0; j < maxTopics; j++) {
      if (ry > H - 180) break;
      const cardH = 38;

      withOpacity(doc, 0.88, () => {
        doc.setFillColor(...bgCard);
        doc.roundedRect(rx, ry - 8, rw, cardH, 8, 8, "F");
      });

      doc.setFillColor(...accent);
      doc.circle(rx + 14, ry + 11, 4, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...textLight);
      const tl = doc.splitTextToSize(topics[j], rw - 34);
      doc.text(tl[0] || "", rx + 26, ry + 14);
      ry += cardH + 6;
    }

    if (expText && ry < H - 130) {
      ry += 10;
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.3);
      doc.line(rx, ry, rx + rw, ry);
      ry += 14;

      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...accent);
      doc.text(SYNTHESIS_LABELS[profile], rx, ry);
      ry += 14;

      doc.setFontSize(12);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...textMuted);
      const eLines     = doc.splitTextToSize(expText, rw);
      const maxLinesFit = Math.floor((H - 72 - ry) / 17);
      doc.text(eLines.slice(0, Math.min(4, maxLinesFit)), rx, ry);
    }

    // ───────────────── FOOTER ─────────────────────────────────────
    const footY = H - 52;
    withOpacity(doc, 0.88, () => {
      doc.setFillColor(16, 16, 26);
      doc.rect(sceneImage ? 0 : DIVX, footY, sceneImage ? W : W - DIVX, 52, "F");
    });

    doc.setDrawColor(...accent);
    doc.setLineWidth(1);
    doc.line(rx - 10, footY, W - 20, footY);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...accent);
    doc.text(ptbr(cfg.guideName), rx, H - 26);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...textMuted);
    doc.text(`${i + 1} / ${total}`, W - 24, H - 26, { align: "right" });

    // Nota: sourceIds (Ref: pptx-sN) e metadado de rastreabilidade interna —
    // NUNCA renderizar no PDF do aluno (bug anterior: aparecia como texto
    // visivel no topo de cada slide).
  }

  return Buffer.from(doc.output("arraybuffer"));
}
