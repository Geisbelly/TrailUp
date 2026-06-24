import { createClient } from "@supabase/supabase-js";
import { createKeyedQueue } from "../lib/serialQueue";
import { createLogger } from "../lib/logger";
import { computeMergedMaterials, type MaterialsMap } from "../lib/materialsMerge";

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

export interface MaterialEntry {
  payload?: Record<string, unknown>;
  metadata: {
    status: string;
    media_kind: string;
    updated_at: string;
    bucket?: string;
  };
  arquivo_url: string | null;
  storage_path: string | null;
  bucket?: string;
  mime_type?: string;
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
  intervalMs: number
): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const client = getClient();
      await client
        .from("conteudo_personalizado")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", personalizacaoId)
        .eq("status", "processando_midias"); // só bate em jobs ativos
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
      .select("id, updated_at")
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
      await markPersonalizacaoFailed(
        row.id as number,
        `job órfão recuperado no startup (idade ${Math.round(age / 1000)}s; provavelmente processo crashou)`
      );
      count++;
    }
    return count;
  } catch (err) {
    log.error("recoverStaleJobs exception", { err });
    return 0;
  }
}

export async function markPersonalizacaoFailed(
  personalizacaoId: number,
  errorMessage: string
): Promise<void> {
  // Tenta primeiro o RPC atômico (cross-instance safe).
  try {
    const result = await tryRpc<null>(
      "mark_personalizacao_failed",
      { p_id: personalizacaoId, p_error_message: errorMessage },
      "sql/migrations/0002_mark_personalizacao_failed_rpc.sql"
    );
    if (result.ok) return;
  } catch (err) {
    log.error("markPersonalizacaoFailed via RPC", { personalizacaoId, err });
    return;
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
      }

      const current = (data?.materiais ?? {}) as Record<string, unknown>;
      const merged = {
        ...current,
        erro: { mensagem: errorMessage, updated_at: new Date().toISOString() },
      };

      await client
        .from("conteudo_personalizado")
        .update({
          status: "falha",
          materiais: merged,
          updated_at: new Date().toISOString(),
        })
        .eq("id", personalizacaoId);
    } catch (err) {
      log.error("markPersonalizacaoFailed exception", { personalizacaoId, err });
    }
  });
}

export async function saveMateriaisGerados(
  personalizacaoId: number,
  entries: Array<{
    tipo: string;
    payload: Record<string, unknown> | null;
    arquivo_url: string | null;
    storage_path: string | null;
    metadata: Record<string, unknown>;
  }>
): Promise<void> {
  try {
    const client = getClient();

    const { data, error } = await client
      .from("conteudo_personalizado")
      .select("aluno_id, conteudo_id")
      .eq("id", personalizacaoId)
      .single();

    if (error || !data) {
      log.error("saveMateriaisGerados fetch error", { personalizacaoId, msg: error?.message });
      return;
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

    const { error: insertError } = await client.from("materiais_gerados").insert(rows);
    if (insertError) {
      log.error("saveMateriaisGerados insert error", { personalizacaoId, msg: insertError.message });
    }
  } catch (err) {
    log.error("saveMateriaisGerados exception", { personalizacaoId, err });
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
  migrationHint: string
): Promise<{ ok: true; data: T } | { ok: false }> {
  if (_rpcAvailability.get(rpcName) === false) return { ok: false };

  const client = getClient();
  const { data, error } = await client.rpc(rpcName, args);

  if (error) {
    const isMissingFn =
      error.code === "42883" ||
      /function .* does not exist|could not find the function/i.test(error.message ?? "");
    if (isMissingFn) {
      if (!_rpcAvailability.has(rpcName)) {
        log.warn("RPC ausente — fallback JS", { rpcName, migrationHint });
      }
      _rpcAvailability.set(rpcName, false);
      return { ok: false };
    }
    throw new Error(`[supabase] RPC ${rpcName} falhou: ${error.message}`);
  }

  _rpcAvailability.set(rpcName, true);
  return { ok: true, data: data as T };
}

export async function mergePersonalizacaoMateriais(
  personalizacaoId: number,
  updates: Record<string, MaterialEntry>
): Promise<void> {
  // Tenta primeiro o RPC atômico (cross-instance safe via pg_advisory_xact_lock).
  // Se não disponível, cai no fallback JS protegido pelo lock in-process
  // (cross-instance NÃO safe — limitação documentada em serialQueue.ts).
  try {
    const result = await tryRpc<string>(
      "merge_personalizacao_materiais",
      { p_id: personalizacaoId, p_updates: updates },
      "sql/migrations/0001_merge_personalizacao_materiais_rpc.sql"
    );
    if (result.ok) return;
  } catch (err) {
    log.error("mergePersonalizacaoMateriais via RPC", { personalizacaoId, err });
    return; // erro real do RPC — não cair pra JS pra evitar duplicar trabalho
  }

  // Fallback JS — mantém a impl original, agora dentro do lock in-process.
  return withPersonalizacaoLock(personalizacaoId, async () => {
    try {
      const client = getClient();

      const { data, error } = await client
        .from("conteudo_personalizado")
        .select("materiais, status")
        .eq("id", personalizacaoId)
        .single();

      if (error || !data) {
        log.error("fetch personalizacao error", { personalizacaoId, msg: error?.message });
        return;
      }

      // Toda a lógica de filtro + cálculo de status agregado vive em
      // src/lib/materialsMerge.ts (testado). A função SQL em
      // sql/migrations/0001_*.sql replica este comportamento — mantenha
      // os dois em sincronia se mudar a lógica aqui.
      const { merged, newStatus } = computeMergedMaterials(
        data.materiais as MaterialsMap | null,
        updates as MaterialsMap,
        data.status as string
      );

      const { error: updateError } = await client
        .from("conteudo_personalizado")
        .update({
          materiais:  merged,
          status:     newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", personalizacaoId);

      if (updateError) {
        log.error("update materiais error", { personalizacaoId, msg: updateError.message });
      }
    } catch (err) {
      log.error("mergePersonalizacaoMateriais exception", { personalizacaoId, err });
    }
  });
}
