import {
  BRAIN_HEX_CONFIG,
  type BrainHexProfile,
} from "../constants/brainHex";
import {
  presentationImageDirection,
  type PresentationDesignPlan,
  type PresentationLayout,
} from "../constants/presentationThemes";
import type { SlideForTemplate } from "./slideTemplate";

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
