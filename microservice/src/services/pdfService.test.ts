import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateSlidesPDF,
  getPresentationRendererReadiness,
  launchPresentationBrowser,
  presentationBrowserLaunchOptions,
  resolvePresentationExecutablePath,
} from "./pdfService";
import type { BrainHexProfile } from "../constants/brainHex";

const PROFILES: BrainHexProfile[] = [
  "mastermind", "seeker", "survivor", "daredevil", "conqueror", "socializer", "achiever",
];

test("gera um PDF valido (magic bytes %PDF) para cada perfil, sem imagem de IA", async () => {
  for (const profile of PROFILES) {
    const buf = await generateSlidesPDF(
      [{ titulo: "Slide 1", topics: ["a", "b"], explanation: "exp", characterQuote: "oi" }],
      profile
    );
    assert.equal(buf.subarray(0, 4).toString("ascii"), "%PDF", `perfil ${profile}`);
  }
});

test("nao renderiza sourceIds (Ref: ...) como texto visivel no slide", async () => {
  const buf = await generateSlidesPDF(
    [{ titulo: "Slide 1", sourceIds: ["pptx-s1", "pptx-s2"] }],
    "seeker"
  );
  const text = buf.toString("latin1");
  assert.ok(!text.includes("pptx-s1"));
});

test("usa a imagem_referencia (cena de fundo) e os icones quando presentes, sem lancar excecao", async () => {
  const fakePng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const buf = await generateSlidesPDF(
    [{
      titulo: "Com imagem",
      imagem_referencia: fakePng,
      icones: [fakePng, fakePng],
      characterQuote: "fala longa de teste pra checar quebra de linha do balao inteiro",
    }],
    "mastermind"
  );
  assert.equal(buf.subarray(0, 4).toString("ascii"), "%PDF");
});

test("multiplos slides geram multiplas paginas (contagem real + PDF valido no Puppeteer)", async () => {
  const buf = await generateSlidesPDF(
    [{ titulo: "S1" }, { titulo: "S2" }, { titulo: "S3" }],
    "achiever"
  );
  // Contagem real de paginas via objeto /Type /Page (exclui /Type /Pages, o
  // no-pai da arvore de paginas) — verificado contra a saida real do
  // Puppeteer, nao so contra jsPDF (regex funciona igual nos dois motores).
  const text = buf.toString("latin1");
  const pageCountMatch = text.match(/\/Type\s*\/Page[^s]/g) || [];
  assert.equal(pageCountMatch.length, 3);

  // Smoke test: um browser real consegue abrir o PDF gerado sem travar/rejeitar
  // (pega PDF malformado/truncado que o Chromium recusaria a carregar).
  const browser = await launchPresentationBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(`data:application/pdf;base64,${buf.toString("base64")}`, { waitUntil: "load" });
  } finally {
    await browser.close();
  }
});

test("readiness abre o Chromium real e gera um PDF minimo", async () => {
  const readiness = await getPresentationRendererReadiness(true);
  assert.equal(readiness.ready, true, readiness.error);
  assert.match(readiness.browser ?? "", /Chrome|Chromium|Headless/i);
});

test("nao aceita caminho de Chrome configurado que nao existe", () => {
  assert.throws(
    () => resolvePresentationExecutablePath({
      PUPPETEER_EXECUTABLE_PATH: "__trailup_missing_chrome__",
    }),
    /executavel inexistente/,
  );
});

test("resolve o Chrome instalado dentro do artefato do microservico", () => {
  const executablePath = resolvePresentationExecutablePath({});
  assert.match(
    executablePath,
    /node_modules[\\/]\.puppeteer_cache[\\/]/,
  );
});

test("configuracao do browser inclui protecao para memoria compartilhada do Render", () => {
  const options = presentationBrowserLaunchOptions();
  assert.ok(options.executablePath);
  assert.ok(options.args?.includes("--disable-dev-shm-usage"));
});
