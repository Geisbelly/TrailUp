import puppeteer from "puppeteer";
import { BrainHexProfile } from "../constants/brainHex";
import { buildDeckHtml } from "../lib/slideTemplate";

interface SlideData {
  titulo?: string;
  title?: string;
  topics?: string[];
  explanation?: string;
  characterQuote?: string;
  characterAction?: string;
  imagem_referencia?: string;
  icones?: string[];
  sourceIds?: string[];
}

/** Gera o PDF de apresentacao a partir dos slides — 1 documento HTML (slideTemplate.ts)
 * renderizado via Puppeteer, 1 pagina por slide, 1280x720 (16:9). */
export async function generateSlidesPDF(
  slides: SlideData[],
  profile: BrainHexProfile,
  _titulo: string = "Apresentação"
): Promise<Buffer> {
  const html = buildDeckHtml(slides, profile);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    // Viewport explicito 1280x720 (bate com o tamanho fixo de .slide em
    // slideTemplate.ts) — sem isso o Chromium usa o viewport default (800x600)
    // pra fazer layout e so depois encaixa no tamanho de pagina do PDF, o que
    // pode cortar/escalar o conteudo de forma inesperada.
    await page.setViewport({ width: 1280, height: 720 });
    await page.setContent(html, { waitUntil: "load" });
    const pdfBuffer = await page.pdf({
      width: "1280px",
      height: "720px",
      printBackground: true,
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
