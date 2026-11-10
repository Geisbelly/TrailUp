/**
 * Converte uma fórmula TeX em SVG, no aparelho e sem rede (spec A, 08/11).
 *
 * MathJax 4 (`@mathjax/src`) com a fonte New Computer Modern. Três escolhas que não são óbvias:
 *
 * - **Carregamento tardio.** Nada do MathJax é avaliado até a primeira fórmula: `require` dentro de
 *   função. O Metro embute os módulos (o nome é literal), mas a abertura do app não paga por eles.
 * - **Faixas da fonte embutidas à mão.** A fonte base cobre o essencial; o resto vem em faixas que o
 *   MathJax pede sob demanda por `asyncLoad`. O Metro não resolve `require` com nome calculado, então
 *   as faixas que um corpus escolar pede (medido em 08/11: acento em `\text{ação}`, `\mathbb`,
 *   `\mathcal`, `\mathbf`, setas, ângulo, `\star`…) estão listadas em `FAIXAS`. Faixa fora da lista
 *   não quebra: a fórmula volta como erro e o componente mostra o texto legível.
 *   Ficaram de fora, de propósito, grego estendido (1 MB), cirílico, hebraico, árabe e braille.
 * - **Comando desconhecido é erro.** Sem o pacote `noundefined`, que o pintaria de vermelho dentro
 *   da fórmula: erro cai no texto legível, como TeX quebrado.
 * - **Química pelo mhchem**, que precisa da extensão de fonte própria (`-mhchem`), registrada antes
 *   do primeiro documento.
 *
 * O resultado guarda as medidas em `ex`, como o MathJax as dá. Quem desenha converte para pixel com
 * o tamanho da fonte do texto ao redor (`EX_POR_EM`).
 */

/* eslint-disable @typescript-eslint/no-require-imports */

export const EX_POR_EM = 0.5;

export type FormulaSvg = {
  svg: string;
  /** Largura, altura e deslocamento vertical (negativo desce), em ex. */
  largura: number;
  altura: number;
  alinhamento: number;
};

export type ResultadoFormula = FormulaSvg | { erro: string };

const PACOTES = [
  "base",
  "ams",
  "newcommand",
  "noerrors",
  "mhchem",
  "physics",
  "boldsymbol",
  "textmacros",
  "cancel",
  "units",
] as const;

const FAIXAS: Record<string, () => unknown> = {
  latin: () => require("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/latin.js"),
  "latin-b": () => require("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/latin-b.js"),
  "latin-i": () => require("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/latin-i.js"),
  arrows: () => require("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/arrows.js"),
  math: () => require("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/math.js"),
  shapes: () => require("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/shapes.js"),
  script: () => require("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/script.js"),
  "double-struck": () => require("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/double-struck.js"),
  calligraphic: () => require("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/calligraphic.js"),
  fraktur: () => require("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/fraktur.js"),
  monospace: () => require("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/monospace.js"),
  "sans-serif": () => require("@mathjax/mathjax-newcm-font/cjs/svg/dynamic/sans-serif.js"),
};

/** Nomes das faixas embutidas, para o teste conferir que cada uma existe no pacote. */
export const FAIXAS_EMBUTIDAS = Object.keys(FAIXAS);

type Conversor = (tex: string, display: boolean) => Promise<string>;

let conversor: Conversor | null = null;

type Navegador = { appVersion?: unknown; userAgent?: unknown };

/**
 * `@mathjax/src/cjs/util/context.js`, ao ser carregado, vê `window.navigator` e chama
 * `navigator.appVersion.includes(...)` e `navigator.userAgent.includes(...)`. No React Native o
 * `navigator` existe sem esses dois campos, e o `require` estoura com "Cannot read property
 * 'includes' of undefined" (medido no Android, 10/11). Eles ficam como texto vazio só durante a
 * carga e voltam a não existir depois: nada fora do MathJax enxerga a troca.
 */
function carregarSemNavegador<T>(carregar: () => T): T {
  const navegador = (globalThis as { navigator?: Navegador }).navigator;
  const faltando = navegador
    ? (["appVersion", "userAgent"] as const).filter((campo) => typeof navegador[campo] !== "string")
    : [];
  for (const campo of faltando) navegador![campo] = "";
  try {
    return carregar();
  } finally {
    for (const campo of faltando) delete navegador![campo];
  }
}

function criarConversor(): Conversor {
  return carregarSemNavegador(montarConversor);
}

