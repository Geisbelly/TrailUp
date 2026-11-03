// Tokens gastos por uma geração, para o custo por artefato do painel técnico (#21).
//
// Cada chamada ao modelo registra o que gastou no "uso" do pedido em andamento, achado pelo
// AsyncLocalStorage: não precisa passar um acumulador por todas as funções do pipeline. Fora de um
// pedido medido (testes, rotas antigas), registrar não faz nada.
//
// Aqui, /render-and-store devolve o uso ao microservice em toda resposta (`medirUsoDaRota`), e ele o
// soma ao da geração que devolve à API.
//
// Cópia de `microservice/src/lib/usoDoModelo.ts` (os dois serviços não compartilham pacote), com o
// middleware `medirUsoDaRota` a mais. O formato do JSON é o contrato com a API (`app/services/uso_do_modelo.py`).
import { AsyncLocalStorage } from "node:async_hooks";

import type { NextFunction, Request, Response } from "express";

export interface UsoPorModelo {
  chamadas: number;
  tokens_entrada: number;
  tokens_saida: number;
  /** Texto enviado à voz da OpenAI, que cobra por caractere e não devolve tokens. */
  caracteres: number;
}

export interface UsoDoModelo {
  chamadas: number;
  tokens_entrada: number;
  tokens_saida: number;
  caracteres: number;
  por_modelo: Record<string, UsoPorModelo>;
}

const armazenamento = new AsyncLocalStorage<UsoDoModelo>();

export function novoUso(): UsoDoModelo {
  return { chamadas: 0, tokens_entrada: 0, tokens_saida: 0, caracteres: 0, por_modelo: {} };
}

/** Roda `fn` medindo o uso em `uso`. O chamador cria o objeto para lê-lo mesmo se `fn` falhar. */
export function medirUso<T>(uso: UsoDoModelo, fn: () => Promise<T>): Promise<T> {
  return armazenamento.run(uso, fn);
}

function inteiro(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

export function registrarUso(
  modelo: string | undefined,
  gasto: { entrada?: unknown; saida?: unknown; caracteres?: unknown; chamadas?: unknown },
): void {
  const uso = armazenamento.getStore();
  if (!uso) return;
  const chave = String(modelo || "desconhecido").slice(0, 80);
  const parcela = {
    chamadas: gasto.chamadas === undefined ? 1 : inteiro(gasto.chamadas),
    tokens_entrada: inteiro(gasto.entrada),
    tokens_saida: inteiro(gasto.saida),
    caracteres: inteiro(gasto.caracteres),
  };
  const doModelo = (uso.por_modelo[chave] ??= { chamadas: 0, tokens_entrada: 0, tokens_saida: 0, caracteres: 0 });
  for (const campo of ["chamadas", "tokens_entrada", "tokens_saida", "caracteres"] as const) {
    uso[campo] += parcela[campo];
    doModelo[campo] += parcela[campo];
  }
}

/**
 * Gemini: `promptTokenCount` é a entrada; a saída cobrada é a resposta mais o raciocínio
 * (`candidatesTokenCount` + `thoughtsTokenCount`).
 */
export function registrarUsoGemini(modelo: string | undefined, usageMetadata: unknown): void {
  const u = (usageMetadata ?? {}) as Record<string, unknown>;
  registrarUso(modelo, {
    entrada: u.promptTokenCount,
    saida: inteiro(u.candidatesTokenCount) + inteiro(u.thoughtsTokenCount),
  });
}

/** OpenAI: Responses API (`input_tokens`/`output_tokens`) ou Chat Completions (`prompt_`/`completion_`). */
export function registrarUsoOpenAI(modelo: string | undefined, usage: unknown): void {
  const u = (usage ?? {}) as Record<string, unknown>;
  registrarUso(modelo, {
    entrada: u.input_tokens ?? u.prompt_tokens,
    saida: u.output_tokens ?? u.completion_tokens,
  });
}

/** Soma o uso que outro serviço devolveu (o BrainHexPDF). Formato inválido é ignorado. */
export function somarUso(externo: unknown): void {
  if (!externo || typeof externo !== "object") return;
  const porModelo = (externo as { por_modelo?: unknown }).por_modelo;
  if (!porModelo || typeof porModelo !== "object") return;
  for (const [modelo, gasto] of Object.entries(porModelo as Record<string, Record<string, unknown>>)) {
    if (!gasto || typeof gasto !== "object") continue;
    registrarUso(modelo, {
      chamadas: gasto.chamadas,
      entrada: gasto.tokens_entrada,
      saida: gasto.tokens_saida,
      caracteres: gasto.caracteres,
    });
  }
}

/**
 * Middleware de rota: mede o uso do pedido e o põe em toda resposta JSON de objeto (`uso_modelo`),
 * inclusive nas de falha, porque a tentativa que falha também foi paga.
 */
export function medirUsoDaRota(_req: Request, res: Response, next: NextFunction): void {
  const uso = novoUso();
  const json = res.json.bind(res);
  res.json = ((corpo: unknown) =>
    json(corpo && typeof corpo === "object" && !Array.isArray(corpo) ? { ...corpo, uso_modelo: uso } : corpo)) as Response["json"];
  armazenamento.run(uso, next);
}
