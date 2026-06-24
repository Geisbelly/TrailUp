import { supabase } from "@/integrations/supabase/client";
import { parseOptionalPositiveScore } from "@/lib/question-score";

export interface EssayValidationInput {
  enunciado: string;
  respostaAluno: string;
  respostaProfessor?: string | null;
  conteudoBase?: string | null;
  notaEstabelecida?: number | null;
  materiaNome?: string | null;
  materiaDescricao?: string | null;
  classeNome?: string | null;
  topicoNome?: string | null;
  topicoDescricao?: string | null;
}

export interface EssayValidationResult {
  nota_obtida: number;
  nota_maxima: number;
  percentual: number;
  correta: boolean;
  feedback: string;
  pontos_fortes: string[];
  pontos_melhoria: string[];
  observacao?: string;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeList(value: unknown, fallback: string): string[] {
  const rows = Array.isArray(value) ? value : [];
  const normalized = rows
    .map((entry) => asString(entry))
    .filter(Boolean)
    .slice(0, 5);
  if (normalized.length > 0) return normalized;
  return [fallback];
}

function normalizeValidationResult(raw: unknown, notaEsperada: number): EssayValidationResult {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const notaMaxima = round2(clamp(asNumber(row.nota_maxima, notaEsperada), 0.1, 1000));
  const notaObtida = round2(clamp(asNumber(row.nota_obtida, 0), 0, notaMaxima));
  const percentualBase = notaMaxima > 0 ? (notaObtida / notaMaxima) * 100 : 0;
  const percentual = round2(clamp(asNumber(row.percentual, percentualBase), 0, 100));
  const correta = typeof row.correta === "boolean" ? row.correta : percentual >= 60;

  return {
    nota_obtida: notaObtida,
    nota_maxima: notaMaxima,
    percentual,
    correta,
    feedback:
      asString(row.feedback) ||
      "A resposta foi corrigida por IA. Revise os pontos fortes e de melhoria para evoluir.",
    pontos_fortes: normalizeList(row.pontos_fortes, "Demonstrou entendimento parcial do enunciado."),
    pontos_melhoria: normalizeList(row.pontos_melhoria, "Aprofunde a argumentacao com base no conteudo."),
    observacao: asString(row.observacao) || undefined,
  };
}

export async function validateEssayAnswerWithAi(input: EssayValidationInput): Promise<EssayValidationResult> {
  const parsedScore = parseOptionalPositiveScore(input.notaEstabelecida);
  const notaEstabelecida = parsedScore.isValid ? parsedScore.value : null;
  const notaEsperada = notaEstabelecida ?? 100;
  const { data, error } = await supabase.functions.invoke("validate-essay-answer-ai", {
    body: {
      enunciado: input.enunciado,
      respostaAluno: input.respostaAluno,
      respostaProfessor: input.respostaProfessor ?? "",
      conteudoBase: input.conteudoBase ?? "",
      ...(notaEstabelecida !== null ? { notaEstabelecida } : {}),
      materiaNome: input.materiaNome ?? "",
      materiaDescricao: input.materiaDescricao ?? "",
      classeNome: input.classeNome ?? "",
      topicoNome: input.topicoNome ?? "",
      topicoDescricao: input.topicoDescricao ?? "",
    },
  });

  if (error) throw error;
  return normalizeValidationResult(data, notaEsperada);
}

export async function buildActivityContentContext(atividadeId: number): Promise<string> {
  const { data: links, error: linksError } = await supabase
    .from("atividade_conteudos")
    .select("conteudo_id")
    .eq("atividade_id", atividadeId);
  if (linksError) throw linksError;

  const contentIds = Array.from(
    new Set(
      (links ?? [])
        .map((row) => Number(row.conteudo_id))
        .filter((id) => Number.isFinite(id))
    )
  );
  if (contentIds.length === 0) return "";

  const { data: contents, error: contentsError } = await supabase
    .from("conteudos")
    .select("id, titulo, tipo, conteudo, ordem")
    .in("id", contentIds)
    .order("ordem", { ascending: true });
  if (contentsError) throw contentsError;

  const contextParts = (contents ?? []).map((content, index) => {
    const titulo = asString(content.titulo) || `Conteudo ${index + 1}`;
    const tipo = asString(content.tipo) || "texto";
    const texto = asString(content.conteudo).slice(0, 1800);
    if (!texto) return `[${index + 1}] ${titulo} (${tipo})`;
    return `[${index + 1}] ${titulo} (${tipo})\n${texto}`;
  });

  return contextParts.join("\n\n").slice(0, 12000);
}

export async function saveEssayAttempt(params: {
  alunoId: string;
  atividadeId: number;
  questaoId: number;
  respostaAluno: string;
  result: EssayValidationResult;
}) {
  const { data: lastAttemptData, error: attemptError } = await supabase
    .from("questao_aluno")
    .select("tentativa")
    .eq("aluno_id", params.alunoId)
    .eq("questao_id", params.questaoId)
    .order("tentativa", { ascending: false })
    .limit(1);
  if (attemptError) throw attemptError;

  const tentativaAtual = Number(lastAttemptData?.[0]?.tentativa ?? 0);
  const tentativa = Number.isFinite(tentativaAtual) ? tentativaAtual + 1 : 1;

  const { data, error } = await supabase
    .from("questao_aluno")
    .insert({
      aluno_id: params.alunoId,
      atividade_id: params.atividadeId,
      questao_id: params.questaoId,
      tentativa,
      resposta: params.respostaAluno,
      correta: params.result.correta,
      acertos_percentual: params.result.percentual,
    })
    .select("id")
    .single();
  if (error) throw error;

  return Number(data.id);
}
