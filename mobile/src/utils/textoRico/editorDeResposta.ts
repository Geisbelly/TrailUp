/**
 * O que os editores de código, número e expressão precisam, sem React (spec B, PR 5).
 *
 * - `formaDaResposta`: qual editor a questão abre. Vale o tipo da questão e o da atividade, nos
 *   dois idiomas que o banco aceita (`codigo`/`code`, `numerica`/`numeric`,
 *   `expressao`/`expression`).
 * - `inserirNoCursor`: a tecla da barra entra onde o cursor está, envolve o que estiver
 *   selecionado e deixa o cursor dentro do par (`\frac{|}{}`, `(|)`).
 * - Os atalhos da expressão são **só** o que a edge `questao-conferir-resposta` lê
 *   (`latexParaMathjs.ts` e `quimica.ts`). Letra grega além de `\pi`, `\pm` e `\rightarrow` ela
 *   recusa como `expressao_invalida`: oferecer a tecla seria levar o aluno a errar pelo teclado.
 */

export type FormaDaResposta = "codigo" | "numerica" | "expressao";

const FORMAS: Record<string, FormaDaResposta> = {
  codigo: "codigo",
  code: "codigo",
  numerica: "numerica",
  numeric: "numerica",
  expressao: "expressao",
  expression: "expressao",
};

/** O primeiro tipo reconhecido manda. Passe o da questão antes do da atividade. */
export function formaDaResposta(...tipos: unknown[]): FormaDaResposta | null {
  for (const tipo of tipos) {
    const chave = String(tipo ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    if (FORMAS[chave]) return FORMAS[chave];
  }
  return null;
}

/** Linguagens em que o costume é recuar 2 espaços. O resto (Python, Java, C, C++, C#…) usa 4. */
const RECUO_DE_DOIS = new Set(["javascript", "js", "typescript", "ts", "html", "css", "sql", "json"]);

export function recuoDaLinguagem(linguagem: unknown): string {
  const nome = String(linguagem ?? "").trim().toLowerCase();
  return RECUO_DE_DOIS.has(nome) ? "  " : "    ";
}

export type Selecao = { start: number; end: number };

/**
 * Põe `antes` e `depois` em volta da seleção. Sem seleção, o cursor fica entre os dois; com
 * seleção, logo depois do texto envolvido. Seleção fora do texto (o Android às vezes manda a de
 * antes de um `setState`) é presa às pontas.
 */
export function inserirNoCursor(
  texto: string,
  selecao: Selecao | null | undefined,
  antes: string,
  depois = "",
): { texto: string; selecao: Selecao } {
  const tamanho = texto.length;
  const prender = (n: unknown) => Math.max(0, Math.min(tamanho, Number.isFinite(Number(n)) ? Number(n) : tamanho));
  const a = prender(selecao?.start);
  const b = prender(selecao?.end);
  const inicio = Math.min(a, b);
  const fim = Math.max(a, b);
  const meio = texto.slice(inicio, fim);
  const novo = texto.slice(0, inicio) + antes + meio + depois + texto.slice(fim);
  const cursor = inicio + antes.length + meio.length;
  return { texto: novo, selecao: { start: cursor, end: cursor } };
}

export type Tecla = { rotulo: string; leitura: string; antes: string; depois?: string };

export const TECLAS_DE_CODIGO: Tecla[] = [
  { rotulo: "{ }", leitura: "chaves", antes: "{", depois: "}" },
  { rotulo: "( )", leitura: "parênteses", antes: "(", depois: ")" },
  { rotulo: "[ ]", leitura: "colchetes", antes: "[", depois: "]" },
  { rotulo: ";", leitura: "ponto e vírgula", antes: ";" },
  { rotulo: ":", leitura: "dois pontos", antes: ":" },
  { rotulo: "=", leitura: "igual", antes: "=" },
  { rotulo: '"', leitura: "aspas", antes: '"', depois: '"' },
];

export const TECLAS_DA_EXPRESSAO: Tecla[] = [
  { rotulo: "a/b", leitura: "fração", antes: "\\frac{", depois: "}{}" },
  { rotulo: "xⁿ", leitura: "potência", antes: "^{", depois: "}" },
  { rotulo: "√", leitura: "raiz", antes: "\\sqrt{", depois: "}" },
  { rotulo: "xₙ", leitura: "índice", antes: "_{", depois: "}" },
  { rotulo: "·", leitura: "vezes", antes: " \\cdot " },
  { rotulo: "( )", leitura: "parênteses", antes: "(", depois: ")" },
  { rotulo: "π", leitura: "pi", antes: "\\pi " },
  { rotulo: "→", leitura: "seta de reação", antes: " → " },
  { rotulo: "Química", leitura: "fórmula química", antes: "\\ce{", depois: "}" },
];

/**
 * Atalhos de unidade por `config_resposta.dimensao`. Só unidade que a edge lê: o mathjs entende
 * todas, e `°C`, `²` e `³` ela converte antes (`conferir.ts`). Dimensão desconhecida: sem atalho.
 */
const UNIDADES: Record<string, string[]> = {
  comprimento: ["m", "cm", "mm", "km"],
  massa: ["kg", "g", "mg", "t"],
  tempo: ["s", "min", "h"],
  velocidade: ["m/s", "km/h"],
  aceleracao: ["m/s²"],
  forca: ["N", "kN"],
  energia: ["J", "kJ", "cal", "kcal", "kWh"],
  trabalho: ["J", "kJ"],
  potencia: ["W", "kW"],
  pressao: ["Pa", "kPa", "atm", "mmHg"],
  temperatura: ["°C", "K"],
  area: ["m²", "cm²", "km²"],
  volume: ["m³", "L", "mL", "cm³"],
  densidade: ["kg/m³", "g/cm³", "g/mL"],
  frequencia: ["Hz", "kHz"],
  carga: ["C", "mC"],
  corrente: ["A", "mA"],
  tensao: ["V", "mV", "kV"],
  resistencia: ["ohm", "kohm"],
  quantidade: ["mol"],
  concentracao: ["mol/L", "g/L"],
};

export function unidadesDaDimensao(dimensao: unknown): string[] {
  const chave = String(dimensao ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return UNIDADES[chave] ?? [];
}

/** Uma unidade no fim do número, trocando a que já estiver lá (`10 km/h` + `m/s` = `10 m/s`). */
export function trocarUnidade(texto: string, unidade: string): string {
  const numero = /^\s*[-+]?[\d.,]*(?:\s*(?:[·×*]|e)\s*10\s*\^?\s*[-+]?\d+|e[-+]?\d+)?/i.exec(texto)?.[0]?.trim() ?? "";
  return numero ? `${numero} ${unidade}` : `${texto.trim()} ${unidade}`.trim();
}

/** A expressão digitada vira fórmula na prévia. Quem já pôs `$` escolheu onde ela começa. */
export function previaDaExpressao(texto: string): string {
  const limpo = texto.trim();
  if (!limpo) return "";
  return limpo.includes("$") ? limpo : `$${limpo}$`;
}
