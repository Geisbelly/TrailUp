// Conferência da numérica e da expressão, sem IA (spec B, PR 2).
//
// O mathjs chega por parâmetro: o vitest usa o pacote do frontend, a edge usa
// `npm:mathjs@15.2.0`, a mesma versão exata. O tipo abaixo é só o pedaço que este arquivo usa,
// para o núcleo não importar nada além dos vizinhos.
//
// Ao aluno sai `correta` e, no máximo, um de dois motivos: `unidade_incompativel` ou
// `expressao_invalida`. Nunca "perto", "quase" ou "fora da tolerância": isso ajudaria a achar o
// valor por tentativa. E nunca nada da esperada (há teste que procura).

import { LatexInvalido, latexParaMathjs, semDelimitadores } from "./latexParaMathjs.ts";
import { equacoesIguais, lerEquacao, QuimicaInvalida } from "./quimica.ts";

export interface MathNode {
  type: string;
  name?: string;
  op?: string;
  fn?: unknown;
  value?: unknown;
  args?: MathNode[];
  traverse(visitar: (no: MathNode, caminho: string, pai: MathNode | null) => void): void;
  compile(): { evaluate(escopo?: Record<string, number>): unknown };
}

export interface Unidade {
  value: number | null;
  equalBase(outra: Unidade): boolean;
  toNumber(unidade?: string): number;
  formatUnits(): string;
}

export interface MathJs {
  parse(texto: string): MathNode;
  unit(texto: string): Unidade;
}

export type Motivo = "unidade_incompativel" | "expressao_invalida";
export type Conferencia = { correta: boolean; motivo?: Motivo };

/** A esperada (ou os critérios) do professor não serve: é erro do gabarito, não do aluno. */
export class EsperadaInvalida extends Error {}

export interface ContextoDaConferencia {
  tipo: string;
  respostaEsperada: string;
  criterios: Record<string, unknown> | null;
  configResposta: Record<string, unknown> | null;
}

const LIMITE_DA_RESPOSTA = 500;
const LIMITE_DE_NOS = 200;
const INVALIDA: Conferencia = { correta: false, motivo: "expressao_invalida" };
const INCOMPATIVEL: Conferencia = { correta: false, motivo: "unidade_incompativel" };

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null;
}

/** O que `questao_conferencia_contexto` devolve, sem confiar na forma. */
export function lerContextoDaConferencia(bruto: unknown): ContextoDaConferencia {
  const linha = objeto(bruto) ?? {};
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    tipo: texto(linha.tipo),
    respostaEsperada: texto(linha.resposta_esperada),
    criterios: objeto(linha.criterios),
    configResposta: objeto(linha.config_resposta),
  };
}

// ---------------------------------------------------------------------------------- numérica

const NUMERO = /^[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i;

/** Texto do aluno (ou do professor) no formato que `math.unit` lê. */
function normalizarNumero(entrada: string): string {
  let t = semDelimitadores(entrada)
    .replace(/\\(?:mathrm|text|operatorname|textrm)\s*\{([^{}]*)\}/g, " $1 ")
    .replace(/\{,\}/g, ",")
    .replace(/\\[,;: !]/g, " ")
    .replace(/[−–]/g, "-")
    .replace(/\^\{(-?\d+)\}/g, "^$1")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/°C/g, "degC")
    .replace(/°F/g, "degF")
    .replace(/°/g, "deg")
    .trim();
  // Separador de milhar com vírgula decimal (1.500,5); senão, a vírgula é a decimal.
  if (/\d\.\d{3}(?:\D|$)/.test(t) && /\d,\d/.test(t)) t = t.replace(/(\d)\.(?=\d{3})/g, "$1");
  t = t.replace(/(\d),(\d)/g, "$1.$2");
  // 1.5 × 10^3, 1.5·10^-3 e 1.5*10^3 viram 1.5e3.
  t = t.replace(/(\d)\s*(?:[·∙×*]|\\cdot|\\times)\s*10\s*\^\s*\(?([+-]?\d+)\)?/g, "$1e$2");
  return t.replace(/\s+/g, " ");
}

type Valor = { numero: number; unidade: Unidade | null };

