import { createClient } from "@supabase/supabase-js";
import { createKeyedQueue } from "../lib/serialQueue";
import { createLogger } from "../lib/logger";
import type { MaterialEntryLike } from "../lib/materialsMerge";

const log = createLogger({ ctx: "supabase" });

function getClient() {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");
  }
  return createClient(url, key);
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    (process.env.SUPABASE_URL ?? "").trim() &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim()
  );
}

export async function uploadBuffer(
  bucket: string,
  storagePath: string,
  data: Buffer,
  contentType: string
): Promise<string | null> {
  const client = getClient();
  const { error } = await client.storage
    .from(bucket)
    .upload(storagePath, data, { contentType, upsert: true });

  if (error) {
    throw new Error(`[supabase] upload falhou (${storagePath}): ${error.message}`);
  }

  const { data: urlData } = client.storage
    .from(bucket)
    .getPublicUrl(storagePath);

  return urlData?.publicUrl ?? null;
}

// Uma parte entregavel de uma midia (ver splitProcessedContentIntoParts) -
// arquivo_url/storage_path no nivel do MaterialEntry continuam apontando
// pra parte 1, por compatibilidade com qualquer consumidor que ainda so
// conheca um arquivo por midia; "partes" e o jeito novo, multi-arquivo.
export interface MaterialPart {
  ordem: number;
  titulo: string;
  arquivo_url: string | null;
  storage_path: string | null;
}

export interface MaterialEntry {
  payload?: Record<string, unknown>;
  metadata: {
    status: string;
    media_kind: string;
    updated_at: string;
    generation_key?: string;
    bucket?: string;
    engine?: string;
    schema?: string;
    media_pipeline_version?: string;
    engine_variant?: "immersive";
    error_stage?: "render" | "upload";
    error?: string;
  };
  arquivo_url: string | null;
  storage_path: string | null;
  bucket?: string;
  mime_type?: string;
  partes?: MaterialPart[];
}

export interface GenerationFence {
  cicloId: string;
  sourceHash: string;
  generationKey: string;
}

export interface PersistedMaterialEntry extends MaterialEntryLike {
  payload?: Record<string, unknown>;
  arquivo_url?: string | null;
  storage_path?: string | null;
  bucket?: string;
  mime_type?: string;
}

export interface PersistedMaterialsMerge {
  status: string;
  materiais: Record<string, PersistedMaterialEntry>;
  generation_key: string;
}

export interface MaterialGeradoSnapshot {
  tipo: string;
  payload: Record<string, unknown> | null;
  arquivo_url: string | null;
  storage_path: string | null;
  metadata: Record<string, unknown>;
}

// Serialização in-process por personalizacao_id. Ver src/lib/serialQueue.ts.
const personalizacaoQueue = createKeyedQueue<number>();
const withPersonalizacaoLock = <T>(id: number, fn: () => Promise<T>) =>
  personalizacaoQueue.enqueue(id, fn);

/**
 * Inicia um heartbeat que atualiza `updated_at` da personalização periodicamente
 * enquanto o job está em execução. Permite que recoverStaleJobs use threshold
 * muito mais agressivo (ex.: 3min) sem matar jobs legítimos longos.
 *
 * Retorna função de cleanup que para o heartbeat. SEMPRE chame em finally.
 *
 * Não passa pelo lock per-id porque o payload é apenas { updated_at } — em
 * caso de race com merge, ambos escrevem timestamps quase iguais (não há
 * conflito real de dados).
 */
export function startJobHeartbeat(
  personalizacaoId: number,
  intervalMs: number,
  fence?: GenerationFence,
): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const client = getClient();
      let query = client
        .from("conteudo_personalizado")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", personalizacaoId)
        .eq("status", "processando_midias"); // só bate em jobs ativos
      if (fence) {
        query = query.eq("ciclo_id", fence.cicloId).eq("source_hash", fence.sourceHash);
      }
      await query;
    } catch (err) {
      log.error("heartbeat erro", { personalizacaoId, err });
    }
  };
  const handle = setInterval(tick, intervalMs);
  // Não bloqueia shutdown — graceful shutdown faz sentido mesmo com heartbeat ativo.
  handle.unref();
  return () => {
    stopped = true;
    clearInterval(handle);
  };
}

/**
 * Busca personalizações com status `processando_midias` antigas (provavelmente
 * órfãs de processos que crasharam) e marca como falha. Útil para chamar no
 * startup do servidor — libera TrailUp para retentar.
 *
 * `olderThanMs` define a idade mínima (em ms) para considerar um job órfão.
 * Deve ser >= MAX_JOB_DURATION_MS no server para não matar jobs em execução
 * legítima de outras instâncias.
 *
 * Retorna a quantidade de jobs marcados como falha.
 */
