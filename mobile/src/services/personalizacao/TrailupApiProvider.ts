import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/database/supabase";
import {
  isNetworkRequestFailedError,
  resolveApiBaseCandidates,
} from "@/services/apiBaseUrl";
import {
  PersonalizacaoAuthError,
  PersonalizacaoNetworkError,
  PersonalizacaoRlsError,
} from "@/services/personalizacao/errors";
import type {
  CardPersonalizadoRecord,
  ListarJobsParams,
  ListarPersonalizacoesPerfilParams,
  MentorChatPayload,
  MentorChatResponse,
  PersonalizacaoJobRecord,
  PersonalizacaoListResponse,
  PersonalizacaoProgressDirectPayload,
  PersonalizacaoRecord,
  PersonalizarPayload,
  SubscribePersonalizacoesClasseParams,
} from "@/services/personalizacao/types";
import type { IPersonalizacaoProvider } from "@/services/personalizacao/IPersonalizacaoProvider";
import {
  clampPercent,
  normalizeNullableNonNegativeNumber,
  normalizePositiveInteger,
} from "@/utils/dataValidation";

const AUTH_COOLDOWN_MS = 60_000;
const NETWORK_COOLDOWN_MS = 45_000;

type AuthHeaders = { Authorization: string; "Content-Type": "application/json" };

type TrailupApiProviderDeps = {
  supabase: SupabaseClient;
  apiBaseCandidates: string[];
};

export class TrailupApiProvider implements IPersonalizacaoProvider {
  private readonly deps: TrailupApiProviderDeps;
  private readonly apiBaseCandidates: string[];
  private authBlockedUntil = 0;
  private networkBlockedUntil = 0;

  constructor(deps: TrailupApiProviderDeps) {
    this.deps = deps;
    this.apiBaseCandidates = deps.apiBaseCandidates;
  }

  // ─── Cooldown helpers ────────────────────────────────────────────────────────

  private isAuthBlocked() {
    return this.authBlockedUntil > Date.now();
  }

  private blockAuthRequests() {
    this.authBlockedUntil = Date.now() + AUTH_COOLDOWN_MS;
  }

  private clearAuthBlock() {
    this.authBlockedUntil = 0;
  }

  private isNetworkBlocked() {
    return this.networkBlockedUntil > Date.now();
  }

  private blockNetworkRequests() {
    this.networkBlockedUntil = Date.now() + NETWORK_COOLDOWN_MS;
  }

  private clearNetworkBlock() {
    this.networkBlockedUntil = 0;
  }

  // ─── URL helpers ─────────────────────────────────────────────────────────────

  private buildUrls(
    path: string,
    query?: Record<string, string | number | null | undefined>
  ) {
    if (!this.apiBaseCandidates.length) return [] as string[];
    const urls: string[] = [];

    this.apiBaseCandidates.forEach((baseUrl) => {
      const url = new URL(`${baseUrl}${path}`);
      Object.entries(query ?? {}).forEach(([key, value]) => {
        if (value == null || value === "") return;
        url.searchParams.set(key, String(value));
      });
      urls.push(url.toString());
    });

    return urls;
  }

  // ─── Auth helpers ─────────────────────────────────────────────────────────────

  private async getAuthHeaders(forceRefresh = false): Promise<AuthHeaders> {
    if (!forceRefresh && this.isAuthBlocked()) {
      throw new PersonalizacaoAuthError(
        "Requisicoes de personalizacao pausadas temporariamente apos falha de autenticacao.",
        "cooldown"
      );
    }

    const sessionResult = forceRefresh
      ? await this.deps.supabase.auth.refreshSession()
      : await this.deps.supabase.auth.getSession();

    if (sessionResult.error) throw sessionResult.error;

    const token = sessionResult.data.session?.access_token;
    if (!token && !forceRefresh) {
      return this.getAuthHeaders(true);
    }

    if (!token) {
      this.blockAuthRequests();
      throw new PersonalizacaoAuthError(
        "Sem sessao ativa para buscar personalizacao.",
        "no_session"
      );
    }

    this.clearAuthBlock();

    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  // ─── Response parsing ─────────────────────────────────────────────────────────

  private async parseResponse<T>(response: Response): Promise<T> {
    const text = await response.text();
    let payload: any = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const detail =
        payload?.detail ||
        payload?.message ||
        text ||
        `Erro ${response.status} ao consultar personalizacao.`;

      if (
        response.status === 401 ||
        /token invalido|token inv[áa]lido|unauthorized|not authenticated/i.test(String(detail))
      ) {
        this.blockAuthRequests();
        throw new PersonalizacaoAuthError(String(detail), "token_invalid");
      }

      throw new Error(String(detail));
    }

    if (!payload && text) {
      throw new Error("Resposta invalida da API de personalizacao.");
    }

    return payload as T;
  }

