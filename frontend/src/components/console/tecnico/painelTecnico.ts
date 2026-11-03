// Painel técnico (#21, migration 20261102_22): a superfície onde a fila de jobs, o erro e a latência por
// formato e os quatro gatilhos de revisão arquitetural do §11 são observados. Tudo é calculado no banco
// (`painel_tecnico`, só para o dono do projeto); aqui ficam só a leitura sem confiança no formato e os
// rótulos. Nenhum número é recalculado na tela: o que o banco não mediu aparece como "sem dado".

export type EstadoDoGatilho = "ok" | "alerta" | "sem_dado";

export type Gatilho = { id: string; titulo: string; estado: EstadoDoGatilho; detalhe: string };

export type TipoDeJob = {
  kind: string;
  total: number;
  pending: number;
  processing: number;
  completed: number;
  partial: number;
  failed: number;
  latencia_p95_seg: number | null;
  slo_p95_seg: number | null;
  slo_violado: boolean | null;
};

export type Formato = {
  formato: string;
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  skipped: number;
  falha_pct: number | null;
  tempo_p95_seg: number | null;
  slo_p95_seg: number | null;
  slo_violado: boolean | null;
  execucoes_medias: number | null;
  execucoes_medias_anterior: number | null;
};

export type GastoDoModelo = { modelo: string; chamadas: number; tokens_entrada: number; tokens_saida: number; caracteres: number };

/**
 * Custo em tokens da geração (20261103_14). `null` em tokens por alvo quando a janela não tem alvo com
 * uso gravado (os anteriores à medição vêm sem): não é zero.
 */
export type Custo = {
  tokens_por_alvo: number | null;
  tokens_por_alvo_anterior: number | null;
  alvos_medidos: number;
  alvos_medidos_anterior: number;
  por_modelo: GastoDoModelo[];
};

export type Invariante = { invariante: string; ok: boolean; linhas: number; erro: string | null; rodado_em: string };

export type PainelTecnico = {
  gerado_em: string;
  janela_horas: number;
  fila: {
    jobs_pending: number;
    jobs_processing: number;
    pending_mais_antigo_min: number | null;
    processing_travados: number;
    alvos_pending: number;
    alvos_processing: number;
  };
  jobs: { total: number; por_tipo: TipoDeJob[] };
  formatos: Formato[];
  gatilhos: Gatilho[];
  /** Banco ainda sem a 20261103_14: `null`, e a tela não mostra a seção. */
  custo: Custo | null;
  invariantes: Invariante[];
  atividade: {
    ultimo_job_iniciado_em: string | null;
    ultimo_lote_em: string | null;
    ultima_analise_em: string | null;
    analise_na_fila: number;
    analise_com_erro: number;
  };
};

export const JANELAS: { horas: number; rotulo: string }[] = [
  { horas: 24, rotulo: "24 horas" },
  { horas: 168, rotulo: "7 dias" },
  { horas: 720, rotulo: "30 dias" },
];

const num = (v: unknown, reserva = 0) => (typeof v === "number" && Number.isFinite(v) ? v : reserva);
const numOuNulo = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const texto = (v: unknown, reserva = "") => (typeof v === "string" ? v : reserva);
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

const ESTADOS: readonly EstadoDoGatilho[] = ["ok", "alerta", "sem_dado"];

/**
 * Lê o JSON da RPC sem confiar no formato. Estado desconhecido vira `sem_dado`, nunca `ok`: um gatilho
 * que a tela não entende não pode parecer saudável.
 */
