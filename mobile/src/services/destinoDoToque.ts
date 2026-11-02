/**
 * Para onde leva o toque numa notificação do sistema.
 *
 * Mensagem privada (`chat_privado`, do gatilho `chat_privado_notificar` da `20261102_06`) abre a
 * conversa com quem mandou. O aviso não traz o texto da mensagem, de propósito, então o detalhe da
 * notificação só repetiria "Fulano mandou uma mensagem" e o aluno ainda teria de achar a conversa.
 * O id da notificação vai junto para a caixa de entrada também dar o aviso como lido.
 *
 * O Social é `navigate`, não `push`: a aba já pode estar aberta, e empilhar outra cópia dela
 * deixaria o "voltar" passando por duas telas iguais.
 *
 * O resto vai ao detalhe da notificação; sem id (as locais agendadas), à lista.
 */
export type DadosDoToque = Record<string, unknown> | null | undefined;

export type DestinoDoToque = { rota: string; modo: "push" | "navigate" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function destinoDoToque(dados: DadosDoToque): DestinoDoToque {
  const id = dados?.notificacao_id;
  const notificacao = typeof id === "number" || typeof id === "string" ? String(id).trim() : "";
  const remetente = dados?.remetente_id;
  if (dados?.tipo === "chat_privado" && typeof remetente === "string" && UUID.test(remetente)) {
    const extra = /^\d+$/.test(notificacao) ? `&notificacao=${notificacao}` : "";
    return { rota: `/social?conversa=${remetente}${extra}`, modo: "navigate" };
  }
  return { rota: notificacao ? `/notificacoes/${encodeURIComponent(notificacao)}` : "/notificacoes", modo: "push" };
}