function lerValor(math: MathJs, entrada: string): Valor | null {
  const t = normalizarNumero(entrada);
  if (!t || t.length > LIMITE_DA_RESPOSTA) return null;
  if (NUMERO.test(t)) return { numero: Number(t), unidade: null };
  // Só número seguido de unidade: nada de expressão, função ou atribuição.
  if (!/^[+-]?\d/.test(t) || /[;=,"'[\]{}]/.test(t)) return null;
  try {
    const unidade = math.unit(t);
    if (unidade.value === null || !Number.isFinite(unidade.value)) return null;
    return { numero: unidade.value, unidade };
  } catch {
    return null;
  }
}

function lerTolerancia(criterios: Record<string, unknown>): { valor: number; absoluta: boolean } {
  const valor = Number(criterios.tolerancia);
  return {
    valor: Number.isFinite(valor) && valor >= 0 ? valor : 0,
    absoluta: criterios.tipo_tolerancia === "absoluta",
  };
}

export function conferirNumerica(
  math: MathJs,
  resposta: string,
  esperada: string,
  criterios: Record<string, unknown>,
): Conferencia {
  const alvo = lerValor(math, esperada);
  if (!alvo) throw new EsperadaInvalida("esperada da numérica não é número");
  const dada = lerValor(math, resposta);
  if (!dada) return INVALIDA;
  if (!alvo.unidade !== !dada.unidade) return INCOMPATIVEL;

  let valorDado = dada.numero;
  let valorAlvo = alvo.numero;
  if (alvo.unidade && dada.unidade) {
    if (!dada.unidade.equalBase(alvo.unidade)) return INCOMPATIVEL;
    // Na unidade da esperada: é nela que a tolerância absoluta foi escrita.
    const unidadeAlvo = alvo.unidade.formatUnits();
    valorDado = dada.unidade.toNumber(unidadeAlvo);
    valorAlvo = alvo.unidade.toNumber(unidadeAlvo);
  }
  const { valor, absoluta } = lerTolerancia(criterios);
  const diferenca = Math.abs(valorDado - valorAlvo);
  const limite = absoluta || valorAlvo === 0 ? valor : valor * Math.abs(valorAlvo);
  // O piso é o arredondamento do ponto flutuante (36 km/h → 9.999999999999998 m/s).
  return { correta: diferenca <= Math.max(limite, 1e-9 * Math.max(1, Math.abs(valorAlvo))) };
}

// ---------------------------------------------------------------------------------- expressão

const FUNCOES = new Set(["sqrt", "nthRoot", "sin", "cos", "tan", "asin", "acos", "atan", "log", "log10", "exp", "abs"]);
const OPERADORES = new Set(["add", "subtract", "multiply", "divide", "pow", "unaryMinus", "unaryPlus"]);
const CONSTANTES: Record<string, number> = { pi: Math.PI, e: Math.E };

class ExpressaoInvalida extends Error {}

type Expressao = { avaliar(escopo: Record<string, number>): number | null; simbolos: Set<string> };

/** Parse com lista de permissão: só número, variável, operador aritmético e função elementar. */
function lerExpressao(math: MathJs, entrada: string): Expressao {
  if (!entrada.trim() || entrada.length > LIMITE_DA_RESPOSTA) throw new ExpressaoInvalida("vazia ou longa");
  let texto: string;
  try {
    texto = latexParaMathjs(entrada);
  } catch (erro) {
    if (erro instanceof LatexInvalido) throw new ExpressaoInvalida(erro.message);
    throw erro;
  }
  let raiz: MathNode;
  try {
    raiz = math.parse(texto);
  } catch {
    throw new ExpressaoInvalida("não parseia");
  }
  const simbolos = new Set<string>();
  let nos = 0;
  raiz.traverse((no, caminho, pai) => {
    nos += 1;
    switch (no.type) {
      case "ConstantNode":
        if (typeof no.value !== "number") throw new ExpressaoInvalida("constante que não é número");
        return;
      case "ParenthesisNode":
        return;
      case "OperatorNode":
        if (typeof no.fn !== "string" || !OPERADORES.has(no.fn)) throw new ExpressaoInvalida("operador");
        return;
      case "FunctionNode": {
        const fn = no.fn as MathNode | undefined;
        if (fn?.type !== "SymbolNode" || !FUNCOES.has(fn.name ?? "")) throw new ExpressaoInvalida("função");
        const aridade = no.args?.length ?? 0;
        if (aridade < 1 || aridade > (fn.name === "log" || fn.name === "nthRoot" ? 2 : 1)) {
          throw new ExpressaoInvalida("aridade");
        }
        return;
      }
      case "SymbolNode":
        // O nome da função também é um SymbolNode, filho em `fn`.
        if (pai?.type === "FunctionNode" && caminho === "fn") return;
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(no.name ?? "")) throw new ExpressaoInvalida("nome");
        if (!((no.name ?? "") in CONSTANTES)) simbolos.add(no.name ?? "");
        return;
      default:
        throw new ExpressaoInvalida(no.type);
    }
  });
  if (nos > LIMITE_DE_NOS) throw new ExpressaoInvalida("grande demais");
  const compilada = raiz.compile();
  return {
    simbolos,
    avaliar(escopo) {
      try {
        const valor = compilada.evaluate({ ...CONSTANTES, ...escopo });
        return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
      } catch {
        return null;
      }
    },
  };
}

/** Sorteio com semente (mulberry32): a mesma questão sorteia os mesmos pontos em toda tentativa. */
function sorteador(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerDominio(criterios: Record<string, unknown>): [number, number] {
  const d = criterios.dominio;
  if (Array.isArray(d) && d.length === 2) {
    const [a, b] = d.map(Number);
    if (Number.isFinite(a) && Number.isFinite(b) && a < b) return [a, b];
  }
  return [-10, 10];
}

function lerPontos(criterios: Record<string, unknown>): number {
  const n = Number(criterios.pontos);
  return Number.isInteger(n) ? Math.min(200, Math.max(5, n)) : 20;
}

function variaveisDaConfig(config: Record<string, unknown>): string[] | null {
  const v = config.variaveis;
  if (!Array.isArray(v) || v.length === 0) return null;
  return v.filter((x): x is string => typeof x === "string" && /^[A-Za-z][A-Za-z0-9_]*$/.test(x));
}

export function conferirExpressao(
  math: MathJs,
  resposta: string,
  esperada: string,
  criterios: Record<string, unknown>,
  config: Record<string, unknown>,
  semente: number,
): Conferencia {
  let alvo: Expressao;
  try {
    alvo = lerExpressao(math, esperada);
  } catch (erro) {
    if (erro instanceof ExpressaoInvalida) throw new EsperadaInvalida("esperada da expressão não parseia");
    throw erro;
  }
  let dada: Expressao;
  try {
    dada = lerExpressao(math, resposta);
  } catch (erro) {
    if (erro instanceof ExpressaoInvalida) return INVALIDA;
    throw erro;
  }
  const variaveis = variaveisDaConfig(config) ?? [...alvo.simbolos].sort();
  // Variável que a questão não tem: errado, sem motivo (não é forma inválida, é outra resposta).
  for (const simbolo of dada.simbolos) if (!variaveis.includes(simbolo)) return { correta: false };

  const [de, ate] = lerDominio(criterios);
  const pontos = lerPontos(criterios);
  const sortear = sorteador(semente);
  let definidos = 0;
  for (let i = 0; i < pontos; i += 1) {
    const escopo: Record<string, number> = {};
    for (const nome of variaveis) escopo[nome] = de + (ate - de) * sortear();
    const f = dada.avaliar(escopo);
    const g = alvo.avaliar(escopo);
    if (f === null || g === null) continue;
    definidos += 1;
    if (Math.abs(f - g) >= 1e-9 * Math.max(1, Math.abs(g))) return { correta: false };
  }
  return { correta: definidos * 2 >= pontos };
}

// ---------------------------------------------------------------------------------- química

export function conferirQuimica(resposta: string, esperada: string): Conferencia {
  let alvo;
  try {
    alvo = lerEquacao(esperada);
  } catch (erro) {
    if (erro instanceof QuimicaInvalida) throw new EsperadaInvalida("esperada da química não é fórmula");
    throw erro;
  }
  try {
    return { correta: equacoesIguais(lerEquacao(resposta), alvo) };
  } catch (erro) {
    if (erro instanceof QuimicaInvalida) return INVALIDA;
    throw erro;
  }
}

function ehQuimica(contexto: ContextoDaConferencia): boolean {
  return contexto.configResposta?.quimica === true || /\\ce\s*\{/.test(contexto.respostaEsperada);
}

/**
 * Confere pelo tipo. `semente` é o id da questão. Levanta `EsperadaInvalida` quando o problema é
 * do gabarito: a edge não grava nada nesse caso.
 */
export function conferir(math: MathJs, contexto: ContextoDaConferencia, resposta: string, semente: number): Conferencia {
  if (!contexto.respostaEsperada) throw new EsperadaInvalida("sem esperada");
  const criterios = contexto.criterios ?? {};
  if (contexto.tipo === "numerica") return conferirNumerica(math, resposta, contexto.respostaEsperada, criterios);
  if (contexto.tipo === "expressao") {
    return ehQuimica(contexto)
      ? conferirQuimica(resposta, contexto.respostaEsperada)
      : conferirExpressao(math, resposta, contexto.respostaEsperada, criterios, contexto.configResposta ?? {}, semente);
  }
  throw new EsperadaInvalida(`tipo não conferido aqui: ${contexto.tipo}`);
}
