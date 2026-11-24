/**
 * O miolo do MathJax de `formulaParaSvg.ts`: pacotes, faixas da fonte e o conversor.
 *
 * Fica num arquivo só dele porque `formulaParaSvg` o carrega por `import()`. Na web, o export do
 * Expo põe tudo o que este arquivo importa (MathJax, a fonte New Computer Modern e o mhchem, uns
 * 3,8 MB crus, medidos em 24/11) num pedaço separado, baixado só na primeira fórmula. Antes o
 * `require` dentro de função já adiava a AVALIAÇÃO, mas os bytes iam no pedaço da tela do tópico,
 * e todo aluno que abria um tópico baixava a fonte inteira, com fórmula ou sem. No celular o
 * `import()` resolve dentro do próprio bundle e nada muda.
 *
 * Não importe este arquivo de forma estática fora de teste: o MathJax voltaria para o pedaço de
 * quem importou.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

export type Conversor = (tex: string, display: boolean) => Promise<string>;

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

export function criarConversor(): Conversor {
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
