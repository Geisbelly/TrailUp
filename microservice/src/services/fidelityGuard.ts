import type { EnrichedContentBlock } from "../types";

/**
 * Barreira de fidelidade: confere cada capítulo gerado contra o bloco de origem do professor.
 *
 * Não chama modelo, não lança erro e não reescreve frase. Só faz duas coisas no texto:
 * cerca o código do material que veio solto e remove item de checklist que cita código que o
 * material não tem. O resto (código fora da fonte, número fora da fonte, generalização que a
 * fonte não faz, desafio sem resposta) é registrado e o capítulo é publicado assim mesmo
 * (decisão de 11/11, docs/superpowers/specs/2026-11-11-assinatura-meio-termo-e-barreira-design.md).
 *
 * O que ela não pega: afirmação errada em prosa. No piloto de 11/11 nenhum limiar de
 * vocabulário separou o item de checklist inventado ("evitar falhas de ponto flutuante") do
 * verdadeiro parafraseado ("atualizar corretamente inicio = meio + 1"): os dois têm menos de
 * 20% das palavras na fonte. Pegar isso exige um segundo passe de modelo.
 *
 * Roda depois que o lote foi aceito, nunca dentro de `validateResult`: lá um erro faz a
 * cascata gerar de novo e gasta cota.
 */

export const FIDELITY_GUARD_VERSION = "fidelidade-v1";

export type TipoDeAchado =
  | "codigo_sem_cerca"
  | "codigo_fora_da_fonte"
  | "item_sem_apoio"
  | "numero_fora_da_fonte"
  | "generalizacao_fora_da_fonte"
  | "desafio_sem_resposta";

export interface AchadoDeFidelidade {
  blockId: string;
  campo: "markdown" | "audioScript";
  tipo: TipoDeAchado;
  trecho: string;
  acao: "cercado" | "removido" | "registrado";
}

export interface RelatorioDeFidelidade {
  versao: string;
  achados: AchadoDeFidelidade[];
}

const MAX_TRECHO = 160;
const MIN_LINHAS_DE_CODIGO_SOLTO = 3;

// Palavras que, no piloto, marcaram afirmação mais forte que o material ("ganho exponencial",
// "lista estritamente ordenada"). "nunca", "sempre", "garantir" e "qualquer" ficaram de fora:
// aparecem em prosa didática normal e virariam ruído (medido nos cinco textos do piloto). Só
// "estritamente ordenada" entra: "estritamente maior que fim" é matemática correta.
const GENERALIZACOES = ["exponencial", "estritamente ordenad", "certeza absoluta", "infalivel", "impossivel"];

