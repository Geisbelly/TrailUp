import type { JanelaTemporal } from "./DashboardHeader";
import { periodoDaJanela } from "./porTopico";

/**
 * KPIs operacionais da fila de personalização (#14): a resposta da RPC
 * `personalizacao_kpis_operacionais` (migration 20261102_12). Tudo é agregado no banco; aqui só se
 * lê, rotula e formata. Número ausente é `null` (sem dado), nunca zero.
 */

export type StatusDeJob = "pending" | "processing" | "completed" | "partial" | "failed";
export type StatusDeTarget = "pending" | "processing" | "completed" | "failed" | "skipped";

export type KpisDoTipo = {
  kind: string;
  total: number;
  por_status: Record<StatusDeJob, number>;
  em_aberto: number;
  terminados: number;
  latencia_media_seg: number | null;
  latencia_p95_seg: number | null;
  espera_media_seg: number | null;
  slo_latencia_p95_seg: number | null;
  slo_violado: boolean | null;
};

export type KpisDoFormato = {
  formato: string;
  total: number;
  por_status: Record<StatusDeTarget, number>;
  geracoes_medidas: number;
  tempo_geracao_medio_seg: number | null;
  tempo_geracao_p95_seg: number | null;
  base_reprocessamento: number;
  reprocessados: number;
  taxa_reprocessamento_pct: number | null;
  slo_geracao_p95_seg: number | null;
  slo_violado: boolean | null;
};

export type BaldeDaSerie = { inicio: string; total: number; latencia_media_seg: number | null } & Record<StatusDeJob, number>;

export type Gatilho =
  | { chave: "falha_persistente"; ativo: boolean; limiar_pct: number | null; dias: number; ultimos_dias_com_job: { dia: string; total: number; problema_pct: number }[] }
  | { chave: "latencia_acima_slo"; ativo: boolean; tipos: string[] }
  | { chave: "geracao_acima_slo"; ativo: boolean; formatos: string[] }
  | { chave: "fila_parada"; ativo: boolean; jobs_em_aberto_acima_do_slo: number };

export type KpisOperacionais = {
  classe_id: number;
  inicio: string;
  fim: string;
  granularidade: "hora" | "dia" | "semana";
  jobs: {
    total: number;
    por_status: Record<StatusDeJob, number>;
    em_aberto: number;
    terminados: number;
    latencia_media_seg: number | null;
    latencia_p95_seg: number | null;
    espera_media_seg: number | null;
    pedidos_de_reprocessamento: number;
  };
  por_tipo: KpisDoTipo[];
  por_formato: KpisDoFormato[];
  serie: BaldeDaSerie[];
  gatilhos: Gatilho[];
};

/** Lê a resposta da RPC; forma inesperada vira `null` (o card mostra erro, não números inventados). */
export function lerKpisOperacionais(resposta: unknown): KpisOperacionais | null {
  if (!resposta || typeof resposta !== "object") return null;
  const r = resposta as Partial<KpisOperacionais>;
  if (
    !r.jobs ||
    typeof r.jobs.total !== "number" ||
    !Array.isArray(r.por_tipo) ||
    !Array.isArray(r.por_formato) ||
    !Array.isArray(r.serie) ||
    !Array.isArray(r.gatilhos)
  ) {
    return null;
  }
  return r as KpisOperacionais;
}

/**
 * Parâmetros da RPC para a janela do cabeçalho: começa à meia-noite (Brasília) do primeiro dia e vai
 * até agora. "Tudo" (um ano) vai em semanas, o resto em dias.
 */
export function parametrosDaJanela(
  janela: JanelaTemporal,
  agora: Date
): { p_inicio: string; p_granularidade: "dia" | "semana" } {
  const { inicio } = periodoDaJanela(janela, agora);
  return { p_inicio: `${inicio}T00:00:00-03:00`, p_granularidade: janela === "tudo" ? "semana" : "dia" };
}

const TIPOS: Record<string, string> = {
  student_enrollment: "Matrícula",
  class_delta_sync: "Edição da trilha",
  full_class_sync: "Sincronização da turma",
  class_theme_sync: "Tema da turma",
  manual_retry: "Reprocessamento pedido",
  manual_profile_generate: "Geração manual por perfil",
  manual_profile_generate_all: "Geração manual de todos os perfis",
  media_generation: "Geração de mídia",
  media_render: "Renderização de mídia",
  student_cleanup: "Limpeza de aluno",
  missao_diaria: "Texto da missão diária",
};

const FORMATOS: Record<string, string> = {
  enriquecimento: "Enriquecimento do texto",
  capitulo: "Texto",
  audio: "Áudio",
  apresentacao: "Apresentação",
  perfil_inteiro: "Perfil inteiro (antigo)",
};

export const rotuloDoTipo = (kind: string) => TIPOS[kind] ?? kind;
export const rotuloDoFormato = (formato: string) => FORMATOS[formato] ?? formato;

/** "—" sem dado; segundos até 1 min, minutos até 1 h, depois horas e minutos. */
export function duracao(seg: number | null | undefined): string {
  if (seg === null || seg === undefined || !Number.isFinite(seg)) return "—";
  const s = Math.round(seg);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  const h = Math.floor(s / 3600);
  const min = Math.round((s - h * 3600) / 60);
  return min === 0 ? `${h} h` : `${h} h ${String(min).padStart(2, "0")} min`;
}

export const percentual = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** Jobs com problema na janela: falharam ou terminaram pela metade. */
export const comProblema = (s: Record<StatusDeJob, number>) => s.failed + s.partial;

/** Balde da série no formato curto (dd/mm, e hh:mm quando é por hora). */
export function rotuloDoBalde(inicio: string, granularidade: KpisOperacionais["granularidade"]): string {
  const [data, hora] = inicio.split("T");
  const [, mes, dia] = data.split("-");
  const curto = `${dia}/${mes}`;
  if (granularidade === "hora") return `${curto} ${hora}`;
  return granularidade === "semana" ? `semana de ${curto}` : curto;
}

/**
 * Onde a falha começou: o primeiro balde com job falho ou parcial depois do último balde só com jobs
 * bons. Sem falha na janela, null. Balde vazio não interrompe a sequência (não houve job para dizer
 * que estava bom).
 */
export function inicioDaSequenciaDeFalhas(serie: BaldeDaSerie[]): BaldeDaSerie | null {
  let inicio: BaldeDaSerie | null = null;
  for (const b of serie) {
    if (b.total === 0) continue;
    if (comProblema(b) > 0) inicio ??= b;
    else inicio = null;
  }
  return inicio;
}

/** A frase de cada gatilho ativo do §11 (cap. 10 do TCC), para o professor sem conta manual. */
export function textoDoGatilho(g: Gatilho): string {
  switch (g.chave) {
    case "falha_persistente":
      return `Falha persistente: nos últimos ${g.dias} dias com geração, mais de ${percentual(g.limiar_pct)} dos pedidos falharam, ficaram pela metade ou parados.`;
    case "latencia_acima_slo":
      return `Demora acima da meta em: ${g.tipos.map(rotuloDoTipo).join(", ")}.`;
    case "geracao_acima_slo":
      return `Geração acima da meta em: ${g.formatos.map(rotuloDoFormato).join(", ")}.`;
    case "fila_parada":
      return `${g.jobs_em_aberto_acima_do_slo} ${g.jobs_em_aberto_acima_do_slo === 1 ? "pedido está" : "pedidos estão"} na fila há mais tempo que a meta.`;
  }
}
