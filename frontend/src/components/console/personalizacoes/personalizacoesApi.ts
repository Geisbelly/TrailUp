import { apiRequest } from "@/lib/apiTraiupClient";
import { supabase } from "@/integrations/supabase/client";
import {
  BRAINHEX_PROFILES,
  PROFILE_LABEL_MAP,
  buildDesignTokensForProfile,
  extractProfileKeyFromRecord,
  mapConteudoPersonalizadoRowToResponse,
  type ConteudoPersonalizadoFallbackRow,
} from "./personalizacaoFallback";

// ── Tipos compartilhados ──────────────────────────────────────────────────────
export type DesignTokensCores = {
  background: string;
  surface: string;
  surface_elevated: string;
  primary: string;
  primary_glow: string;
  border: string;
  text_primary: string;
  text_muted: string;
  success: string;
  warning: string;
  info: string;
  locked: string;
};

export type DesignTokens = {
  cores: DesignTokensCores;
  tipografia?: Record<string, unknown>;
  border_radius?: number;
  sombra?: string;
  sombra_primary?: string;
};

export type PlanoPersonalizacao = {
  formato_prioritario?: string;
  formatos?: string[];
  nivel?: string;
  tom?: string;
  estilo?: string;
  justificativa?: string;
  [key: string]: unknown;
};

export type PersonalizacaoResponse = {
  id: number;
  aluno_id: string;
  classe_id?: number | null;
  conteudo_id?: number | null;
  topico_id?: number | null;
  ciclo_id: string;
  status: string;
  media_status?: "ready" | "pending" | "partial" | "failed";
  formato_prioritario?: string;
  formatos_gerados?: string[];
  plano?: PlanoPersonalizacao | null;
  materiais?: Record<string, unknown> | null;
  design_tokens: DesignTokens;
  steps?: Array<Record<string, unknown>>;
  gerado_em?: string | null;
  updated_at?: string | null;
};

export type GeracaoConteudoStatus =
  | "sem_material"
  | "na_fila"
  | "enriquecendo"
  | "gerando_midias"
  | "pronto"
  | "parcial"
  | "falhou";

export type GeracaoFormatoStatus =
  | "sem_material"
  | "na_fila"
  | "gerando"
  | "pronto"
  | "falhou";

export type GeracaoFormato = {
  status: GeracaoFormatoStatus;
  label?: string | null;
  arquivo_url?: string | null;
  erro?: string | null;
};

export type GeracaoPersonalizacao = {
  status: GeracaoConteudoStatus;
  label?: string | null;
  etapa?: string | null;
  etapa_label?: string | null;
  progresso_percentual: number;
  job_id?: string | null;
  target_id?: number | string | null;
  erro?: string | null;
  erro_codigo?: string | null;
  blocos_total: number;
  blocos_concluidos: number;
  formatos: Partial<Record<"cards" | "markdown" | "pdf" | "audio" | "apresentacao", GeracaoFormato>>;
  updated_at?: string | null;
};

export type GeracaoConteudoResumo = {
  total_perfis?: number;
  perfis_prontos?: number;
  perfis_ativos?: number;
  perfis_em_andamento?: number;
  perfis_parciais?: number;
  perfis_falhos?: number;
  perfis_com_falha?: number;
  perfis_sem_material?: number;
  progresso_percentual?: number;
  estados?: Partial<Record<GeracaoConteudoStatus, number>>;
  updated_at?: string | null;
};

export type PersonalizacaoPerfilItem = {
  perfil: string;
  perfil_label: string;
  cor: string;
  design_tokens: DesignTokens;
  tem_personalizacao: boolean;
  personalizacao?: PersonalizacaoResponse | null;
  plano?: PlanoPersonalizacao | null;
  formato_prioritario?: string | null;
  formatos_gerados?: string[];
  materiais?: Record<string, unknown> | null;
  total_alunos: number;
  gerado_em?: string | null;
  /**
   * Ausente apenas enquanto o console conversa com uma versão antiga da API.
   * O endpoint novo sempre devolve o estado, inclusive `sem_material`.
   */
  geracao?: GeracaoPersonalizacao | null;
};

