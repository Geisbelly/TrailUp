// O gabarito das questões de código, numérica e expressão no editor do professor (spec B, PR 4).
//
// Três destinos, e a separação é o ponto:
// - `questoes.config_resposta`: o que o aluno precisa para responder (linguagem, variáveis,
//   dimensão). O aluno lê `questoes`, então nada aqui pode ajudar a achar a resposta;
// - `questao_gabarito.resposta_correta`: a esperada (código de referência, valor, expressão);
// - `questao_gabarito.criterios`: tolerância, domínio e critérios do código.
// As duas últimas só o professor e o servidor leem. `questoes.resposta_correta` fica NULL (CHECK
// `questoes_gabarito_fora_dos_tipos_novos`).
//
// Puro: o formulário entra como texto e sai validado no formato que a edge
// `questao-conferir-resposta` e a `validate-essay-answer-ai` leem.

import type { FormatoNoServidor } from "./formatoDaQuestao";

export type FormularioDoGabarito = {
  linguagem: string;
  /** Código de referência, valor com unidade ou expressão esperada. */
  referencia: string;
  criterios: string[];
  tolerancia: string;
  tipoTolerancia: "relativa" | "absoluta";
  dimensao: string;
  /** Separadas por vírgula ou espaço. */
  variaveis: string;
  dominioDe: string;
  dominioAte: string;
};

export const FORMULARIO_PADRAO: FormularioDoGabarito = {
  linguagem: "",
  referencia: "",
  criterios: [],
  tolerancia: "",
  tipoTolerancia: "relativa",
  dimensao: "",
  variaveis: "",
  dominioDe: "-10",
  dominioAte: "10",
};

/** As linguagens do seletor. O valor é o que `nomeDaLinguagem` e o realce do app reconhecem. */
export const LINGUAGENS: { valor: string; rotulo: string }[] = [
  { valor: "python", rotulo: "Python" },
  { valor: "javascript", rotulo: "JavaScript" },
  { valor: "typescript", rotulo: "TypeScript" },
  { valor: "java", rotulo: "Java" },
  { valor: "c", rotulo: "C" },
  { valor: "cpp", rotulo: "C++" },
  { valor: "csharp", rotulo: "C#" },
  { valor: "sql", rotulo: "SQL" },
  { valor: "html", rotulo: "HTML" },
  { valor: "css", rotulo: "CSS" },
];

/**
 * As dimensões que dão atalho de unidade no app. A lista espelha `unidadesDaDimensao` em
 * `mobile/src/utils/textoRico/editorDeResposta.ts`; dimensão fora dela só não daria atalho.
 */
export const DIMENSOES: { valor: string; rotulo: string }[] = [
  { valor: "comprimento", rotulo: "Comprimento" },
  { valor: "massa", rotulo: "Massa" },
  { valor: "tempo", rotulo: "Tempo" },
  { valor: "velocidade", rotulo: "Velocidade" },
  { valor: "aceleracao", rotulo: "Aceleração" },
  { valor: "forca", rotulo: "Força" },
  { valor: "energia", rotulo: "Energia" },
  { valor: "trabalho", rotulo: "Trabalho" },
  { valor: "potencia", rotulo: "Potência" },
  { valor: "pressao", rotulo: "Pressão" },
  { valor: "temperatura", rotulo: "Temperatura" },
  { valor: "area", rotulo: "Área" },
  { valor: "volume", rotulo: "Volume" },
  { valor: "densidade", rotulo: "Densidade" },
  { valor: "frequencia", rotulo: "Frequência" },
  { valor: "carga", rotulo: "Carga elétrica" },
  { valor: "corrente", rotulo: "Corrente elétrica" },
  { valor: "tensao", rotulo: "Tensão elétrica" },
  { valor: "resistencia", rotulo: "Resistência elétrica" },
  { valor: "quantidade", rotulo: "Quantidade de matéria" },
  { valor: "concentracao", rotulo: "Concentração" },
];

export const MAXIMO_DE_CRITERIOS = 20;
export const MAXIMO_DE_VARIAVEIS = 6;
/** Pontos sorteados na conferência da expressão (a edge aceita de 5 a 200). */
const PONTOS_DA_EXPRESSAO = 20;
const TOLERANCIA_PADRAO = { tolerancia: 0.01, tipo_tolerancia: "relativa" as const };

export type GabaritoDoServidor = {
  configResposta: Record<string, unknown> | null;
  respostaCorreta: string;
  criterios: unknown;
};

// `erro?: undefined` e `gabarito?: undefined`: o console compila sem `strict`, e sem eles o TS não
// estreita a união pelo `ok`.
export type GabaritoMontado =
  | { ok: true; gabarito: GabaritoDoServidor; erro?: undefined }
  | { ok: false; erro: string; gabarito?: undefined };

const falha = (erro: string): GabaritoMontado => ({ ok: false, erro });

