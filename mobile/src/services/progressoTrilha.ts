import { supabase } from "@/database/supabase";
import {
  clampPercent,
  normalizeEventType,
  normalizeNonNegativeNumber,
  normalizeNullableNonNegativeNumber,
  normalizeReferencia,
} from "@/utils/dataValidation";

type StatusAtividade = "não iniciado" | "em andamento" | "concluido";

const statusConcluido: StatusAtividade = "concluido";
const statusEmAndamento: StatusAtividade = "em andamento";
const statusNaoIniciado: StatusAtividade = "não iniciado";

function resolveStatusByPercentual(percentual: number): StatusAtividade {
  if (percentual >= 100) return statusConcluido;
  if (percentual > 0) return statusEmAndamento;
  return statusNaoIniciado;
}

export async function registrarConteudoProgresso(params: {
  alunoId?: string | null;
  conteudoId?: number | null;
  percentual?: number;
  tempoGastoMin?: number;
}) {
  const { alunoId, conteudoId, percentual = 100, tempoGastoMin = 0 } = params;
  if (!alunoId || !conteudoId) return;
  const percentualNormalizado = clampPercent(percentual);
  const tempoNormalizado = normalizeNonNegativeNumber(tempoGastoMin);

  const payload = {
    aluno_id: alunoId,
    conteudo_id: conteudoId,
    status: resolveStatusByPercentual(percentualNormalizado),
    percentual_concluido: percentualNormalizado,
    tempo_gasto_min: tempoNormalizado,
    ultima_visualizacao: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await supabase
    .from("conteudo_aluno")
    .upsert(payload, { onConflict: "aluno_id,conteudo_id" });
}

export async function registrarAtividadeProgresso(params: {
  alunoId?: string | null;
  atividadeId?: number | null;
  percentual?: number;
  acertosPercentual?: number;
  tempoGastoMin?: number;
}) {
  const { alunoId, atividadeId, percentual = 100, acertosPercentual, tempoGastoMin = 0 } = params;
  if (!alunoId || !atividadeId) return;
  const percentualNormalizado = clampPercent(percentual);
  const acertosNormalizado =
    acertosPercentual == null ? null : clampPercent(acertosPercentual);
  const tempoNormalizado = normalizeNonNegativeNumber(tempoGastoMin);

  const payload = {
    aluno_id: alunoId,
    atividade_id: atividadeId,
    status: resolveStatusByPercentual(percentualNormalizado),
    percentual_concluido: percentualNormalizado,
    acertos_percentual: acertosNormalizado,
    tempo_gasto_min: tempoNormalizado,
    ultima_visualizacao: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await supabase
    .from("atividade_aluno")
    .upsert(payload, { onConflict: "aluno_id,atividade_id" });
}

export async function registrarTopicoProgresso(params: {
  alunoId?: string | null;
  topicoId?: number | null;
  percentual?: number;
  ultimaAtividadeId?: number | null;
  ultimaVisualizacao?: string | null;
}) {
  const { alunoId, topicoId, percentual = 0, ultimaAtividadeId, ultimaVisualizacao } = params;
  if (!alunoId || !topicoId) return;

  const percentualNormalizado = clampPercent(percentual);
  const agora = ultimaVisualizacao ?? new Date().toISOString();

  const payload = {
    aluno_id: alunoId,
    topico_id: topicoId,
    status: resolveStatusByPercentual(percentualNormalizado),
    percentual_concluido: percentualNormalizado,
    ultima_visualizacao: agora,
    updated_at: agora,
    ...(ultimaAtividadeId === undefined ? {} : { ultima_atividade: ultimaAtividadeId }),
  };

  await supabase
    .from("topico_aluno")
    .upsert(payload, { onConflict: "aluno_id,topico_id" });
}

export async function registrarEventoPontos(params: {
  alunoId?: string | null;
  tipo?: string;
  referencia?: string | number | null;
  valor?: number;
}) {
  const { alunoId, tipo = "atividade", referencia, valor = 0 } = params;
  if (!alunoId) return;
  const tipoNormalizado = normalizeEventType(tipo, "atividade");
  const referenciaNormalizada = normalizeReferencia(referencia ?? null);
  const valorNormalizado = normalizeNullableNonNegativeNumber(valor) ?? 0;

  await supabase.from("eventos_aluno").insert({
    aluno_id: alunoId,
    tipo: tipoNormalizado,
    referencia: referenciaNormalizada,
    valor: valorNormalizado,
  });
}
