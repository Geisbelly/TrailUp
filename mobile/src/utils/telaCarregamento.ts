/**
 * Núcleo puro da tela de carregamento: paleta AAA, ritmo e voz de cada perfil
 * BrainHex, e as curvas do indicador "trilha de marcos". Sem React, para que
 * tudo o que decide a aparência possa ser testado em node.
 *
 * Fundamentação (limiares, movimento, acessibilidade, voz por perfil) em
 * docs/superpowers/specs/2026-11-02-tela-de-carregamento-por-perfil-design.md.
 */
import { brainHexGuideNames, getBrainHexConfig } from "@/constants/profileImages";
import { normalizeBrainHexProfile, type BrainHexProfile } from "@/constants/brainHexProfiles";
import tinycolor from "tinycolor2";
import { ensureMinContrast, type ProfileShellPalette } from "./profileShellPalette";
import { getProfileShellPalette } from "./profileShellTheme";

/** Abaixo de ~1 s a espera não interrompe o raciocínio: o conteúdo só aparece depois disto. */
export const ATRASO_PARA_MOSTRAR_MS = 300;
/** Limite de atenção de Nielsen: a partir daqui a tela explica que está demorando. */
export const LIMIAR_DEMORA_MS = 10_000;
/** Marcos na trilha do indicador. */
export const MARCOS_NA_TRILHA = 5;

/**
 * Como a luz percorre a trilha de marcos.
 * - `viajante`: uma luz anda de marco em marco (exploração, ação);
 * - `respira`: todos os marcos sobem e descem juntos, devagar (estabilidade);
 * - `passo`: um marco por vez, em degraus secos, sem transição (precisão, assertividade);
 * - `par`: duas luzes andam juntas, meia volta de distância (os dois guias);
 * - `acumula`: os marcos acendem um a um e ficam acesos até o fim da volta (marcos conquistados).
 *
 * Nenhum modo representa porcentagem: o indicador é indeterminado e nunca "volta" —
 * barra que regride é a que mais alonga a espera percebida (Harrison et al., 2007).
 */
export type ModoDoMarco = "viajante" | "respira" | "passo" | "par" | "acumula";

export type VozDoCarregamento = {
  /** Frases do guia enquanto carrega; uma é sorteada por montagem, sem rodízio. */
  frases: readonly string[];
  /** Mostrada (e anunciada) depois de LIMIAR_DEMORA_MS. */
  demora: string;
};

export type MovimentoDoCarregamento = {
  modo: ModoDoMarco;
  /** O mesmo `ritmo` da assinatura editorial do perfil (teste de paridade com a API). */
  ritmo: RitmoEditorial;
  /** Duração de uma volta completa da trilha: `RITMO_MS[ritmo]`. */
  cicloMs: number;
  /** Escala do marco aceso (1 = sem crescer). */
  escalaMaxima: number;
};

export type PerfilDoCarregamento = BrainHexProfile | "neutro";

export type PaletaDoCarregamento = {
  /** Paleta base (fundo, superfícies, bordas), a mesma do resto do app. */
  base: ProfileShellPalette;
  fundo: string;
  superficie: string;
  /** Cor-assinatura com luminosidade elevada até 7:1 sobre fundo e superfície. */
  destaque: string;
  texto: string;
  /** Texto secundário, opaco, também >= 7:1. */
  textoSuave: string;
  /** Marco apagado: precisa de 3:1 contra o fundo (WCAG 1.4.11). */
  marcoApagado: string;
  /** Anel em volta do guia. */
  anel: string;
};

export const RITMO_MS = {
  dinamico: 1_200,
  medio: 1_900,
  "medio-lento": 2_600,
} as const;

export type RitmoEditorial = keyof typeof RITMO_MS;

/**
 * Ritmo, modo e voz de cada perfil. O ritmo e os marcadores de linguagem vêm de
 * `_BRAINHEX_EDITORIAL_SIGNATURES` (api/app/services/personalizacao.py), e as
 * proibições de estilo de lá valem aqui também (ex.: nada de "promessas vagas"
 * para o Sobrevivente). Nenhuma frase promete o que a tela não faz: o
 * carregamento não salva nem tenta de novo, então nenhuma diz isso.
 */
