// Equação química lida em espécies com coeficiente, por lado da seta (spec B, 10/11).
//
// Aceita `\ce{2H2 + O2 -> 2H2O}` (mhchem, como o professor escreve) e texto (`2H2 + O2 -> 2H2O`,
// `H_2O`, `2 H_{2}O`, `→`). Duas equações são iguais quando cada lado tem as mesmas espécies com os
// mesmos coeficientes, em qualquer ordem, e a seta é do mesmo tipo.
//
// O que fica de fora, de propósito:
// - estado físico (`(aq)`, `(s)`, `(l)`, `(g)`) não conta;
// - a equação multiplicada por uma constante é outra (4H2 + 2O2 -> 4H2O não é 2H2 + O2 -> 2H2O);
// - maiúscula conta: CO é monóxido de carbono, Co é cobalto;
// - sem espaço em volta do `+`, `Na+Cl-` é lido como Na e Cl⁻. Com espaço (`Na+ + Cl-`), certo.
//
// Puro e sem import, para o vitest do frontend e para o Deno da edge.

export type Seta = "->" | "<-" | "<=>";

export interface Equacao {
  seta: Seta | null;
  /** Por lado, a espécie canônica e o coeficiente somado, em ordem alfabética. */
  lados: Array<Array<[string, number]>>;
}

export class QuimicaInvalida extends Error {}

const ESTADO = /\((?:aq|s|l|g)\)$/;

function semInvolucro(texto: string): string {
  let t = texto.replace(/\\[()[\]]/g, " ").replace(/\$/g, " ").trim();
  const ce = /^\\ce\s*\{([\s\S]*)\}$/.exec(t);
  if (ce) t = ce[1].trim();
  return t
    .replace(/[→⟶]/g, "->")
    .replace(/←/g, "<-")
    .replace(/[⇌⇄]|<->/g, "<=>")
    .replace(/[−–]/g, "-");
}

/** H_{2}O, H_2O e H2O dão H2O; ^{2-}, ^2- e o 2- do fim dão ^2-. */
function especieCanonica(bruta: string): string {
  let t = bruta.replace(/\s+/g, "").replace(ESTADO, "");
  t = t.replace(/_\{([0-9]+)\}/g, "$1").replace(/_([0-9]+)/g, "$1");
  let carga = "";
  const comChapeu = /\^\{?([0-9]*[+-])\}?$/.exec(t);
  if (comChapeu) {
    carga = comChapeu[1];
    t = t.slice(0, comChapeu.index);
  } else {
    // mhchem: o sinal colado no fim é carga (Na+, Cl-, Fe3+).
    const colada = /^(.*?[A-Za-z)\]])([0-9]*[+-])$/.exec(t);
    if (colada) {
      t = colada[1];
      carga = colada[2];
    }
  }
  if (carga.startsWith("1") && carga.length === 2) carga = carga.slice(1);
  if (t === "e" && carga === "-") return "e^-";
  // Símbolo de elemento: maiúscula e no máximo uma minúscula. Parênteses e colchetes com índice.
  if (!/^[A-Z([]/.test(t) || !/^(?:[A-Z][a-z]?[0-9]*|[()[\]][0-9]*|[·.*][0-9]*)+$/.test(t)) {
    throw new QuimicaInvalida("espécie que não é fórmula");
  }
  return carga ? `${t}^${carga}` : t;
}

function lerLado(lado: string): Array<[string, number]> {
  const texto = lado.trim();
  if (!texto) throw new QuimicaInvalida("lado vazio");
  const partes = /\s\+\s/.test(texto)
    ? texto.split(/\s+\+\s+/)
    : texto.split(/\+(?=\s*[0-9]*\s*[A-Z([])/);
  const soma = new Map<string, number>();
  for (const parte of partes) {
    const m = /^([0-9]+(?:[.,][0-9]+)?|[0-9]+\/[0-9]+)?\s*(.+)$/.exec(parte.trim());
    if (!m) throw new QuimicaInvalida("parte vazia");
    const [, coeficienteBruto, especieBruta] = m;
    let coeficiente = 1;
    if (coeficienteBruto) {
      const [a, b] = coeficienteBruto.replace(",", ".").split("/");
      coeficiente = b === undefined ? Number(a) : Number(a) / Number(b);
    }
    if (!Number.isFinite(coeficiente) || coeficiente <= 0) throw new QuimicaInvalida("coeficiente");
    const especie = especieCanonica(especieBruta);
    soma.set(especie, (soma.get(especie) ?? 0) + coeficiente);
  }
  return [...soma.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

export function lerEquacao(entrada: string): Equacao {
  const texto = semInvolucro(entrada);
  if (!texto || texto.length > 500) throw new QuimicaInvalida("vazia ou longa demais");
  const pedacos = texto.split(/\s*(<=>|<-|->)\s*/);
  if (pedacos.length > 3) throw new QuimicaInvalida("mais de uma seta");
  if (pedacos.length === 1) return { seta: null, lados: [lerLado(pedacos[0])] };
  return { seta: pedacos[1] as Seta, lados: [lerLado(pedacos[0]), lerLado(pedacos[2])] };
}

export function equacoesIguais(a: Equacao, b: Equacao): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
