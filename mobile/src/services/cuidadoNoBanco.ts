/**
 * O lado Supabase do modo de cuidado (spec `2026-11-20-modo-de-cuidado-design.md`, seções 3 a 5):
 * as RPCs `cuidado_registrar`, `cuidado_ativo` e `cuidado_responder` (`20261121_02`) e as chaves
 * `cuidado_*` de `app_config` (públicas: o app precisa delas antes de decidir).
 *
 * Direto no Supabase, sem a API: nada aqui tem modelo de linguagem (regra de fronteira). Nenhuma
 * função daqui lança: o alívio na tela nunca pode cair porque a rede caiu. Quem chama decide o que
 * fazer com `null` ou `{ ok: false }`.
 */
import type { FatosDeSobrecarga, LimitesDeSobrecarga } from "@/utils/sinaisDeSobrecarga";

export type ClienteDoCuidado = {
  rpc: (funcao: string, argumentos?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
  from: (tabela: string) => any;
};

export type OrigemDoCuidado = "aluno_disse" | "sinais_de_uso";

export type AcoesDoCuidado = {
  pausa_sugerida?: boolean;
  cronometro_desligado?: boolean;
  tecnica_oferecida?: boolean;
  cvv_indicado?: boolean;
};

export type RegistroDoCuidado =
  | { ok: true; momentoId: number; expiraEm: number | null; atualizado: boolean }
  // `sem_consentimento`, `intervalo`, `sem_matricula`, `fato_invalido`... ou `falha` (rede, RPC
  // ausente, resposta que não se entende).
  | { ok: false; motivo: string };

export type CuidadoAtivo = { ativo: boolean; expiraEm: number | null; origem: OrigemDoCuidado | null };

export type ConfigDoCuidado = { limites: LimitesDeSobrecarga; duracaoMin: number };

const CHAVES = {
  errosSeguidos: "cuidado_erros_seguidos",
  minutosSemParar: "cuidado_minutos_sem_parar",
  abandonos: "cuidado_abandonos",
  duracaoMin: "cuidado_duracao_min",
} as const;

function instante(valor: unknown): number | null {
  if (typeof valor !== "string" || !valor) return null;
  const ms = Date.parse(valor);
  return Number.isFinite(ms) ? ms : null;
}

function origem(valor: unknown): OrigemDoCuidado | null {
  return valor === "aluno_disse" || valor === "sinais_de_uso" ? valor : null;
}

/**
 * Grava o momento do sinal de uso. O aparelho só grava `sinais_de_uso` e nunca nível: o que o
 * aluno diz ao Guia entra pela API.
 */
export async function registrarCuidadoNoBanco(
  cliente: ClienteDoCuidado,
  params: { classeId: number; topicoId: number | null; fatos: FatosDeSobrecarga; acoes: AcoesDoCuidado },
): Promise<RegistroDoCuidado> {
  try {
    const { data, error } = await cliente.rpc("cuidado_registrar", {
      p_classe_id: params.classeId,
      p_topico_id: params.topicoId,
      p_origem: "sinais_de_uso",
      p_fatos: params.fatos,
      p_acoes: params.acoes,
    });
    if (error || !data || typeof data !== "object") return { ok: false, motivo: "falha" };
    const d = data as Record<string, unknown>;
    if (d.ok === true && typeof d.momento_id === "number") {
      return { ok: true, momentoId: d.momento_id, expiraEm: instante(d.expira_em), atualizado: d.atualizado === true };
    }
    return { ok: false, motivo: typeof d.motivo === "string" ? d.motivo : "falha" };
  } catch {
    return { ok: false, motivo: "falha" };
  }
}

/** Há modo de cuidado valendo nesta turma? `null` quando não deu para saber. */
export async function lerCuidadoAtivo(cliente: ClienteDoCuidado, classeId: number): Promise<CuidadoAtivo | null> {
  try {
    const { data, error } = await cliente.rpc("cuidado_ativo", { p_classe_id: classeId });
    if (error || !data || typeof data !== "object") return null;
    const d = data as Record<string, unknown>;
    return { ativo: d.ativo === true, expiraEm: instante(d.expira_em), origem: origem(d.origem) };
  } catch {
    return null;
  }
}

/** O aluno fez a pausa ou continuou. Só existe com um momento gravado. */
export async function responderCuidado(
  cliente: ClienteDoCuidado,
  momentoId: number,
  resposta: "pausou" | "continuou",
): Promise<boolean> {
  try {
    const { data, error } = await cliente.rpc("cuidado_responder", { p_momento_id: momentoId, p_resposta: resposta });
    return !error && data === true;
  } catch {
    return false;
  }
}

/**
 * Os limites do detector e a duração do alívio. Sem as quatro chaves, `null`: o detector fica
 * desarmado em vez de disparar com um número inventado no aparelho.
 */
export async function lerConfigDoCuidado(cliente: ClienteDoCuidado): Promise<ConfigDoCuidado | null> {
  try {
    const { data, error } = await cliente
      .from("app_config")
      .select("chave, valor")
      .in("chave", Object.values(CHAVES));
    if (error || !Array.isArray(data)) return null;
    const ler = (chave: string) => {
      const linha = data.find((l: { chave?: string }) => l?.chave === chave);
      const n = Number(String(linha?.valor ?? "").trim());
      return linha && Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    };
    const errosSeguidos = ler(CHAVES.errosSeguidos);
    const minutosSemParar = ler(CHAVES.minutosSemParar);
    const abandonos = ler(CHAVES.abandonos);
    const duracaoMin = ler(CHAVES.duracaoMin);
    if (errosSeguidos == null || minutosSemParar == null || abandonos == null || duracaoMin == null) return null;
    return { limites: { errosSeguidos, minutosSemParar, abandonos }, duracaoMin };
  } catch {
    return null;
  }
}
