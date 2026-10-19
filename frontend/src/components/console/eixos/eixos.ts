/**
 * Os quatro eixos do desafio — espelho do que a fase 1 gravou em `guilda_desafios`
 * e do que a fase 7 expõe no seletor (mobile) e no cartão (console).
 *
 * Não são um enum único: são quatro listas curtas. Achatar daria 72 rótulos.
 */

export type Formato = "solo" | "dupla" | "guilda" | "turma";
export type Regra = "todos" | "velocidade" | "precisao";
/** `duelo`/`duplo` existem no CHECK antigo do chat; o seletor novo não os oferece. */
export type RegraLegada = Regra | "duelo" | "duplo";
export type Dificuldade = "normal" | "dificil";
export type Consequencia = "treino" | "ranqueada" | "evento";

export const FORMATOS: { chave: Formato; rotulo: string }[] = [
  { chave: "solo", rotulo: "Solo" },
  { chave: "dupla", rotulo: "Dupla" },
  { chave: "guilda", rotulo: "Guilda" },
  { chave: "turma", rotulo: "Turma" },
];

export const REGRAS: { chave: Regra; rotulo: string; ajuda: string }[] = [
  { chave: "todos", rotulo: "Todos respondem", ajuda: "Cada um responde; conta o conjunto." },
  { chave: "velocidade", rotulo: "Velocidade", ajuda: "Quem responde certo mais rápido." },
  { chave: "precisao", rotulo: "Precisão", ajuda: "Quem acerta mais." },
];

export const DIFICULDADES: { chave: Dificuldade; rotulo: string; ajuda: string }[] = [
  { chave: "normal", rotulo: "Normal", ajuda: "Tempo e tentativas padrão." },
  { chave: "dificil", rotulo: "Difícil", ajuda: "Menos tempo, menos tentativas, aposta dobrada." },
];

export const CONSEQUENCIAS: { chave: Consequencia; rotulo: string; ajuda: string }[] = [
  { chave: "treino", rotulo: "Treino", ajuda: "Não pontua, não move rank, não paga moeda." },
  { chave: "ranqueada", rotulo: "Ranqueada", ajuda: "Conta no rank; derrota desconta (com piso)." },
  { chave: "evento", rotulo: "Evento", ajuda: "Conta para o evento aberto da turma." },
];

export function rotuloDoFormato(v: string | null | undefined): string {
  return FORMATOS.find((x) => x.chave === v)?.rotulo ?? (v?.trim() || "—");
}

export function rotuloDaRegra(v: string | null | undefined): string {
  if (v === "duelo") return "Duelo";
  if (v === "duplo") return "Duplo";
  return REGRAS.find((x) => x.chave === v)?.rotulo ?? (v?.trim() || "—");
}

export function rotuloDaDificuldade(v: string | null | undefined): string {
  return DIFICULDADES.find((x) => x.chave === v)?.rotulo ?? "Normal";
}

export function rotuloDaConsequencia(v: string | null | undefined): string {
  return CONSEQUENCIAS.find((x) => x.chave === v)?.rotulo ?? "Ranqueada";
}

export function dificuldadeValida(v: unknown): Dificuldade {
  return v === "dificil" ? "dificil" : "normal";
}

export function consequenciaValida(v: unknown): Consequencia {
  return v === "treino" || v === "evento" || v === "ranqueada" ? v : "ranqueada";
}

export function formatoValido(v: unknown): Formato {
  return v === "solo" || v === "dupla" || v === "turma" || v === "guilda" ? v : "guilda";
}

export function regraValida(v: unknown): RegraLegada {
  if (v === "velocidade" || v === "precisao" || v === "duelo" || v === "duplo" || v === "todos") return v;
  return "todos";
}

/** Uma linha curta para o cartão: "Guilda · Velocidade · Difícil · Ranqueada". */
export function resumoDosEixos(d: {
  formato?: string | null;
  modo?: string | null;
  dificuldade?: string | null;
  consequencia?: string | null;
}): string {
  return [
    rotuloDoFormato(d.formato),
    rotuloDaRegra(d.modo),
    rotuloDaDificuldade(d.dificuldade),
    rotuloDaConsequencia(d.consequencia),
  ].join(" · ");
}
