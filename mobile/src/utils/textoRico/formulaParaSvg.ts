/**
 * Converte uma fórmula TeX em SVG, no aparelho e sem rede (spec A, 08/11).
 *
 * MathJax 4 (`@mathjax/src`) com a fonte New Computer Modern. Três escolhas que não são óbvias:
 *
 * - **Carregamento tardio.** Nada do MathJax é baixado nem avaliado até a primeira fórmula: o miolo
 *   mora em `conversorMathJax.ts`, carregado por `import()`. Na web ele vira um pedaço à parte do
 *   export; no celular o Metro o embute no bundle, e só a avaliação espera.
 * - **Faixas da fonte embutidas à mão.** A fonte base cobre o essencial; o resto vem em faixas que o
 *   MathJax pede sob demanda por `asyncLoad`. O Metro não resolve `require` com nome calculado, então
 *   as faixas que um corpus escolar pede (medido em 08/11: acento em `\text{ação}`, `\mathbb`,
 *   `\mathcal`, `\mathbf`, setas, ângulo, `\star`…) estão listadas em `FAIXAS`, em `conversorMathJax.ts`. Faixa fora da lista
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

// Só o tipo: um import de valor levaria o MathJax para o pedaço de quem importa este arquivo.
import type { Conversor } from "./conversorMathJax";

export const EX_POR_EM = 0.5;

export type FormulaSvg = {
  svg: string;
  /** Largura, altura e deslocamento vertical (negativo desce), em ex. */
  largura: number;
  altura: number;
  alinhamento: number;
};

export type ResultadoFormula = FormulaSvg | { erro: string };

let conversor: Promise<Conversor> | null = null;

/**
 * Carrega o MathJax na primeira fórmula, por `import()` (ver `conversorMathJax.ts`). A promessa fica
 * guardada para as fórmulas da mesma tela não pedirem o pedaço várias vezes; se a carga falhar (rede
 * caiu no meio do download, na web), ela é esquecida e a próxima fórmula tenta de novo.
 */
function obterConversor(): Promise<Conversor> {
  conversor ??= import("./conversorMathJax")
    .then((modulo) => modulo.criarConversor())
    .catch((falha: unknown) => {
      conversor = null;
      throw falha;
    });
  return conversor;
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
    const converter = await obterConversor();
    return lembrar(chave, extrairSvg(await converter(tex, display)));
  } catch (falha) {
    // Não guarda no cache: uma falha de carga pode ser passageira, e a próxima tentativa é barata.
    return { erro: falha instanceof Error ? falha.message : String(falha) };
  }
}

/** Só para teste. */
export function tamanhoDoCacheDeFormulas(): number {
  return cache.size;
}
