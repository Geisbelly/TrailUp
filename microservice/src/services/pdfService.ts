import { jsPDF } from "jspdf";
import { BRAIN_HEX_CONFIG, BrainHexProfile } from "../constants/brainHex";
import { sanitizeLatin1 } from "../lib/textSanitize";

// 16:9 slide dimensions
const W = 1280;
const H = 720;
const DIVX = 560; // left panel (image) width

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

// Right-panel background per profile (matches interface)
const PANEL_BG: Record<BrainHexProfile, [number, number, number]> = {
  mastermind: [12, 12, 20],
  seeker:     [5,  10, 5],
  survivor:   [15, 10, 10],
  daredevil:  [10, 15, 10],
  conqueror:  [10, 10, 20],
  socializer: [15, 10, 20],
  achiever:   [20, 15, 10],
};

const SYNTHESIS_LABELS: Record<BrainHexProfile, string> = {
  mastermind: "SÍNTESE ESTRATÉGICA",
  seeker:     "ECO DA DESCOBERTA",
  survivor:   "PROTOCOLO DE SOBREVIVÊNCIA",
  daredevil:  "VISÃO DO ABISMO",
  conqueror:  "DECRETO DE VITÓRIA",
  socializer: "PACTO SOCIAL",
  achiever:   "RELATÓRIO DE CONQUISTA",
};

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
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

