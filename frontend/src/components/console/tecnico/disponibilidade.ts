// Disponibilidade e acessos (migrations 20261105_09 e _10). O banco mede e agrega (`painel_disponibilidade`,
// `painel_acessos_alunos`, só para o dono); aqui ficam a leitura sem confiança no formato e os rótulos.
// O que o banco não mediu aparece como "sem dado", nunca como "no ar".

export type EstadoDoAlvo = "ok" | "queda" | "sem_dado";

export type DiaDoAlvo = { dia: string; medidas: number; boas: number };

export type Alvo = {
  id: string;
  nome: string;
  estado: EstadoDoAlvo;
  estado_desde: string | null;
  ultima_sonda_em: string | null;
  intervalo_min: number;
  versao: string | null;
  medidas: number;
  boas: number;
  disponibilidade_pct: number | null;
  latencia_p50_ms: number | null;
  latencia_p95_ms: number | null;
  slo_pct: number | null;
  medidas_aula: number;
  disponibilidade_aula_pct: number | null;
  minutos_aula: number | null;
  cobertura_aula_pct: number | null;
  minutos_fora_aula: number;
  /** Minutos de deploy curto, tirados da meta e mostrados à parte (migration 20261105_26). */
  minutos_deploy: number;
  orcamento_aula_min: number | null;
  medidas_30d: number;
  disponibilidade_30d_pct: number | null;
  serie_30d: DiaDoAlvo[];
};

export type Incidente = {
  id: number;
  alvo_id: string;
  tipo: string;
  inicio: string;
  fim: string | null;
  motivo: string | null;
  versao: string | null;
  minutos: number;
};

export type DiaDeAcesso = { dia: string; alunos: number; minutos: number };

export type Disponibilidade = {
  gerado_em: string;
  /** O JSON do banco mantém o nome `aula`; o monitor vale 24 horas. */
  aula: { slo_janela_dias: number };
  alvos: Alvo[];
  incidentes: Incidente[];
  resumo: { abertos: number; quedas: number; instabilidades: number; lentidoes: number; degradacoes: number; mediana_queda_min: number | null };
  cliente: {
    lotes: number;
    pela_api: number;
    diretos: number;
    sem_alcancar_api: number;
    motivos: { motivo: string; lotes: number }[];
    versoes: { versao: string; plataforma: string; lotes: number }[];
  };
  ia: {
    chamadas: number;
    erros: number;
    latencia_p95_ms: number | null;
    tokens_entrada: number;
    tokens_saida: number;
    por_prompt: { prompt: string; chamadas: number; erros: number }[];
  };
  banco: { tamanho_mb: number | null; limite_mb: number | null; conexoes: number | null; conexoes_max: number | null; rotinas_com_falha_24h: number | null };
  alertas: {
    enviados_24h: number;
    pendentes: number;
    desistidos: number;
    teto_dia: number;
    ultimos: { assunto: string; criado_em: string; enviado_em: string | null; tentativas: number; erro: string | null }[];
  };
  acessos: {
    matriculados: number;
    ativos_hoje: number;
    ativos_7d: number;
    ativos_30d: number;
    acessos_7d: number;
    acessos_30d: number;
    por_plataforma: { plataforma: string; acessos: number }[];
    serie_30d: DiaDeAcesso[];
  };
};

export type AcessoDoAluno = {
  codigo: string;
  nome: string | null;
  dias_com_acesso: number;
  acessos: number;
  minutos: number;
  ultimo_acesso_em: string | null;
};

const num = (v: unknown, padrao = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : padrao);
const numOuNulo = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const texto = (v: unknown, padrao = ""): string => (typeof v === "string" ? v : padrao);
const textoOuNulo = (v: unknown): string | null => (typeof v === "string" ? v : null);
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

const ESTADOS: readonly EstadoDoAlvo[] = ["ok", "queda", "sem_dado"];

