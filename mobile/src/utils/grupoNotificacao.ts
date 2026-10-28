// Grupos da lista de Notificações (mobile-v1, `07-notificacoes.html`): "Hoje",
// "Esta semana" e "Anteriores", pelo dia de envio no fuso do aparelho.

export type GrupoNotificacao = "Hoje" | "Esta semana" | "Anteriores";

const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Esta semana" = os 6 dias antes de hoje; data inválida cai em "Anteriores". */
export function grupoDaNotificacao(enviadaEm: string | number | Date | null | undefined, agora: Date = new Date()): GrupoNotificacao {
  const d = enviadaEm instanceof Date ? enviadaEm : new Date(enviadaEm ?? NaN);
  if (Number.isNaN(d.getTime())) return "Anteriores";
  const dias = Math.round((inicioDoDia(agora) - inicioDoDia(d)) / 86_400_000);
  if (dias <= 0) return "Hoje";
  if (dias < 7) return "Esta semana";
  return "Anteriores";
}

/** O cabeçalho de grupo aparece na primeira linha de cada grupo (a lista já vem do mais novo ao mais antigo). */
export function abreGrupo<T>(itens: readonly T[], indice: number, dataDe: (item: T) => unknown, agora: Date = new Date()): GrupoNotificacao | null {
  const grupo = grupoDaNotificacao(dataDe(itens[indice]) as string, agora);
  if (indice === 0) return grupo;
  return grupoDaNotificacao(dataDe(itens[indice - 1]) as string, agora) === grupo ? null : grupo;
}