export async function recoverStaleJobs(olderThanMs: number): Promise<number> {
  try {
    const client = getClient();
    const threshold = new Date(Date.now() - olderThanMs).toISOString();

    const { data, error } = await client
      .from("conteudo_personalizado")
      .select("id, updated_at, ciclo_id, source_hash")
      .eq("status", "processando_midias")
      .lt("updated_at", threshold);

    if (error) {
      log.error("recoverStaleJobs query error", { msg: error.message });
      return 0;
    }
    if (!data || data.length === 0) return 0;

    let count = 0;
    for (const row of data) {
      const age = Date.now() - new Date(row.updated_at).getTime();
      const cicloId = row.ciclo_id == null ? "" : String(row.ciclo_id);
      const sourceHash = row.source_hash == null ? "" : String(row.source_hash);
      if (!cicloId || !sourceHash) {
        log.warn("recoverStaleJobs ignorou registro sem fence", {
          personalizacaoId: row.id,
        });
        continue;
      }
      const marked = await markPersonalizacaoFailed(
        row.id as number,
        `job órfão recuperado no startup (idade ${Math.round(age / 1000)}s; provavelmente processo crashou)`,
        {
          cicloId,
          sourceHash,
          generationKey: `${cicloId}:${sourceHash}`,
        },
      );
      if (marked) count++;
    }
    return count;
  } catch (err) {
    log.error("recoverStaleJobs exception", { err });
    return 0;
  }
}

export async function markPersonalizacaoFailed(
  personalizacaoId: number,
  errorMessage: string,
  fence?: GenerationFence,
): Promise<boolean> {
  if (fence) {
    try {
      const result = await tryRpc<boolean>(
        "mark_personalizacao_failed_v2",
        {
          p_id: personalizacaoId,
          p_error_message: errorMessage,
          p_ciclo_id: fence.cicloId,
          p_source_hash: fence.sourceHash,
        },
        "api/alembic/versions/20260728_02_drop_legacy_content_unique.py",
        false,
      );
      if (!result.ok) {
        log.error("mark_personalizacao_failed_v2 ausente", { personalizacaoId });
        return false;
      }
      return result.data === true;
    } catch (err) {
      log.error("markPersonalizacaoFailed v2", { personalizacaoId, err });
      return false;
    }
  }

  // Tenta primeiro o RPC atômico (cross-instance safe).
  try {
    const result = await tryRpc<null>(
      "mark_personalizacao_failed",
      { p_id: personalizacaoId, p_error_message: errorMessage },
      "sql/migrations/0002_mark_personalizacao_failed_rpc.sql"
    );
    if (result.ok) return true;
  } catch (err) {
    log.error("markPersonalizacaoFailed via RPC", { personalizacaoId, err });
    return false;
  }

  // Fallback JS — protegido pelo lock in-process (não cross-instance).
  return withPersonalizacaoLock(personalizacaoId, async () => {
    try {
      const client = getClient();

      const { data, error } = await client
        .from("conteudo_personalizado")
        .select("materiais")
        .eq("id", personalizacaoId)
        .single();

      if (error) {
        log.error("markPersonalizacaoFailed fetch error", { personalizacaoId, msg: error.message });
        return false;
      }

      const current = (data?.materiais ?? {}) as Record<string, unknown>;
      const merged = {
        ...current,
        erro: { mensagem: errorMessage, updated_at: new Date().toISOString() },
      };

      const { error: updateError } = await client
        .from("conteudo_personalizado")
        .update({
          status: "failed",
          materiais: merged,
          updated_at: new Date().toISOString(),
        })
        .eq("id", personalizacaoId);
      if (updateError) {
        log.error("markPersonalizacaoFailed update error", {
          personalizacaoId,
          msg: updateError.message,
        });
        return false;
      }
      return true;
    } catch (err) {
      log.error("markPersonalizacaoFailed exception", { personalizacaoId, err });
      return false;
    }
  });
}

/**
 * Extrai do retorno canônico do RPC apenas os formatos desta geração.
 *
 * Em retries, um upload recém-tentado pode falhar enquanto o RPC preserva um
 * artefato `completed` anterior da mesma geração. Por isso esta função nunca
 * recebe os updates tentados: o histórico deve espelhar o agregado persistido.
 */
