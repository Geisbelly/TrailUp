// src/utils/essayValidation.ts
// Validacao de respostas dissertativas via IA (Edge Function
// "validate-essay-answer-ai", ja usada pelo console do professor em
// frontend/src/components/console/trilha/essayValidationApi.ts) — mesma
// funcao, mesmo contrato, chamada agora tambem no fluxo ao vivo do aluno,
// no lugar de comparacao de texto/similaridade pra perguntas abertas.
import { supabase } from "@/database/supabase";

export interface EssayValidationInput {
  enunciado: string;
  respostaAluno: string;
  respostaProfessor?: string | null;
  conteudoBase?: string | null;
  notaEstabelecida?: number | null;
  topicoNome?: string | null;
  topicoDescricao?: string | null;
}

export interface EssayValidationResult {
  correta: boolean;
  percentual: number;
  feedback: string;
  pontosFortes: string[];
  pontosMelhoria: string[];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeList(value: unknown, fallback: string): string[] {
  const rows = Array.isArray(value) ? value.map(asString).filter(Boolean).slice(0, 5) : [];
  return rows.length > 0 ? rows : [fallback];
}

function normalizeResult(raw: unknown): EssayValidationResult {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const percentual = clamp(asNumber(row.percentual, 0), 0, 100);
  const correta = typeof row.correta === "boolean" ? row.correta : percentual >= 60;

  return {
    correta,
    percentual,
    feedback:
      asString(row.feedback) || "Resposta corrigida por IA. Confira os pontos fortes e de melhoria.",
    pontosFortes: normalizeList(row.pontos_fortes, "Demonstrou entendimento parcial do enunciado."),
    pontosMelhoria: normalizeList(row.pontos_melhoria, "Aprofunde a argumentacao com base no conteudo."),
  };
}

/**
 * Chama a Edge Function de correcao dissertativa por IA. Lanca erro se a
 * chamada falhar (rede, funcao fora do ar, etc.) — o chamador deve decidir
 * o fallback (ex.: comparacao de texto local) nesse caso.
 */
export async function validateEssayAnswerWithAi(
  input: EssayValidationInput
): Promise<EssayValidationResult> {
  const { data, error } = await supabase.functions.invoke("validate-essay-answer-ai", {
    body: {
      enunciado: input.enunciado,
      respostaAluno: input.respostaAluno,
      respostaProfessor: input.respostaProfessor ?? "",
      conteudoBase: input.conteudoBase ?? "",
      ...(input.notaEstabelecida != null ? { notaEstabelecida: input.notaEstabelecida } : {}),
      topicoNome: input.topicoNome ?? "",
      topicoDescricao: input.topicoDescricao ?? "",
    },
  });

  if (error) throw error;
  return normalizeResult(data);
}
