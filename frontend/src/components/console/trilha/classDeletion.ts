import { supabase } from "@/integrations/supabase/client";

type IdRow = { id: number };
type ConteudoSourceRow = { id: number; conteudo: string | null; metadata: unknown };
type FonteStorageRow = { storage_path: string | null };
type DynamicDeleteQuery = {
  eq: (column: string, value: number) => Promise<{ error: unknown }>;
  in: (column: string, values: number[]) => Promise<{ error: unknown }>;
};
type DynamicSupabaseClient = {
  from: (table: string) => {
    delete: () => DynamicDeleteQuery;
  };
};

const dynamicSupabase = supabase as unknown as DynamicSupabaseClient;

function looksLikeStoragePath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return false;
  if (trimmed.includes("\n")) return false;
  return trimmed.includes("/");
}

function collectMetadataFilePaths(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const files = (metadata as { files?: unknown }).files;
  if (!Array.isArray(files)) return [];
  return files
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const path = (entry as { path?: unknown }).path;
      return typeof path === "string" && looksLikeStoragePath(path) ? path : null;
    })
    .filter((path): path is string => path !== null);
}

async function deleteStoragePaths(paths: string[]) {
  if (paths.length === 0) return;
  const uniquePaths = Array.from(new Set(paths));

  for (let i = 0; i < uniquePaths.length; i += 100) {
    const chunk = uniquePaths.slice(i, i + 100);
    const { error } = await supabase.storage.from("conteudos").remove(chunk);
    if (error) {
      console.warn("[ClassDeletion] Falha opcional ao remover arquivos do bucket conteudos:", error);
    }
  }
}

async function fetchTrailIds(classeId: number) {
  const { data: topicRows, error: topicFetchErr } = await supabase
    .from("topicos")
    .select("id")
    .eq("classe_id", classeId);
  if (topicFetchErr) throw topicFetchErr;

  const topicIds = (topicRows ?? []).map((row: IdRow) => row.id);
  if (topicIds.length === 0) {
    return { topicIds: [], conteudoIds: [], atividadeIds: [], questionIds: [], storagePaths: [] };
  }

  const { data: conteudoRows, error: conteudoFetchErr } = await supabase
    .from("conteudos")
    .select("id, conteudo, metadata")
    .in("topico_id", topicIds);
  if (conteudoFetchErr) throw conteudoFetchErr;

  const { data: fonteRows, error: fonteFetchErr } = await supabase
    .from("fontes_personalizacao")
    .select("storage_path")
    .eq("classe_id", classeId);
  if (fonteFetchErr) throw fonteFetchErr;

  const { data: atividadeRows, error: atividadeFetchErr } = await supabase
    .from("atividades")
    .select("id")
    .in("topico_id", topicIds);
  if (atividadeFetchErr) throw atividadeFetchErr;

  const atividadeIds = (atividadeRows ?? []).map((row: IdRow) => row.id);
  let questionIds: number[] = [];
  if (atividadeIds.length > 0) {
    const { data: questionRows, error: questionFetchErr } = await supabase
      .from("questoes")
      .select("id")
      .in("atividade_id", atividadeIds);
    if (questionFetchErr) throw questionFetchErr;
    questionIds = (questionRows ?? []).map((row: IdRow) => row.id);
  }

  const storagePaths = new Set<string>();
  (conteudoRows as ConteudoSourceRow[] | null)?.forEach((row) => {
    if (typeof row.conteudo === "string" && looksLikeStoragePath(row.conteudo)) {
      storagePaths.add(row.conteudo);
    }
    collectMetadataFilePaths(row.metadata).forEach((path) => storagePaths.add(path));
  });
  (fonteRows as FonteStorageRow[] | null)?.forEach((row) => {
    if (typeof row.storage_path === "string" && looksLikeStoragePath(row.storage_path)) {
      storagePaths.add(row.storage_path);
    }
  });

  return {
    topicIds,
    conteudoIds: (conteudoRows ?? []).map((row: IdRow) => row.id),
    atividadeIds,
    questionIds,
    storagePaths: Array.from(storagePaths),
  };
}

async function tryDeleteEq(table: string, column: string, value: number) {
  try {
    const { error } = await dynamicSupabase.from(table).delete().eq(column, value);
    if (error) {
      console.warn(`[ClassDeletion] Falha opcional ao limpar ${table}:`, error);
    }
  } catch (error) {
    console.warn(`[ClassDeletion] Falha opcional ao limpar ${table}:`, error);
  }
}

