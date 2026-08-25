export interface GenerationFence {
  personalizacaoId: number;
  cicloId: string;
  sourceHash: string;
}

export function generationKeyFor(fence: GenerationFence): string {
  return `${fence.cicloId}:${fence.sourceHash}`;
}

export interface PresentationVersionMetadata {
  engine: string;
  schema: string;
  design_system: string;
  media_pipeline_version: string;
}

export interface PresentationFailure {
  stage: string;
  error: string;
}

export interface PersistApresentacaoParams {
  fence: GenerationFence;
  versionMetadata: PresentationVersionMetadata;
  bucket: string;
  storagePath: string;
  presentationUrl: string | null;
  failure: PresentationFailure | null;
  ordem: number;
  totalPartes: number;
  titulo?: string;
}

export interface MaterialPart {
  ordem: number;
  titulo?: string;
  arquivo_url: string | null;
  storage_path: string | null;
  failed?: boolean;
}

interface SupabaseRpcResult {
  data: unknown;
  error: { message: string } | null;
}

interface SupabaseSelectResult {
  data: { aluno_id: string; conteudo_id: number | null; materiais: any } | null;
  error: unknown;
}

export interface SupabaseClientLike {
  // PromiseLike (nao Promise) de proposito: o SupabaseClient real devolve um
  // PostgrestFilterBuilder "thenable" pra .rpc()/.upsert(), nao um Promise
  // estrito - await funciona igual, mas a tipagem estrutural do TS so bate
  // com PromiseLike.
  rpc(name: string, args: Record<string, unknown>): PromiseLike<SupabaseRpcResult>;
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: unknown): {
        eq(col: string, val: unknown): {
          eq(col: string, val: unknown): { maybeSingle(): PromiseLike<SupabaseSelectResult> };
        };
      };
    };
    upsert(rows: unknown[], opts: { onConflict: string }): PromiseLike<{ error: { message: string } | null }>;
  };
}

function buildApresentacaoMetadata(params: {
  // string, nao só "completed"|"failed": a agregacao multi-parte tambem
  // passa o status intermediario atual do banco quando ainda faltam
  // partes chegar.
  status: string;
  versionMetadata: PresentationVersionMetadata;
  generationKey: string;
  bucket: string | null;
  failure: PresentationFailure | null;
}) {
  return {
    status: params.status,
    media_kind: "apresentacao",
    ...params.versionMetadata,
    generation_key: params.generationKey,
    updated_at: new Date().toISOString(),
    ...(params.bucket ? { bucket: params.bucket } : {}),
    ...(params.failure ? { error_stage: params.failure.stage, error: params.failure.error } : {}),
  };
}

export function computeAggregatedApresentacaoEntry(
  currentPartes: MaterialPart[],
  novaParte: MaterialPart,
  totalPartes: number,
  currentStatus: string,
): { partes: MaterialPart[]; status: string; headline: { arquivo_url: string | null; storage_path: string | null } } {
  const mergedPartes = [...currentPartes.filter((p) => p.ordem !== novaParte.ordem), novaParte].sort(
    (a, b) => a.ordem - b.ordem,
  );

  const anyFailed = mergedPartes.some((p) => p.failed);
  const allArrived = mergedPartes.length === totalPartes;

  let status: string;
  if (anyFailed) {
    status = "failed";
  } else if (allArrived) {
    status = "completed";
  } else {
    status = currentStatus;
  }

  return {
    partes: mergedPartes,
    status,
    headline: {
      arquivo_url: mergedPartes[0]?.arquivo_url ?? null,
      storage_path: mergedPartes[0]?.storage_path ?? null,
    },
  };
}

