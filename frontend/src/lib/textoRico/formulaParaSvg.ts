/**
 * Converte uma fórmula TeX em SVG, no navegador e sem rede (spec A, 08/11).
 *
 * Mesmo motor do app (`mobile/src/utils/textoRico/formulaParaSvg.ts`): MathJax 4 (`@mathjax/src`
 * 4.1.3), fonte New Computer Modern, os mesmos pacotes TeX e as mesmas faixas da fonte. O que muda
 * é só a carga:
 *
 * - **`import()` dinâmico.** O MathJax tem alguns MB; o Vite o separa num pedaço próprio, baixado
 *   na primeira fórmula, e quem nunca abre um texto rico não paga por ele.
 * - **Faixas da fonte listadas à mão**, como no app: o MathJax pede a faixa por nome calculado
 *   (`asyncLoad`), e o Vite só embute `import()` com nome literal. Faixa fora da lista vira erro, e
 *   a fórmula aparece crua.
 * - **Sem quebra em linha** (`linebreaks.inline: false`): o MathJax 4 partiria a fórmula em linha
 *   em vários `<svg>`, e o app mostrava só o primeiro (medido no Android, 10/11).
 * - **Comando desconhecido é erro** (sem `noundefined`).
 *
 * O SVG sai com largura e altura em `ex`, que o navegador resolve pela fonte do texto ao redor.
 */

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

const FAIXAS: Record<string, () => Promise<unknown>> = {
  latin: () => import("@mathjax/mathjax-newcm-font/mjs/svg/dynamic/latin.js"),
  "latin-b": () => import("@mathjax/mathjax-newcm-font/mjs/svg/dynamic/latin-b.js"),
  "latin-i": () => import("@mathjax/mathjax-newcm-font/mjs/svg/dynamic/latin-i.js"),
  arrows: () => import("@mathjax/mathjax-newcm-font/mjs/svg/dynamic/arrows.js"),
  math: () => import("@mathjax/mathjax-newcm-font/mjs/svg/dynamic/math.js"),
  shapes: () => import("@mathjax/mathjax-newcm-font/mjs/svg/dynamic/shapes.js"),
  script: () => import("@mathjax/mathjax-newcm-font/mjs/svg/dynamic/script.js"),
  "double-struck": () => import("@mathjax/mathjax-newcm-font/mjs/svg/dynamic/double-struck.js"),
  calligraphic: () => import("@mathjax/mathjax-newcm-font/mjs/svg/dynamic/calligraphic.js"),
  fraktur: () => import("@mathjax/mathjax-newcm-font/mjs/svg/dynamic/fraktur.js"),
  monospace: () => import("@mathjax/mathjax-newcm-font/mjs/svg/dynamic/monospace.js"),
  "sans-serif": () => import("@mathjax/mathjax-newcm-font/mjs/svg/dynamic/sans-serif.js"),
};

/** Nomes das faixas embutidas, para o teste conferir que cada uma existe no pacote. */
export const FAIXAS_EMBUTIDAS = Object.keys(FAIXAS);

type Conversor = (tex: string, display: boolean) => Promise<string>;

let conversor: Promise<Conversor> | null = null;

async function montarConversor(): Promise<Conversor> {
  const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }] = await Promise.all([
    import("@mathjax/src/mjs/mathjax.js"),
    import("@mathjax/src/mjs/input/tex.js"),
    import("@mathjax/src/mjs/output/svg.js"),
    import("@mathjax/src/mjs/adaptors/liteAdaptor.js"),
    import("@mathjax/src/mjs/handlers/html.js"),
  ]);
  await Promise.all([
    import("@mathjax/src/mjs/input/tex/base/BaseConfiguration.js"),
    import("@mathjax/src/mjs/input/tex/ams/AmsConfiguration.js"),
    import("@mathjax/src/mjs/input/tex/newcommand/NewcommandConfiguration.js"),
    import("@mathjax/src/mjs/input/tex/noerrors/NoErrorsConfiguration.js"),
    import("@mathjax/src/mjs/input/tex/mhchem/MhchemConfiguration.js"),
    import("@mathjax/src/mjs/input/tex/physics/PhysicsConfiguration.js"),
    import("@mathjax/src/mjs/input/tex/boldsymbol/BoldsymbolConfiguration.js"),
    import("@mathjax/src/mjs/input/tex/textmacros/TextMacrosConfiguration.js"),
    import("@mathjax/src/mjs/input/tex/cancel/CancelConfiguration.js"),
    import("@mathjax/src/mjs/input/tex/units/UnitsConfiguration.js"),
  ]);
  const [{ MathJaxNewcmFont }, { MathJaxMhchemFontExtension }] = await Promise.all([
    import("@mathjax/mathjax-newcm-font/mjs/svg.js"),
    import("@mathjax/mathjax-mhchem-font-extension/mjs/svg.js"),
  ]);

  MathJaxNewcmFont.addExtension(MathJaxMhchemFontExtension);
  mathjax.asyncLoad = (nome: string) => {
    const faixa = nome.split("/").pop()?.replace(/\.js$/, "") ?? nome;
    const carregar = FAIXAS[faixa];
    return carregar ? carregar() : Promise.reject(new Error(`faixa da fonte não embutida: ${faixa}`));
  };

  const adaptador = liteAdaptor();
  RegisterHTMLHandler(adaptador);
  const documento = mathjax.document("", {
    InputJax: new TeX({ packages: [...PACOTES] }),
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

/** A fórmula já convertida, sem esperar: a prévia desenha o SVG no primeiro quadro. */
export function formulaJaConvertida(tex: string, opcoes: { display?: boolean } = {}): ResultadoFormula | null {
  return cache.get(`${opcoes.display === true ? "B" : "I"}|${tex}`) ?? null;
}

export async function formulaParaSvg(tex: string, opcoes: { display?: boolean } = {}): Promise<ResultadoFormula> {
  const display = opcoes.display === true;
  const chave = `${display ? "B" : "I"}|${tex}`;
  const lembrado = cache.get(chave);
  if (lembrado) return lembrar(chave, lembrado);
  if (tex.trim() === "") return { erro: "fórmula vazia" };
  try {
    conversor ??= montarConversor();
    const converter = await conversor;
    return lembrar(chave, extrairSvg(await converter(tex, display)));
  } catch (falha) {
    // Não guarda no cache: uma falha de carga pode ser passageira, e a próxima tentativa é barata.
    // A carga que falhou também não fica guardada, senão nenhuma fórmula voltaria a funcionar.
    if (falha instanceof Error && /import|fetch|module/i.test(falha.message)) conversor = null;
    return { erro: falha instanceof Error ? falha.message : String(falha) };
  }
}

/** Só para teste. */
export function tamanhoDoCacheDeFormulas(): number {
  return cache.size;
}