export async function generateSlidesPDF(
  slides: SlideData[],
  profile: BrainHexProfile,
  _titulo: string = "Apresentação"
): Promise<Buffer> {
  const cfg = BRAIN_HEX_CONFIG[profile];
  const accent: [number, number, number] = hexToRgb(cfg.color);
  const bgDark: [number, number, number]    = [10,  10,  15];
  const bgRight: [number, number, number]   = PANEL_BG[profile];
  const textLight: [number, number, number] = [243, 236, 218];
  const textMuted: [number, number, number] = [148, 163, 184];
  const bgCard: [number, number, number]    = [
    Math.min(255, bgRight[0] + 14),
    Math.min(255, bgRight[1] + 14),
    Math.min(255, bgRight[2] + 22),
  ];

  const doc = new jsPDF({
    orientation: "landscape",
    unit: "px",
    format: [W, H],
    hotfixes: ["px_scaling"],
  });

  const total = slides.length;

  for (let i = 0; i < total; i++) {
    if (i > 0) doc.addPage([W, H], "landscape");

    const s          = slides[i];
    const title      = ptbr(s.titulo || s.title || `Slide ${i + 1}`);
    const topics     = (s.topics || []).map(ptbr).filter(Boolean);
    const expText    = ptbr(s.explanation || "");
    const quote      = ptbr(s.characterQuote || "");
    const imgRef     = s.imagem_referencia || "";

    // ───────────────── LEFT PANEL (imagem + guia) ─────────────────
    doc.setFillColor(...bgDark);
    doc.rect(0, 0, DIVX, H, "F");

    if (imgRef.startsWith("data:image/")) {
      try {
        doc.addImage(imgRef, imgFormat(imgRef), 0, 0, DIVX, H, undefined, "MEDIUM");
      } catch {
        // fallback: accent-tinted dark rectangle
        doc.setFillColor(
          Math.min(255, accent[0] / 5),
          Math.min(255, accent[1] / 5),
          Math.min(255, accent[2] / 5)
        );
        doc.rect(0, 0, DIVX, H, "F");
      }
    } else {
      // No image: placeholder with accent colour
      doc.setFillColor(
        Math.min(255, accent[0] / 4),
        Math.min(255, accent[1] / 4),
        Math.min(255, accent[2] / 4)
      );
      doc.rect(0, 0, DIVX, H, "F");
    }

    // Gradient fade (right edge of left panel → right panel bg)
    // Using stepped rectangles since jsPDF doesn't support CSS gradients
    const fadeW = 140;
    const steps = 14;
    for (let st = 0; st < steps; st++) {
      const ratio = st / steps;
      doc.setFillColor(
        Math.round(bgRight[0] * ratio + accent[0] * 0.15 * (1 - ratio)),
        Math.round(bgRight[1] * ratio + accent[1] * 0.15 * (1 - ratio)),
        Math.round(bgRight[2] * ratio + accent[2] * 0.15 * (1 - ratio))
      );
      doc.rect(DIVX - fadeW + st * (fadeW / steps), 0, fadeW / steps + 1, H, "F");
    }

    // Guide circle (centered in left panel, on top of image)
    const gx = DIVX / 2;
    const gy = H / 2;
    const gr = 52;

    // Outer glow (darker accent)
    doc.setFillColor(
      Math.min(255, accent[0] / 3 + 10),
      Math.min(255, accent[1] / 3 + 10),
      Math.min(255, accent[2] / 3 + 10)
    );
    doc.circle(gx, gy, gr + 18, "F");

    // Circle fill
    doc.setFillColor(20, 20, 32);
    doc.circle(gx, gy, gr, "F");

    // Circle border (accent)
    doc.setDrawColor(...accent);
    doc.setLineWidth(3);
    doc.circle(gx, gy, gr, "S");

    // Guide name
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...accent);
    doc.text(ptbr(cfg.guideName), gx, gy + 8, { align: "center" });

    // Character quote bubble (top-right of guide circle)
    if (quote) {
      const bx    = Math.min(gx + gr + 6, DIVX - 230);
      const by    = gy - gr - 100;
      const bw    = 215;
      const qWrapped = doc.setFontSize(10).splitTextToSize
        ? doc.splitTextToSize(`"${quote}"`, bw - 20)
        : [`"${quote}"`];
      doc.setFontSize(10);
      const visLines = qWrapped.slice(0, 4);
      const bh = 24 + visLines.length * 15 + 12;

      // Bubble background
      doc.setFillColor(30, 30, 50);
      doc.roundedRect(bx, by, bw, bh, 10, 10, "F");
      doc.setDrawColor(...accent);
      doc.setLineWidth(1.2);
      doc.roundedRect(bx, by, bw, bh, 10, 10, "S");

      // Guide name label
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...accent);
      doc.text(ptbr(cfg.guideName).toUpperCase(), bx + 10, by + 14);

      // Quote text
      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(...textLight);
      doc.text(visLines, bx + 10, by + 28);
    }

    // ───────────────── RIGHT PANEL (conteúdo) ─────────────────────
    doc.setFillColor(...bgRight);
    doc.rect(DIVX, 0, W - DIVX, H, "F");

    // Separator line
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.4);
    doc.line(DIVX, 0, DIVX, H);

    const rx = DIVX + 44;
    const rw = W - DIVX - 68;
    let ry   = 52;

    // Source IDs (small refs)
    const srcIds = (s.sourceIds || []).slice(0, 3);
    if (srcIds.length > 0) {
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(90, 90, 115);
      doc.text(srcIds.map((id) => `Ref: ${id}`).join("   "), rx, ry);
      ry += 18;
    }

    // Slide title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(30);
    doc.setTextColor(...textLight);
    const titleLines = doc.splitTextToSize(title, rw);
    const visTitle   = titleLines.slice(0, 2);
    doc.text(visTitle, rx, ry + 28);
    ry += visTitle.length * 36 + 16;

    // Separator
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.4);
    doc.line(rx, ry, rx + rw, ry);
    ry += 16;

    // Topics
    const maxTopics = Math.min(topics.length, 5);
    for (let j = 0; j < maxTopics; j++) {
      if (ry > H - 180) break;
      const cardH = 38;

      // Card background
      doc.setFillColor(...bgCard);
      doc.roundedRect(rx, ry - 8, rw, cardH, 8, 8, "F");

      // Accent dot
      doc.setFillColor(...accent);
      doc.circle(rx + 14, ry + 11, 4, "F");

      // Topic text
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...textLight);
      const tl = doc.splitTextToSize(topics[j], rw - 34);
      doc.text(tl[0] || "", rx + 26, ry + 14);
      ry += cardH + 6;
    }

    // Explanation
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
    doc.setFillColor(20, 20, 32);
    doc.rect(DIVX, footY, W - DIVX, 52, "F");

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
  }

  return Buffer.from(doc.output("arraybuffer"));
}