export const CARREGAMENTO_POR_PERFIL: Record<
  PerfilDoCarregamento,
  { movimento: MovimentoDoCarregamento; voz: VozDoCarregamento }
> = {
  // curioso e exploratório · ritmo médio · explorar, descobrir, mapear, pistas
  seeker: {
    movimento: { modo: "viajante", ritmo: "medio", cicloMs: RITMO_MS.medio, escalaMaxima: 1.35 },
    voz: {
      frases: [
        "Amara está mapeando o caminho para você.",
        "Seguindo as pistas até o próximo trecho.",
        "Tem coisa nova para descobrir por aqui.",
      ],
      demora: "O caminho está mais longo que o normal. Vale conferir a sua conexão.",
    },
  },
  // pragmático e seguro · ritmo médio-lento · passo a passo, evite falhas
  survivor: {
    movimento: { modo: "respira", ritmo: "medio-lento", cicloMs: RITMO_MS["medio-lento"], escalaMaxima: 1.15 },
    voz: {
      frases: [
        "Kenji está conferindo cada passo antes de você começar.",
        "Tudo no lugar, passo a passo.",
        "Verificando o terreno antes de seguir.",
      ],
      demora: "Está levando mais tempo que o normal. Confira a sua conexão.",
    },
  },
  // energético e desafiador · ritmo dinâmico · desafio, missão, ação
  daredevil: {
    movimento: { modo: "viajante", ritmo: "dinamico", cicloMs: RITMO_MS.dinamico, escalaMaxima: 1.5 },
    voz: {
      frases: [
        "Ember está preparando o próximo desafio.",
        "Missão a caminho. Prepare-se!",
        "Aquecendo para a ação.",
      ],
      demora: "Este está mais lento que o normal. Confira a sua conexão; a missão continua de pé.",
    },
  },
  // analítico e preciso · ritmo médio · hipótese, evidência, modelo
  mastermind: {
    movimento: { modo: "passo", ritmo: "medio", cicloMs: RITMO_MS.medio, escalaMaxima: 1.25 },
    voz: {
      frases: [
        "Idris está organizando as peças do raciocínio.",
        "Montando o modelo, peça por peça.",
        "Reunindo as evidências para o próximo passo.",
      ],
      demora: "Mais lento que o previsto. A causa mais provável é a conexão: vale conferir.",
    },
  },
  // assertivo e orientado a resultado · ritmo dinâmico · meta, resultado, execução
  conqueror: {
    movimento: { modo: "passo", ritmo: "dinamico", cicloMs: RITMO_MS.dinamico, escalaMaxima: 1.4 },
    voz: {
      frases: [
        "Amina está posicionando você para a próxima meta.",
        "Rumo ao resultado. Só mais um instante.",
        "Preparando o terreno para a execução.",
      ],
      demora: "Está demorando mais que o normal. Confira a sua conexão e siga para a meta.",
    },
  },
  // humano e colaborativo · ritmo médio · juntos, compartilhar, comunidade
  socializer: {
    movimento: { modo: "par", ritmo: "medio", cicloMs: RITMO_MS.medio, escalaMaxima: 1.3 },
    voz: {
      frases: [
        "Mateo e Zuri estão reunindo a turma.",
        "Preparando um espaço para aprender junto.",
        "A comunidade já está chegando.",
      ],
      demora: "Está demorando mais que o normal. Confira a sua conexão; Mateo e Zuri esperam com você.",
    },
  },
  // objetivo e progressivo · ritmo médio · progresso, marco, evolução
  achiever: {
    movimento: { modo: "acumula", ritmo: "medio", cicloMs: RITMO_MS.medio, escalaMaxima: 1.3 },
    voz: {
      frases: [
        "Kwame está separando o seu próximo marco.",
        "Cada passo conta. Preparando a próxima etapa.",
        "Organizando a sua evolução.",
      ],
      demora: "Está levando mais tempo que o normal. Confira a sua conexão; o próximo marco espera.",
    },
  },
  // Antes do login ou do quiz: a voz é a do TrailUp, sem guia.
  neutro: {
    movimento: { modo: "viajante", ritmo: "medio", cicloMs: RITMO_MS.medio, escalaMaxima: 1.25 },
    voz: {
      frases: ["Preparando a sua trilha.", "Organizando o caminho para você."],
      demora: "Está demorando mais que o normal. Confira a sua conexão com a internet.",
    },
  },
};

