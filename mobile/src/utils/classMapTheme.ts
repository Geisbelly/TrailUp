import { NodeItem } from "@/hooks/use-grafo-trilha";
import { Classe } from "@/models/Classe";

export type MapWorldPalette = {
  skyTop: string;
  skyBottom: string;
  sea: string;
  seaDeep: string;
  route: string;
  routeGlow: string;
  countryLocked: string;
  countryOpen: string;
  countryDone: string;
  countryCurrent: string;
  borderLocked: string;
  borderOpen: string;
  borderDone: string;
  borderCurrent: string;
  marker: string;
  markerText: string;
  textPrimary: string;
  textSecondary: string;
  panelBg: string;
  panelBorder: string;
};

export type MapCountryTheme = {
  nodeId: string;
  topicId: number | null;
  topicTitle: string;
  countryName: string;
  capitalName: string;
  lore: string;
  emblem: string;
  biome: string;
};

export type MapWorldTheme = {
  source: "local" | "api";
  worldName: string;
  worldSubtitle: string;
  worldDescription: string;
  classLabel: string;
  templateId: string;
  palette: MapWorldPalette;
  countries: Record<string, MapCountryTheme>;
};

type WorldTemplate = {
  id: string;
  keywords: string[];
  worldPrefixes: string[];
  worldSuffixes: string[];
  subtitle: string;
  description: string;
  countryPrefixes: string[];
  capitalPrefixes: string[];
  emblems: string[];
  biomes: string[];
  palette: MapWorldPalette;
};

