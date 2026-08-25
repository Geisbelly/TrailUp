import {
  BRAIN_HEX_CONFIG,
  type BrainHexProfile,
} from "./brainHex";
import { PRESENTATION_DESIGN_VERSION } from "./pipelineVersions";

export type PresentationLayout =
  | "cover"
  | "split"
  | "cards"
  | "spotlight"
  | "timeline"
  | "finale";

export interface PresentationThemeInput {
  version?: string;
  subject?: string;
  style_name?: string;
  art_direction?: string;
  mood?: string;
  texture?: string;
  narrative?: string;
  motifs?: string[];
  layout_sequence?: PresentationLayout[];
}

export interface PresentationDesignPlan {
  version: typeof PRESENTATION_DESIGN_VERSION;
  subject: string;
  styleName: string;
  artDirection: string;
  mood: string;
  texture: string;
  narrative: string;
  motifs: string[];
  layoutSequence: PresentationLayout[];
  palette: {
    accent: string;
    accentSoft: string;
    highlight: string;
    background: string;
    surface: string;
    ink: string;
  };
}

interface ProfileThemeDefinition {
  styleName: string;
  artDirection: string;
  mood: string;
  texture: string;
  narrative: string;
  motifs: string[];
  layoutSequence: PresentationLayout[];
  palette: Omit<PresentationDesignPlan["palette"], "accent">;
}

const PROFILE_THEMES: Record<BrainHexProfile, ProfileThemeDefinition> = {
  seeker: {
    styleName: "Atlas das Descobertas",
    artDirection:
      "editorial cartográfico contemporâneo, mapas em camadas, rotas luminosas, recortes orgânicos e amplo espaço de respiro",
    mood: "curioso, luminoso e exploratório",
    texture: "papel cartográfico sutil com linhas topográficas",
    narrative: "uma expedição que revela pistas e amplia o horizonte a cada etapa",
    motifs: ["rosa dos ventos", "rota pontilhada", "marcador de mapa", "horizonte"],
    layoutSequence: ["cover", "split", "cards", "timeline", "spotlight", "split", "finale"],
    palette: {
      accentSoft: "#8ce0d8",
      highlight: "#ffd166",
      background: "#071f24",
      surface: "#10353a",
      ink: "#f4fffd",
    },
  },
  survivor: {
    styleName: "Manual de Campo",
    artDirection:
      "manual de sobrevivência editorial, placas técnicas, recortes robustos, coordenadas e sinalização de segurança",
    mood: "firme, protetor e pragmático",
    texture: "fibra escura, grade tática e marcas discretas de desgaste",
    narrative: "um protocolo de campo que identifica riscos e transforma conhecimento em proteção",
    motifs: ["escudo modular", "coordenadas", "faixa de alerta", "selo de proteção"],
    layoutSequence: ["cover", "cards", "split", "spotlight", "timeline", "cards", "finale"],
    palette: {
      accentSoft: "#aeb8c2",
      highlight: "#f3b61f",
      background: "#12181e",
      surface: "#26323d",
      ink: "#f6f8fa",
    },
  },
  daredevil: {
    styleName: "Código de Impacto",
    artDirection:
      "revista esportiva cinética, diagonais fortes, cortes assimétricos, faíscas e sensação controlada de velocidade",
    mood: "elétrico, ousado e focado",
    texture: "granulado energético com linhas de velocidade",
    narrative: "uma sequência de desafios crescentes que converte risco em domínio",
    motifs: ["raio angular", "trilha de velocidade", "marcador de desafio", "faísca"],
    layoutSequence: ["cover", "spotlight", "split", "cards", "timeline", "spotlight", "finale"],
    palette: {
      accentSoft: "#ff8795",
      highlight: "#ffcf33",
      background: "#24070d",
      surface: "#49101c",
      ink: "#fff8f6",
    },
  },
  mastermind: {
    styleName: "Blueprint Estratégico",
    artDirection:
      "blueprint editorial premium, diagramas de sistema, grade modular, nós conectados e precisão arquitetônica",
    mood: "analítico, elegante e calculado",
    texture: "grade técnica fina com constelações de dados",
    narrative: "uma arquitetura lógica que conecta peças isoladas até revelar o sistema completo",
    motifs: ["nó conectado", "grade blueprint", "engrenagem abstrata", "coordenada lógica"],
    layoutSequence: ["cover", "timeline", "cards", "split", "spotlight", "cards", "finale"],
    palette: {
      accentSoft: "#aa9cff",
      highlight: "#40e0d0",
      background: "#100b29",
      surface: "#241b50",
      ink: "#f7f4ff",
    },
  },
  conqueror: {
    styleName: "Tratado de Soberania",
    artDirection:
      "editorial monumental contemporâneo, arcos geométricos, estandartes, blocos de autoridade e composição régia sem excesso ornamental",
    mood: "decisivo, imponente e progressivo",
    texture: "pedra polida com linhas metálicas discretas",
    narrative: "um mapa de conquista intelectual que transforma fundamentos em domínio responsável",
    motifs: ["estandarte", "arco monumental", "coroa geométrica", "território em expansão"],
    layoutSequence: ["cover", "split", "spotlight", "cards", "timeline", "split", "finale"],
    palette: {
      accentSoft: "#82a7ff",
      highlight: "#f4c95d",
      background: "#07152f",
      surface: "#112d5c",
      ink: "#f5f8ff",
    },
  },
  socializer: {
    styleName: "Mosaico de Conexões",
    artDirection:
      "editorial humano em colagem, círculos sobrepostos, fios de conversa, cartões calorosos e ritmo de comunidade",
    mood: "acolhedor, expressivo e colaborativo",
    texture: "papel recortado com tramas suaves de conversa",
    narrative: "uma conversa guiada em que cada conceito ganha força quando se conecta aos demais",
    motifs: ["balão de diálogo", "elos circulares", "fogueira abstrata", "mosaico humano"],
    layoutSequence: ["cover", "cards", "split", "spotlight", "cards", "timeline", "finale"],
    palette: {
      accentSoft: "#ffad8f",
      highlight: "#ffd166",
      background: "#2c100b",
      surface: "#542419",
      ink: "#fff9f5",
    },
  },
  achiever: {
    styleName: "Portfólio de Maestria",
    artDirection:
      "portfólio editorial de alto acabamento, marcos de progresso, medalhas geométricas, vitrines e composição de conquista",
    mood: "aspiracional, organizado e recompensador",
    texture: "papel premium escuro com brilho metálico pontual",
    narrative: "uma trilha de metas verificáveis que torna o progresso visível e culmina em maestria",
    motifs: ["medalha geométrica", "trilha de progresso", "gema lapidada", "selo de conclusão"],
    layoutSequence: ["cover", "timeline", "cards", "spotlight", "split", "cards", "finale"],
    palette: {
      accentSoft: "#f4d976",
      highlight: "#63d6c5",
      background: "#241b05",
      surface: "#46370d",
      ink: "#fffdf4",
    },
  },
};

