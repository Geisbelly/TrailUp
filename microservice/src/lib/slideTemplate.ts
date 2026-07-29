import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  BRAIN_HEX_CONFIG,
  type BrainHexProfile,
} from "../constants/brainHex";
import {
  buildPresentationDesignPlan,
  presentationLayoutForSlide,
  type PresentationDesignPlan,
  type PresentationThemeInput,
} from "../constants/presentationThemes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface SlideForTemplate {
  titulo?: string;
  title?: string;
  subtitulo?: string;
  topics?: string[];
  pontos?: string[];
  explanation?: string;
  visualDescription?: string;
  characterQuote?: string;
  characterAction?: string;
  imagem_referencia?: string;
  icones?: string[];
  renderMode?: "full-image" | "legacy";
}

const SYNTHESIS_LABELS: Record<BrainHexProfile, string> = {
  mastermind: "SÍNTESE ESTRATÉGICA",
  seeker: "ECO DA DESCOBERTA",
  survivor: "PROTOCOLO DE CAMPO",
  daredevil: "PONTO DE IMPACTO",
  conqueror: "DECRETO DE DOMÍNIO",
  socializer: "CONEXÃO-CHAVE",
  achiever: "MARCO DE PROGRESSO",
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fileToDataUrl(filePath: string, mime: string): string | null {
  try {
    return `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
  } catch {
    return null;
  }
}

function guardianPortraitPath(profile: BrainHexProfile): string {
  const fileName =
    profile === "socializer" ? "socializer-duo.png" : `${profile}.png`;
  return path.join(__dirname, "..", "assets", "guardioes", fileName);
}

function fontFaceCss(): string {
  const fontPath = path.join(
    __dirname,
    "..",
    "assets",
    "fonts",
    "MedievalSharp-Regular.ttf",
  );
  const dataUrl = fileToDataUrl(fontPath, "font/ttf");
  if (!dataUrl) return "";
  return `
    @font-face {
      font-family: "TrailDisplay";
      src: url("${dataUrl}") format("truetype");
      font-display: block;
    }
  `;
}

function resolvePlan(
  profile: BrainHexProfile,
  theme: PresentationDesignPlan | PresentationThemeInput | undefined,
  slides: SlideForTemplate[],
): PresentationDesignPlan {
  if (
    theme
    && "styleName" in theme
    && "layoutSequence" in theme
    && "palette" in theme
  ) {
    return theme as PresentationDesignPlan;
  }
  const fallbackSubject =
    slides[0]?.subtitulo
    || slides[0]?.titulo
    || slides[0]?.title
    || "Conteúdo de estudo";
  return buildPresentationDesignPlan(
    profile,
    theme as PresentationThemeInput | undefined,
    fallbackSubject,
  );
}

function slideTopics(slide: SlideForTemplate): string[] {
  const values = Array.isArray(slide.topics)
    ? slide.topics
    : Array.isArray(slide.pontos)
      ? slide.pontos
      : [];
  return values
    .map((value) => String(value ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 5);
}

function guideName(profile: BrainHexProfile): string {
  const config = BRAIN_HEX_CONFIG[profile];
  return config.secondaryGuideName
    ? `${config.guideName} & ${config.secondaryGuideName}`
    : config.guideName;
}

function sceneHtml(scene: string | undefined): string {
  return scene
    ? `<div class="scene" style="background-image:url('${scene}')"></div>`
    : "";
}

function iconsHtml(icons: string[] | undefined): string {
  if (!icons?.length) return "";
  return `
    <div class="decor-icons" aria-hidden="true">
      ${icons.slice(0, 4).map((icon, index) => `
        <div class="decor-icon decor-icon-${index + 1}">
          <img src="${icon}" alt="" />
        </div>
      `).join("")}
    </div>
  `;
}

function guideBadgeHtml(
  profile: BrainHexProfile,
  portraitDataUrl: string | null,
  large = false,
): string {
  const config = BRAIN_HEX_CONFIG[profile];
  return `
    <div class="guide-badge${large ? " guide-badge-large" : ""}">
      ${portraitDataUrl ? `<img src="${portraitDataUrl}" alt="" />` : ""}
      <div class="guide-meta">
        <span>GUIA DO PERCURSO</span>
        <strong>${escapeHtml(guideName(profile))}</strong>
        <small>${escapeHtml(config.label)}</small>
      </div>
    </div>
  `;
}

function topicCards(topics: string[], numbered = false): string {
  return topics.map((topic, index) => `
    <div class="topic-card">
      ${numbered ? `<span class="topic-number">${String(index + 1).padStart(2, "0")}</span>` : `<span class="topic-dot"></span>`}
      <span>${escapeHtml(topic)}</span>
    </div>
  `).join("");
}

function slideBodyHtml(params: {
  slide: SlideForTemplate;
  profile: BrainHexProfile;
  plan: PresentationDesignPlan;
  layout: string;
  index: number;
  total: number;
  portraitDataUrl: string | null;
}): string {
  const {
    slide,
    profile,
    plan,
    layout,
    index,
    total,
    portraitDataUrl,
  } = params;
  const config = BRAIN_HEX_CONFIG[profile];
  const title = escapeHtml(
    slide.titulo || slide.title || `Etapa ${index + 1}`,
  );
  const subtitle = escapeHtml(slide.subtitulo || plan.subject);
  const topics = slideTopics(slide);
  const explanation = escapeHtml(
    slide.explanation || slide.visualDescription || "",
  );
  const quote = escapeHtml(slide.characterQuote || "");
  const commonHeader = `
    <div class="slide-kicker">
      <span>${escapeHtml(plan.styleName)}</span>
      <i></i>
      <span>${escapeHtml(config.label)}</span>
    </div>
  `;
  const explanationBlock = explanation
    ? `
      <div class="explanation">
        <span>${SYNTHESIS_LABELS[profile]}</span>
        <p>${explanation}</p>
      </div>
    `
    : "";
  const quoteBlock = quote
    ? `
      <blockquote>
        <span>${escapeHtml(guideName(profile))}</span>
        “${quote}”
      </blockquote>
    `
    : "";

  if (layout === "cover") {
    return `
      ${sceneHtml(slide.imagem_referencia)}
      <div class="cover-wash"></div>
      <div class="theme-orbit orbit-a"></div>
      <div class="theme-orbit orbit-b"></div>
      ${iconsHtml(slide.icones)}
      <div class="cover-content">
        ${commonHeader}
        <div class="subject-label">${subtitle}</div>
        <h1>${title}</h1>
        ${explanation ? `<p class="cover-deck">${explanation}</p>` : ""}
        <div class="cover-topics">
          ${topics.slice(0, 3).map((topic) => `<span>${escapeHtml(topic)}</span>`).join("")}
        </div>
      </div>
      ${guideBadgeHtml(profile, portraitDataUrl, true)}
    `;
  }

  if (layout === "cards") {
    return `
      ${sceneHtml(slide.imagem_referencia)}
      <div class="full-wash"></div>
      <div class="theme-shape shape-a"></div>
      <div class="theme-shape shape-b"></div>
      ${iconsHtml(slide.icones)}
      <div class="cards-layout">
        ${commonHeader}
        <div class="title-row">
          <div>
            <span class="section-index">CAPÍTULO ${String(index).padStart(2, "0")}</span>
            <h1>${title}</h1>
          </div>
          <p>${subtitle}</p>
        </div>
        <div class="topic-grid">${topicCards(topics, true)}</div>
        ${explanationBlock}
      </div>
      ${guideBadgeHtml(profile, portraitDataUrl)}
    `;
  }

  if (layout === "spotlight") {
    return `
      ${sceneHtml(slide.imagem_referencia)}
      <div class="spotlight-wash"></div>
      ${iconsHtml(slide.icones)}
      <div class="spotlight-index">${String(index + 1).padStart(2, "0")}</div>
      <div class="spotlight-copy">
        ${commonHeader}
        <span class="section-index">${subtitle}</span>
        <h1>${title}</h1>
        ${explanationBlock}
        <div class="spotlight-topics">
          ${topics.slice(0, 3).map((topic) => `<span>${escapeHtml(topic)}</span>`).join("")}
        </div>
        ${quoteBlock}
      </div>
      ${guideBadgeHtml(profile, portraitDataUrl)}
    `;
  }

  if (layout === "timeline") {
    return `
      ${sceneHtml(slide.imagem_referencia)}
      <div class="full-wash"></div>
      <div class="timeline-layout">
        ${commonHeader}
        <div class="timeline-heading">
          <div>
            <span class="section-index">${subtitle}</span>
            <h1>${title}</h1>
          </div>
          ${quoteBlock}
        </div>
        <div class="timeline-track">
          ${topics.slice(0, 4).map((topic, topicIndex) => `
            <div class="timeline-item">
              <span>${String(topicIndex + 1).padStart(2, "0")}</span>
              <i></i>
              <p>${escapeHtml(topic)}</p>
            </div>
          `).join("")}
        </div>
        ${explanationBlock}
      </div>
      ${iconsHtml(slide.icones)}
      ${guideBadgeHtml(profile, portraitDataUrl)}
    `;
  }

  if (layout === "finale") {
    return `
      ${sceneHtml(slide.imagem_referencia)}
      <div class="finale-wash"></div>
      <div class="theme-orbit orbit-a"></div>
      <div class="theme-orbit orbit-b"></div>
      ${iconsHtml(slide.icones)}
      <div class="finale-content">
        <span class="section-index">${SYNTHESIS_LABELS[profile]}</span>
        <h1>${title}</h1>
        ${explanation ? `<p>${explanation}</p>` : ""}
        <div class="finale-topics">
          ${topics.slice(0, 4).map((topic) => `<span>${escapeHtml(topic)}</span>`).join("")}
        </div>
        ${quoteBlock}
      </div>
      ${guideBadgeHtml(profile, portraitDataUrl, true)}
    `;
  }

  const reverse = index % 2 === 0 ? " is-reverse" : "";
  return `
    <div class="split-layout${reverse}">
      <div class="split-media">
        ${sceneHtml(slide.imagem_referencia)}
        <div class="media-wash"></div>
        ${iconsHtml(slide.icones)}
        <div class="media-caption">
          <span>${escapeHtml(plan.motifs[index % plan.motifs.length])}</span>
          <strong>${String(index + 1).padStart(2, "0")}</strong>
        </div>
      </div>
      <div class="split-copy">
        ${commonHeader}
        <span class="section-index">${subtitle}</span>
        <h1>${title}</h1>
        <div class="topic-list">${topicCards(topics)}</div>
        ${explanationBlock}
        ${quoteBlock}
      </div>
    </div>
    ${guideBadgeHtml(profile, portraitDataUrl)}
  `;
}

function slideHtml(
  slide: SlideForTemplate,
  index: number,
  total: number,
  profile: BrainHexProfile,
  plan: PresentationDesignPlan,
  portraitDataUrl: string | null,
): string {
  if (slide.renderMode === "full-image" && slide.imagem_referencia) {
    const title = slide.titulo || slide.title || "";
    const explanation = slide.explanation || slide.visualDescription || "";
    const alt = escapeHtml(`${title}. ${explanation}`.trim());
    return `
    <section
      class="slide profile-${profile} slide-full-image"
      data-layout="full-image"
      data-design-system="${plan.version}"
    >
      <img class="full-slide-image" src="${slide.imagem_referencia}" alt="${alt}" />
    </section>
  `;
  }

  const layout = presentationLayoutForSlide(plan, index, total);
  const progress = Math.max(7, Math.round(((index + 1) / total) * 100));
  return `
    <section
      class="slide profile-${profile} layout-${layout}"
      data-layout="${layout}"
      data-design-system="${plan.version}"
      style="
        --accent:${plan.palette.accent};
        --accent-soft:${plan.palette.accentSoft};
        --highlight:${plan.palette.highlight};
        --background:${plan.palette.background};
        --surface:${plan.palette.surface};
        --ink:${plan.palette.ink};
        --progress:${progress}%;
      "
    >
      <div class="texture-layer"></div>
      ${slideBodyHtml({
        slide,
        profile,
        plan,
        layout,
        index,
        total,
        portraitDataUrl,
      })}
      <footer>
        <span>${escapeHtml(plan.subject)}</span>
        <div class="progress"><i></i></div>
        <strong>${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</strong>
      </footer>
    </section>
  `;
}

const BASE_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #080a0d; }
  body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .slide {
    width: 1280px;
    height: 720px;
    position: relative;
    overflow: hidden;
    page-break-after: always;
    background: var(--background);
    color: var(--ink);
    font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .slide:last-child { page-break-after: auto; }
  .slide h1 {
    margin: 0;
    font-family: "TrailDisplay", Georgia, serif;
    font-weight: 700;
    line-height: .98;
    letter-spacing: -.02em;
    text-wrap: balance;
  }
  .texture-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: .42;
    z-index: 1;
  }
  .scene {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
  }
  .slide-full-image { padding: 0; }
  .full-slide-image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .slide-kicker {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--accent-soft);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .16em;
    text-transform: uppercase;
  }
  .slide-kicker i {
    width: 34px;
    height: 1px;
    background: var(--highlight);
  }
  .section-index {
    display: block;
    color: var(--highlight);
    font-size: 13px;
    font-weight: 800;
    letter-spacing: .13em;
    text-transform: uppercase;
  }
  .guide-badge {
    position: absolute;
    left: 32px;
    bottom: 66px;
    z-index: 15;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 198px;
    padding: 8px 14px 8px 8px;
    border: 1px solid color-mix(in srgb, var(--accent-soft) 55%, transparent);
    border-radius: 18px;
    background: color-mix(in srgb, var(--background) 86%, transparent);
    box-shadow: 0 18px 50px rgba(0,0,0,.25);
    backdrop-filter: blur(16px);
  }
  .guide-badge img {
    width: 58px;
    height: 58px;
    object-fit: cover;
    object-position: top center;
    border: 2px solid var(--accent);
    border-radius: 14px;
    background: var(--surface);
  }
  .guide-meta { display: flex; flex-direction: column; }
  .guide-meta span {
    color: var(--accent-soft);
    font-size: 8px;
    font-weight: 800;
    letter-spacing: .13em;
  }
  .guide-meta strong { margin-top: 2px; font-size: 15px; }
  .guide-meta small { margin-top: 1px; color: rgba(255,255,255,.58); font-size: 9px; }
  .guide-badge-large { padding: 10px 18px 10px 10px; }
  .guide-badge-large img { width: 84px; height: 84px; }
  .guide-badge-large .guide-meta strong { font-size: 20px; }
  footer {
    position: absolute;
    z-index: 20;
    left: 32px;
    right: 32px;
    bottom: 18px;
    display: grid;
    grid-template-columns: 240px 1fr 70px;
    align-items: center;
    gap: 20px;
    color: rgba(255,255,255,.66);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
  }
  footer strong { color: var(--ink); text-align: right; }
  .progress {
    height: 3px;
    overflow: hidden;
    border-radius: 4px;
    background: rgba(255,255,255,.13);
  }
  .progress i {
    display: block;
    width: var(--progress);
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--highlight));
  }
  .decor-icons {
    position: absolute;
    inset: 0;
    z-index: 8;
    pointer-events: none;
  }
  .decor-icon {
    position: absolute;
    width: 80px;
    height: 80px;
    padding: 7px;
    border: 1px solid rgba(255,255,255,.32);
    border-radius: 24px;
    background: color-mix(in srgb, var(--surface) 72%, transparent);
    box-shadow: 0 18px 35px rgba(0,0,0,.24);
    transform: rotate(-6deg);
  }
  .decor-icon img { width: 100%; height: 100%; object-fit: cover; border-radius: 17px; }
  .decor-icon-1 { left: 42px; top: 104px; }
  .decor-icon-2 { left: 140px; top: 176px; transform: rotate(8deg); }
  .decor-icon-3 { left: 56px; top: 282px; transform: rotate(5deg); }
  .decor-icon-4 { left: 168px; top: 350px; transform: rotate(-9deg); }
  blockquote {
    margin: 18px 0 0;
    padding: 14px 16px;
    border-left: 3px solid var(--highlight);
    border-radius: 0 14px 14px 0;
    background: color-mix(in srgb, var(--surface) 70%, transparent);
    color: rgba(255,255,255,.82);
    font-family: Georgia, serif;
    font-size: 14px;
    font-style: italic;
    line-height: 1.35;
  }
  blockquote span {
    display: block;
    margin-bottom: 5px;
    color: var(--accent-soft);
    font-family: Inter, sans-serif;
    font-size: 9px;
    font-style: normal;
    font-weight: 900;
    letter-spacing: .12em;
    text-transform: uppercase;
  }
  .explanation { margin-top: 18px; }
  .explanation > span {
    display: block;
    color: var(--accent-soft);
    font-size: 9px;
    font-weight: 900;
    letter-spacing: .14em;
  }
  .explanation p {
    margin: 7px 0 0;
    color: rgba(255,255,255,.76);
    font-size: 15px;
    line-height: 1.42;
  }
  .topic-card {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    min-height: 54px;
    padding: 14px 16px;
    border: 1px solid rgba(255,255,255,.11);
    border-radius: 16px;
    background: color-mix(in srgb, var(--surface) 72%, transparent);
    box-shadow: 0 14px 30px rgba(0,0,0,.14);
    color: var(--ink);
    font-size: 16px;
    font-weight: 650;
    line-height: 1.25;
  }
  .topic-dot {
    flex: 0 0 auto;
    width: 9px;
    height: 9px;
    margin-top: 5px;
    border-radius: 50%;
    background: var(--highlight);
    box-shadow: 0 0 0 5px color-mix(in srgb, var(--highlight) 18%, transparent);
  }
  .topic-number {
    color: var(--highlight);
    font-size: 11px;
    font-weight: 900;
    letter-spacing: .08em;
  }

  /* CAPA */
  .cover-wash {
    position: absolute;
    inset: 0;
    z-index: 2;
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--background) 96%, transparent) 0 42%, color-mix(in srgb, var(--background) 72%, transparent) 70%, color-mix(in srgb, var(--background) 34%, transparent)),
      linear-gradient(0deg, var(--background), transparent 55%);
  }
  .cover-content {
    position: absolute;
    z-index: 10;
    left: 64px;
    top: 64px;
    width: 690px;
  }
  .subject-label {
    display: inline-flex;
    margin-top: 60px;
    padding: 8px 13px;
    border-radius: 999px;
    background: var(--highlight);
    color: var(--background);
    font-size: 11px;
    font-weight: 900;
    letter-spacing: .08em;
    text-transform: uppercase;
  }
  .cover-content h1 { max-width: 700px; margin-top: 18px; font-size: 66px; }
  .cover-deck {
    max-width: 610px;
    margin: 20px 0 0;
    color: rgba(255,255,255,.78);
    font-size: 18px;
    line-height: 1.42;
  }
  .cover-topics { display: flex; gap: 8px; margin-top: 22px; flex-wrap: wrap; }
  .cover-topics span {
    padding: 8px 12px;
    border: 1px solid rgba(255,255,255,.2);
    border-radius: 999px;
    background: rgba(0,0,0,.2);
    font-size: 11px;
    font-weight: 700;
  }
  .layout-cover .guide-badge { left: auto; right: 42px; bottom: 70px; }
  .theme-orbit {
    position: absolute;
    z-index: 3;
    border: 1px solid color-mix(in srgb, var(--accent-soft) 35%, transparent);
    border-radius: 50%;
  }
  .orbit-a { width: 390px; height: 390px; right: -90px; top: -110px; }
  .orbit-b { width: 250px; height: 250px; right: 86px; top: 74px; }

  /* SPLIT EDITORIAL */
  .split-layout { position: absolute; inset: 0 0 48px; z-index: 3; display: grid; grid-template-columns: 46% 54%; }
  .split-layout.is-reverse { grid-template-columns: 54% 46%; }
  .split-media { position: relative; overflow: hidden; background: var(--surface); }
  .split-media .scene { z-index: 1; }
  .media-wash {
    position: absolute;
    inset: 0;
    z-index: 2;
    background: linear-gradient(0deg, color-mix(in srgb, var(--background) 80%, transparent), transparent 58%);
  }
  .media-caption {
    position: absolute;
    z-index: 9;
    left: 34px;
    right: 34px;
    top: 34px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--ink);
    text-transform: uppercase;
  }
  .media-caption span { font-size: 10px; font-weight: 850; letter-spacing: .14em; }
  .media-caption strong {
    font-family: "TrailDisplay", serif;
    font-size: 42px;
    color: var(--highlight);
  }
  .split-copy { padding: 50px 52px 64px; background: var(--background); }
  .split-copy .section-index { margin-top: 54px; }
  .split-copy h1 { margin-top: 10px; font-size: 47px; }
  .topic-list { display: grid; gap: 8px; margin-top: 22px; }
  .split-layout.is-reverse .split-media { order: 2; }
  .split-layout.is-reverse .split-copy { order: 1; }
  .split-media .decor-icon-1 { left: auto; right: 36px; top: 130px; }
  .split-media .decor-icon-2 { left: 38px; top: auto; bottom: 88px; }
  .split-media .decor-icon-3,
  .split-media .decor-icon-4 { display: none; }

  /* CARDS */
  .full-wash {
    position: absolute;
    inset: 0;
    z-index: 2;
    background: linear-gradient(110deg, color-mix(in srgb, var(--background) 98%, transparent), color-mix(in srgb, var(--background) 83%, transparent));
  }
  .cards-layout { position: absolute; z-index: 9; inset: 42px 58px 68px; }
  .title-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 50px; margin-top: 38px; }
  .title-row h1 { max-width: 760px; margin-top: 8px; font-size: 48px; }
  .title-row > p { width: 270px; margin: 0 0 5px; color: var(--accent-soft); font-size: 14px; line-height: 1.4; text-align: right; }
  .topic-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 26px; }
  .topic-grid .topic-card { min-height: 78px; align-items: center; padding: 16px 20px; font-size: 17px; }
  .topic-grid .topic-number { font-size: 18px; }
  .cards-layout .explanation { max-width: 870px; }
  .theme-shape { position: absolute; z-index: 4; border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent); }
  .shape-a { width: 280px; height: 280px; right: -90px; top: 110px; transform: rotate(24deg); }
  .shape-b { width: 170px; height: 170px; right: 80px; bottom: -60px; border-color: color-mix(in srgb, var(--highlight) 45%, transparent); transform: rotate(42deg); }
  .layout-cards .decor-icon-1 { left: auto; right: 72px; top: 190px; }
  .layout-cards .decor-icon-2 { left: auto; right: 30px; top: 302px; }
  .layout-cards .decor-icon-3,
  .layout-cards .decor-icon-4 { display: none; }

  /* SPOTLIGHT */
  .spotlight-wash {
    position: absolute;
    inset: 0;
    z-index: 2;
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--background) 98%, transparent) 0 56%, color-mix(in srgb, var(--background) 45%, transparent) 83%),
      linear-gradient(0deg, var(--background), transparent 48%);
  }
  .spotlight-index {
    position: absolute;
    z-index: 5;
    right: 44px;
    top: 20px;
    color: color-mix(in srgb, var(--accent-soft) 22%, transparent);
    font-family: "TrailDisplay", serif;
    font-size: 260px;
    line-height: 1;
  }
  .spotlight-copy { position: absolute; z-index: 10; left: 62px; top: 52px; width: 690px; }
  .spotlight-copy .section-index { margin-top: 54px; }
  .spotlight-copy h1 { max-width: 680px; margin-top: 10px; font-size: 58px; }
  .spotlight-copy .explanation { max-width: 620px; }
  .spotlight-topics { display: flex; gap: 8px; margin-top: 18px; }
  .spotlight-topics span {
    padding: 9px 13px;
    border-radius: 10px;
    background: var(--surface);
    font-size: 12px;
    font-weight: 750;
  }
  .spotlight-copy blockquote { max-width: 550px; }
  .layout-spotlight .guide-badge { left: auto; right: 38px; }
  .layout-spotlight .decor-icon-1 { left: auto; right: 94px; top: 292px; }
  .layout-spotlight .decor-icon-2 { left: auto; right: 214px; top: 388px; }
  .layout-spotlight .decor-icon-3,
  .layout-spotlight .decor-icon-4 { display: none; }

  /* TIMELINE */
  .timeline-layout { position: absolute; z-index: 9; inset: 42px 58px 70px; }
  .timeline-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 44px; margin-top: 42px; }
  .timeline-heading h1 { max-width: 720px; margin-top: 8px; font-size: 47px; }
  .timeline-heading blockquote { width: 320px; margin: 0; }
  .timeline-track { position: relative; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 48px; }
  .timeline-track::before {
    content: "";
    position: absolute;
    left: 28px;
    right: 28px;
    top: 27px;
    height: 2px;
    background: linear-gradient(90deg, var(--accent), var(--highlight));
  }
  .timeline-item { position: relative; z-index: 2; }
  .timeline-item > span {
    display: flex;
    width: 56px;
    height: 56px;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--accent);
    border-radius: 50%;
    background: var(--background);
    color: var(--highlight);
    font-family: "TrailDisplay", serif;
    font-size: 20px;
  }
  .timeline-item p { max-width: 230px; margin: 14px 0 0; font-size: 16px; font-weight: 700; line-height: 1.3; }
  .timeline-layout .explanation { max-width: 900px; }
  .layout-timeline .decor-icon-1 { left: auto; right: 54px; top: 304px; }
  .layout-timeline .decor-icon-2,
  .layout-timeline .decor-icon-3,
  .layout-timeline .decor-icon-4 { display: none; }

  /* ENCERRAMENTO */
  .finale-wash {
    position: absolute;
    inset: 0;
    z-index: 2;
    background:
      radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--surface) 55%, transparent), color-mix(in srgb, var(--background) 92%, transparent) 58%),
      linear-gradient(0deg, var(--background), color-mix(in srgb, var(--background) 55%, transparent));
  }
  .finale-content {
    position: absolute;
    z-index: 10;
    left: 50%;
    top: 72px;
    width: 800px;
    transform: translateX(-50%);
    text-align: center;
  }
  .finale-content h1 { margin-top: 12px; font-size: 60px; }
  .finale-content > p { max-width: 680px; margin: 18px auto 0; color: rgba(255,255,255,.78); font-size: 17px; line-height: 1.45; }
  .finale-topics { display: flex; justify-content: center; gap: 9px; flex-wrap: wrap; margin-top: 22px; }
  .finale-topics span { padding: 9px 14px; border: 1px solid rgba(255,255,255,.19); border-radius: 999px; background: rgba(0,0,0,.18); font-size: 12px; font-weight: 750; }
  .finale-content blockquote { max-width: 560px; margin: 22px auto 0; text-align: left; }
  .layout-finale .guide-badge { left: 50%; bottom: 66px; transform: translateX(-50%); }
  .layout-finale .decor-icon-1 { left: 82px; top: 135px; }
  .layout-finale .decor-icon-2 { left: auto; right: 82px; top: 135px; }
  .layout-finale .decor-icon-3 { left: 128px; top: 320px; }
  .layout-finale .decor-icon-4 { left: auto; right: 128px; top: 320px; }

  /* ASSINATURAS VISUAIS POR PERFIL */
  .profile-seeker .texture-layer {
    background:
      repeating-radial-gradient(circle at 12% 32%, transparent 0 26px, color-mix(in srgb, var(--accent-soft) 20%, transparent) 27px 28px, transparent 29px 44px);
  }
  .profile-survivor .texture-layer {
    background:
      linear-gradient(135deg, transparent 0 47%, color-mix(in srgb, var(--highlight) 18%, transparent) 48% 52%, transparent 53%),
      repeating-linear-gradient(0deg, transparent 0 34px, rgba(255,255,255,.035) 35px 36px);
  }
  .profile-daredevil .texture-layer {
    background: repeating-linear-gradient(118deg, transparent 0 46px, color-mix(in srgb, var(--accent) 14%, transparent) 48px 53px, transparent 55px 92px);
  }
  .profile-mastermind .texture-layer {
    background-image:
      linear-gradient(color-mix(in srgb, var(--accent-soft) 10%, transparent) 1px, transparent 1px),
      linear-gradient(90deg, color-mix(in srgb, var(--accent-soft) 10%, transparent) 1px, transparent 1px),
      radial-gradient(circle, color-mix(in srgb, var(--highlight) 28%, transparent) 1px, transparent 2px);
    background-size: 36px 36px, 36px 36px, 108px 108px;
  }
  .profile-conqueror .texture-layer {
    background:
      radial-gradient(ellipse at 20% 120%, transparent 0 28%, color-mix(in srgb, var(--accent-soft) 16%, transparent) 28.5% 30%, transparent 30.5%),
      linear-gradient(90deg, transparent 0 72%, color-mix(in srgb, var(--highlight) 10%, transparent) 72% 73%, transparent 73%);
  }
  .profile-socializer .texture-layer {
    background:
      radial-gradient(circle at 10% 20%, color-mix(in srgb, var(--accent) 15%, transparent) 0 80px, transparent 82px),
      radial-gradient(circle at 86% 35%, color-mix(in srgb, var(--highlight) 12%, transparent) 0 120px, transparent 122px),
      radial-gradient(circle at 54% 90%, color-mix(in srgb, var(--accent-soft) 10%, transparent) 0 145px, transparent 147px);
  }
  .profile-achiever .texture-layer {
    background:
      linear-gradient(45deg, transparent 46%, color-mix(in srgb, var(--highlight) 12%, transparent) 47% 49%, transparent 50%),
      linear-gradient(-45deg, transparent 46%, color-mix(in srgb, var(--accent) 10%, transparent) 47% 49%, transparent 50%);
    background-size: 90px 90px;
  }
`;

/** Monta um deck editorial 16:9 com direção temática e layouts variados. */
export function buildDeckHtml(
  slides: SlideForTemplate[],
  profile: BrainHexProfile,
  theme?: PresentationDesignPlan | PresentationThemeInput,
): string {
  const plan = resolvePlan(profile, theme, slides);
  const portraitDataUrl = fileToDataUrl(
    guardianPortraitPath(profile),
    "image/png",
  );
  const total = Math.max(1, slides.length);
  const sourceSlides = slides.length > 0
    ? slides
    : [{ titulo: plan.subject }];
  const sections = sourceSlides
    .map((slide, index) => slideHtml(
      slide,
      index,
      total,
      profile,
      plan,
      portraitDataUrl,
    ))
    .join("\n");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=1280, initial-scale=1" />
  <style>${fontFaceCss()}${BASE_CSS}</style>
</head>
<body data-design-system="${plan.version}" data-theme="${escapeHtml(plan.styleName)}">
${sections}
</body>
</html>`;
}