/** Lê o JSON da RPC sem confiar no formato. Estado desconhecido vira `sem_dado`, nunca `ok`. */
export function lerDisponibilidade(bruto: unknown): Disponibilidade | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const b = bruto as Record<string, unknown>;
  const resumo = obj(b.resumo_incidentes);
  const cliente = obj(b.cliente);
  const ia = obj(b.ia);
  const banco = obj(b.banco);
  const alertas = obj(b.alertas);
  const acessos = obj(b.acessos);
  const janela = obj(b.aula);
  return {
    gerado_em: texto(b.gerado_em),
    aula: {
      slo_janela_dias: num(janela.slo_janela_dias, 28),
    },
    alvos: lista(b.alvos).map((a) => ({
      id: texto(a.id, "?"),
      nome: texto(a.nome, "?"),
      estado: ESTADOS.includes(a.estado as EstadoDoAlvo) ? (a.estado as EstadoDoAlvo) : "sem_dado",
      estado_desde: textoOuNulo(a.estado_desde),
      ultima_sonda_em: textoOuNulo(a.ultima_sonda_em),
      intervalo_min: num(a.intervalo_min, 1),
      versao: textoOuNulo(a.versao),
      medidas: num(a.medidas),
      boas: num(a.boas),
      disponibilidade_pct: numOuNulo(a.disponibilidade_pct),
      latencia_p50_ms: numOuNulo(a.latencia_p50_ms),
      latencia_p95_ms: numOuNulo(a.latencia_p95_ms),
      slo_pct: numOuNulo(a.slo_pct),
      medidas_aula: num(a.medidas_aula),
      disponibilidade_aula_pct: numOuNulo(a.disponibilidade_aula_pct),
      minutos_aula: numOuNulo(a.minutos_aula),
      cobertura_aula_pct: numOuNulo(a.cobertura_aula_pct),
      minutos_fora_aula: num(a.minutos_fora_aula),
      minutos_deploy: num(a.minutos_deploy),
      orcamento_aula_min: numOuNulo(a.orcamento_aula_min),
      medidas_30d: num(a.medidas_30d),
      disponibilidade_30d_pct: numOuNulo(a.disponibilidade_30d_pct),
      serie_30d: lista(a.serie_30d).map((d) => ({ dia: texto(d.dia), medidas: num(d.medidas), boas: num(d.boas) })),
    })),
    incidentes: lista(b.incidentes).map((i) => ({
      id: num(i.id),
      alvo_id: texto(i.alvo_id, "?"),
      tipo: texto(i.tipo, "?"),
      inicio: texto(i.inicio),
      fim: textoOuNulo(i.fim),
      motivo: textoOuNulo(i.motivo),
      versao: textoOuNulo(i.versao),
      minutos: num(i.minutos),
    })),
    resumo: {
      abertos: num(resumo.abertos),
      quedas: num(resumo.quedas),
      instabilidades: num(resumo.instabilidades),
      lentidoes: num(resumo.lentidoes),
      degradacoes: num(resumo.degradacoes),
      mediana_queda_min: numOuNulo(resumo.mediana_queda_min),
    },
    cliente: {
      lotes: num(cliente.lotes),
      pela_api: num(cliente.pela_api),
      diretos: num(cliente.diretos),
      sem_alcancar_api: num(cliente.sem_alcancar_api),
      motivos: lista(cliente.motivos).map((m) => ({ motivo: texto(m.motivo, "?"), lotes: num(m.lotes) })),
      versoes: lista(cliente.versoes).map((v) => ({ versao: texto(v.versao, "?"), plataforma: texto(v.plataforma, "?"), lotes: num(v.lotes) })),
    },
    ia: {
      chamadas: num(ia.chamadas),
      erros: num(ia.erros),
      latencia_p95_ms: numOuNulo(ia.latencia_p95_ms),
      tokens_entrada: num(ia.tokens_entrada),
      tokens_saida: num(ia.tokens_saida),
      por_prompt: lista(ia.por_prompt).map((p) => ({ prompt: texto(p.prompt, "?"), chamadas: num(p.chamadas), erros: num(p.erros) })),
    },
    banco: {
      tamanho_mb: numOuNulo(banco.tamanho_mb),
      limite_mb: numOuNulo(banco.limite_mb),
      conexoes: numOuNulo(banco.conexoes),
      conexoes_max: numOuNulo(banco.conexoes_max),
      rotinas_com_falha_24h: numOuNulo(banco.rotinas_com_falha_24h),
    },
    alertas: {
      enviados_24h: num(alertas.enviados_24h),
      pendentes: num(alertas.pendentes),
      desistidos: num(alertas.desistidos),
      teto_dia: num(alertas.teto_dia),
      ultimos: lista(alertas.ultimos).map((a) => ({
        assunto: texto(a.assunto),
        criado_em: texto(a.criado_em),
        enviado_em: textoOuNulo(a.enviado_em),
        tentativas: num(a.tentativas),
        erro: textoOuNulo(a.erro),
      })),
    },
    acessos: {
      matriculados: num(acessos.matriculados),
      ativos_hoje: num(acessos.ativos_hoje),
      ativos_7d: num(acessos.ativos_7d),
      ativos_30d: num(acessos.ativos_30d),
      acessos_7d: num(acessos.acessos_7d),
      acessos_30d: num(acessos.acessos_30d),
      por_plataforma: lista(acessos.por_plataforma).map((p) => ({ plataforma: texto(p.plataforma, "?"), acessos: num(p.acessos) })),
      serie_30d: lista(acessos.serie_30d).map((d) => ({ dia: texto(d.dia), alunos: num(d.alunos), minutos: num(d.minutos) })),
    },
  };
}