const VALID_LAYOUTS = new Set<PresentationLayout>([
  "cover",
  "split",
  "cards",
  "spotlight",
  "timeline",
  "finale",
]);

function cleanText(value: unknown, fallback = "", maxLength = 600): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return (normalized || fallback).slice(0, maxLength);
}

function cleanList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const items = [...new Set(
    value.map((item) => cleanText(item, "", 100)).filter(Boolean),
  )];
  return items.length > 0 ? items.slice(0, 6) : [...fallback];
}

function cleanLayouts(
  value: unknown,
  fallback: PresentationLayout[],
): PresentationLayout[] {
  if (!Array.isArray(value)) return [...fallback];
  const layouts = value.filter(
    (item): item is PresentationLayout =>
      typeof item === "string" && VALID_LAYOUTS.has(item as PresentationLayout),
  );
  return layouts.length >= 3 ? layouts.slice(0, 10) : [...fallback];
}

export function buildPresentationDesignPlan(
  profile: BrainHexProfile,
  input: PresentationThemeInput = {},
  fallbackSubject = "Conteúdo de estudo",
): PresentationDesignPlan {
  const definition = PROFILE_THEMES[profile];
  const accent = BRAIN_HEX_CONFIG[profile].color;
  return {
    version: PRESENTATION_DESIGN_VERSION,
    subject: cleanText(input.subject, fallbackSubject, 180),
    styleName: cleanText(input.style_name, definition.styleName, 100),
    artDirection: cleanText(
      input.art_direction,
      definition.artDirection,
      700,
    ),
    mood: cleanText(input.mood, definition.mood, 220),
    texture: cleanText(input.texture, definition.texture, 220),
    narrative: cleanText(input.narrative, definition.narrative, 420),
    motifs: cleanList(input.motifs, definition.motifs),
    layoutSequence: cleanLayouts(
      input.layout_sequence,
      definition.layoutSequence,
    ),
    palette: {
      accent,
      ...definition.palette,
    },
  };
}

export function presentationLayoutForSlide(
  plan: PresentationDesignPlan,
  index: number,
  total: number,
): PresentationLayout {
  if (index === 0) return "cover";
  if (total > 1 && index === total - 1) return "finale";
  const middleLayouts = plan.layoutSequence.filter(
    (layout) => layout !== "cover" && layout !== "finale",
  );
  return middleLayouts[(index - 1) % middleLayouts.length] ?? "split";
}

export function presentationImageDirection(
  plan: PresentationDesignPlan,
): string {
  return [
    `Tema curricular do deck: ${plan.subject}.`,
    `Sistema visual coeso: ${plan.styleName}.`,
    `Direção de arte: ${plan.artDirection}.`,
    `Clima: ${plan.mood}.`,
    `Textura: ${plan.texture}.`,
    `Motivos recorrentes: ${plan.motifs.join(", ")}.`,
    "Manter a mesma linguagem visual em todas as imagens deste deck.",
  ].join(" ");
}
