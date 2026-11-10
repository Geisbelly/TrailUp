// Saúde dos clientes (migration 20261105_14). O banco agrega (`painel_clientes`, só para o dono); aqui ficam a
// leitura sem confiança no formato e as contas. Sem amostra, a tela mostra traço, nunca um número bom.

export type VitaisDoFormato = {
  formato: string;
  lcp_n: number;
  lcp_p75_ms: number | null;
  inp_n: number;
  inp_p75_ms: number | null;
  cls_n: number;
  cls_p75: number | null;
};

export type SaudeDaSuperficie = {
  superficie: string;
  sessoes: number;
  pessoas: number;
  sessoes_com_erro: number;
  sessoes_com_critica: number;
  sessoes_sem_falha: number;
  chamadas: number;
  falhas_servidor: number;
  sem_resposta: number;
  criticas: number;
  criticas_falha: number;
  fallback_api: number;
  inicio_n: number;
  inicio_p75_ms: number | null;
  vitais: VitaisDoFormato[];
  versoes: { versao: string; sessoes: number; com_erro: number }[];
  destinos: { destino: string; falhas: number }[];
};

export type ErroDoCliente = {
  superficie: string;
  versao: string | null;
  assinatura: string;
  tipo: string;
  nome: string | null;
  mensagem: string | null;
  rota: string | null;
  vezes: number;
  sessoes: number;
  pessoas: number;
  ultima_em: string | null;
  nova: boolean;
};

export type DiaDoConsole = { dia: string; professores: number; sessoes: number };

export type SaudeDosClientes = {
  superficies: SaudeDaSuperficie[];
  erros: ErroDoCliente[];
  console: { professores: number; ativos_7d: number; ativos_30d: number; sessoes_7d: number; serie_30d: DiaDoConsole[] };
};

const numero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const talvez = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const texto = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => typeof x === "object" && x !== null) : []);

export function lerSaudeDosClientes(dado: unknown): SaudeDosClientes | null {
  if (typeof dado !== "object" || dado === null || Array.isArray(dado)) return null;
  const d = dado as Record<string, unknown>;
  const c = (typeof d.console === "object" && d.console !== null ? d.console : {}) as Record<string, unknown>;
  return {
    superficies: lista(d.superficies).map((s) => ({
      superficie: texto(s.superficie) ?? "?",
      sessoes: numero(s.sessoes),
      pessoas: numero(s.pessoas),
      sessoes_com_erro: numero(s.sessoes_com_erro),
      sessoes_com_critica: numero(s.sessoes_com_critica),
      sessoes_sem_falha: numero(s.sessoes_sem_falha),
      chamadas: numero(s.chamadas),
      falhas_servidor: numero(s.falhas_servidor),
      sem_resposta: numero(s.sem_resposta),
      criticas: numero(s.criticas),
      criticas_falha: numero(s.criticas_falha),
      fallback_api: numero(s.fallback_api),
      inicio_n: numero(s.inicio_n),
      inicio_p75_ms: talvez(s.inicio_p75_ms),
      vitais: lista(s.vitais).map((v) => ({
        formato: texto(v.formato) ?? "sem_dado",
        lcp_n: numero(v.lcp_n),
        lcp_p75_ms: talvez(v.lcp_p75_ms),
        inp_n: numero(v.inp_n),
        inp_p75_ms: talvez(v.inp_p75_ms),
        cls_n: numero(v.cls_n),
        cls_p75: talvez(v.cls_p75),
      })),
      versoes: lista(s.versoes).map((v) => ({ versao: texto(v.versao) ?? "sem_dado", sessoes: numero(v.sessoes), com_erro: numero(v.com_erro) })),
      destinos: lista(s.destinos).map((v) => ({ destino: texto(v.destino) ?? "?", falhas: numero(v.falhas) })),
    })),
    erros: lista(d.erros).map((e) => ({
      superficie: texto(e.superficie) ?? "?",
      versao: texto(e.versao),
      assinatura: texto(e.assinatura) ?? "?",
      tipo: texto(e.tipo) ?? "erro",
      nome: texto(e.nome),
      mensagem: texto(e.mensagem),
      rota: texto(e.rota),
      vezes: numero(e.vezes),
      sessoes: numero(e.sessoes),
      pessoas: numero(e.pessoas),
      ultima_em: texto(e.ultima_em),
      nova: e.nova === true,
    })),
    console: {
      professores: numero(c.professores),
      ativos_7d: numero(c.ativos_7d),
      ativos_30d: numero(c.ativos_30d),
      sessoes_7d: numero(c.sessoes_7d),
      serie_30d: lista(c.serie_30d).map((x) => ({ dia: texto(x.dia) ?? "", professores: numero(x.professores), sessoes: numero(x.sessoes) })),
    },
  };
}

const SUPERFICIES: Record<string, string> = { console: "Console do professor", web_aluno: "Web do aluno", app: "App do aluno" };
export const rotuloDaSuperficie = (id: string) => SUPERFICIES[id] ?? id;

const TIPOS: Record<string, string> = { tela: "Tela derrubada", fatal: "Fatal", promessa: "Promessa", erro: "Erro", tratado: "Falha avisada" };
export const rotuloDoTipo = (tipo: string) => TIPOS[tipo] ?? tipo;

const FORMATOS: Record<string, string> = { celular: "Celular", desktop: "Computador", sem_dado: "Sem dado" };
export const rotuloDoFormato = (formato: string) => FORMATOS[formato] ?? formato;

/** Abaixo disso, P75 descreve poucas pessoas, não a superfície. */
export const AMOSTRA_MINIMA = 20;

export type LeituraDoVital = "bom" | "acima" | "amostra_pequena" | "sem_dado";

/** Metas do relatório: LCP 2,5 s, INP 200 ms, CLS 0,1. Amostra pequena mostra o valor e não julga. */
export function lerVital(valor: number | null, n: number, meta: number): LeituraDoVital {
  if (valor === null || n === 0) return "sem_dado";
  if (n < AMOSTRA_MINIMA) return "amostra_pequena";
  return valor <= meta ? "bom" : "acima";
}

export function formatarMs(ms: number | null): string {
  if (ms === null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s` : `${ms} ms`;
}

export const METAS = { lcp_ms: 2500, inp_ms: 200, cls: 0.1 } as const;