export function perfilDoCarregamento(perfil?: string | null): PerfilDoCarregamento {
  return normalizeBrainHexProfile(perfil) ?? "neutro";
}

/** Fundo do splash nativo (app.json): a variante neutra começa exatamente nele, sem piscar. */
export const FUNDO_DO_SPLASH = "#111936";
/** Azul do contorno da estrela da marca (trailup-brand-logo.png). */
export const AZUL_DA_ESTRELA = "#5b7cff";

function paletaNeutra(): ProfileShellPalette {
  const { h } = tinycolor(FUNDO_DO_SPLASH).toHsl();
  const tom = (s: number, l: number) => tinycolor({ h, s, l }).toHexString();
  // `profile` fica indefinido de propósito: é o que faz o HallBackground mostrar o cenário público.
  return {
    theme: "magica",
    accent: AZUL_DA_ESTRELA,
    accentStrong: tinycolor(AZUL_DA_ESTRELA).darken(8).toHexString(),
    accentSoft: tinycolor(AZUL_DA_ESTRELA).setAlpha(0.18).toRgbString(),
    accentMuted: tinycolor(AZUL_DA_ESTRELA).setAlpha(0.12).toRgbString(),
    background: FUNDO_DO_SPLASH,
    surface: tom(0.5, 0.16),
    surfaceElevated: tom(0.5, 0.22),
    border: tom(0.4, 0.35),
    borderStrong: tom(0.4, 0.55),
    text: tom(0.18, 0.96),
    textMuted: tinycolor(tom(0.18, 0.96)).setAlpha(0.82).toRgbString(),
    textSubtle: tinycolor(tom(0.18, 0.96)).setAlpha(0.62).toRgbString(),
    progressTrack: FUNDO_DO_SPLASH,
    inactive: tinycolor(tom(0.18, 0.96)).setAlpha(0.6).toRgbString(),
  };
}

const AAA_TEXTO = 7;
const AA_COMPONENTE = 3;

/** Pior caso entre duas superfícies: a cor precisa passar nas duas. */
function contrastarNasDuas(cor: string, a: string, b: string, minimo: number): string {
  return ensureMinContrast(ensureMinContrast(cor, a, minimo), b, minimo);
}

/**
 * Paleta da tela. Toda cor que vira texto passa de 7:1 (WCAG 1.4.6, AAA) sobre o
 * fundo E sobre a superfície do cartão. O ajuste só eleva a luminosidade HSL da
 * cor-assinatura (matiz e saturação ficam), nunca mistura com branco.
 */
export function paletaDoCarregamento(perfil: PerfilDoCarregamento, accentForcado?: string | null): PaletaDoCarregamento {
  const base = perfil === "neutro" ? paletaNeutra() : getProfileShellPalette(perfil);
  const assinatura =
    accentForcado && tinycolor(accentForcado).isValid()
      ? tinycolor(accentForcado).toHexString()
      : perfil === "neutro"
        ? AZUL_DA_ESTRELA
        : tinycolor(getBrainHexConfig(perfil).color).toHexString();
  const fundo = base.background;
  const superficie = base.surfaceElevated;
  const { h } = tinycolor(assinatura).toHsl();

  const destaque = contrastarNasDuas(assinatura, fundo, superficie, AAA_TEXTO);
  const texto = contrastarNasDuas(base.text, fundo, superficie, AAA_TEXTO);
  // Texto secundário opaco com o matiz do perfil: alfa sobre fundo variável não dá para garantir.
  const textoSuave = contrastarNasDuas(tinycolor({ h, s: 0.16, l: 0.78 }).toHexString(), fundo, superficie, AAA_TEXTO);
  const marcoApagado = ensureMinContrast(tinycolor({ h, s: 0.35, l: 0.4 }).toHexString(), fundo, AA_COMPONENTE);

  return {
    base,
    fundo,
    superficie,
    destaque,
    texto,
    textoSuave,
    marcoApagado,
    anel: tinycolor(destaque).setAlpha(0.55).toRgbString(),
  };
}