export function lerAcessosDosAlunos(bruto: unknown): AcessoDoAluno[] {
  return lista(obj(bruto).alunos).map((a) => ({
    codigo: texto(a.codigo, "?"),
    nome: textoOuNulo(a.nome),
    dias_com_acesso: num(a.dias_com_acesso),
    acessos: num(a.acessos),
    minutos: num(a.minutos),
    ultimo_acesso_em: textoOuNulo(a.ultimo_acesso_em),
  }));
}

export function rotuloDoAlvo(estado: EstadoDoAlvo): string {
  if (estado === "queda") return "Fora do ar";
  if (estado === "ok") return "No ar";
  return "Sem dado";
}

const TIPOS: Record<string, string> = { queda: "Queda", instabilidade: "Instabilidade", lentidao: "Lentidão", degradacao: "Degradação" };
export function rotuloDoIncidente(tipo: string): string {
  return TIPOS[tipo] ?? tipo;
}

const SINAIS: Record<string, string> = {
  app_api: "App sem alcançar a API",
  ia: "Modelo",
  banco_espaco: "Espaço do banco",
  banco_conexoes: "Conexões do banco",
  rotinas: "Rotinas do banco",
};
export function rotuloDaOrigem(alvoId: string, alvos: Pick<Alvo, "id" | "nome">[]): string {
  return alvos.find((a) => a.id === alvoId)?.nome ?? SINAIS[alvoId] ?? alvoId;
}

/** "99,52%": duas casas, porque a diferença entre metas está nelas. Nulo é traço, não zero. */
export function formatarDisponibilidade(pct: number | null): string {
  return pct === null ? "—" : `${pct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** Fração do orçamento já gasta. Sem meta ou sem sonda medida, não há o que dizer. */
export function orcamentoGastoPct(a: Pick<Alvo, "minutos_fora_aula" | "orcamento_aula_min" | "medidas_aula">): number | null {
  if (!a.orcamento_aula_min || a.medidas_aula === 0) return null;
  return Math.round((100 * a.minutos_fora_aula) / a.orcamento_aula_min);
}

/** A faixa de um dia: `sem_dado` quando nada foi medido, em vez de parecer um dia bom. */
export function estadoDoDia(d: DiaDoAlvo | undefined): "bom" | "falhou" | "sem_dado" {
  if (!d || d.medidas === 0) return "sem_dado";
  return d.boas === d.medidas ? "bom" : "falhou";
}

/** Os últimos 30 dias, do mais antigo ao de hoje, com buraco onde o banco não tem linha. */
export function ultimosDias(hoje: Date, quantos = 30): string[] {
  const fuso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  return Array.from({ length: quantos }, (_, i) => fuso.format(new Date(hoje.getTime() - (quantos - 1 - i) * 86_400_000)));
}

/** Data e hora em Brasília. Sem valor, traço. */
export const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }) : "—");

/** Contagem com denominador: com turma pequena, o percentual sozinho engana. */
export function contagem(parte: number, total: number): string {
  return total === 0 ? "—" : `${parte} de ${total}`;
}
