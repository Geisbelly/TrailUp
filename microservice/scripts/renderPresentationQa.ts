import fs from "node:fs";
import path from "node:path";
import { PROFILES, BRAIN_HEX_CONFIG } from "../src/constants/brainHex";
import { buildPresentationDesignPlan } from "../src/constants/presentationThemes";
import { buildDeckHtml } from "../src/lib/slideTemplate";

const outputDir = path.resolve(
  process.argv[2] || path.join(process.cwd(), "qa-presentation-output"),
);
fs.mkdirSync(outputDir, { recursive: true });

function sceneDataUrl(accent: string, index: number): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${accent}" stop-opacity=".85"/>
          <stop offset=".58" stop-color="#101827"/>
          <stop offset="1" stop-color="#03070d"/>
        </linearGradient>
        <filter id="blur"><feGaussianBlur stdDeviation="28"/></filter>
      </defs>
      <rect width="1280" height="720" fill="url(#g)"/>
      <circle cx="${900 - index * 34}" cy="${160 + index * 42}" r="210" fill="#fff" opacity=".10" filter="url(#blur)"/>
      <path d="M80 610 C330 ${430 - index * 18}, 660 ${760 - index * 25}, 1190 180" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="7"/>
      <path d="M0 ${220 + index * 28} L1280 ${70 + index * 31}" fill="none" stroke="${accent}" stroke-opacity=".4" stroke-width="4"/>
    </svg>
  `;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const slideTitles = [
  "Arquiteturas que conectam",
  "O problema da consistência",
  "Quatro decisões essenciais",
  "Caminho da requisição",
  "O trade-off em destaque",
  "Síntese e próximo passo",
];

async function main(): Promise<void> {
  for (const profile of PROFILES) {
    const config = BRAIN_HEX_CONFIG[profile];
    const theme = buildPresentationDesignPlan(profile, {
      subject: "Sistemas distribuídos",
    });
    const slides = slideTitles.map((title, index) => ({
      titulo: title,
      subtitulo: index === 0
        ? "Como serviços independentes trabalham como um sistema"
        : "Sistemas distribuídos",
      topics: [
        "Coordenação entre serviços",
        "Tolerância a falhas",
        "Consistência dos dados",
        "Observabilidade do fluxo",
      ].slice(0, index % 2 === 0 ? 4 : 3),
      explanation:
        "Cada decisão arquitetural equilibra disponibilidade, consistência e resposta a falhas sem perder o objetivo pedagógico central.",
      characterQuote:
        "Observe como cada parte muda o comportamento do sistema inteiro.",
      imagem_referencia: sceneDataUrl(config.color, index),
    }));
    const html = buildDeckHtml(slides, profile, theme);
    fs.writeFileSync(path.join(outputDir, `${profile}.html`), html, "utf-8");
  }
  process.stdout.write(`${outputDir}\n`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
