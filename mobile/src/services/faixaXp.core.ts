/**
 * Núcleo puro da faixa de XP (#143): ler o que `aluno_faixa_xp` devolve e montar
 * o texto e a barra.
 *
 * Os limites e os títulos são do banco (`xp_faixa`, `20261102_10`), não daqui: o
 * app não sabe quantas faixas existem nem onde cada uma começa. Separado de
 * `faixaXp.ts` porque o cliente do Supabase não carrega no runner de testes em Node.
 */

export type FaixaXp = {
  classeId: number;
  /** XP do aluno na turma. Nunca negativo: o banco conta o negativo como 0. */
  xp: number;
  nivel: number;
  titulo: string;
  totalNiveis: number;
  xpMinimo: number;
  /** `null` na última faixa. */
  proximoMinimo: number | null;
  proximoTitulo: string | null;
  xpNaFaixa: number;
  tamanhoFaixa: number | null;
  xpParaProxima: number | null;
};

function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

/** Uma linha da RPC (o PostgREST manda `numeric` como número ou texto). Linha inválida vira `null`. */
export function lerFaixaXp(linha: unknown): FaixaXp | null {
  if (!linha || typeof linha !== "object") return null;
  const l = linha as Record<string, unknown>;
  const classeId = numero(l.classe_id);
  const xp = numero(l.xp);
  const nivel = numero(l.nivel);
  const titulo = texto(l.titulo);
  const totalNiveis = numero(l.total_niveis);
  const xpMinimo = numero(l.xp_minimo);
  if (classeId === null || xp === null || nivel === null || !titulo || totalNiveis === null || xpMinimo === null) {
    return null;
  }
  const proximoMinimo = numero(l.proximo_minimo);
  return {
    classeId,
    xp: Math.max(0, xp),
    nivel,
    titulo,
    totalNiveis,
    xpMinimo,
    proximoMinimo,
    proximoTitulo: proximoMinimo === null ? null : texto(l.proximo_titulo),
    xpNaFaixa: Math.max(0, numero(l.xp_na_faixa) ?? xp - xpMinimo),
    tamanhoFaixa: proximoMinimo === null ? null : numero(l.tamanho_faixa),
    xpParaProxima: proximoMinimo === null ? null : Math.max(0, numero(l.xp_para_proxima) ?? proximoMinimo - xp),
  };
}

/** Quanto da faixa atual já foi feito, de 0 a 1. A última faixa aparece cheia. */
export function progressoDaFaixa(faixa: FaixaXp): number {
  if (faixa.proximoMinimo === null || !faixa.tamanhoFaixa || faixa.tamanhoFaixa <= 0) return 1;
  return Math.min(1, Math.max(0, faixa.xpNaFaixa / faixa.tamanhoFaixa));
}

/** Inteiro com ponto de milhar ("1.300"), sem depender do Intl do aparelho. */
export function formatarXp(valor: number): string {
  return String(Math.max(0, Math.floor(valor))).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export type TextosDaFaixa = {
  nivel: string;
  xp: string;
  proxima: string;
  acessivel: string;
};

export function textosDaFaixa(faixa: FaixaXp): TextosDaFaixa {
  const nivel = `Nível ${faixa.nivel} de ${faixa.totalNiveis}`;
  const xp = `${formatarXp(faixa.xp)} XP`;
  if (faixa.proximoMinimo === null || faixa.xpParaProxima === null) {
    const proxima = "Você chegou à última faixa da trilha";
    return { nivel, xp, proxima, acessivel: `${faixa.titulo}, ${nivel}, ${xp}. ${proxima}.` };
  }
  // Para cima: com 0,5 XP faltando, "faltam 0" seria mentira.
  const faltam = formatarXp(Math.ceil(faixa.xpParaProxima));
  const proxima = faixa.proximoTitulo
    ? `Faltam ${faltam} XP para ${faixa.proximoTitulo}`
    : `Faltam ${faltam} XP para o próximo nível`;
  return { nivel, xp, proxima, acessivel: `${faixa.titulo}, ${nivel}, ${xp}. ${proxima}.` };
}

/** RPC ausente (banco local sem a `20261102_10`): o cartão some em vez de virar erro. */
export function rpcIndisponivel(erro: { code?: unknown; message?: unknown } | null): boolean {
  if (!erro) return false;
  const code = String(erro.code ?? "");
  return code === "PGRST202" || code === "42883";
}
