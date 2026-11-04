import type { ChamadaDoDeck } from "../utils/slideBatchPlanner";

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
  /** Chamadas ao modelo que geraram (ou tentaram gerar) esta parte (#775). */
  chamadas?: ChamadaDoDeck[];
}

export interface MaterialPart {
  ordem: number;
  titulo?: string;
  arquivo_url: string | null;
  storage_path: string | null;
  failed?: boolean;
  // Motivo da falha DESTA parte (#776). Sem ele, o motivo so vivia na
  // metadata agregada, e a parte seguinte que dava certo o apagava.
  failure?: PresentationFailure;
  // finishReason, modelo e tokens de cada chamada ao modelo (#775), inclusive
  // as que deram certo. Antes so o log do BrainHexPDF tinha isso.
  chamadas?: ChamadaDoDeck[];
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

/**
 * A apresentacao gravada e' desta geracao e desta versao do deck? So' entao
 * as partes dela entram na agregacao. Os campos sao os que a RPC
 * `merge_personalizacao_materiais_v2` compara para preservar um `completed`.
 */
export function apresentacaoDaMesmaVersao(
  metadata: Record<string, unknown> | null | undefined,
  versao: PresentationVersionMetadata,
  generationKey: string,
): boolean {
  if (!metadata) return false;
  return (
    metadata.generation_key === generationKey &&
    metadata.engine === versao.engine &&
    metadata.design_system === versao.design_system &&
    metadata.media_pipeline_version === versao.media_pipeline_version
  );
}

export function computeAggregatedApresentacaoEntry(
  currentPartes: MaterialPart[],
  novaParte: MaterialPart,
  totalPartes: number,
  currentStatus: string,
): { partes: MaterialPart[]; status: string; headline: { arquivo_url: string | null; storage_path: string | null } } {
  // Parte com ordem acima do total e' de uma geracao anterior que tinha mais
  // partes: a regeracao reusa o mesmo fence (source_hash nao muda), e sem este
  // corte a parte velha ficava para sempre e prendia o status em `failed`
  // (socializer, turma 68, 02/11: 7 partes geradas, 8 gravadas).
  const mergedPartes = [
    ...currentPartes.filter((p) => p.ordem !== novaParte.ordem && p.ordem <= totalPartes),
    novaParte,
  ].sort((a, b) => a.ordem - b.ordem);

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

/**
 * Motivo que a metadata agregada mostra (#776): enquanto alguma parte estiver
 * `failed`, o motivo fica - mesmo que a ultima parte a chegar tenha dado certo.
 * Ordem: a parte que acabou de falhar, a primeira parte falha que guardou o
 * proprio motivo, e por fim o motivo que ja estava na metadata (partes gravadas
 * antes de `MaterialPart.failure` existir nao tem motivo proprio).
 */
export function aggregatedApresentacaoFailure(
  status: string,
  partes: MaterialPart[],
  novaParteFailure: PresentationFailure | null,
  currentMetadata: { error_stage?: unknown; error?: unknown } | null | undefined,
): PresentationFailure | null {
  if (status !== "failed") return null;
  if (novaParteFailure) return novaParteFailure;
  const daParte = partes.find((p) => p.failed && p.failure)?.failure;
  if (daParte) return daParte;
  if (typeof currentMetadata?.error === "string" && currentMetadata.error) {
    return {
      stage: typeof currentMetadata.error_stage === "string" ? currentMetadata.error_stage : "unknown",
      error: currentMetadata.error,
    };
  }
  return null;
}

// Gravacoes multi-parte em andamento, por personalizacao.
const gravacoesPorPersonalizacao = new Map<number, Promise<unknown>>();

/**
 * Roda `trabalho` depois de todas as gravacoes ja enfileiradas para a mesma
 * personalizacao, uma de cada vez. Falha de uma nao trava a fila.
 */
export function emFilaPorPersonalizacao<T>(personalizacaoId: number, trabalho: () => Promise<T>): Promise<T> {
  const anterior = gravacoesPorPersonalizacao.get(personalizacaoId) ?? Promise.resolve();
  const atual = anterior.then(trabalho);
  const cauda = atual.catch(() => undefined);
  gravacoesPorPersonalizacao.set(personalizacaoId, cauda);
  void cauda.then(() => {
    if (gravacoesPorPersonalizacao.get(personalizacaoId) === cauda) {
      gravacoesPorPersonalizacao.delete(personalizacaoId);
    }
  });
  return atual;
}

/**
 * Grava a apresentacao (ou uma parte dela) em `conteudo_personalizado.materiais`.
 *
 * Multi-parte e' SELECT + merge da chave `apresentacao` inteira (a RPC faz `||`
 * no primeiro nivel), e o microservice renderiza as partes em paralelo. Duas
 * partes que liam o mesmo estado gravavam cada uma por cima da outra, e a que
 * gravava primeiro sumia: a parte velha ficava no lugar, sem o motivo da falha
 * nova (socializer, turma 68, 02/11: partes 1 e 6 com titulos da geracao
 * anterior). Por isso as partes da mesma personalizacao passam em fila. A fila
 * e' do processo: vale enquanto o BrainHexPDF rodar numa instancia so'.
 */
export async function persistApresentacaoResult(
  client: SupabaseClientLike,
  params: PersistApresentacaoParams,
): Promise<{ dbWritten: boolean; error?: string }> {
  if (params.totalPartes > 1) {
    return emFilaPorPersonalizacao(params.fence.personalizacaoId, () => gravarApresentacao(client, params));
  }
  return gravarApresentacao(client, params);
}

async function gravarApresentacao(
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
    ...(params.presentationUrl === null && params.failure ? { failure: params.failure } : {}),
    ...(params.chamadas && params.chamadas.length > 0 ? { chamadas: params.chamadas } : {}),
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
    const atual = currentRow?.materiais?.apresentacao;
    // Partes de outra versao do deck (ou de outra geracao) nao contam: sem
    // isto, a primeira parte nova se somava as antigas, o deck ficava
    // `completed` com o carimbo da versao nova, e a RPC passava a recusar em
    // silencio as partes seguintes (ela preserva o `completed` da mesma
    // geracao e versao) - turma 66, 04/11: 1 parte nova e 2 velhas.
    const mesmaVersao = apresentacaoDaMesmaVersao(atual?.metadata, params.versionMetadata, generationKey);
    const currentPartes: MaterialPart[] = mesmaVersao ? atual?.partes ?? [] : [];
    const currentStatus: string = mesmaVersao ? atual?.metadata?.status ?? "pending" : "pending";
    const aggregated = computeAggregatedApresentacaoEntry(currentPartes, novaParte, params.totalPartes, currentStatus);
    apresentacao = {
      payload: { slides: [] as never[], tema_visual: null },
      metadata: buildApresentacaoMetadata({
        status: aggregated.status,
        versionMetadata: params.versionMetadata,
        generationKey,
        bucket: aggregated.headline.arquivo_url ? params.bucket : null,
        failure: aggregatedApresentacaoFailure(
          aggregated.status,
          aggregated.partes,
          novaParte.failed ? params.failure : null,
          currentRow?.materiais?.apresentacao?.metadata,
        ),
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
      ...(params.chamadas && params.chamadas.length > 0 ? { chamadas: params.chamadas } : {}),
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
