// O LaTeX do teclado do app vira a sintaxe do mathjs (spec B, 10/11).
//
// Só o que o teclado escreve: `\frac`, `\sqrt` (com e sem índice), `\cdot`, `\times`, `\div`,
// `\left`/`\right`, `^{}`, `_{}`, `\pi` e as funções elementares. Comando que não estiver aqui é
// erro: a conferência devolve `expressao_invalida`, nunca um palpite sobre o que o aluno quis.
//
// Puro e sem import, para o vitest do frontend e para o Deno da edge.

const SIMBOLOS: Record<string, string> = {
  cdot: "*",
  times: "*",
  ast: "*",
  div: "/",
  pi: "pi",
  sin: "sin",
  cos: "cos",
  tan: "tan",
  arcsin: "asin",
  arccos: "acos",
  arctan: "atan",
  ln: "log",
  // Em sala, `log` sem base é decimal.
  log: "log10",
  exp: "exp",
  left: "",
  right: "",
};

// `\,` `\;` `\:` `\!` e `\ ` são só espaço.
const ESPACOS = new Set([",", ";", ":", "!", " "]);

const UNICODE: Array<[RegExp, string]> = [
  [/[·∙×]/g, "*"],
  [/÷/g, "/"],
  [/[−–]/g, "-"],
  [/π/g, "pi"],
  [/²/g, "^2"],
  [/³/g, "^3"],
];

export class LatexInvalido extends Error {}

/** Tira `\( \)`, `\[ \]` e `$` das pontas e do meio. */
export function semDelimitadores(texto: string): string {
  return texto.replace(/\\[()[\]]/g, " ").replace(/\$/g, " ").trim();
}

export function latexParaMathjs(entrada: string): string {
  let texto = semDelimitadores(entrada);
  for (const [padrao, troca] of UNICODE) texto = texto.replace(padrao, troca);
  // Vírgula decimal (`2,5`) vira ponto. `{,}` é a vírgula decimal escrita em LaTeX.
  texto = texto.replace(/\{,\}/g, ",").replace(/(\d),(\d)/g, "$1.$2");
  // Valor absoluto sem aninhar: |x| vira abs(x).
  texto = texto.replace(/\\left\|/g, "|").replace(/\\right\|/g, "|").replace(/\|([^|]+)\|/g, "abs($1)");
  const leitor = { texto, i: 0 };
  const saida = lerAte(leitor, null);
  return saida;
}

type Leitor = { texto: string; i: number };

function lerAte(leitor: Leitor, fim: string | null): string {
  let saida = "";
  while (leitor.i < leitor.texto.length) {
    const c = leitor.texto[leitor.i];
    if (fim !== null && c === fim) {
      leitor.i += 1;
      return saida;
    }
    if (c === "\\") {
      saida += lerComando(leitor);
    } else if (c === "{") {
      leitor.i += 1;
      saida += `(${lerAte(leitor, "}")})`;
    } else if (c === "}") {
      throw new LatexInvalido("chave fechada sem abrir");
    } else if (c === "_") {
      leitor.i += 1;
      saida += `_${lerIndice(leitor)}`;
    } else {
      saida += c;
      leitor.i += 1;
    }
  }
  if (fim !== null) throw new LatexInvalido(`faltou ${fim}`);
  return saida;
}

function lerGrupo(leitor: Leitor): string {
  while (leitor.texto[leitor.i] === " ") leitor.i += 1;
  if (leitor.texto[leitor.i] !== "{") throw new LatexInvalido("esperava {");
  leitor.i += 1;
  return lerAte(leitor, "}");
}

function lerIndice(leitor: Leitor): string {
  const indice = leitor.texto[leitor.i] === "{" ? lerGrupo(leitor) : leitor.texto[leitor.i++] ?? "";
  if (!/^[A-Za-z0-9]+$/.test(indice)) throw new LatexInvalido("índice que não é nome");
  return indice;
}

function lerComando(leitor: Leitor): string {
  leitor.i += 1; // a barra
  const proximo = leitor.texto[leitor.i] ?? "";
  if (ESPACOS.has(proximo)) {
    leitor.i += 1;
    return " ";
  }
  const nome = /^[A-Za-z]+/.exec(leitor.texto.slice(leitor.i))?.[0] ?? "";
  if (!nome) throw new LatexInvalido("barra solta");
  leitor.i += nome.length;
  if (nome === "frac" || nome === "dfrac" || nome === "tfrac") {
    const numerador = lerGrupo(leitor);
    const denominador = lerGrupo(leitor);
    return `((${numerador})/(${denominador}))`;
  }
  if (nome === "sqrt") {
    let indice: string | null = null;
    if (leitor.texto[leitor.i] === "[") {
      const fecha = leitor.texto.indexOf("]", leitor.i);
      if (fecha < 0) throw new LatexInvalido("faltou ]");
      indice = latexParaMathjs(leitor.texto.slice(leitor.i + 1, fecha));
      leitor.i = fecha + 1;
    }
    const radicando = lerGrupo(leitor);
    return indice === null ? `sqrt((${radicando}))` : `nthRoot((${radicando}), (${indice}))`;
  }
  if (nome in SIMBOLOS) return SIMBOLOS[nome];
  throw new LatexInvalido(`comando desconhecido: ${nome}`);
}
