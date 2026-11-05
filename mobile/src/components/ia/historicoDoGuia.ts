import type { MentorChatMessagePayload } from "@/services/personalizacao/types";

/** O `reply` como a API mandou e a assinatura dele. A tela mostra o texto já ajustado de tom. */
export type FalaAssinada = { content: string; assinatura: string };

type FalaDoPainel = {
  role: "assistant" | "user";
  content: string;
  falaAssinada?: FalaAssinada;
};

export function falaAssinadaDaResposta(reply: unknown, assinatura: unknown): FalaAssinada | undefined {
  return typeof reply === "string" && typeof assinatura === "string" && assinatura
    ? { content: reply, assinatura }
    : undefined;
}

/** Fala assinada volta intacta: qualquer ajuste no texto invalida a assinatura. */
export function falaParaHistorico(fala: FalaDoPainel): MentorChatMessagePayload {
  return fala.falaAssinada
    ? { role: fala.role, content: fala.falaAssinada.content, assinatura: fala.falaAssinada.assinatura }
    : { role: fala.role, content: fala.content };
}