export type CurvaDoMarco = { inputRange: number[]; outputRange: number[] };

const EPS = 0.001;

/** Remove pontos repetidos/fora de ordem para o `interpolate` (exige entrada estritamente crescente). */
function normalizarCurva(pontos: [number, number][]): CurvaDoMarco {
  const ordenados = pontos
    .map(([t, v]) => [Math.min(1, Math.max(0, t)), v] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (const [t, v] of ordenados) {
    if (inputRange.length && t <= inputRange[inputRange.length - 1]) {
      // Mesmo instante: vale o último valor escrito (é o que faz o degrau).
      outputRange[outputRange.length - 1] = v;
      continue;
    }
    inputRange.push(t);
    outputRange.push(v);
  }
  return { inputRange, outputRange };
}

/**
 * Picos triangulares centrados em `centros`, com meia largura `w`, dando a volta em 1
 * (o pico que atravessa o fim da volta reaparece no começo). A função é linear por
 * partes entre os pontos de quebra, então amostrá-los descreve a curva inteira —
 * desde que os picos não se sobreponham, o que vale para os modos daqui.
 */
function picos(centros: number[], w: number): [number, number][] {
  const deslocados = centros.flatMap((c) => [c - 1, c, c + 1]);
  const valorEm = (t: number) =>
    deslocados.reduce((v, c) => Math.max(v, 1 - Math.abs(t - c) / w), 0);
  const quebras = new Set<number>([0, 1]);
  for (const c of deslocados) {
    for (const t of [c - w, c, c + w]) if (t > 0 && t < 1) quebras.add(t);
  }
  return [...quebras].map((t) => [t, valorEm(t)] as [number, number]);
}

/**
 * Intensidade (0 a 1) do marco `i` de `n` ao longo de uma volta `t` em [0, 1].
 * Sai pronta para `Animated.Value.interpolate`.
 */
export function curvaDoMarco(modo: ModoDoMarco, i: number, n: number = MARCOS_NA_TRILHA): CurvaDoMarco {
  const passo = 1 / n;
  switch (modo) {
    case "respira":
      // Todos juntos, com um leve atraso por marco para a onda não parecer um bloco.
      return normalizarCurva([
        [0, 0.15],
        [0.5 + i * 0.02, 1],
        [1, 0.15],
      ]);
    case "passo": {
      const inicio = i * passo;
      const fim = (i + 1) * passo;
      return normalizarCurva([
        [0, 0],
        [inicio, 0],
        [inicio + EPS, 1],
        [fim - EPS, 1],
        [fim, 0],
        [1, i === n - 1 ? 1 : 0],
      ]);
    }
    case "acumula": {
      // Acende no seu trecho e fica aceso até 85% da volta; depois todos apagam juntos.
      const inicio = i * passo * 0.8;
      return normalizarCurva([
        [0, 0],
        [inicio, 0],
        [inicio + passo * 0.25, 1],
        [0.85, 1],
        [1, 0],
      ]);
    }
    case "par": {
      const centro = (i + 0.5) * passo;
      return normalizarCurva(picos([centro, (centro + 0.5) % 1], passo * 1.2));
    }
    case "viajante":
    default:
      return normalizarCurva(picos([(i + 0.5) * passo], passo * 1.2));
  }
}

/** Valor da curva em `t` (interpolação linear, como o `Animated` faz). Usado nos testes e no quadro parado. */
export function intensidadeEm(curva: CurvaDoMarco, t: number): number {
  const { inputRange: x, outputRange: y } = curva;
  if (t <= x[0]) return y[0];
  for (let k = 1; k < x.length; k += 1) {
    if (t <= x[k]) {
      const f = (t - x[k - 1]) / (x[k] - x[k - 1]);
      return y[k - 1] + (y[k] - y[k - 1]) * f;
    }
  }
  return y[y.length - 1];
}

/** Com movimento reduzido, os marcos ficam parados e iguais: um quadro que não sugere porcentagem. */
export const INTENSIDADE_PARADA = 0.6;

export function escolherFrase(perfil: PerfilDoCarregamento, sorteio: number): string {
  const { frases } = CARREGAMENTO_POR_PERFIL[perfil].voz;
  const indice = Math.min(frases.length - 1, Math.max(0, Math.floor(sorteio * frases.length)));
  return frases[indice];
}

/** Linha "Explorador · Amara" acima do título; nula na variante neutra. */
export function rotuloDoGuia(perfil: PerfilDoCarregamento): string | null {
  if (perfil === "neutro") return null;
  return `${getBrainHexConfig(perfil).label} · ${brainHexGuideNames[perfil]}`;
}

/**
 * Transição da variante neutra para a do perfil, quando o perfil chega com a tela aberta
 * (abertura do app, login). A estrela da marca gira e se apaga; do medalhão sai um círculo
 * na cor de fundo do perfil que cobre a tela; o guia e o texto entram por cima; o cenário
 * do perfil aparece e o círculo some nele. Uma volta só, sem laço.
 */
export const TRANSICAO_MS = 1_200;

/** Trecho da transição (fração de 0 a 1 de TRANSICAO_MS) em que cada parte anima. */
export const FASES_DA_TRANSICAO = {
  /** Estrela da marca: gira um quarto de volta, cresce e se apaga. */
  estrelaSai: [0, 0.28],
  /** Onda na cor de destaque, que sai do medalhão enquanto a estrela gira. */
  onda: [0, 0.5],
  /**
   * Círculo do fundo do perfil: do tamanho da moldura até cobrir a tela. Só nasce com a
   * estrela quase apagada; antes disso ele a cobriria e o giro não seria visto.
   */
  circulo: [0.22, 0.66],
  /** Símbolo do perfil e moldura. */
  medalhaoEntra: [0.4, 0.7],
  /** Rótulo, título, frase e trilha. */
  textoEntra: [0.5, 0.85],
  /** Cenário e luz do perfil, por baixo do círculo. */
  fundoEntra: [0.68, 0.95],
  /** O círculo, liso, se apaga sobre o cenário. */
  circuloSai: [0.78, 1],
} as const satisfies Record<string, readonly [number, number]>;

/**
 * Só a chegada do perfil sobre a variante neutra é animada. Troca entre perfis, saída
 * para a neutra (logout) e qualquer troca com "Reduzir movimento" são instantâneas: o
 * círculo que cresce até cobrir a tela é justamente o tipo de movimento (escala grande)
 * que a preferência existe para evitar.
 */
export function deveAnimarTransicao(
  de: PerfilDoCarregamento | null,
  para: PerfilDoCarregamento,
  reduzido: boolean,
): boolean {
  return !reduzido && de === "neutro" && para !== "neutro";
}

/**
 * Diâmetro do círculo da transição e a escala em que ele nasce. Com raio igual à
 * diagonal da tela, o círculo cobre a tela inteira a partir de qualquer centro dentro
 * dela. Ele nasce do tamanho da moldura, para parecer que sai do medalhão.
 */
export function circuloDaTransicao(diametroInicial: number, largura: number, altura: number) {
  const diametro = 2 * Math.hypot(Math.max(1, largura), Math.max(1, altura));
  return { diametro, escalaInicial: Math.min(1, diametroInicial / diametro) };
}

/** Curva de saída suave (ease-out cúbica). */
export const desacelerar = (t: number) => 1 - (1 - t) ** 3;

/**
 * Interpolação de `de` para `para` no trecho `[ini, fim]` da transição, com a curva
 * `easing` amostrada em pontos. O `easing` do próprio `interpolate` não chega ao driver
 * nativo (é uma função JS), então a curva vai embutida nos pontos.
 */
export function faseDaTransicao(
  [ini, fim]: readonly [number, number],
  de: number,
  para: number,
  easing: (t: number) => number = (t) => t,
  pontos = 8,
): CurvaDoMarco {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  if (ini > 0) {
    inputRange.push(0);
    outputRange.push(de);
  }
  for (let k = 0; k <= pontos; k += 1) {
    const f = k / pontos;
    inputRange.push(ini + (fim - ini) * f);
    outputRange.push(de + (para - de) * easing(f));
  }
  if (fim < 1) {
    inputRange.push(1);
    outputRange.push(para);
  }
  return { inputRange, outputRange };
}