export function lerPainel(bruto: unknown): PainelTecnico | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const b = bruto as Record<string, unknown>;
  const fila = obj(b.fila);
  const jobs = obj(b.jobs);
  const ativ = obj(b.atividade);
  const custo = b.custo && typeof b.custo === "object" && !Array.isArray(b.custo) ? obj(b.custo) : null;
  return {
    gerado_em: texto(b.gerado_em),
    janela_horas: num(b.janela_horas),
    fila: {
      jobs_pending: num(fila.jobs_pending),
      jobs_processing: num(fila.jobs_processing),
      pending_mais_antigo_min: numOuNulo(fila.pending_mais_antigo_min),
      processing_travados: num(fila.processing_travados),
      alvos_pending: num(fila.alvos_pending),
      alvos_processing: num(fila.alvos_processing),
    },
    jobs: {
      total: num(jobs.total),
      por_tipo: lista(jobs.por_tipo).map((t) => ({
        kind: texto(t.kind, "?"),
        total: num(t.total),
        pending: num(t.pending),
        processing: num(t.processing),
        completed: num(t.completed),
        partial: num(t.partial),
        failed: num(t.failed),
        latencia_p95_seg: numOuNulo(t.latencia_p95_seg),
        slo_p95_seg: numOuNulo(t.slo_p95_seg),
        slo_violado: typeof t.slo_violado === "boolean" ? t.slo_violado : null,
      })),
    },
    formatos: lista(b.formatos).map((f) => ({
      formato: texto(f.formato, "?"),
      total: num(f.total),
      pending: num(f.pending),
      processing: num(f.processing),
      completed: num(f.completed),
      failed: num(f.failed),
      skipped: num(f.skipped),
      falha_pct: numOuNulo(f.falha_pct),
      tempo_p95_seg: numOuNulo(f.tempo_p95_seg),
      slo_p95_seg: numOuNulo(f.slo_p95_seg),
      slo_violado: typeof f.slo_violado === "boolean" ? f.slo_violado : null,
      execucoes_medias: numOuNulo(f.execucoes_medias),
      execucoes_medias_anterior: numOuNulo(f.execucoes_medias_anterior),
    })),
    gatilhos: lista(b.gatilhos).map((g) => ({
      id: texto(g.id, "?"),
      titulo: texto(g.titulo, "Gatilho"),
      estado: ESTADOS.includes(g.estado as EstadoDoGatilho) ? (g.estado as EstadoDoGatilho) : "sem_dado",
      detalhe: texto(g.detalhe),
    })),
    custo: custo && {
      tokens_por_alvo: numOuNulo(custo.tokens_por_alvo),
      tokens_por_alvo_anterior: numOuNulo(custo.tokens_por_alvo_anterior),
      alvos_medidos: num(custo.alvos_medidos),
      alvos_medidos_anterior: num(custo.alvos_medidos_anterior),
      por_modelo: Object.entries(obj(custo.por_modelo))
        .map(([modelo, g]) => {
          const gasto = obj(g);
          return {
            modelo,
            chamadas: num(gasto.chamadas),
            tokens_entrada: num(gasto.tokens_entrada),
            tokens_saida: num(gasto.tokens_saida),
            caracteres: num(gasto.caracteres),
          };
        })
        .sort((a, b) => b.tokens_entrada + b.tokens_saida - (a.tokens_entrada + a.tokens_saida) || a.modelo.localeCompare(b.modelo)),
    },
    invariantes: lista(b.invariantes).map((i) => ({
      invariante: texto(i.invariante, "?"),
      ok: i.ok === true,
      linhas: num(i.linhas),
      erro: typeof i.erro === "string" ? i.erro : null,
      rodado_em: texto(i.rodado_em),
    })),
    atividade: {
      ultimo_job_iniciado_em: typeof ativ.ultimo_job_iniciado_em === "string" ? ativ.ultimo_job_iniciado_em : null,
      ultimo_lote_em: typeof ativ.ultimo_lote_em === "string" ? ativ.ultimo_lote_em : null,
      ultima_analise_em: typeof ativ.ultima_analise_em === "string" ? ativ.ultima_analise_em : null,
      analise_na_fila: num(ativ.analise_na_fila),
      analise_com_erro: num(ativ.analise_com_erro),
    },
  };
}

/** Quantos gatilhos pedem atenção agora. `sem_dado` não conta: não é alarme, é lacuna (e aparece como tal). */
export function contarAlertas(gatilhos: Pick<Gatilho, "estado">[]): number {
  return gatilhos.filter((g) => g.estado === "alerta").length;
}

export function rotuloDoEstado(estado: EstadoDoGatilho): string {
  if (estado === "alerta") return "Atenção";
  if (estado === "ok") return "Dentro do esperado";
  return "Sem dado";
}

/** "45 s", "12 min", "2 h 5 min": a unidade que cabe no número. Nulo é traço, não zero. */
export function formatarDuracao(segundos: number | null): string {
  if (segundos === null || !Number.isFinite(segundos)) return "—";
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto === 0 ? `${h} h` : `${h} h ${resto} min`;
}

export function formatarMinutos(min: number | null): string {
  return min === null ? "—" : formatarDuracao(min * 60);
}

/** "12,3 mil", "1,2 mi": tokens em ordem de grandeza legível. Nulo é traço, não zero. */
export function formatarTokens(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return Math.round(n).toLocaleString("pt-BR");
}

export function formatarPercentual(pct: number | null): string {
  return pct === null ? "—" : `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

const FORMATOS: Record<string, string> = {
  enriquecimento: "Enriquecimento",
  capitulo: "Capítulos",
  texto: "Texto",
  audio: "Áudio",
  apresentacao: "Apresentação",
  perfil_inteiro: "Perfil inteiro (legado)",
};
export function rotuloDoFormato(formato: string): string {
  return FORMATOS[formato] ?? formato;
}

/** Há quanto tempo foi, ou "nunca" quando o banco não tem registro. */
export function haQuanto(iso: string | null, agora: Date): string {
  if (!iso) return "nunca";
  const min = Math.max(0, Math.floor((agora.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

/** Perfil inteiro, enriquecimento, texto, áudio e apresentação primeiro, na ordem do pipeline. */
const ORDEM_DOS_FORMATOS = ["enriquecimento", "texto", "capitulo", "audio", "apresentacao", "perfil_inteiro"];
export function ordenarFormatos(formatos: Formato[]): Formato[] {
  const pos = (f: string) => {
    const i = ORDEM_DOS_FORMATOS.indexOf(f);
    return i === -1 ? ORDEM_DOS_FORMATOS.length : i;
  };
  return [...formatos].sort((a, b) => pos(a.formato) - pos(b.formato) || a.formato.localeCompare(b.formato));
}

/** O erro do banco quando quem chama não é o dono. A tela diz isso, em vez de mostrar um painel vazio. */
export function eSemPermissao(erro: { code?: string; message?: string } | null | undefined): boolean {
  return erro?.code === "42501";
}

/** A função ainda não existe no banco (migration pendente). */
export function eMigracaoPendente(erro: { code?: string; message?: string } | null | undefined): boolean {
  if (!erro) return false;
  return erro.code === "42883" || erro.code === "PGRST202" || /painel_tecnico/i.test(erro.message ?? "") && /does not exist|schema cache|could not find/i.test(erro.message ?? "");
}