  // ─── HTTP request helpers ─────────────────────────────────────────────────────

  private async requestOnce<T>(url: string, init: RequestInit) {
    const headers = await this.getAuthHeaders(false);
    const response = await fetch(url, {
      ...init,
      headers: {
        ...headers,
        ...(init.headers ?? {}),
      },
    });

    return this.parseResponse<T>(response);
  }

  private async requestWithRefreshedToken<T>(url: string, init: RequestInit) {
    const headers = await this.getAuthHeaders(true);
    const response = await fetch(url, {
      ...init,
      headers: {
        ...headers,
        ...(init.headers ?? {}),
      },
    });

    return this.parseResponse<T>(response);
  }

  private async requestWithAuth<T>(urls: string[], init: RequestInit): Promise<T> {
    if (!urls.length) {
      throw new PersonalizacaoNetworkError(
        "API de personalizacao indisponivel: URL base nao configurada.",
        "no_api_config"
      );
    }
    if (this.isNetworkBlocked()) {
      throw new PersonalizacaoNetworkError(
        "API de personalizacao temporariamente indisponivel apos falha de rede.",
        "network_cooldown"
      );
    }

    let lastNetworkError: unknown = null;

    for (const url of urls) {
      try {
        const payload = await this.requestOnce<T>(url, init);
        this.clearNetworkBlock();
        return payload;
      } catch (error) {
        if (error instanceof PersonalizacaoAuthError && error.code === "token_invalid") {
          try {
            const payload = await this.requestWithRefreshedToken<T>(url, init);
            this.clearNetworkBlock();
            return payload;
          } catch (refreshError) {
            if (isNetworkRequestFailedError(refreshError)) {
              lastNetworkError = refreshError;
              continue;
            }
            throw refreshError;
          }
        }

        if (isNetworkRequestFailedError(error)) {
          lastNetworkError = error;
          continue;
        }

        throw error;
      }
    }

    if (lastNetworkError) {
      this.blockNetworkRequests();
      throw new PersonalizacaoNetworkError(
        "Falha de rede ao comunicar com a API de personalizacao.",
        "network_unreachable"
      );
    }

    throw new PersonalizacaoNetworkError(
      "Nao foi possivel completar a requisicao de personalizacao.",
      "network_unreachable"
    );
  }

  // ─── BrainHex profile helpers ─────────────────────────────────────────────────

  private normalizeBrainhexProfileKey(value: string | null | undefined) {
    const normalized = String(value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/\s+/g, "_");
    if (!normalized) return "mastermind";

    const aliases: Record<string, string> = {
      seeker: "seeker",
      explorador: "seeker",
      buscador: "seeker",
      survivor: "survivor",
      sobrevivente: "survivor",
      daredevil: "daredevil",
      aventureiro: "daredevil",
      ousado: "daredevil",
      mastermind: "mastermind",
      estrategista: "mastermind",
      mestre: "mastermind",
      conqueror: "conqueror",
      conquistador: "conqueror",
      socializer: "socializer",
      socialiser: "socializer",
      socializador: "socializer",
      achiever: "achiever",
      realizador: "achiever",
    };

    return aliases[normalized] ?? normalized;
  }