// Linha de código: atribuição/comparação, palavra-chave no início ou chamada `nome(`. Dois-pontos
// e parênteses sozinhos não bastam: "Local: margens do Ipiranga (São Paulo)" é prosa (revisão final).
const PARECE_CODIGO = /=|^(def|return|while|if|elif|else|for|class|import|from|try|except)\b|^[A-Za-z_][\w.]*\(/;
// Estrutura de markdown (tabela, título, citação, item de lista) nunca é código solto.
const ESTRUTURA_MARKDOWN = /^(\||#|>|[-*+]\s|\d+[.)]\s)/;

function normalizar(texto: string): string {
  return texto
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Sem acento, minúsculo e sem espaço nenhum: `inicio<=fim` e `inicio <= fim` são o mesmo termo. */
function compactar(texto: string): string {
  return normalizar(texto).replace(/\s+/g, "");
}

function semEspacos(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

function trecho(texto: string): string {
  return semEspacos(texto).slice(0, MAX_TRECHO);
}

function textoDaFonte(block: EnrichedContentBlock): string {
  return [
    block.conteudo_base,
    block.conteudo_aprofundado,
    ...(block.objetivos ?? []),
    ...(block.conceitos_chave ?? []),
    ...(block.exemplos_contextos ?? []),
    block.ponte_proximo_bloco,
  ].filter(Boolean).join("\n");
}

function linhaDeCodigo(linha: string): string {
  // Comentário no fim da linha não muda o código.
  return semEspacos(linha.replace(/\s+#.*$/, ""));
}

function linhasDaFonte(fonte: string): Set<string> {
  return new Set(fonte.split("\n").map(linhaDeCodigo).filter(Boolean));
}

function digitos(numero: string): string {
  return numero.replace(/[.,](?=\d{3}\b)/g, "");
}

const NUMERO = /\d{1,3}(?:[.,]\d{3})+(?!\d)|\d{3,}|\d+(?:[.,]\d+)?%/g;

function numerosDe(texto: string): string[] {
  return texto.match(NUMERO) ?? [];
}

interface Contexto {
  block: EnrichedContentBlock;
  fonte: string;
  fonteNormalizada: string;
  fonteCompacta: string;
  linhas: Set<string>;
  numeros: Set<string>;
  linguagem: string;
}

function contexto(block: EnrichedContentBlock, materialDoTopico: EnrichedContentBlock[] = []): Contexto {
  // O capítulo de um bloco pode citar, com razão, o que está noutro bloco do mesmo tópico (no
  // piloto, o checklist do b1 citava o código do b2). Tudo isso é material do professor.
  const outros = materialDoTopico.filter((b) => b.id !== block.id);
  const fonte = [block, ...outros].map(textoDaFonte).join("\n");
  return {
    block,
    fonte,
    fonteNormalizada: normalizar(fonte),
    fonteCompacta: compactar(fonte),
    linhas: linhasDaFonte(fonte),
    numeros: new Set(numerosDe(fonte).map(digitos)),
    linguagem: /python/i.test(fonte) ? "python" : "",
  };
}

function achado(
  ctx: Contexto,
  campo: AchadoDeFidelidade["campo"],
  tipo: TipoDeAchado,
  texto: string,
  acao: AchadoDeFidelidade["acao"],
): AchadoDeFidelidade {
  return { blockId: ctx.block.id, campo, tipo, trecho: trecho(texto), acao };
}

/** Cerca o código do material que veio solto e confere o código que já veio cercado. */
function conferirCodigo(ctx: Contexto, markdown: string, achados: AchadoDeFidelidade[]): string {
  const linhas = markdown.split("\n");
  const saida: string[] = [];
  let i = 0;
  while (i < linhas.length) {
    const linha = linhas[i];
    if (/^\s*```/.test(linha)) {
      const fim = linhas.findIndex((l, j) => j > i && /^\s*```/.test(l));
      const ate = fim === -1 ? linhas.length - 1 : fim;
      const corpo = linhas.slice(i + 1, fim === -1 ? linhas.length : fim);
      const estranha = corpo
        .map(linhaDeCodigo)
        .find((l) => l && !l.startsWith("#") && !ctx.linhas.has(l));
      if (estranha) achados.push(achado(ctx, "markdown", "codigo_fora_da_fonte", estranha, "registrado"));
      saida.push(...linhas.slice(i, ate + 1));
      i = ate + 1;
      continue;
    }
    let j = i;
    while (j < linhas.length) {
      const l = linhaDeCodigo(linhas[j]);
      if (!l || ESTRUTURA_MARKDOWN.test(l) || !ctx.linhas.has(l) || !PARECE_CODIGO.test(l)) break;
      j++;
    }
    if (j - i >= MIN_LINHAS_DE_CODIGO_SOLTO) {
      const bloco = linhas.slice(i, j);
      saida.push("```" + ctx.linguagem, ...bloco, "```");
      achados.push(achado(ctx, "markdown", "codigo_sem_cerca", bloco[0], "cercado"));
      i = j;
      continue;
    }
    saida.push(linha);
    i++;
  }
  return saida.join("\n");
}

const ITEM_DE_TAREFA = /^\s*[-*]\s+\[[ xX]\]\s+/;
const ITEM_DE_LISTA = /^\s*[-*]\s+/;

/** Remove item de checklist que cita, entre crases, código que o material não tem. */
function conferirChecklist(ctx: Contexto, markdown: string, achados: AchadoDeFidelidade[]): string {
  const saida: string[] = [];
  let dentroDoChecklist = false;
  let dentroDeCerca = false;
  for (const linha of markdown.split("\n")) {
    if (/^\s*```/.test(linha)) dentroDeCerca = !dentroDeCerca;
    if (dentroDeCerca) {
      saida.push(linha);
      continue;
    }
    const titulo = /^\s*#/.test(linha) || /^\s*\*\*[^*]+\*\*\s*$/.test(linha);
    if (titulo || /^\s*\*\*checklist/i.test(linha)) {
      // Só o título que É o checklist ("### Checklist ...", "**Checklist:**") liga a conferência;
      // "## Por que um checklist decorado não basta" só fala dele.
      dentroDoChecklist = /^\s*(#+\s*|\*\*\s*)checklist/i.test(linha);
      saida.push(linha);
      continue;
    }
    const item = ITEM_DE_TAREFA.test(linha) || (dentroDoChecklist && ITEM_DE_LISTA.test(linha));
    if (!item) {
      if (linha.trim() && dentroDoChecklist) dentroDoChecklist = false;
      saida.push(linha);
      continue;
    }
    const termos = [...linha.matchAll(/`([^`]+)`/g)].map((m) => compactar(m[1]));
    if (termos.some((t) => t && !ctx.fonteCompacta.includes(t))) {
      achados.push(achado(ctx, "markdown", "item_sem_apoio", linha.replace(ITEM_DE_TAREFA, "").replace(ITEM_DE_LISTA, ""), "removido"));
      continue;
    }
    saida.push(linha);
  }
  return saida.join("\n");
}

function semCodigoCercado(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, " ");
}

function conferirNumeros(ctx: Contexto, markdown: string, achados: AchadoDeFidelidade[]): void {
  const vistos = new Set<string>();
  for (const numero of numerosDe(semCodigoCercado(markdown))) {
    const chave = digitos(numero);
    if (ctx.numeros.has(chave) || vistos.has(chave)) continue;
    vistos.add(chave);
    achados.push(achado(ctx, "markdown", "numero_fora_da_fonte", numero, "registrado"));
  }
}

function frases(texto: string): string[] {
  return texto.split(/(?<=[.!?])\s+|\n+/).filter((f) => f.trim());
}

function conferirGeneralizacoes(
  ctx: Contexto,
  texto: string,
  campo: AchadoDeFidelidade["campo"],
  achados: AchadoDeFidelidade[],
): void {
  for (const termo of GENERALIZACOES) {
    const padrao = new RegExp(`\\b${termo}`);
    if (padrao.test(ctx.fonteNormalizada)) continue;
    const frase = frases(texto).find((f) => padrao.test(normalizar(f)));
    if (frase) achados.push(achado(ctx, campo, "generalizacao_fora_da_fonte", frase, "registrado"));
  }
}

function conferirDesafio(ctx: Contexto, markdown: string, achados: AchadoDeFidelidade[]): void {
  const partes = markdown.split(/(?=\*\*Desafio:\*\*)/);
  for (const parte of partes) {
    if (!parte.startsWith("**Desafio:**")) continue;
    if (!/\*\*Resposta:\*\*/.test(parte)) {
      achados.push(achado(ctx, "markdown", "desafio_sem_resposta", parte.split("\n")[0], "registrado"));
    }
  }
}

/** Só a generalização vale no áudio: os números vêm por extenso e não há lista nem código. */
export function guardarFidelidadeDoAudio(
  block: EnrichedContentBlock,
  audioScript: string,
  materialDoTopico: EnrichedContentBlock[] = [],
): AchadoDeFidelidade[] {
  const achados: AchadoDeFidelidade[] = [];
  conferirGeneralizacoes(contexto(block, materialDoTopico), audioScript, "audioScript", achados);
  return achados;
}

export function guardarFidelidade(
  block: EnrichedContentBlock,
  chapter: { markdown: string; audioScript: string },
  materialDoTopico: EnrichedContentBlock[] = [],
): { markdown: string; audioScript: string; achados: AchadoDeFidelidade[] } {
  const ctx = contexto(block, materialDoTopico);
  const achados: AchadoDeFidelidade[] = [];
  let markdown = conferirCodigo(ctx, chapter.markdown, achados);
  markdown = conferirChecklist(ctx, markdown, achados);
  conferirNumeros(ctx, markdown, achados);
  conferirGeneralizacoes(ctx, markdown, "markdown", achados);
  conferirDesafio(ctx, markdown, achados);
  achados.push(...guardarFidelidadeDoAudio(block, chapter.audioScript, materialDoTopico));
  return { markdown, audioScript: chapter.audioScript, achados };
}
