import { supabase } from "@/database/supabase";

export type TrilhaCheckpoint = {
  mostrarResumo: boolean;
  blockKind?: "conteudo" | "atividade" | null;
  blockId?: number | null;
  questionIndex?: number | null;
  stepIndex?: number | null;
  updatedAt: string;
};

export type TrilhaCheckpointKeyParams = {
  userId?: string | null;
  classeId?: number | null;
  topicoId?: number | null;
  scopeId?: string | null;
};

type TrilhaCheckpointRow = {
  aluno_id: string;
  classe_id: number;
  topico_id: number;
  scope_id: string;
  mostrar_resumo: boolean;
  block_kind: "conteudo" | "atividade" | null;
  block_id: number | null;
  question_index: number | null;
  step_index: number | null;
  updated_at: string;
};

type TrilhaCheckpointRaw = Partial<TrilhaCheckpointRow> &
  Partial<TrilhaCheckpoint> & {
    mostrar_resumo?: boolean;
    block_kind?: "conteudo" | "atividade" | null;
    block_id?: number | null;
    question_index?: number | null;
    step_index?: number | null;
    updated_at?: string | null;
  };

function buildCheckpointScope({
  userId,
  classeId,
  topicoId,
  scopeId,
}: TrilhaCheckpointKeyParams) {
  if (!userId || classeId == null || topicoId == null) {
    return null;
  }

  return {
    aluno_id: userId,
    classe_id: Number(classeId),
    topico_id: Number(topicoId),
    scope_id: scopeId ?? "default",
  };
}

function normalizeCheckpoint(raw: unknown): TrilhaCheckpoint | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const value = raw as TrilhaCheckpointRaw;
  const updatedAt =
    typeof value.updatedAt === "string" && value.updatedAt.length > 0
      ? value.updatedAt
      : typeof value.updated_at === "string" && value.updated_at.length > 0
      ? value.updated_at
      : null;

  if (!updatedAt) return null;

  return {
    mostrarResumo:
      typeof value.mostrarResumo === "boolean"
        ? value.mostrarResumo
        : Boolean(value.mostrar_resumo),
    blockKind:
      value.blockKind === "conteudo" ||
      value.blockKind === "atividade"
        ? value.blockKind
        : value.block_kind === "conteudo" || value.block_kind === "atividade"
        ? value.block_kind
        : null,
    blockId:
      typeof value.blockId === "number" && Number.isFinite(value.blockId)
        ? value.blockId
        : typeof value.block_id === "number" && Number.isFinite(value.block_id)
        ? value.block_id
        : null,
    questionIndex:
      typeof value.questionIndex === "number" && Number.isFinite(value.questionIndex)
        ? Math.max(0, value.questionIndex)
        : typeof value.question_index === "number" && Number.isFinite(value.question_index)
        ? Math.max(0, value.question_index)
        : null,
    stepIndex:
      typeof value.stepIndex === "number" && Number.isFinite(value.stepIndex)
        ? Math.max(0, value.stepIndex)
        : typeof value.step_index === "number" && Number.isFinite(value.step_index)
        ? Math.max(0, value.step_index)
        : null,
    updatedAt,
  };
}

export async function loadTrilhaCheckpoint(params: TrilhaCheckpointKeyParams) {
  const scope = buildCheckpointScope(params);
  if (!scope) return null;

  try {
    const { data, error } = await supabase
      .from("trilha_checkpoint_navegacao")
      .select("*")
      .eq("aluno_id", scope.aluno_id)
      .eq("classe_id", scope.classe_id)
      .eq("topico_id", scope.topico_id)
      .eq("scope_id", scope.scope_id)
      .maybeSingle();

    if (error) throw error;
    return normalizeCheckpoint(data);
  } catch (error) {
    console.warn("[Checkpoint] Falha ao carregar checkpoint da trilha:", error);
    return null;
  }
}

export async function saveTrilhaCheckpoint(
  params: TrilhaCheckpointKeyParams,
  checkpoint: Omit<TrilhaCheckpoint, "updatedAt">
) {
  const scope = buildCheckpointScope(params);
  if (!scope) return;

  try {
    const payload: TrilhaCheckpointRow = {
      ...scope,
      mostrar_resumo: checkpoint.mostrarResumo,
      block_kind: checkpoint.blockKind ?? null,
      block_id: checkpoint.blockId ?? null,
      question_index: checkpoint.questionIndex ?? null,
      step_index: checkpoint.stepIndex ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("trilha_checkpoint_navegacao")
      .upsert(payload, {
        onConflict: "aluno_id,classe_id,topico_id,scope_id",
      });

    if (error) throw error;
  } catch (error) {
    console.warn("[Checkpoint] Falha ao salvar checkpoint da trilha:", error);
  }
}

export async function clearTrilhaCheckpoint(params: TrilhaCheckpointKeyParams) {
  const scope = buildCheckpointScope(params);
  if (!scope) return;

  try {
    const { error } = await supabase
      .from("trilha_checkpoint_navegacao")
      .delete()
      .eq("aluno_id", scope.aluno_id)
      .eq("classe_id", scope.classe_id)
      .eq("topico_id", scope.topico_id)
      .eq("scope_id", scope.scope_id);

    if (error) throw error;
  } catch (error) {
    console.warn("[Checkpoint] Falha ao limpar checkpoint da trilha:", error);
  }
}