const WORLD_TEMPLATES: WorldTemplate[] = [
  {
    id: "arcane-atlas",
    keywords: ["matemat", "algebra", "geometr", "calculo", "estat", "fisic", "logica"],
    worldPrefixes: ["Reinos de", "Coroa de", "Cartas de"],
    worldSuffixes: ["Numeria", "Axioma", "Vetoria", "Astraria"],
    subtitle: "Cartografia de estrategia, padroes e estruturas.",
    description: "Cada pais guarda um saber central e as estradas reais entre eles seguem a progressao logica da classe.",
    countryPrefixes: ["Reino de", "Ducado de", "Bastiao de", "Marca de"],
    capitalPrefixes: ["Torre de", "Castelo de", "Bastiao de", "Observatorio de"],
    emblems: ["compass-rose", "ruler-square", "shield-outline", "orbit"],
    biomes: ["planicies de pedra-luz", "ilhas de geometria", "vales runicos", "mares de calculo"],
    palette: {
      skyTop: "#22150d",
      skyBottom: "#5a3a20",
      sea: "#1c3550",
      seaDeep: "#0b1826",
      route: "#d4af63",
      routeGlow: "#f3dfae",
      countryLocked: "#675845",
      countryOpen: "#7b5f32",
      countryDone: "#4f7a52",
      countryCurrent: "#c58f2f",
      borderLocked: "#9e8a6e",
      borderOpen: "#ead7a7",
      borderDone: "#d3f0c9",
      borderCurrent: "#fff0c2",
      marker: "#f4ead2",
      markerText: "#2d1f13",
      textPrimary: "#f7edd6",
      textSecondary: "#dfceb0",
      panelBg: "rgba(39,24,14,0.84)",
      panelBorder: "rgba(226,191,126,0.4)",
    },
  },
  {
    id: "bio-frontier",
    keywords: ["biolog", "quimic", "ciencias", "ecolog", "saude", "anatom", "celula"],
    worldPrefixes: ["Coroa de", "Bosques de", "Dominios de"],
    worldSuffixes: ["Verdan", "Cromaris", "Floris", "Organia"],
    subtitle: "Terras vivas de bestiarios, ervas e ciencias naturais.",
    description: "Os paises deste mapa crescem como reinos vivos, cada qual guardando saberes e criaturas simbolicas da classe.",
    countryPrefixes: ["Vale de", "Bosque de", "Santuario de", "Marca de"],
    capitalPrefixes: ["Abadia de", "Santuario de", "Fortaleza de", "Torre de"],
    emblems: ["leaf", "dna", "molecule", "pine-tree"],
    biomes: ["selvas antigas", "rios de esmeralda", "pantanos de alquimia", "campos de herbario"],
    palette: {
      skyTop: "#182013",
      skyBottom: "#41512c",
      sea: "#234436",
      seaDeep: "#0d1a15",
      route: "#c8b26c",
      routeGlow: "#efe0ab",
      countryLocked: "#5e5a48",
      countryOpen: "#5f7f42",
      countryDone: "#7aa85e",
      countryCurrent: "#c99643",
      borderLocked: "#9b9176",
      borderOpen: "#dfe9b7",
      borderDone: "#ebf7cf",
      borderCurrent: "#fff0c5",
      marker: "#f6f0dc",
      markerText: "#26301b",
      textPrimary: "#f4f0df",
      textSecondary: "#d9d2bb",
      panelBg: "rgba(30,27,16,0.84)",
      panelBorder: "rgba(197,176,111,0.38)",
    },
  },
  {
    id: "chronicle-realms",
    keywords: ["hist", "geograf", "filosof", "sociolog", "polit", "human"],
    worldPrefixes: ["Cronicas de", "Reinos de", "Terras de"],
    worldSuffixes: ["Aurelia", "Cartographia", "Imperium", "Memoria"],
    subtitle: "Mapa de eras, cortes e disputas por narrativas.",
    description: "Cada topico se ergue como um reino com memoria propria, ligado por estradas de campanha e rotas de exploracao historica.",
    countryPrefixes: ["Imperio de", "Condado de", "Provincia de", "Territorio de"],
    capitalPrefixes: ["Corte de", "Porto de", "Baluarte de", "Fortaleza de"],
    emblems: ["castle", "sword-cross", "shield-crown", "map-legend"],
    biomes: ["planaltos antigos", "costas imperiais", "rotas caravaneiras", "fronteiras cronicas"],
    palette: {
      skyTop: "#24141d",
      skyBottom: "#5b3240",
      sea: "#2d2745",
      seaDeep: "#120f1d",
      route: "#d1a253",
      routeGlow: "#f7dfae",
      countryLocked: "#62525f",
      countryOpen: "#7e5a6b",
      countryDone: "#5f7c63",
      countryCurrent: "#c07f2f",
      borderLocked: "#a18f99",
      borderOpen: "#ead6c0",
      borderDone: "#d9f0d3",
      borderCurrent: "#fff0c0",
      marker: "#f7efdc",
      markerText: "#312011",
      textPrimary: "#f7eedc",
      textSecondary: "#dfceb5",
      panelBg: "rgba(34,20,18,0.84)",
      panelBorder: "rgba(214,180,124,0.34)",
    },
  },
  {
    id: "scriptoria-isles",
    keywords: ["portugues", "liter", "ingles", "espanhol", "lingua", "redacao", "texto"],
    worldPrefixes: ["Scriptoria de", "Coroa de", "Ilhas de"],
    worldSuffixes: ["Lumen", "Versalia", "Lexis", "Cantaria"],
    subtitle: "Reinos de linguagem, simbolos e cronicas em expansao.",
    description: "Cada pais guarda um livro, uma voz e uma rota narrativa, como se toda a classe fosse uma carta de escribas e trovadores.",
    countryPrefixes: ["Cantao de", "Ilha de", "Provincia de", "Ordem de"],
    capitalPrefixes: ["Biblioteca de", "Torre de", "Arquivo de", "Farol de"],
    emblems: ["feather", "book-open-page-variant", "scroll", "fountain-pen-tip"],
    biomes: ["costas literarias", "ilhas de pergaminho", "planicies verbais", "mares de leitura"],
    palette: {
      skyTop: "#20172a",
      skyBottom: "#5a3755",
      sea: "#273457",
      seaDeep: "#111828",
      route: "#d5aa74",
      routeGlow: "#f7e2bd",
      countryLocked: "#665a68",
      countryOpen: "#7c5f6d",
      countryDone: "#5f7b6a",
      countryCurrent: "#c98f41",
      borderLocked: "#a7999f",
      borderOpen: "#eadfcf",
      borderDone: "#d8f0df",
      borderCurrent: "#fff0cb",
      marker: "#f7efdf",
      markerText: "#2a1d14",
      textPrimary: "#faeedf",
      textSecondary: "#e0d0b8",
      panelBg: "rgba(35,22,23,0.84)",
      panelBorder: "rgba(219,181,129,0.32)",
    },
  },
  {
    id: "cyber-frontier",
    keywords: ["program", "comput", "algorit", "dados", "software", "sistema", "rede"],
    worldPrefixes: ["Forja de", "Dominios de", "Reinos de"],
    worldSuffixes: ["Nexis", "Compilaria", "Datara", "Codexia"],
    subtitle: "Terras de engenho, codices e mecanismos arcanos.",
    description: "Os topicos deste mapa surgem como feudos de forja e logica, ligados por estradas de cobre e torres de conhecimento.",
    countryPrefixes: ["Guilde de", "Dominio de", "Feudo de", "Marca de"],
    capitalPrefixes: ["Torre de", "Forja de", "Nucleo de", "Portal de"],
    emblems: ["anvil", "chip", "server-network", "lan-connect"],
    biomes: ["ilhas de cobre", "mares de dados", "planicies mecanicas", "zonas de forja"],
    palette: {
      skyTop: "#171611",
      skyBottom: "#4b4030",
      sea: "#233544",
      seaDeep: "#0c141b",
      route: "#c99f58",
      routeGlow: "#eedbb0",
      countryLocked: "#5e5b53",
      countryOpen: "#6d624b",
      countryDone: "#557763",
      countryCurrent: "#c48834",
      borderLocked: "#9b907b",
      borderOpen: "#ead9b2",
      borderDone: "#d2efd9",
      borderCurrent: "#fff0c4",
      marker: "#f5ecd8",
      markerText: "#2b2117",
      textPrimary: "#f6ebd8",
      textSecondary: "#deceb1",
      panelBg: "rgba(34,27,20,0.84)",
      panelBorder: "rgba(216,182,121,0.34)",
    },
  },
];