export async function persistApresentacaoResult(
  client: SupabaseClientLike,
  params: PersistApresentacaoParams,
): Promise<{ dbWritten: boolean; error?: string }> {
  const generationKey = generationKeyFor(params.fence);
  const novaParte: MaterialPart = {
    ordem: params.ordem,
    titulo: params.titulo,
    arquivo_url: params.presentationUrl,
    storage_path: params.presentationUrl ? params.storagePath : null,
    failed: params.presentationUrl === null,
  };

  // Multi-parte precisa do estado atual (partes ja gravadas por chamadas
  // anteriores) ANTES de montar o p_updates - o merge e por chave inteira,
  // nao por sub-chave dentro de partes[].
  let currentRow: { aluno_id: string; conteudo_id: number | null; materiais: any } | null = null;
  if (params.totalPartes > 1) {
    const { data, error: preSelectError } = await client
      .from("conteudo_personalizado")
      .select("aluno_id, conteudo_id, materiais")
      .eq("id", params.fence.personalizacaoId)
      .eq("ciclo_id", params.fence.cicloId)
      .eq("source_hash", params.fence.sourceHash)
      .maybeSingle();
    if (preSelectError) {
      console.warn(
        "persistApresentacaoResult: SELECT previo (multi-parte) falhou (generation_key=%s)",
        generationKey,
        preSelectError,
      );
      return { dbWritten: false, error: (preSelectError as any)?.message ?? "select falhou" };
    }
    currentRow = data;
    if (!currentRow) {
      console.warn(
        "persistApresentacaoResult: geracao obsoleta (generation_key=%s nao encontrada) - nada a agregar",
        generationKey,
      );
      return { dbWritten: true };
    }
  }

  let apresentacao: Record<string, unknown>;
  if (params.totalPartes > 1) {
    const currentPartes: MaterialPart[] = currentRow?.materiais?.apresentacao?.partes ?? [];
    const currentStatus: string = currentRow?.materiais?.apresentacao?.metadata?.status ?? "pending";
    const aggregated = computeAggregatedApresentacaoEntry(currentPartes, novaParte, params.totalPartes, currentStatus);
    apresentacao = {
      payload: { slides: [] as never[], tema_visual: null },
      metadata: buildApresentacaoMetadata({
        status: aggregated.status,
        versionMetadata: params.versionMetadata,
        generationKey,
        bucket: aggregated.headline.arquivo_url ? params.bucket : null,
        failure: novaParte.failed ? params.failure : null,
      }),
      arquivo_url: aggregated.headline.arquivo_url,
      storage_path: aggregated.headline.storage_path,
      partes: aggregated.partes,
      ...(aggregated.headline.arquivo_url ? { bucket: params.bucket, mime_type: "text/html; charset=utf-8" } : {}),
    };
  } else {
    const status: "completed" | "failed" = params.presentationUrl ? "completed" : "failed";
    apresentacao = {
      payload: { slides: [] as never[], tema_visual: null },
      metadata: buildApresentacaoMetadata({
        status,
        versionMetadata: params.versionMetadata,
        generationKey,
        bucket: params.presentationUrl ? params.bucket : null,
        failure: params.failure,
      }),
      arquivo_url: params.presentationUrl,
      storage_path: params.presentationUrl ? params.storagePath : null,
      ...(params.presentationUrl ? { bucket: params.bucket, mime_type: "text/html; charset=utf-8" } : {}),
    };
  }

  const { error: rpcError } = await client.rpc("merge_personalizacao_materiais_v2", {
    p_id: params.fence.personalizacaoId,
    p_updates: { apresentacao },
    p_ciclo_id: params.fence.cicloId,
    p_source_hash: params.fence.sourceHash,
  });
  if (rpcError) {
    return { dbWritten: false, error: rpcError.message };
  }

  let row = currentRow;
  let selectError: unknown = null;
  if (!row) {
    const result = await client
      .from("conteudo_personalizado")
      .select("aluno_id, conteudo_id, materiais")
      .eq("id", params.fence.personalizacaoId)
      .eq("ciclo_id", params.fence.cicloId)
      .eq("source_hash", params.fence.sourceHash)
      .maybeSingle();
    row = result.data;
    selectError = result.error;
  }

  if (selectError) {
    console.warn(
      "persistApresentacaoResult: SELECT em conteudo_personalizado falhou (geracao_key=%s), pulando upsert de historico",
      generationKey,
      selectError,
    );
    return { dbWritten: true };
  }

  if (!row) {
    console.warn(
      "persistApresentacaoResult: geracao obsoleta (generation_key=%s nao encontrada) - upsert de historico ignorado",
      generationKey,
    );
    return { dbWritten: true };
  }

  const { error: upsertError } = await client.from("materiais_gerados").upsert(
    [
      {
        aluno_id: row.aluno_id,
        conteudo_id: row.conteudo_id ?? null,
        personalizacao_id: params.fence.personalizacaoId,
        tipo: "apresentacao",
        payload: apresentacao.payload,
        arquivo_url: apresentacao.arquivo_url,
        storage_path: apresentacao.storage_path,
        metadata: apresentacao.metadata,
      },
    ],
    { onConflict: "personalizacao_id,tipo,generation_key" },
  );
  if (upsertError) {
    console.error("persistApresentacaoResult: upsert materiais_gerados falhou", upsertError.message);
  }

  return { dbWritten: true };
}