/** Número digitado no console, com vírgula ou ponto. `null` quando não é número. */
function numeroDigitado(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Sem o ruído do ponto flutuante: 2.5 / 100 vira 0.025, não 0.025000000000000001. */
const limpo = (n: number) => Number(n.toPrecision(12));

export const ehQuimica = (referencia: string) => /\\ce\s*\{/.test(referencia);

function montarCodigo(f: FormularioDoGabarito): GabaritoMontado {
  // Linha em branco antes e espaço no fim saem; o recuo da primeira linha fica.
  const referencia = f.referencia.replace(/^(?:[ \t]*\r?\n)+/, "").replace(/\s+$/, "");
  if (!referencia.trim()) return falha("Escreva o código de referência.");
  const linguagem = f.linguagem;
  if (linguagem && !LINGUAGENS.some((l) => l.valor === linguagem)) return falha("Escolha uma linguagem da lista.");
  const criterios = f.criterios.map((c) => c.trim()).filter(Boolean);
  if (criterios.length > MAXIMO_DE_CRITERIOS) return falha(`No máximo ${MAXIMO_DE_CRITERIOS} critérios.`);
  return {
    ok: true,
    gabarito: {
      configResposta: linguagem ? { linguagem } : null,
      respostaCorreta: referencia,
      criterios: criterios.length ? criterios : null,
    },
  };
}

function montarNumerica(f: FormularioDoGabarito): GabaritoMontado {
  const referencia = f.referencia.trim();
  if (!referencia) return falha("Escreva o valor esperado.");
  let criterios: { tolerancia: number; tipo_tolerancia: "relativa" | "absoluta" } = TOLERANCIA_PADRAO;
  if (f.tolerancia.trim()) {
    const valor = numeroDigitado(f.tolerancia);
    if (valor === null || valor < 0) return falha("A tolerância precisa ser um número maior ou igual a zero.");
    if (f.tipoTolerancia === "relativa") {
      if (valor > 100) return falha("A tolerância relativa vai de 0% a 100%.");
      criterios = { tolerancia: limpo(valor / 100), tipo_tolerancia: "relativa" };
    } else {
      criterios = { tolerancia: limpo(valor), tipo_tolerancia: "absoluta" };
    }
  }
  // Valor de seletor: comparado exato, sem `trim` (o que vier com quebra de linha não é da lista).
  const dimensao = f.dimensao;
  if (dimensao && !DIMENSOES.some((d) => d.valor === dimensao)) return falha("Escolha uma dimensão da lista.");
  return {
    ok: true,
    gabarito: { configResposta: dimensao ? { dimensao } : null, respostaCorreta: referencia, criterios },
  };
}

function montarExpressao(f: FormularioDoGabarito): GabaritoMontado {
  const referencia = f.referencia.trim();
  if (!referencia) return falha("Escreva a expressão esperada.");
  // Química confere por espécies e coeficientes: variável e domínio não valem.
  if (ehQuimica(referencia)) {
    return { ok: true, gabarito: { configResposta: null, respostaCorreta: referencia, criterios: null } };
  }
  const variaveis = f.variaveis.split(/[\s,]+/).filter(Boolean);
  if (variaveis.length > MAXIMO_DE_VARIAVEIS) return falha(`No máximo ${MAXIMO_DE_VARIAVEIS} variáveis.`);
  if (variaveis.some((v) => !/^[A-Za-z][A-Za-z0-9_]{0,19}$/.test(v))) {
    return falha("Cada variável começa com letra e tem só letras, números e _ (ex.: x, t, v0).");
  }
  const de = numeroDigitado(f.dominioDe);
  const ate = numeroDigitado(f.dominioAte);
  if (de === null || ate === null || de >= ate) return falha("O domínio precisa de um início menor que o fim.");
  return {
    ok: true,
    gabarito: {
      configResposta: variaveis.length ? { variaveis: Array.from(new Set(variaveis)) } : null,
      respostaCorreta: referencia,
      criterios: { dominio: [de, ate], pontos: PONTOS_DA_EXPRESSAO },
    },
  };
}

export function montarGabarito(formato: FormatoNoServidor, formulario: FormularioDoGabarito): GabaritoMontado {
  if (formato === "code") return montarCodigo(formulario);
  if (formato === "numeric") return montarNumerica(formulario);
  return montarExpressao(formulario);
}

const objeto = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const texto = (v: unknown) => (typeof v === "string" ? v : "");

export type LinhaDoGabarito = { resposta_correta: unknown; criterios: unknown; config_resposta: unknown } | null;

/** O inverso de `montarGabarito`, para abrir uma questão salva. O que vier torto volta ao padrão. */
export function formularioDoGabarito(formato: FormatoNoServidor, linha: LinhaDoGabarito): FormularioDoGabarito {
  if (!linha) return { ...FORMULARIO_PADRAO };
  const config = objeto(linha.config_resposta) ?? {};
  const criterios = objeto(linha.criterios) ?? {};
  const base = { ...FORMULARIO_PADRAO, referencia: texto(linha.resposta_correta) };
  if (formato === "code") {
    return {
      ...base,
      linguagem: texto(config.linguagem),
      criterios: Array.isArray(linha.criterios) ? linha.criterios.filter((c): c is string => typeof c === "string") : [],
    };
  }
  if (formato === "numeric") {
    const valor = Number(criterios.tolerancia);
    const absoluta = criterios.tipo_tolerancia === "absoluta";
    return {
      ...base,
      dimensao: texto(config.dimensao),
      tipoTolerancia: absoluta ? "absoluta" : "relativa",
      tolerancia: Number.isFinite(valor) && valor >= 0 ? String(limpo(absoluta ? valor : valor * 100)) : "",
    };
  }
  const dominio = Array.isArray(criterios.dominio) ? criterios.dominio.map(Number) : [];
  const dominioValido = dominio.length === 2 && dominio.every(Number.isFinite) && dominio[0] < dominio[1];
  return {
    ...base,
    variaveis: Array.isArray(config.variaveis) ? config.variaveis.filter((v) => typeof v === "string").join(", ") : "",
    dominioDe: dominioValido ? String(dominio[0]) : FORMULARIO_PADRAO.dominioDe,
    dominioAte: dominioValido ? String(dominio[1]) : FORMULARIO_PADRAO.dominioAte,
  };
}
