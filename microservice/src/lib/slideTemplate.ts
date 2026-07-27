import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { BRAIN_HEX_CONFIG, BrainHexProfile } from "../constants/brainHex";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface SlideForTemplate {
  titulo?: string;
  title?: string;
  topics?: string[];
  explanation?: string;
  characterQuote?: string;
  imagem_referencia?: string;
  icones?: string[];
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

// Fundo escuro derivado da cor-assinatura do perfil — cada perfil sempre carrega
// o proprio tom, sem depender de uma tabela escolhida a mao (bug do jsPDF antigo).
function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}
function deriveDarkBg(accent: [number, number, number]): string {
  const r = Math.round(accent[0] * 0.1) + 6;
  const g = Math.round(accent[1] * 0.1) + 6;
  const b = Math.round(accent[2] * 0.1) + 9;
  return `rgb(${r}, ${g}, ${b})`;
}

// Determinístico por índice — mesmo slide sempre gera o mesmo layout, mas cada
// slide/perfil tem posições diferentes pros ícones.
function rand01(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function guardianPortraitPath(profile: BrainHexProfile): string {
  const fileName = profile === "socializer" ? "socializer-duo.png" : `${profile}.png`;
  return path.join(__dirname, "..", "assets", "guardioes", fileName);
}

function fileToDataUrl(filePath: string, mime: string): string | null {
  try {
    return `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
  } catch {
    return null;
  }
}

function fontFaceCss(): string {
  const fontPath = path.join(__dirname, "..", "assets", "fonts", "MedievalSharp-Regular.ttf");
  const dataUrl = fileToDataUrl(fontPath, "font/ttf");
  if (!dataUrl) return "";
  return `
    @font-face {
      font-family: 'Grimoire';
      src: url('${dataUrl}') format('truetype');
    }
  `;
}

function iconsHtml(icones: string[] | undefined, seedBase: number): string {
  if (!icones || icones.length === 0) return "";
  return icones
    .map((icon, idx) => {
      const seed = seedBase + idx * 17;
      const top = 8 + rand01(seed) * 58; // 8%-66%, evita rodape/selo
      const left = 4 + rand01(seed + 3) * 32; // 4%-36%, evita coluna de conteudo
      const size = 56 + rand01(seed + 6) * 28; // 56-84px
      const rotate = (rand01(seed + 9) - 0.5) * 24; // -12 a +12 graus
      return `<div class="icon" style="top:${top}%; left:${left}%; width:${size}px; height:${size}px; transform: rotate(${rotate}deg);"><img src="${icon}" /></div>`;
    })
    .join("\n");
}

function slideHtml(slide: SlideForTemplate, index: number, profile: BrainHexProfile): string {
  const cfg = BRAIN_HEX_CONFIG[profile];
  // Acento mantém o hex exato da cor-assinatura oficial (brainHex.ts) — não
  // recalcular/reconverter, para não criar mais uma variante dessincronizada
  // (ver CLAUDE.md: backend/frontend já divergem por terem cada um a sua conta).
  const accent = cfg.color;
  const accentRgb = hexToRgb(cfg.color);
  const bgSolid = deriveDarkBg(accentRgb);

  const titulo = escapeHtml(slide.titulo || slide.title || `Slide ${index + 1}`);
  const topics = (slide.topics || []).slice(0, 5).map(escapeHtml);
  const explanation = escapeHtml(slide.explanation || "");
  const quote = escapeHtml(slide.characterQuote || "");
  const scene = slide.imagem_referencia;

  const portraitDataUrl = fileToDataUrl(guardianPortraitPath(profile), "image/png");

  return `
    <section class="slide" style="--accent: ${accent}; --bg-solid: ${bgSolid};">
      ${scene ? `<div class="scene" style="background-image: url('${scene}');"></div><div class="scrim"></div>` : ""}
      ${iconsHtml(slide.icones, index * 31)}
      <div class="guide-badge">
        ${portraitDataUrl ? `<img src="${portraitDataUrl}" />` : ""}
        <div class="tag">${escapeHtml(cfg.guideName)}</div>
      </div>
      ${quote ? `<div class="quote-bubble"><span class="who">${escapeHtml(cfg.guideName)}</span>"${quote}"</div>` : ""}
      <div class="content">
        <h1>${titulo}</h1>
        ${topics.map((t) => `<div class="topic-card">${t}</div>`).join("\n")}
        ${explanation ? `<div class="explanation-label">${SYNTHESIS_LABELS[profile]}</div><div class="explanation-text">${explanation}</div>` : ""}
      </div>
      <div class="footer">
        <span class="footer-guide">${escapeHtml(cfg.guideName)}</span>
        <span class="footer-page">${index + 1} / ${"__TOTAL__"}</span>
      </div>
    </section>
  `;
}

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; }
  .slide {
    width: 1280px; height: 720px; position: relative; overflow: hidden;
    page-break-after: always; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: var(--bg-solid); color: #f3ecda;
  }
  .slide:last-child { page-break-after: auto; }
  .scene { position: absolute; inset: 0; background-size: cover; background-position: center; }
  .scrim { position: absolute; inset: 0; background: linear-gradient(90deg, transparent 0%, transparent 38%, var(--bg-solid) 78%); }
  .content { position: absolute; right: 44px; top: 52px; width: 620px; }
  .content h1 { font-family: 'Grimoire', serif; font-size: 30px; margin: 0 0 16px; border-bottom: 1px solid rgba(255,255,255,.4); padding-bottom: 16px; }
  .topic-card { background: rgba(255,255,255,.06); border-radius: 8px; padding: 10px 16px 10px 26px; margin-bottom: 6px; position: relative; font-weight: bold; font-size: 12px; }
  .topic-card::before { content: ""; position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
  .explanation-label { font-size: 8px; font-weight: bold; color: var(--accent); text-transform: uppercase; margin-top: 14px; letter-spacing: .05em; }
  .explanation-text { font-style: italic; font-size: 12px; color: #bcbcca; margin-top: 4px; }
  .guide-badge { position: absolute; left: 24px; bottom: 78px; width: 86px; border: 2px solid var(--accent); border-radius: 12px; background: #0e0e16; }
  .guide-badge img { width: 100%; display: block; border-radius: 10px; }
  .guide-badge .tag { position: absolute; left: 50%; bottom: -13px; transform: translateX(-50%); background: var(--accent); color: #10101a; font-weight: bold; font-size: 11px; padding: 6px 14px; border-radius: 7px; white-space: nowrap; }
  .quote-bubble { position: absolute; left: 24px; bottom: 270px; background: rgba(24,24,40,.92); border: 1.2px solid var(--accent); border-radius: 10px; padding: 10px; width: 250px; font-size: 10px; font-style: italic; }
  .quote-bubble .who { font-weight: bold; text-transform: uppercase; color: var(--accent); font-size: 8px; display: block; margin-bottom: 4px; font-style: normal; }
  .icon { position: absolute; border-radius: 50%; overflow: hidden; border: 2px solid rgba(255,255,255,.35); background: rgba(0,0,0,.25); }
  .icon img { width: 100%; height: 100%; object-fit: cover; }
  .footer { position: absolute; left: 0; right: 0; bottom: 0; height: 52px; background: #10101a; display: flex; align-items: center; justify-content: space-between; padding: 0 44px; border-top: 1px solid var(--accent); font-size: 11px; }
  .footer-guide { color: var(--accent); font-weight: bold; }
  .footer-page { color: #bcbcca; }
`;

/** Monta o documento HTML inteiro (1 <section class="slide"> por slide). Puro —
 * não abre browser; quem renderiza pra PDF é pdfService.ts via Puppeteer. */
export function buildDeckHtml(slides: SlideForTemplate[], profile: BrainHexProfile): string {
  const total = slides.length;
  const sections = slides
    .map((s, i) => slideHtml(s, i, profile).replace("__TOTAL__", String(total)))
    .join("\n");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<style>${fontFaceCss()}${BASE_CSS}</style>
</head>
<body>
${sections}
</body>
</html>`;
}