export type PersonalizacaoPorPerfilResponse = {
  classe_id: number;
  topico_id: number;
  conteudo_id?: number | null;
  conteudo_titulo?: string | null;
  total_perfis_com_material: number;
  geracao_resumo?: GeracaoConteudoResumo | null;
  perfis: PersonalizacaoPerfilItem[];
};

export type PersonalizacaoContextoDocenteResponse = {
  aluno_id: string;
  classe_id: number;
  topico_id?: number | null;
  contexto_aluno?: Record<string, unknown> | null;
  personalizacoes?: PersonalizacaoResponse[];
  progresso_itens?: Array<{
    id: number;
    item_key: string;
    item_kind: string;
    item_title: string;
    status: string;
    percentual_concluido: number;
    tempo_gasto_min: number;
    pontuacao_obtida?: number | null;
    pontuacao_maxima?: number | null;
    updated_at?: string | null;
  }>;
};

export function buildPersonalizacaoPorPerfilPath(params: {
  classeId: number;
  topicoId: number;
  conteudoId?: number;
}): string {
  const path = `/api/v1/personalizar/perfis/${params.classeId}/${params.topicoId}`;
  if (params.conteudoId == null) return path;

  const search = new URLSearchParams();
  search.set("conteudo_id", String(params.conteudoId));
  return `${path}?${search.toString()}`;
}

/**
 * Le direto do Supabase quando a API esta fora do ar. Fidelidade reduzida de
 * proposito (ver personalizacaoFallback.ts): sem status de geracao
 * (`personalizacao_jobs`/`personalizacao_job_targets`, cruzamento com
 * estado/target que nao vale a pena replicar as cegas) e sem a contagem de
 * alunos por perfil (precisaria de RLS em `aluno_perfil`/`perfil` que nao foi
 * confirmada). `statusGeracaoDoPerfil` em generationStatus.ts ja sabe cair
 * pro status legado quando `geracao` vem null, entao o badge continua
 * mostrando algo util (so menos granular).
 */
async function fetchPersonalizacaoPorPerfilFallback(
  params: { classeId: number; topicoId: number; conteudoId?: number }
): Promise<PersonalizacaoPorPerfilResponse> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;

  let query = supabase
    .from("conteudo_personalizado" as never)
    .select(
      "id, aluno_id, classe_id, conteudo_id, topico_id, ciclo_id, status, formato_prioritario, formatos_gerados, plano, materiais, ai_patch, brainhex_profile_key, gerado_em, updated_at"
    )
    .eq("classe_id", params.classeId)
    .eq("topico_id", params.topicoId)
    .order("updated_at", { ascending: false })
    .order("gerado_em", { ascending: false })
    .limit(500);
  if (params.conteudoId != null) query = query.eq("conteudo_id", params.conteudoId);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as unknown as ConteudoPersonalizadoFallbackRow[];
  // Registros ja vem ordenados por updated_at/gerado_em desc: o primeiro que
  // aparece pra cada perfil e o mais recente.
  const byProfile = new Map<string, ConteudoPersonalizadoFallbackRow>();
  for (const row of rows) {
    const perfil = extractProfileKeyFromRecord(row);
    if (!byProfile.has(perfil)) byProfile.set(perfil, row);
  }

  let conteudoTitulo: string | null = null;
  if (params.conteudoId != null) {
    const { data: conteudoRow } = await supabase
      .from("conteudos" as never)
      .select("titulo")
      .eq("id", params.conteudoId)
      .maybeSingle();
    conteudoTitulo = (conteudoRow as unknown as { titulo?: string } | null)?.titulo ?? null;
  }

  let totalComMaterial = 0;
  const perfis: PersonalizacaoPerfilItem[] = BRAINHEX_PROFILES.map((perfil) => {
    const row = byProfile.get(perfil);
    const personalizacao = row ? mapConteudoPersonalizadoRowToResponse(supabaseUrl, row) : null;
    if (personalizacao) totalComMaterial += 1;

    return {
      perfil,
      perfil_label: PROFILE_LABEL_MAP[perfil] ?? perfil,
      cor: PROFILE_COLOR_MAP[perfil] ?? PROFILE_COLOR_MAP.mastermind,
      design_tokens: personalizacao?.design_tokens ?? buildDesignTokensForProfile(perfil),
      tem_personalizacao: personalizacao != null,
      personalizacao,
      plano: personalizacao?.plano ?? null,
      formato_prioritario: personalizacao?.formato_prioritario ?? null,
      formatos_gerados: personalizacao?.formatos_gerados ?? [],
      materiais: personalizacao?.materiais ?? null,
      // Precisaria de RLS confirmada em aluno_perfil/perfil pra contar aqui.
      total_alunos: 0,
      gerado_em: personalizacao?.gerado_em ?? null,
      geracao: null,
    } satisfies PersonalizacaoPerfilItem;
  });

  return {
    classe_id: params.classeId,
    topico_id: params.topicoId,
    conteudo_id: params.conteudoId ?? null,
    conteudo_titulo: conteudoTitulo,
    total_perfis_com_material: totalComMaterial,
    geracao_resumo: null,
    perfis,
  } satisfies PersonalizacaoPorPerfilResponse;
}