function montarConversor(): Conversor {
  const { mathjax } = require("@mathjax/src/cjs/mathjax.js");
  const { TeX } = require("@mathjax/src/cjs/input/tex.js");
  const { SVG } = require("@mathjax/src/cjs/output/svg.js");
  const { liteAdaptor } = require("@mathjax/src/cjs/adaptors/liteAdaptor.js");
  const { RegisterHTMLHandler } = require("@mathjax/src/cjs/handlers/html.js");
  require("@mathjax/src/cjs/input/tex/base/BaseConfiguration.js");
  require("@mathjax/src/cjs/input/tex/ams/AmsConfiguration.js");
  require("@mathjax/src/cjs/input/tex/newcommand/NewcommandConfiguration.js");
  require("@mathjax/src/cjs/input/tex/noerrors/NoErrorsConfiguration.js");
  require("@mathjax/src/cjs/input/tex/mhchem/MhchemConfiguration.js");
  require("@mathjax/src/cjs/input/tex/physics/PhysicsConfiguration.js");
  require("@mathjax/src/cjs/input/tex/boldsymbol/BoldsymbolConfiguration.js");
  require("@mathjax/src/cjs/input/tex/textmacros/TextMacrosConfiguration.js");
  require("@mathjax/src/cjs/input/tex/cancel/CancelConfiguration.js");
  require("@mathjax/src/cjs/input/tex/units/UnitsConfiguration.js");
  const { MathJaxNewcmFont } = require("@mathjax/mathjax-newcm-font/cjs/svg.js");
  const { MathJaxMhchemFontExtension } = require("@mathjax/mathjax-mhchem-font-extension/cjs/svg.js");

  MathJaxNewcmFont.addExtension(MathJaxMhchemFontExtension);
  mathjax.asyncLoad = (nome: string) => {
    const faixa = nome.split("/").pop()?.replace(/\.js$/, "") ?? nome;
    const carregar = FAIXAS[faixa];
    return carregar
      ? Promise.resolve(carregar())
      : Promise.reject(new Error(`faixa da fonte não embutida: ${faixa}`));
  };

  const adaptador = liteAdaptor();
  RegisterHTMLHandler(adaptador);
  const documento = mathjax.document("", {
    InputJax: new TeX({ packages: [...PACOTES] }),
    // Sem quebra em linha: o MathJax 4 parte a fórmula em linha em vários `<svg>`, um por trecho
    // entre pontos de quebra, e a tela só desenha um bloco com uma medida (medido no Android:
    // `n = 0` saía só `= 0`, pequeno). Quem quebra a linha do parágrafo é o `Text` em volta.
    OutputJax: new SVG({ fontCache: "none", fontData: MathJaxNewcmFont, linebreaks: { inline: false } }),
  });

  return async (tex, display) => {
    const no = await mathjax.handleRetriesFor(() => documento.convert(tex, { display }));
    return adaptador.outerHTML(no) as string;
  };
}

const LIMITE_CACHE = 200;
const cache = new Map<string, ResultadoFormula>();

function lembrar(chave: string, valor: ResultadoFormula): ResultadoFormula {
  cache.delete(chave);
  cache.set(chave, valor);
  if (cache.size > LIMITE_CACHE) {
    const maisAntiga = cache.keys().next().value;
    if (maisAntiga !== undefined) cache.delete(maisAntiga);
  }
  return valor;
}

const NUMERO = "(-?[\\d.]+)ex";

/** Tira o invólucro `mjx-container` e os atributos `data-*`, e lê as medidas. Exportada para teste. */
export function extrairSvg(html: string): ResultadoFormula {
  const erro = /data-mjx-error="([^"]*)"/.exec(html);
  if (erro) return { erro: erro[1] || "fórmula inválida" };
  const inicio = html.indexOf("<svg");
  const fim = html.lastIndexOf("</svg>");
  if (inicio < 0 || fim < 0) return { erro: "sem svg" };
  // Fórmula partida em trechos (`<mjx-break>` entre `<svg>`s) não tem uma medida só: melhor crua
  // do que desenhada pela metade.
  if (/<mjx-/.test(html.slice(inicio, fim))) return { erro: "fórmula partida em trechos" };
  const svg = html
    .slice(inicio, fim + "</svg>".length)
    .replace(/\s(?:data-[\w-]+|role|focusable|style)="[^"]*"/g, "");
  const abertura = html.slice(inicio, html.indexOf(">", inicio));
  const largura = new RegExp(`width="${NUMERO}"`).exec(abertura);
  const altura = new RegExp(`height="${NUMERO}"`).exec(abertura);
  const alinhamento = new RegExp(`vertical-align:\\s*${NUMERO}`).exec(abertura);
  if (!largura || !altura) return { erro: "svg sem medida" };
  return {
    svg,
    largura: Number(largura[1]),
    altura: Number(altura[1]),
    alinhamento: alinhamento ? Number(alinhamento[1]) : 0,
  };
}

export async function formulaParaSvg(tex: string, opcoes: { display?: boolean } = {}): Promise<ResultadoFormula> {
  const display = opcoes.display === true;
  const chave = `${display ? "B" : "I"}|${tex}`;
  const lembrado = cache.get(chave);
  if (lembrado) return lembrar(chave, lembrado);
  if (tex.trim() === "") return { erro: "fórmula vazia" };
  try {
    conversor ??= criarConversor();
    return lembrar(chave, extrairSvg(await conversor(tex, display)));
  } catch (falha) {
    // Não guarda no cache: uma falha de carga pode ser passageira, e a próxima tentativa é barata.
    return { erro: falha instanceof Error ? falha.message : String(falha) };
  }
}

/** Só para teste. */
export function tamanhoDoCacheDeFormulas(): number {
  return cache.size;
}
