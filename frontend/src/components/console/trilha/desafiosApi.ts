import { supabase } from "@/integrations/supabase/client";
import { formatSupabaseFunctionError } from "@/lib/supabaseFunctionError";
import type {
  DesafiosNormalizados,
  PerfilBrainHex,
  PropostaDeDesafio,
} from "../../../../supabase/functions/generate-content-ai/desafios.ts";
import { MAX_EXISTENTES } from "../../../../supabase/functions/generate-content-ai/repetidas.ts";
import { textosDosDesafios } from "./desafiosNaRevisao";

/**
 * Desafios de lógica e cruzadinha na sugestão por conteúdo (spec
 * `2026-11-17-desafios-logica-e-cruzadinha-como-missao-design.md`, "Console").
 *
 * A edge só propõe (`mode: "desafios"`); quem grava é o banco, pela RPC
 * `missao_desafio_criar`, que confere a posse e valida tudo de novo. O console
 * fala direto com o Supabase, sem a API (regra de fronteira do CLAUDE.md).
 */

export type { PerfilBrainHex, PropostaDeDesafio };

/**
 * A edge publicada ainda não conhece `mode: "desafios"`: responde como `content` (200, sem
 * `desafios`) depois de uma chamada inteira ao Gemini. O drawer para de pedir na mesma sessão.
 */
export class FuncaoSemDesafiosError extends Error {
  constructor() {
    super("A função de IA publicada ainda não gera desafios.");
    this.name = "FuncaoSemDesafiosError";
  }
}

/**
 * Pede os desafios de um conteúdo salvo. `corpo` é o mesmo do `content` (material, orientação e
 * `existentes`); o `mode` é sempre `desafios`, venha o que vier.
 *
 * Devolve também `descartados`: com 200, `desafios: []` e `descartados > 0`, o modelo respondeu mas
 * nada passou na conferência, e o professor precisa saber disso (não é "a IA não sugeriu nada").
 * Erro da edge (o 502 `invalid_ai_response`, cota, rede) sobe com a mensagem dela. Resposta sem a
 * lista `desafios` é a edge antiga: `FuncaoSemDesafiosError`.
 */
export async function gerarDesafios(corpo: Record<string, unknown>): Promise<DesafiosNormalizados> {
  const { data, error } = await supabase.functions.invoke("generate-content-ai", {
    body: { ...corpo, mode: "desafios" },
  });
  if (error) throw new Error(await formatSupabaseFunctionError(error, "Não foi possível gerar desafios."));
  const resposta = (data && typeof data === "object" ? data : {}) as { desafios?: unknown; descartados?: unknown };
  if (!Array.isArray(resposta.desafios)) throw new FuncaoSemDesafiosError();
  return {
    desafios: resposta.desafios as PropostaDeDesafio[],
    descartados: typeof resposta.descartados === "number" && Number.isFinite(resposta.descartados) ? resposta.descartados : 0,
  };
}

/** Como a proposta aparece numa falha: o título é só para o professor reconhecer qual foi. */
function nomeDaProposta(p: PropostaDeDesafio): string {
  return p.titulo?.trim() || (p.tipo === "logica" ? "Desafio de lógica" : "Cruzadinha");
}

/**
 * A RPC que o banco ainda não tem: `PGRST202` (o PostgREST não achou a função) e `42883` (o Postgres
 * não achou). A mensagem deles vem em inglês e não diz nada ao professor.
 */
const SEM_A_RPC = new Set(["PGRST202", "42883"]);

function motivoDaRecusa(error: { code?: string; message?: string }): string {
  if (error.code && SEM_A_RPC.has(error.code)) return "Os desafios ainda não estão disponíveis neste banco.";
  return error.message ?? "erro no banco";
}

/**
 * Uma RPC por proposta, em sequência, sem parar na primeira falha. A falha volta com a mensagem do
 * banco (42501 de posse, 22023 de validação, ambas em PT-BR), e `recusados` traz a posição de cada
 * proposta recusada em `propostas`, para o drawer mantê-la na fila.
 *
 * O `titulo` do modelo não vai: a RPC monta o próprio ("Desafio de lógica: <conteúdo>"), e o do
 * modelo pode conter a resposta.
 */
export async function criarDesafios(
  conteudoId: number,
  propostas: PropostaDeDesafio[],
): Promise<{ criados: number; falhas: string[]; recusados: number[] }> {
  let criados = 0;
  const falhas: string[] = [];
  const recusados: number[] = [];
  for (const [indice, proposta] of propostas.entries()) {
    try {
      const { error } = await supabase.rpc("missao_desafio_criar" as never, {
        p_conteudo_id: conteudoId,
        p_desafio: proposta.desafio,
        p_resposta: proposta.resposta,
        p_perfis: proposta.perfis,
      } as never);
      if (error) {
        falhas.push(`${nomeDaProposta(proposta)}: ${motivoDaRecusa(error as { code?: string; message?: string })}`);
        recusados.push(indice);
      } else {
        criados += 1;
      }
    } catch (e) {
      falhas.push(`${nomeDaProposta(proposta)}: ${e instanceof Error ? e.message : "erro desconhecido"}`);
      recusados.push(indice);
    }
  }
  return { criados, falhas, recusados };
}

/**
 * Os desafios já aplicados a este conteúdo, lidos de `missoes` (o professor lê as da turma dele pela
 * RLS). Cada grupo tem uma linha por perfil com o mesmo desafio, daí a deduplicação.
 *
 * Falha de leitura não bloqueia a geração: volta vazio e a edge ainda filtra o que repete dentro da
 * própria resposta. Antes da migration dos desafios, `conteudo_id` não existe (42703) e cai aqui.
 */
export async function desafiosAplicadosDoConteudo(conteudoId: number): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("missoes" as never)
      .select("desafio")
      .eq("conteudo_id", conteudoId)
      .not("desafio", "is", null)
      .limit(MAX_EXISTENTES);
    if (error) {
      console.warn("[ia] desafios do conteúdo não foram lidos; a sugestão sai sem esse filtro", error);
      return [];
    }
    return textosDosDesafios(((data ?? []) as Array<{ desafio: unknown }>).map((linha) => linha.desafio));
  } catch (e) {
    console.warn("[ia] desafios do conteúdo não foram lidos; a sugestão sai sem esse filtro", e);
    return [];
  }
}