/** Visoes 1 e 2: personalizacao de um conteudo agrupada pelos 7 perfis BrainHex. */
export async function fetchPersonalizacaoPorPerfil(
  accessToken: string,
  params: { classeId: number; topicoId: number; conteudoId?: number }
): Promise<PersonalizacaoPorPerfilResponse> {
  try {
    return await apiRequest<PersonalizacaoPorPerfilResponse>(
      buildPersonalizacaoPorPerfilPath(params),
      accessToken
    );
  } catch (error) {
    console.warn(
      "[personalizacao] API indisponivel, lendo personalizacoes por perfil direto do Supabase (fallback com menos detalhe):",
      error
    );
    return fetchPersonalizacaoPorPerfilFallback(params);
  }
}

/** Visao 3: preview por aluno, reutilizando o contexto docente existente. */
export async function fetchContextoDocente(
  accessToken: string,
  params: { alunoId: string; classeId: number; topicoId?: number }
): Promise<PersonalizacaoContextoDocenteResponse> {
  const search = new URLSearchParams();
  search.set("classe_id", String(params.classeId));
  if (params.topicoId != null) search.set("topico_id", String(params.topicoId));
  return apiRequest<PersonalizacaoContextoDocenteResponse>(
    `/api/v1/personalizar/contexto/${params.alunoId}?${search.toString()}`,
    accessToken
  );
}

export type ClassePerfilDistribuicaoItem = {
  perfil: string;
  quantidade: number;
  percentual: number;
};

export type ClassePerfilSummaryResponse = {
  classe_id: number;
  distribuicao: Record<string, ClassePerfilDistribuicaoItem>;
  perfil_predominante: string | null;
  total_alunos: number;
  media_desempenho: Record<string, number>;
  atualizado_em?: string | null;
};

type ClassePerfilSummaryRow = {
  classe_id: number;
  distribuicao: Record<string, ClassePerfilDistribuicaoItem> | null;
  perfil_predominante: string | null;
  total_alunos: number | null;
  media_desempenho: Record<string, number> | null;
  atualizado_em: string | null;
};

/**
 * Visao 4: adequacao de grupo — distribuicao de perfis BrainHex e desempenho
 * medio da turma.
 *
 * Le direto de `classe_perfil_summary` no Supabase (RLS `professor_all_classe_perfil_summary`,
 * ja confere posse via `classe.professor_id = auth.uid()`) em vez de passar
 * pela API: essa tabela e so leitura formatada, sem IA no meio, e a API caindo
 * nao pode derrubar o console (ver "Regra de fronteira" no CLAUDE.md).
 *
 * O recalculo em si (`GroupAnalysisService.upsert_summary`) continua na API —
 * disparado aqui em segundo plano, best-effort. Se a API estiver fora do ar o
 * professor ainda ve o ultimo resumo calculado, em vez de tela quebrada.
 */
