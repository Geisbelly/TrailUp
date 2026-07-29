import {
  BRAIN_HEX_CONFIG,
  type BrainHexProfile,
} from "../constants/brainHex";
import {
  presentationImageDirection,
  presentationLayoutForSlide,
  type PresentationDesignPlan,
  type PresentationLayout,
} from "../constants/presentationThemes";
import type { SlideForTemplate } from "./slideTemplate";
import {
  generateFullSlideImage,
  generateSceneImage,
} from "../services/openaiImageService";
import { generateSlideIconWithFallback } from "../services/slideIconService";
import { createLogger } from "./logger";

export interface FullSlideInput extends SlideForTemplate {
  imagePrompt: string;
  iconPrompts?: string[];
}

const SAFE_ZONE_INSTRUCTION =
  "Mantenha todo texto e elementos visuais importantes dentro dos 84% "
  + "centrais verticalmente do quadro — os ~8% superiores e ~8% inferiores "
  + "podem ser cortados quando a imagem for encaixada num slide 16:9.";

// O imagePrompt/iconPrompt (escrito pelo LLM) descreve a CENA/elemento; o
// guardiao, a paleta e a atmosfera do perfil precisam ser reforcados aqui pra
// imagem gerada realmente combinar com o guia/perfil.
//
// Duplicata intencional de buildImageStyleSuffix em server.ts — reconciliar
// quando server.ts for revisitado (task de religacao, nao esta task).
export function buildImageStyleSuffix(
  profile: BrainHexProfile,
  plan: PresentationDesignPlan,
): string {
  const cfg = BRAIN_HEX_CONFIG[profile];
  return (
    `. Identidade do perfil: ${cfg.label}, guiado por ${cfg.guideName}. `
    + `Cor de assinatura: ${cfg.color}. ${presentationImageDirection(plan)}`
  );
}

// Duplicata intencional de slideTopics em slideTemplate.ts (nao tocamos esse
// arquivo nesta task) — reconciliar quando slideTemplate.ts for revisitado.
function slideTopicsForPrompt(slide: FullSlideInput): string[] {
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

/** Monta o prompt do slide inteiro: titulo/corpo verbatim + identidade do perfil + area segura. */
export function buildFullSlidePrompt(
  slide: FullSlideInput,
  profile: BrainHexProfile,
  plan: PresentationDesignPlan,
  layout: PresentationLayout,
): string {
  const title = slide.titulo || slide.title || "";
  const topics = slideTopicsForPrompt(slide);
  const explanation = slide.explanation || slide.visualDescription || "";
  const styleSuffix = buildImageStyleSuffix(profile, plan);
  return (
    `Slide de apresentação editorial completo, layout do tipo ${layout}. `
    + `Título (renderize exatamente este texto, em português): "${title}". `
    + (topics.length ? `Tópicos: ${topics.join("; ")}. ` : "")
    + (explanation ? `Texto de apoio: "${explanation}". ` : "")
    + `${slide.imagePrompt}${styleSuffix}. ${SAFE_ZONE_INSTRUCTION}`
  );
}

const log = createLogger({ ctx: "brainhex" });

export interface SlideAssets {
  imagem_referencia: string[];
  icones: string[][];
  renderMode: ("full-image" | "legacy")[];
}

export interface SlideAssetGeneratorOverrides {
  generateFullSlideImage?: typeof generateFullSlideImage;
  generateSceneImage?: typeof generateSceneImage;
  generateSlideIconWithFallback?: typeof generateSlideIconWithFallback;
}

/**
 * Espelha, para um unico slide, a logica que generateSceneImages/
 * generateSlideIcons (server.ts) fazem em lote para todos os slides — aqui e
 * sob demanda, so quando o slide cheio falha. Se a politica de corte de
 * custo dos icones mudar (breakar apos o primeiro vindo da contingencia
 * OpenAI), atualize os dois lugares.
 */
async function generateOneLegacySlide(
  slide: FullSlideInput,
  styleSuffix: string,
  plan: PresentationDesignPlan,
  index: number,
  total: number,
  doGenerateScene: typeof generateSceneImage,
  doGenerateIcon: typeof generateSlideIconWithFallback,
): Promise<{ scene: string; icons: string[] }> {
  let scene = "";
  try {
    const layout = presentationLayoutForSlide(plan, index, total);
    const prompt = (
      `${slide.imagePrompt}${styleSuffix}. `
      + `A composição será usada em um slide editorial do tipo ${layout}; `
      + "preserve áreas de respiro e contraste para títulos e cartões."
    );
    scene = (await doGenerateScene(prompt)) ?? "";
  } catch (e) {
    log.error("cena de fundo falhou (openai)", { slide: index, err: e });
  }

  const icons: string[] = [];
  for (const iconPrompt of slide.iconPrompts ?? []) {
    try {
      const generated = await doGenerateIcon(`${iconPrompt}${styleSuffix}`);
      icons.push(generated.image ?? "");
      // A contingência de imagem OpenAI é mais cara e já existe uma cena
      // OpenAI por slide. Um ícone de contingência por slide preserva o
      // acabamento sem multiplicar custo quando a cota Gemini está zerada.
      if (generated.provider === "openai") break;
    } catch (e) {
      log.error("icone falhou nos dois provedores", { slide: index, err: e });
      icons.push("");
    }
  }
  return { scene, icons };
}

/**
 * Gera, para cada slide, uma unica imagem com titulo+corpo+visual embutidos
 * (gpt-image-1). Quando falha, cai para o pipeline legacy (cena + icones) so
 * para aquele slide — o deck sempre sai completo, misto se necessario.
 */
export async function generateFullSlideImages(
  slides: FullSlideInput[],
  profile: BrainHexProfile,
  plan: PresentationDesignPlan,
  overrides: SlideAssetGeneratorOverrides = {},
): Promise<SlideAssets> {
  const doGenerateFull = overrides.generateFullSlideImage ?? generateFullSlideImage;
  const doGenerateScene = overrides.generateSceneImage ?? generateSceneImage;
  const doGenerateIcon = overrides.generateSlideIconWithFallback ?? generateSlideIconWithFallback;
  const styleSuffix = buildImageStyleSuffix(profile, plan);

  const imagem_referencia: string[] = [];
  const icones: string[][] = [];
  const renderMode: ("full-image" | "legacy")[] = [];

  for (let i = 0; i < slides.length; i++) {
    try {
      const layout = presentationLayoutForSlide(plan, i, slides.length);
      const prompt = buildFullSlidePrompt(slides[i], profile, plan, layout);
      const image = await doGenerateFull(prompt);
      imagem_referencia.push(image);
      icones.push([]);
      renderMode.push("full-image");
    } catch (e) {
      log.warn("slide cheio falhou, caindo pro pipeline legacy", { slide: i, err: e });
      const legacy = await generateOneLegacySlide(
        slides[i],
        styleSuffix,
        plan,
        i,
        slides.length,
        doGenerateScene,
        doGenerateIcon,
      );
      imagem_referencia.push(legacy.scene);
      icones.push(legacy.icons);
      renderMode.push("legacy");
    }
  }

  return { imagem_referencia, icones, renderMode };
}