async function tryDeleteIn(table: string, column: string, values: number[]) {
  if (values.length === 0) return;

  try {
    const { error } = await dynamicSupabase.from(table).delete().in(column, values);
    if (error) {
      console.warn(`[ClassDeletion] Falha opcional ao limpar ${table}:`, error);
    }
  } catch (error) {
    console.warn(`[ClassDeletion] Falha opcional ao limpar ${table}:`, error);
  }
}

export async function deleteClassTrail(classeId: number) {
  const { topicIds, conteudoIds, atividadeIds, questionIds, storagePaths } = await fetchTrailIds(classeId);
  if (topicIds.length === 0) return;

  await deleteStoragePaths(storagePaths);

  await tryDeleteEq("telemetria_lotes", "classe_id", classeId);
  await tryDeleteEq("telemetria_sessoes", "classe_id", classeId);
  await tryDeleteEq("personalizacao_item_progresso", "classe_id", classeId);
  await tryDeleteEq("fontes_personalizacao", "classe_id", classeId);
  await tryDeleteEq("trilha_checkpoint_navegacao", "classe_id", classeId);
  await tryDeleteEq("ranks", "classe_id", classeId);
  await tryDeleteEq("classe_aluno", "classe_id", classeId);

  await tryDeleteIn("topico_aluno", "topico_id", topicIds);
  await tryDeleteIn("conteudo_aluno", "conteudo_id", conteudoIds);
  await tryDeleteIn("atividade_aluno", "atividade_id", atividadeIds);
  await tryDeleteIn("questao_aluno", "questao_id", questionIds);
  await tryDeleteIn("materiais_gerados", "conteudo_id", conteudoIds);
  await tryDeleteIn("conteudo_personalizado", "conteudo_id", conteudoIds);
  await tryDeleteIn("conteudo_personalizado", "topico_id", topicIds);
  await tryDeleteIn("fontes_personalizacao", "topico_id", topicIds);
  await tryDeleteIn("fontes_personalizacao", "conteudo_id", conteudoIds);
  await tryDeleteIn("personalizacao_item_progresso", "topico_id", topicIds);

  if (atividadeIds.length > 0) {
    const { error: e1 } = await supabase.from("questoes").delete().in("atividade_id", atividadeIds);
    if (e1) throw e1;
    const { error: e2 } = await supabase.from("atividade_conteudos").delete().in("atividade_id", atividadeIds);
    if (e2) throw e2;
  }

  if (conteudoIds.length > 0) {
    const { error: e3 } = await supabase.from("cards").delete().in("conteudo_id", conteudoIds);
    if (e3) throw e3;
    const { error: e4 } = await supabase.from("atividade_conteudos").delete().in("conteudo_id", conteudoIds);
    if (e4) throw e4;
  }

  if (atividadeIds.length > 0) {
    const { error: e5 } = await supabase.from("atividades").delete().in("id", atividadeIds);
    if (e5) throw e5;
  }

  if (conteudoIds.length > 0) {
    const { error: e6 } = await supabase.from("conteudos").delete().in("id", conteudoIds);
    if (e6) throw e6;
  }

  const { error: e7 } = await supabase.from("topicos").delete().in("id", topicIds);
  if (e7) throw e7;
}

export async function deleteClasseCascade(classeId: number) {
  await deleteClassTrail(classeId);
  await tryDeleteEq("telemetria_lotes", "classe_id", classeId);
  await tryDeleteEq("telemetria_sessoes", "classe_id", classeId);
  await tryDeleteEq("personalizacao_item_progresso", "classe_id", classeId);
  await tryDeleteEq("fontes_personalizacao", "classe_id", classeId);
  await tryDeleteEq("trilha_checkpoint_navegacao", "classe_id", classeId);

  const { error: rankError } = await dynamicSupabase.from("ranks").delete().eq("classe_id", classeId);
  if (rankError) throw rankError;

  const { error: classeAlunoError } = await supabase.from("classe_aluno").delete().eq("classe_id", classeId);
  if (classeAlunoError) throw classeAlunoError;

  const { error: classeError } = await supabase.from("classe").delete().eq("id", classeId);
  if (classeError) throw classeError;
}