export async function fetchAdequacaoGrupo(
  accessToken: string,
  params: { classeId: number }
): Promise<ClassePerfilSummaryResponse> {
  void apiRequest<ClassePerfilSummaryResponse>(
    `/api/v1/personalizar/grupo/${params.classeId}`,
    accessToken
  ).catch((error) => {
    console.warn("[personalizacao] Recalculo de adequacao de grupo indisponivel:", error);
  });

  const { data, error } = await supabase
    .from("classe_perfil_summary" as never)
    .select("classe_id, distribuicao, perfil_predominante, total_alunos, media_desempenho, atualizado_em")
    .eq("classe_id", params.classeId)
    .maybeSingle();
  if (error) throw error;

  const row = data as unknown as ClassePerfilSummaryRow | null;
  return {
    classe_id: params.classeId,
    distribuicao: row?.distribuicao ?? {},
    perfil_predominante: row?.perfil_predominante ?? null,
    total_alunos: row?.total_alunos ?? 0,
    media_desempenho: row?.media_desempenho ?? {},
    atualizado_em: row?.atualizado_em ?? null,
  };
}

// ── Sugestao de material por aluno ────────────────────────────────────────────

export type SugestaoMaterialItem = {
  formato: string;
  posicao: number;
  score: number;
  motivos: string[];
};

export type SugestaoMaterial = {
  formato_inicial: string | null;
  ordem: SugestaoMaterialItem[];
  versao: number;
  origem: string;
};

export type SugestaoHistoricoItem = {
  versao: number;
  acao: string;
  topico_id?: number | null;
  criado_em?: string | null;
  motivos: string[];
  ordem_sugerida: string[];
  ordem_observada: string[];
  /** null = nao deu para medir. Zero significaria "ignorou tudo". */
  aderencia: number | null;
  seguiu_inicio: boolean | null;
  desempenho: number | null;
  desempenho_posterior: number | null;
};

export type SugestaoEfetividade = {
  total_registros: number;
  aderencia_media: number | null;
  n_aderencia: number;
  taxa_seguiu_inicio: number | null;
  desempenho: {
    desempenho_seguiu?: number | null;
    desempenho_ignorou?: number | null;
    n_seguiu?: number;
    n_ignorou?: number;
    minimo_amostra?: number;
    confiavel?: boolean;
    diferenca?: number | null;
  };
  revisoes: {
    revisoes_comparadas?: number;
    delta_medio?: number | null;
    revisoes_que_melhoraram?: number;
    revisoes_que_pioraram?: number;
    confiavel?: boolean;
  };
  churn: {
    por_acao?: Record<string, number>;
    alvos?: number;
    alvos_revisados?: number;
    revisoes_por_alvo?: number | null;
    maior_numero_de_revisoes?: number;
  };
};

export type SugestaoAlunoResponse = {
  aluno_id: string;
  topico_id?: number | null;
  atual: SugestaoMaterial | null;
  historico: SugestaoHistoricoItem[];
  efetividade: SugestaoEfetividade;
};

/**
 * Visao 3 (por aluno): ordem aconselhada, historico de decisoes e efetividade.
 *
 * Uma chamada so: o historico e a metrica saem do mesmo log, e busca-los
 * separado abriria espaco para o console mostrar uma efetividade que nao
 * corresponde as linhas listadas ao lado.
 */
export async function fetchSugestaoAluno(
  accessToken: string,
  params: { alunoId: string; topicoId?: number }
): Promise<SugestaoAlunoResponse> {
  const search = new URLSearchParams();
  if (params.topicoId != null) search.set("topico_id", String(params.topicoId));
  const query = search.toString();
  return apiRequest<SugestaoAlunoResponse>(
    `/api/v1/personalizar/sugestao/${encodeURIComponent(params.alunoId)}/historico${
      query ? `?${query}` : ""
    }`,
    accessToken
  );
}