function normalizeComparisonText(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickByHash<T>(seed: string, items: T[]) {
  return items[hashString(seed) % items.length];
}

function compactTitle(value: string) {
  const clean = String(value ?? "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "Horizonte";

  const stopwords = new Set(["de", "da", "do", "das", "dos", "e", "em", "para", "com", "por", "na", "no"]);
  const tokens = clean.split(" ").filter((token) => !stopwords.has(token.toLowerCase()));
  return (tokens.length ? tokens : clean.split(" ")).slice(0, 3).join(" ");
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function selectTemplate(classe: Classe) {
  const source = normalizeComparisonText(
    [
      classe.resumo?.materia_nome,
      classe.resumo?.materia_descricao,
      classe.resumo?.professor_descricao,
    ]
      .filter(Boolean)
      .join(" ")
  );

  const keywordMatch = WORLD_TEMPLATES.find((template) =>
    template.keywords.some((keyword) => source.includes(keyword))
  );

  if (keywordMatch) return keywordMatch;

  const seed = `${classe.classe_id}:${classe.resumo?.materia_nome ?? "classe"}`;
  return pickByHash(seed, WORLD_TEMPLATES);
}

function buildWorldName(template: WorldTemplate, classe: Classe) {
  const matter = compactTitle(classe.resumo?.materia_nome ?? "Classe");
  const prefix = pickByHash(`${template.id}:${classe.classe_id}:prefix`, template.worldPrefixes);
  const suffix = pickByHash(`${template.id}:${classe.classe_id}:suffix`, template.worldSuffixes);

  if (matter.length >= 5) {
    return `${prefix} ${titleCase(matter)}`;
  }

  return `${prefix} ${suffix}`;
}

function buildCountryTheme(template: WorldTemplate, node: NodeItem): MapCountryTheme {
  const topicTitle = String(node.titulo ?? `Topico ${node.sequence}`);
  const compact = titleCase(compactTitle(topicTitle));
  const prefix = pickByHash(`${template.id}:${node.id}:country`, template.countryPrefixes);
  const capitalPrefix = pickByHash(`${template.id}:${node.id}:capital`, template.capitalPrefixes);
  const biome = pickByHash(`${template.id}:${node.id}:biome`, template.biomes);
  const emblem = pickByHash(`${template.id}:${node.id}:emblem`, template.emblems);

  return {
    nodeId: node.id,
    topicId: Number.isFinite(Number(node.id)) ? Number(node.id) : null,
    topicTitle,
    countryName: `${prefix} ${compact}`,
    capitalName: `${capitalPrefix} ${compact}`,
    lore: `${compact} guarda os saberes de ${topicTitle.toLowerCase()} e protege as estradas que levam a ${biome}.`,
    emblem,
    biome,
  };
}

function buildCountries(template: WorldTemplate, nodes: NodeItem[]) {
  return Object.fromEntries(
    nodes.map((node) => [node.id, buildCountryTheme(template, node)] as const)
  );
}

export function buildClassMapTheme(classe: Classe, nodes: NodeItem[]): MapWorldTheme {
  const template = selectTemplate(classe);
  const classLabel = classe.resumo?.materia_nome ?? `Classe ${classe.classe_id}`;

  return {
    source: "local",
    worldName: buildWorldName(template, classe),
    worldSubtitle: template.subtitle,
    worldDescription: template.description,
    classLabel,
    templateId: template.id,
    palette: template.palette,
    countries: buildCountries(template, nodes),
  };
}

function normalizePalette(raw: any, fallback: MapWorldPalette) {
  if (!raw || typeof raw !== "object") return fallback;

  return {
    skyTop: String(raw.skyTop ?? raw.sky_top ?? fallback.skyTop),
    skyBottom: String(raw.skyBottom ?? raw.sky_bottom ?? fallback.skyBottom),
    sea: String(raw.sea ?? fallback.sea),
    seaDeep: String(raw.seaDeep ?? raw.sea_deep ?? fallback.seaDeep),
    route: String(raw.route ?? fallback.route),
    routeGlow: String(raw.routeGlow ?? raw.route_glow ?? fallback.routeGlow),
    countryLocked: String(raw.countryLocked ?? raw.country_locked ?? fallback.countryLocked),
    countryOpen: String(raw.countryOpen ?? raw.country_open ?? fallback.countryOpen),
    countryDone: String(raw.countryDone ?? raw.country_done ?? fallback.countryDone),
    countryCurrent: String(raw.countryCurrent ?? raw.country_current ?? fallback.countryCurrent),
    borderLocked: String(raw.borderLocked ?? raw.border_locked ?? fallback.borderLocked),
    borderOpen: String(raw.borderOpen ?? raw.border_open ?? fallback.borderOpen),
    borderDone: String(raw.borderDone ?? raw.border_done ?? fallback.borderDone),
    borderCurrent: String(raw.borderCurrent ?? raw.border_current ?? fallback.borderCurrent),
    marker: String(raw.marker ?? fallback.marker),
    markerText: String(raw.markerText ?? raw.marker_text ?? fallback.markerText),
    textPrimary: String(raw.textPrimary ?? raw.text_primary ?? fallback.textPrimary),
    textSecondary: String(raw.textSecondary ?? raw.text_secondary ?? fallback.textSecondary),
    panelBg: String(raw.panelBg ?? raw.panel_bg ?? fallback.panelBg),
    panelBorder: String(raw.panelBorder ?? raw.panel_border ?? fallback.panelBorder),
  };
}

export function normalizeRemoteMapTheme(raw: any, classe: Classe, nodes: NodeItem[]): MapWorldTheme | null {
  if (!raw || typeof raw !== "object") return null;

  const fallback = buildClassMapTheme(classe, nodes);
  const countriesInput =
    raw.countries && typeof raw.countries === "object"
      ? raw.countries
      : Array.isArray(raw.nodes)
      ? raw.nodes
      : Array.isArray(raw.countries)
      ? raw.countries
      : null;

  const countries: Record<string, MapCountryTheme> = {};

  if (countriesInput) {
    if (Array.isArray(countriesInput)) {
      for (const entry of countriesInput) {
        const nodeId = String(entry?.nodeId ?? entry?.node_id ?? entry?.id ?? entry?.topico_id ?? "").trim();
        if (!nodeId) continue;
        const baseNode = nodes.find((node) => node.id === nodeId);
        const base = baseNode ? buildCountryTheme(selectTemplate(classe), baseNode) : null;
        countries[nodeId] = {
          nodeId,
          topicId: Number.isFinite(Number(entry?.topico_id ?? nodeId)) ? Number(entry?.topico_id ?? nodeId) : base?.topicId ?? null,
          topicTitle: String(entry?.topicTitle ?? entry?.topic_title ?? base?.topicTitle ?? `Topico ${nodeId}`),
          countryName: String(entry?.countryName ?? entry?.country_name ?? base?.countryName ?? `Pais ${nodeId}`),
          capitalName: String(entry?.capitalName ?? entry?.capital_name ?? base?.capitalName ?? `Capital ${nodeId}`),
          lore: String(entry?.lore ?? entry?.description ?? base?.lore ?? ""),
          emblem: String(entry?.emblem ?? base?.emblem ?? "map"),
          biome: String(entry?.biome ?? base?.biome ?? "terras em expansao"),
        };
      }
    } else {
      Object.entries(countriesInput).forEach(([key, value]) => {
        const entry = value as Record<string, unknown>;
        const nodeId = String(entry?.nodeId ?? entry?.node_id ?? entry?.id ?? key).trim();
        const baseNode = nodes.find((node) => node.id === nodeId);
        const base = baseNode ? buildCountryTheme(selectTemplate(classe), baseNode) : null;
        countries[nodeId] = {
          nodeId,
          topicId: Number.isFinite(Number(entry?.topico_id ?? nodeId)) ? Number(entry?.topico_id ?? nodeId) : base?.topicId ?? null,
          topicTitle: String(entry?.topicTitle ?? entry?.topic_title ?? base?.topicTitle ?? `Topico ${nodeId}`),
          countryName: String(entry?.countryName ?? entry?.country_name ?? base?.countryName ?? `Pais ${nodeId}`),
          capitalName: String(entry?.capitalName ?? entry?.capital_name ?? base?.capitalName ?? `Capital ${nodeId}`),
          lore: String(entry?.lore ?? entry?.description ?? base?.lore ?? ""),
          emblem: String(entry?.emblem ?? base?.emblem ?? "map"),
          biome: String(entry?.biome ?? base?.biome ?? "terras em expansao"),
        };
      });
    }
  }

  const completedCountries = {
    ...fallback.countries,
    ...countries,
  };

  return {
    source: "api",
    worldName: String(raw.worldName ?? raw.world_name ?? raw.name ?? fallback.worldName),
    worldSubtitle: String(raw.worldSubtitle ?? raw.world_subtitle ?? raw.subtitle ?? fallback.worldSubtitle),
    worldDescription: String(raw.worldDescription ?? raw.world_description ?? raw.description ?? fallback.worldDescription),
    classLabel: String(raw.classLabel ?? raw.class_label ?? fallback.classLabel),
    templateId: String(raw.templateId ?? raw.template_id ?? fallback.templateId),
    palette: normalizePalette(raw.palette, fallback.palette),
    countries: completedCountries,
  };
}