export function buildMateriaisGeradosSnapshot(
  persisted: PersistedMaterialsMerge,
  fence: GenerationFence,
  tipos: string[],
): MaterialGeradoSnapshot[] {
  if (
    fence.generationKey !== `${fence.cicloId}:${fence.sourceHash}`
    || persisted.generation_key !== fence.generationKey
  ) {
    throw new Error("aggregate persistido pertence a outra generation_key");
  }

  return [...new Set(tipos)].map((tipo) => {
    const entry = persisted.materiais?.[tipo];
    if (!entry || entry.metadata?.generation_key !== fence.generationKey) {
      throw new Error(
        `material persistido ${tipo} ausente ou pertence a outra generation_key`
      );
    }

    return {
      tipo,
      payload: entry.payload ?? null,
      arquivo_url: entry.arquivo_url ?? null,
      storage_path: entry.storage_path ?? null,
      metadata: { ...entry.metadata },
    };
  });
}

export async function saveMateriaisGerados(
  personalizacaoId: number,
  persisted: PersistedMaterialsMerge,
  fence: GenerationFence,
  tipos: string[],
): Promise<boolean> {
  const entries = buildMateriaisGeradosSnapshot(persisted, fence, tipos);

  try {
    const client = getClient();

    const { data, error } = await client
      .from("conteudo_personalizado")
      .select("aluno_id, conteudo_id")
      .eq("id", personalizacaoId)
      .eq("ciclo_id", fence.cicloId)
      .eq("source_hash", fence.sourceHash)
      .maybeSingle();

    if (error || !data) {
      log.warn("saveMateriaisGerados ignorou generation stale", {
        personalizacaoId,
        generationKey: fence.generationKey,
        msg: error?.message,
      });
      return false;
    }

    const rows = entries.map((e) => ({
      aluno_id:          data.aluno_id,
      conteudo_id:       data.conteudo_id ?? null,
      personalizacao_id: personalizacaoId,
      tipo:              e.tipo,
      payload:           e.payload,
      arquivo_url:       e.arquivo_url,
      storage_path:      e.storage_path,
      metadata:          e.metadata,
    }));

    const { error: upsertError } = await client
      .from("materiais_gerados")
      .upsert(rows, {
        onConflict: "personalizacao_id,tipo,generation_key",
      });
    if (upsertError) {
      log.error("saveMateriaisGerados upsert error", {
        personalizacaoId,
        msg: upsertError.message,
      });
      return false;
    }
    return true;
  } catch (err) {
    log.error("saveMateriaisGerados exception", { personalizacaoId, err });
    return false;
  }
}

// Cache one-shot por nome de função RPC: true=disponível, false=ausente.
// Evita warn repetido enquanto migrações não foram aplicadas.
const _rpcAvailability = new Map<string, boolean>();

/**
 * Tenta executar um RPC. Em caso de "função não existe" (código 42883
 * do PG ou substring do supabase-rest), marca o RPC como indisponível
 * e retorna `{ ok: false }` para o caller cair no fallback. Outros
 * erros propagam.
 */
async function tryRpc<T = unknown>(
  rpcName: string,
  args: Record<string, unknown>,
  migrationHint: string,
  cacheMissing = true,
): Promise<{ ok: true; data: T } | { ok: false }> {
  if (cacheMissing && _rpcAvailability.get(rpcName) === false) return { ok: false };

  const client = getClient();
  const { data, error } = await client.rpc(rpcName, args);

  if (error) {
    const isMissingFn =
      error.code === "42883" ||
      /function .* does not exist|could not find the function/i.test(error.message ?? "");
    if (isMissingFn) {
      if (!cacheMissing || !_rpcAvailability.has(rpcName)) {
        log.warn("RPC ausente — fallback JS", { rpcName, migrationHint });
      }
      if (cacheMissing) _rpcAvailability.set(rpcName, false);
      return { ok: false };
    }
    throw new Error(`[supabase] RPC ${rpcName} falhou: ${error.message}`);
  }

  _rpcAvailability.set(rpcName, true);
  return { ok: true, data: data as T };
}

export async function mergePersonalizacaoMateriais(
  personalizacaoId: number,
  updates: Record<string, MaterialEntry>,
  fence: GenerationFence,
): Promise<PersistedMaterialsMerge> {
  if (fence.generationKey !== `${fence.cicloId}:${fence.sourceHash}`) {
    throw new Error("generation_key inconsistente com ciclo_id/source_hash");
  }

  const result = await tryRpc<PersistedMaterialsMerge>(
    "merge_personalizacao_materiais_v2",
    {
      p_id: personalizacaoId,
      p_updates: updates,
      p_ciclo_id: fence.cicloId,
      p_source_hash: fence.sourceHash,
    },
    "api/alembic/versions/20260728_02_drop_legacy_content_unique.py",
    false,
  );
  if (!result.ok) {
    throw new Error(
      "RPC merge_personalizacao_materiais_v2 ausente; aplique a migration 20260728_02."
    );
  }
  if (!result.data || typeof result.data !== "object") {
    throw new Error("RPC merge_personalizacao_materiais_v2 retornou payload invalido.");
  }
  return result.data;
}