// ── Regeneracao de material via prompt livre (professor) ───────────────────────
//
// Uma unica chamada Gemini (+ eventual asset) no microservice — mais demorada
// que os GETs desta API, por isso o timeout proprio, bem acima do
// REQUEST_TIMEOUT_MS padrao (20s) e alinhado ao timeout do client Python
// (BRAINHEX_API_REGENERATE_TIMEOUT_SEC, 120s).
const REGENERATE_TIMEOUT_MS = 130_000;

export type RegenerarDocumentoPayload = {
  brainhex_profile_key: string;
  conteudo_id?: number | null;
  improvement_prompt: string;
  expansion_prompt?: string | null;
};

export type RegenerarSlidePayload = {
  brainhex_profile_key: string;
  conteudo_id?: number | null;
  slide_index: number;
  improvement_prompt: string;
  expansion_prompt?: string | null;
};

export type RegenerarSlideResponse = {
  personalizacao: PersonalizacaoResponse;
  slide_index: number;
  slide: Record<string, unknown>;
  image_base64_preview?: string | null;
};

/** Regenera markdown+roteiro de audio da base por perfil via prompt livre do professor. */
export async function regenerarDocumentoPersonalizacao(
  accessToken: string,
  params: { classeId: number; topicoId: number } & RegenerarDocumentoPayload
): Promise<PersonalizacaoResponse> {
  const { classeId, topicoId, ...payload } = params;
  return apiRequest<PersonalizacaoResponse>(
    `/api/v1/personalizar/perfis/${classeId}/${topicoId}/regenerar/documento`,
    accessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    REGENERATE_TIMEOUT_MS
  );
}

/** Regenera um slide especifico da apresentacao via prompt livre do professor. */
export async function regenerarSlidePersonalizacao(
  accessToken: string,
  params: { classeId: number; topicoId: number } & RegenerarSlidePayload
): Promise<RegenerarSlideResponse> {
  const { classeId, topicoId, ...payload } = params;
  return apiRequest<RegenerarSlideResponse>(
    `/api/v1/personalizar/perfis/${classeId}/${topicoId}/regenerar/slide`,
    accessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    REGENERATE_TIMEOUT_MS
  );
}

// ── Geracao manual (botao individual / gerar tudo) ────────────────────────────
export type PersonalizacaoJobResumo = {
  id: string;
  kind: string;
  status: string;
  total_targets: number;
  processed_targets: number;
  error_count: number;
};

export function buildManualGeneratePayload(params: {
  classeId: number;
  topicoId: number;
  conteudoId?: number;
  perfil: string;
}) {
  return {
    classe_id: params.classeId,
    topico_id: params.topicoId,
    ...(params.conteudoId == null ? {} : { conteudo_id: params.conteudoId }),
    brainhex_profile_key: params.perfil,
  };
}

export function buildManualGenerateAllPayload(params: { classeId: number; perfil: string }) {
  return {
    classe_id: params.classeId,
    brainhex_profile_key: params.perfil,
  };
}

export async function enqueueManualGenerateJob(
  accessToken: string,
  params: { classeId: number; topicoId: number; conteudoId?: number; perfil: string }
): Promise<PersonalizacaoJobResumo> {
  return apiRequest<PersonalizacaoJobResumo>("/api/v1/personalizar/jobs/manual-generate", accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildManualGeneratePayload(params)),
  });
}

export async function enqueueManualGenerateAllJob(
  accessToken: string,
  params: { classeId: number; perfil: string }
): Promise<PersonalizacaoJobResumo> {
  return apiRequest<PersonalizacaoJobResumo>("/api/v1/personalizar/jobs/manual-generate-all", accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildManualGenerateAllPayload(params)),
  });
}

export async function fetchPersonalizacaoJobStatus(
  accessToken: string,
  jobId: string
): Promise<PersonalizacaoJobResumo> {
  return apiRequest<PersonalizacaoJobResumo>(`/api/v1/personalizar/jobs/${jobId}`, accessToken);
}
