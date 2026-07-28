import { existsSync } from "node:fs";
import puppeteer, { type Browser, type LaunchOptions } from "puppeteer";
import { BrainHexProfile } from "../constants/brainHex";
import type {
  PresentationDesignPlan,
  PresentationThemeInput,
} from "../constants/presentationThemes";
import {
  buildDeckHtml,
  type SlideForTemplate,
} from "../lib/slideTemplate";

interface SlideData extends SlideForTemplate {
  sourceIds?: string[];
}

export interface PresentationRenderOptions {
  title?: string;
  theme?: PresentationDesignPlan | PresentationThemeInput;
}

export interface PresentationRendererReadiness {
  ready: boolean;
  checked_at: string;
  browser?: string;
  error?: string;
}

const DEFAULT_RENDERER_PROBE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_RENDERER_FAILURE_TTL_MS = 30 * 1000;
const DEFAULT_BROWSER_LAUNCH_TIMEOUT_MS = 30 * 1000;

let rendererReadinessCache:
  | { expiresAt: number; value: PresentationRendererReadiness }
  | undefined;
let rendererReadinessProbe: Promise<PresentationRendererReadiness> | undefined;

function positiveEnvNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function presentationRendererError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/\s+/g, " ").trim().slice(0, 1200) || "renderer_error";
}

/**
 * Respeita um Chrome configurado explicitamente apenas quando o arquivo existe.
 * Sem configuracao, usa exatamente o Chrome for Testing resolvido pelo
 * Puppeteer instalado. Assim o deploy nao presume /usr/bin/chromium.
 */
export function resolvePresentationExecutablePath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  for (const name of ["PUPPETEER_EXECUTABLE_PATH", "GOOGLE_CHROME_BIN"] as const) {
    const configured = String(env[name] ?? "").trim();
    if (!configured) continue;
    if (!existsSync(configured)) {
      throw new Error(`${name} aponta para um executavel inexistente`);
    }
    return configured;
  }

  const bundled = puppeteer.executablePath();
  if (!bundled || !existsSync(bundled)) {
    throw new Error(
      "Chrome do Puppeteer nao encontrado; execute `npx puppeteer browsers install chrome` no build",
    );
  }
  return bundled;
}

export function presentationBrowserLaunchOptions(): LaunchOptions {
  return {
    headless: true,
    executablePath: resolvePresentationExecutablePath(),
    timeout: positiveEnvNumber(
      "PRESENTATION_BROWSER_LAUNCH_TIMEOUT_MS",
      DEFAULT_BROWSER_LAUNCH_TIMEOUT_MS,
    ),
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  };
}

export async function launchPresentationBrowser(): Promise<Browser> {
  return puppeteer.launch(presentationBrowserLaunchOptions());
}

export function invalidatePresentationRendererReadiness(): void {
  rendererReadinessCache = undefined;
}

async function runPresentationRendererProbe(): Promise<PresentationRendererReadiness> {
  const checkedAt = new Date().toISOString();
  let browser: Browser | undefined;
  try {
    browser = await launchPresentationBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 320, height: 180 });
    await page.setContent(
      "<!doctype html><html><body><main>TrailUp renderer probe</main></body></html>",
      { waitUntil: "load" },
    );
    const pdf = Buffer.from(await page.pdf({
      width: "320px",
      height: "180px",
      printBackground: true,
    }));
    if (pdf.subarray(0, 4).toString("ascii") !== "%PDF") {
      throw new Error("renderer retornou um arquivo que nao e PDF");
    }
    return {
      ready: true,
      checked_at: checkedAt,
      browser: await browser.version(),
    };
  } catch (error) {
    return {
      ready: false,
      checked_at: checkedAt,
      error: presentationRendererError(error),
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}

/**
 * Readiness real e cacheada: abre o mesmo Chromium usado na geracao e produz
 * um PDF minimo. Falhas sao reavaliadas mais cedo que sucessos.
 */
export async function getPresentationRendererReadiness(
  force = false,
): Promise<PresentationRendererReadiness> {
  const currentTime = Date.now();
  if (!force && rendererReadinessCache?.expiresAt > currentTime) {
    return rendererReadinessCache.value;
  }
  if (!force && rendererReadinessProbe) {
    return rendererReadinessProbe;
  }

  rendererReadinessProbe = runPresentationRendererProbe()
    .then((value) => {
      const ttl = value.ready
        ? positiveEnvNumber("PRESENTATION_RENDERER_PROBE_TTL_MS", DEFAULT_RENDERER_PROBE_TTL_MS)
        : positiveEnvNumber(
            "PRESENTATION_RENDERER_FAILURE_TTL_MS",
            DEFAULT_RENDERER_FAILURE_TTL_MS,
          );
      rendererReadinessCache = { expiresAt: Date.now() + ttl, value };
      return value;
    })
    .finally(() => {
      rendererReadinessProbe = undefined;
    });

  return rendererReadinessProbe;
}

/** Gera o PDF de apresentacao a partir dos slides, uma pagina 16:9 por slide. */
export async function generateSlidesPDF(
  slides: SlideData[],
  profile: BrainHexProfile,
  options: PresentationRenderOptions | string = {},
): Promise<Buffer> {
  const normalizedOptions = typeof options === "string"
    ? { title: options }
    : options;
  const html = buildDeckHtml(slides, profile, normalizedOptions.theme);

  let browser: Browser | undefined;
  try {
    browser = await launchPresentationBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setContent(html, { waitUntil: "load" });
    const pdfBuffer = await page.pdf({
      width: "1280px",
      height: "720px",
      printBackground: true,
    });
    return Buffer.from(pdfBuffer);
  } catch (error) {
    invalidatePresentationRendererReadiness();
    throw error;
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }
  }
}
