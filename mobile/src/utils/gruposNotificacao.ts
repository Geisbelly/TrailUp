// Grupos da caixa de entrada na web em tela larga (#346, protótipo v4):
// "Hoje", "Esta semana" (últimos 7 dias, sem hoje) e "Anteriores". Função pura,
// com `agora` explícito, para ser testável sem relógio.
export type GrupoNotificacao = "Hoje" | "Esta semana" | "Anteriores";

const ORDEM: GrupoNotificacao[] = ["Hoje", "Esta semana", "Anteriores"];
const DIA_MS = 24 * 60 * 60 * 1000;

function inicioDoDia(data: Date): number {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate()).getTime();
}

export function grupoDaData(quando: string | null | undefined, agora: Date): GrupoNotificacao {
  const ms = quando ? Date.parse(quando) : NaN;
  if (Number.isNaN(ms)) return "Anteriores";
  const hoje = inicioDoDia(agora);
  if (ms >= hoje) return "Hoje";
  if (ms >= hoje - 6 * DIA_MS) return "Esta semana";
  return "Anteriores";
}

/** Mantém a ordem de chegada dentro de cada grupo e omite grupos vazios. */
export function agruparPorData<T>(
  itens: readonly T[],
  dataDe: (item: T) => string | null | undefined,
  agora: Date,
): { grupo: GrupoNotificacao; itens: T[] }[] {
  const mapa = new Map<GrupoNotificacao, T[]>();
  for (const item of itens) {
    const g = grupoDaData(dataDe(item), agora);
    mapa.set(g, [...(mapa.get(g) ?? []), item]);
  }
  return ORDEM.filter((g) => mapa.has(g)).map((grupo) => ({ grupo, itens: mapa.get(grupo)! }));
}