  private extractProfileFromStoragePath(value: unknown) {
    if (typeof value !== "string") return null;
    const raw = value.trim();
    if (!raw) return null;

    const decoded = (() => {
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    })();

    const match = decoded.match(/brainhex\/([^\/?#]+)/i);
    if (!match?.[1]) return null;
    return this.normalizeBrainhexProfileKey(match[1]);
  }

  private findProfileInNestedValue(value: unknown, depth = 0): string | null {
    if (depth > 6 || value == null) return null;

    const fromPath = this.extractProfileFromStoragePath(value);
    if (fromPath) return fromPath;

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findProfileInNestedValue(item, depth + 1);
        if (found) return found;
      }
      return null;
    }

    if (typeof value === "object") {
      for (const nested of Object.values(value as Record<string, unknown>)) {
        const found = this.findProfileInNestedValue(nested, depth + 1);
        if (found) return found;
      }
    }

    return null;
  }

  private extractProfileKeyFromPersonalizacaoRecord(record: PersonalizacaoRecord) {
    const plano =
      record?.plano && typeof record.plano === "object" ? (record.plano as Record<string, any>) : {};
    const editorialMetadata =
      plano?.editorial_metadata && typeof plano.editorial_metadata === "object"
        ? (plano.editorial_metadata as Record<string, any>)
        : {};
    const perfilEditorial =
      editorialMetadata?.perfil_editorial && typeof editorialMetadata.perfil_editorial === "object"
        ? (editorialMetadata.perfil_editorial as Record<string, any>)
        : {};
    const modeloEditorial =
      editorialMetadata?.modelo_editorial && typeof editorialMetadata.modelo_editorial === "object"
        ? (editorialMetadata.modelo_editorial as Record<string, any>)
        : {};
    const personalizacaoBrainhex =
      modeloEditorial?.personalizacao_brainhex &&
      typeof modeloEditorial.personalizacao_brainhex === "object"
        ? (modeloEditorial.personalizacao_brainhex as Record<string, any>)
        : {};

    return this.normalizeBrainhexProfileKey(
      String(
        (record as any)?.brainhex_profile_key ??
          plano?.brainhex_profile_key ??
          plano?.perfil_dominante ??
          perfilEditorial?.perfil_dominante ??
          personalizacaoBrainhex?.perfil_dominante ??
          this.findProfileInNestedValue(record?.materiais) ??
          "mastermind"
      )
    );
  }

  private extractProfileKeyFromCardRecord(card: CardPersonalizadoRecord) {
    const metadata =
      card?.metadata && typeof card.metadata === "object" ? (card.metadata as Record<string, any>) : {};
    return this.normalizeBrainhexProfileKey(
      String(
        metadata?.brainhex_profile_key ??
          metadata?.perfil_dominante ??
          metadata?.profile_key ??
          this.findProfileInNestedValue(metadata) ??
          "mastermind"
      )
    );
  }

  private mergeCardsIntoPersonalizacaoRecords(
    records: PersonalizacaoRecord[],
    cards: CardPersonalizadoRecord[]
  ) {
    if (!records.length || !cards.length) return records;

    const cardsByTopico = new Map<number, CardPersonalizadoRecord[]>();
    cards.forEach((card) => {
      const topicoId = Number(card.topico_id ?? 0);
      if (!topicoId) return;
      const list = cardsByTopico.get(topicoId) ?? [];
      list.push(card);
      cardsByTopico.set(topicoId, list);
    });

    cardsByTopico.forEach((items) => {
      items.sort((left, right) => {
        const leftOrder = Number(left.ordem ?? Number.MAX_SAFE_INTEGER);
        const rightOrder = Number(right.ordem ?? Number.MAX_SAFE_INTEGER);
        if (leftOrder !== rightOrder) return leftOrder - rightOrder;
        return Number(left.id ?? 0) - Number(right.id ?? 0);
      });
    });

    return records.map((record) => {
      const topicoId = Number(record.topico_id ?? 0);
      if (!topicoId) return record;
      const cardsForTopico = cardsByTopico.get(topicoId) ?? [];
      if (!cardsForTopico.length) return record;

      const normalizedCardsPayload = cardsForTopico.map((card) => {
        const metadata =
          card?.metadata && typeof card.metadata === "object"
            ? (card.metadata as Record<string, any>)
            : {};
        const frente = String(metadata?.frente ?? card?.titulo ?? "").trim();
        const verso = String(metadata?.verso ?? card?.descricao ?? "").trim();
        return {
          id: card.id,
          titulo: card.titulo ?? frente,
          descricao: card.descricao ?? verso,
          frente: frente || card.titulo || "Card",
          verso: verso || card.descricao || frente || "Revisao personalizada",
          icone: card.icone ?? null,
          dificuldade: card.dificuldade ?? null,
          xp: card.xp ?? null,
        };
      });

      const materiais =
        record?.materiais && typeof record.materiais === "object"
          ? { ...(record.materiais as Record<string, any>) }
          : {};
      const cardsSection =
        materiais.cards && typeof materiais.cards === "object"
          ? { ...(materiais.cards as Record<string, any>) }
          : {};

      cardsSection.payload = normalizedCardsPayload;
      cardsSection.metadata = {
        ...(cardsSection.metadata && typeof cardsSection.metadata === "object"
          ? cardsSection.metadata
          : {}),
        cards_personalizados_ids: normalizedCardsPayload.map((item) => item.id),
        source: "cards_personalizados",
      };
      materiais.cards = cardsSection;

      const formatos = Array.isArray(record.formatos_gerados)
        ? [...record.formatos_gerados]
        : [];
      if (!formatos.includes("cards")) formatos.push("cards");

      return {
        ...record,
        materiais,
        formatos_gerados: formatos,
      };
    });
  }

  // ─── Private: listarCardsPersonalizadosPersistidosPerfil ─────────────────────

  private async listarCardsPersonalizadosPersistidosPerfil(params: {
    classeId: number;
    topicoId?: number | null;
    brainhexProfileKey: string;
    limit?: number;
  }) {
    const normalizedProfile = this.normalizeBrainhexProfileKey(params.brainhexProfileKey);
    let query = this.deps.supabase
      .from("cards_personalizados")
      .select(
        "id, aluno_id, classe_id, topico_id, conteudo_id, ciclo_id, ordem, titulo, descricao, icone, dificuldade, xp, metadata"
      )
      .eq("classe_id", params.classeId)
      .order("ordem", { ascending: true })
      .order("id", { ascending: true })
      .limit(params.limit ?? 300);

    if (params.topicoId != null) {
      query = query.eq("topico_id", params.topicoId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const cards = (data ?? []) as CardPersonalizadoRecord[];
    return cards.filter(
      (card) => this.extractProfileKeyFromCardRecord(card) === normalizedProfile
    );
  }

  // ─── IPersonalizacaoProvider implementation ───────────────────────────────────

  hasApiConfigured(): boolean {
    return this.apiBaseCandidates.length > 0;
  }

  async solicitarPersonalizacao(payload: PersonalizarPayload): Promise<PersonalizacaoRecord> {
    const urls = this.buildUrls("/api/v1/personalizar");

    return this.requestWithAuth<PersonalizacaoRecord>(urls, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async listarPersonalizacoesPersistidasPerfil(
    params: ListarPersonalizacoesPerfilParams
  ): Promise<PersonalizacaoListResponse> {
    const normalizedProfile = this.normalizeBrainhexProfileKey(params.brainhexProfileKey);

    let query = this.deps.supabase
      .from("conteudo_personalizado")
      .select(
        "id, aluno_id, classe_id, conteudo_id, topico_id, ciclo_id, status, source_hash, formato_prioritario, formatos_gerados, plano, materiais, ai_patch, gerado_em, updated_at"
      )
      .eq("classe_id", params.classeId)
      .order("updated_at", { ascending: false })
      .order("gerado_em", { ascending: false })
      .limit(params.limit ?? 60);

    if (params.topicoId != null) {
      query = query.eq("topico_id", params.topicoId);
    }
    if (params.conteudoId != null) {
      query = query.eq("conteudo_id", params.conteudoId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const allRecords = (data ?? []) as PersonalizacaoRecord[];
    const profileRecords = allRecords.filter(
      (record) => this.extractProfileKeyFromPersonalizacaoRecord(record) === normalizedProfile
    );
    const cards = await this.listarCardsPersonalizadosPersistidosPerfil({
      classeId: params.classeId,
      topicoId: params.topicoId,
      brainhexProfileKey: normalizedProfile,
      limit: 500,
    });
    const merged = this.mergeCardsIntoPersonalizacaoRecords(profileRecords, cards);

    return {
      aluno_id: "",
      total: merged.length,
      itens: merged,
    } satisfies PersonalizacaoListResponse;
  }

  async listarJobsPersistidosAluno(params: ListarJobsParams): Promise<PersonalizacaoJobRecord[]> {
    const { data, error } = await this.deps.supabase
      .from("personalizacao_jobs")
      .select("id, kind, status, classe_id, aluno_id, topico_id, conteudo_id, total_targets, processed_targets, error_count, last_error, created_at, updated_at")
      .eq("classe_id", params.classeId)
      .or(`aluno_id.eq.${params.alunoId},aluno_id.is.null`)
      .order("updated_at", { ascending: false })
      .limit(params.limit ?? 20);

    if (error) throw error;
    return data ?? [];
  }

  async salvarProgressoPersonalizadoDiretoSupabase(
    payload: PersonalizacaoProgressDirectPayload
  ): Promise<{ id: number | null; mode: "insert" | "update" }> {
    const isRlsDeniedError = (error: unknown) => {
      const code = String((error as any)?.code ?? "");
      const message = String((error as any)?.message ?? "");
      return code === "42501" || /row-level security policy/i.test(message);
    };

    const personalizacaoId = normalizePositiveInteger(payload.personalizacao_id);
    const classeId = normalizePositiveInteger(payload.classe_id);
    const topicoId = normalizePositiveInteger(payload.topico_id);
    const alunoId = String(payload.aluno_id ?? "").trim();
    const itemKey = String(payload.item_key ?? "").trim();
    const itemKind = String(payload.item_kind ?? "").trim();
    const itemTitle = String(payload.item_title ?? "").trim();

    if (!personalizacaoId || !classeId || !topicoId || !alunoId || !itemKey || !itemKind || !itemTitle) {
      throw new Error("Payload invalido para salvar progresso personalizado direto no Supabase.");
    }

    const percentualConcluido = clampPercent(payload.percentual_concluido);
    const acertosPercentual =
      payload.acertos_percentual == null ? null : clampPercent(payload.acertos_percentual);
    const tempoGastoMin = normalizeNullableNonNegativeNumber(payload.tempo_gasto_min ?? null);
    const pontuacaoObtida = normalizeNullableNonNegativeNumber(payload.pontuacao_obtida ?? null);
    const pontuacaoMaxima = normalizeNullableNonNegativeNumber(payload.pontuacao_maxima ?? null);
    const nowIso = new Date().toISOString();

    const { data: existing, error: existingError } = await this.deps.supabase
      .from("personalizacao_item_progresso")
      .select(
        "id, status, percentual_concluido, acertos_percentual, tempo_gasto_min, pontuacao_obtida, pontuacao_maxima, metadata, completed_at"
      )
      .eq("personalizacao_id", personalizacaoId)
      .eq("aluno_id", alunoId)
      .eq("classe_id", classeId)
      .eq("topico_id", topicoId)
      .eq("item_key", itemKey)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      if (isRlsDeniedError(existingError)) {
        throw new PersonalizacaoRlsError(
          "Permissao negada pela policy RLS em personalizacao_item_progresso."
        );
      }
      throw existingError;
    }

    const existingPercentual = clampPercent(Number(existing?.percentual_concluido ?? 0));
    const existingTempo = normalizeNullableNonNegativeNumber(existing?.tempo_gasto_min ?? null) ?? 0;
    const existingAcertos =
      existing?.acertos_percentual == null
        ? null
        : clampPercent(Number(existing.acertos_percentual));
    const existingPontuacaoObtida =
      normalizeNullableNonNegativeNumber(existing?.pontuacao_obtida ?? null) ?? null;
    const existingPontuacaoMaxima =
      normalizeNullableNonNegativeNumber(existing?.pontuacao_maxima ?? null) ?? null;
    const existingStatus = String(existing?.status ?? "em_andamento");
    const existingMetadata =
      existing?.metadata && typeof existing.metadata === "object"
        ? (existing.metadata as Record<string, any>)
        : {};

    const mergedStatus =
      payload.status === "concluido" || existingStatus === "concluido"
        ? "concluido"
        : payload.status === "nao_iniciado" && existingStatus === "nao_iniciado"
        ? "nao_iniciado"
        : "em_andamento";

    const mergedPercentual = Math.max(existingPercentual, percentualConcluido);
    const mergedTempo = existingTempo + (tempoGastoMin ?? 0);
    const mergedAcertos =
      acertosPercentual == null
        ? existingAcertos
        : existingAcertos == null
        ? acertosPercentual
        : Math.max(existingAcertos, acertosPercentual);
    const mergedPontuacaoObtida =
      pontuacaoObtida == null
        ? existingPontuacaoObtida
        : existingPontuacaoObtida == null
        ? pontuacaoObtida
        : Math.max(existingPontuacaoObtida, pontuacaoObtida);
    const mergedPontuacaoMaxima =
      pontuacaoMaxima == null
        ? existingPontuacaoMaxima
        : existingPontuacaoMaxima == null
        ? pontuacaoMaxima
        : Math.max(existingPontuacaoMaxima, pontuacaoMaxima);
    const mergedMetadata = {
      ...existingMetadata,
      ...(payload.metadata ?? {}),
    };
    const completedAt =
      mergedStatus === "concluido"
        ? existing?.completed_at ?? nowIso
        : null;

    if (existing?.id) {
      const { error: updateError } = await this.deps.supabase
        .from("personalizacao_item_progresso")
        .update({
          status: mergedStatus,
          percentual_concluido: mergedPercentual,
          acertos_percentual: mergedAcertos,
          tempo_gasto_min: mergedTempo,
          pontuacao_obtida: mergedPontuacaoObtida,
          pontuacao_maxima: mergedPontuacaoMaxima,
          metadata: mergedMetadata,
          completed_at: completedAt,
          updated_at: nowIso,
        })
        .eq("id", existing.id);

      if (updateError) {
        if (isRlsDeniedError(updateError)) {
          throw new PersonalizacaoRlsError(
            "Permissao negada pela policy RLS em personalizacao_item_progresso."
          );
        }
        throw updateError;
      }
      return { id: existing.id, mode: "update" as const };
    }

    const { data: inserted, error: insertError } = await this.deps.supabase
      .from("personalizacao_item_progresso")
      .insert({
        personalizacao_id: personalizacaoId,
        aluno_id: alunoId,
        classe_id: classeId,
        topico_id: topicoId,
        item_key: itemKey,
        item_kind: itemKind,
        item_title: itemTitle,
        status: mergedStatus,
        percentual_concluido: mergedPercentual,
        acertos_percentual: mergedAcertos,
        tempo_gasto_min: mergedTempo,
        pontuacao_obtida: mergedPontuacaoObtida,
        pontuacao_maxima: mergedPontuacaoMaxima,
        metadata: mergedMetadata,
        completed_at: completedAt,
        updated_at: nowIso,
      })
      .select("id")
      .single();

    if (insertError) {
      if (isRlsDeniedError(insertError)) {
        throw new PersonalizacaoRlsError(
          "Permissao negada pela policy RLS em personalizacao_item_progresso."
        );
      }
      throw insertError;
    }
    return { id: inserted?.id ?? null, mode: "insert" as const };
  }

  subscribePersonalizacoesPersistidasClasse(
    params: SubscribePersonalizacoesClasseParams
  ): RealtimeChannel {
    const channel = this.deps.supabase.channel(`rt_personalizacao_classe_${params.classeId}`);
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "conteudo_personalizado",
        filter: `classe_id=eq.${params.classeId}`,
      },
      () => params.onChange()
    );
    return channel.subscribe();
  }

  async conversarComMentorPersonalizacao(payload: MentorChatPayload): Promise<MentorChatResponse> {
    const urls = this.buildUrls("/api/v1/personalizar/chat");

    return this.requestWithAuth<MentorChatResponse>(urls, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}

export const defaultTrailupApiProvider = new TrailupApiProvider({
  supabase,
  apiBaseCandidates: resolveApiBaseCandidates(process.env.EXPO_PUBLIC_APITRAIUP_URL),
});
