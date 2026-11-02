// Notificações do professor (migration 20261102_17): o que pede a atenção dele, avisado pelo banco.
// Uma linha por assunto, não por ocorrência: `contagem` diz quantas vezes o mesmo assunto aconteceu e
// `lida_em` volta a nulo quando acontece de novo.

import { consolePathForView, type ConsoleView } from "@/pages/consoleSections";

export type TipoDeNotificacao = "recomendacao_ia" | "entrega_para_avaliar" | "geracao_falhou" | "evento_encerrado";
export type DestinoDeNotificacao = "recomendacoes" | "notas" | "personalizacoes" | "eventos";

export type NotificacaoDoProfessor = {
  id: number;
  professor_id: string;
  classe_id: number | null;
  tipo: string;
  titulo: string;
  corpo: string;
  destino: string | null;
  contagem: number;
  dedupe_key: string;
  lida_em: string | null;
  created_at: string;
  atualizado_em: string;
};

/** A aba do console que resolve o assunto. Destino desconhecido (versão futura) cai na Visão geral. */
const VIEW_DO_DESTINO: Record<DestinoDeNotificacao, ConsoleView> = {
  recomendacoes: "recomendacoes",
  notas: "notas",
  personalizacoes: "personalizacoes",
  eventos: "eventos",
};

export function caminhoDaNotificacao(n: Pick<NotificacaoDoProfessor, "destino">): string {
  const view = n.destino && Object.prototype.hasOwnProperty.call(VIEW_DO_DESTINO, n.destino) ? VIEW_DO_DESTINO[n.destino as DestinoDeNotificacao] : "dashboard";
  return consolePathForView(view);
}

export const naoLida = (n: Pick<NotificacaoDoProfessor, "lida_em">) => n.lida_em === null;

export function contarNaoLidas(lista: Pick<NotificacaoDoProfessor, "lida_em">[]): number {
  return lista.filter(naoLida).length;
}

/** Mais recente primeiro; o desempate pelo id mantém a ordem estável entre leituras. */
export function ordenarNotificacoes(lista: NotificacaoDoProfessor[]): NotificacaoDoProfessor[] {
  return [...lista].sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em) || b.id - a.id);
}

export { rotuloDoSelo } from "../recomendacoes/recomendacoes";

export function tempoRelativo(iso: string, agora: Date): string {
  const minutos = Math.max(0, Math.floor((agora.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

/** "3 novas" quando o mesmo assunto se repetiu; nada quando foi uma vez só. */
export function rotuloDaContagem(contagem: number): string | null {
  return contagem > 1 ? `${contagem} ocorrências` : null;
}

/** A tabela ainda não existe (migration não aplicada): o sino some em vez de mostrar erro. */
export function eTabelaAusente(erro: { code?: string; message?: string } | null | undefined): boolean {
  if (!erro) return false;
  return erro.code === "42P01" || erro.code === "PGRST205" || /professor_notificacoes.*(does not exist|schema cache)/i.test(erro.message ?? "");
}
