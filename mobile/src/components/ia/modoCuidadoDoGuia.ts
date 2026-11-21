/**
 * A resposta do Guia liga o modo de cuidado no aparelho (spec 2026-11-20, seção 2).
 *
 * Puro, para o teste: `IAMentorPanel` passa a resposta e o `ligarPeloGuia` do
 * `ModoDeCuidadoContext`. Sem o campo (API antiga) ou com um valor que não se entende, nada muda.
 * Não depende do consentimento: o alívio na tela vale para todos; quem grava (ou não) é a API.
 */
import type { NivelDoGuia } from "@/context/modoDeCuidado.core";

const NIVEIS: readonly NivelDoGuia[] = ["desconforto", "crise", "risco"];

export function ligarCuidadoSeOGuiaPediu(
  resposta: unknown,
  ligar: (nivel: NivelDoGuia, expiraEmIso: string | null) => void,
): boolean {
  if (!resposta || typeof resposta !== "object") return false;
  const modo = (resposta as { modo_cuidado?: unknown }).modo_cuidado;
  if (!modo || typeof modo !== "object") return false;
  const { nivel, expira_em: expiraEm } = modo as { nivel?: unknown; expira_em?: unknown };
  if (typeof nivel !== "string" || !NIVEIS.includes(nivel as NivelDoGuia)) return false;
  try {
    ligar(nivel as NivelDoGuia, typeof expiraEm === "string" && expiraEm ? expiraEm : null);
  } catch (erro) {
    // O cuidado é um extra: falhar aqui nunca pode levar a resposta do Guia junto.
    console.warn("[IAMentorPanel] modo de cuidado nao ligou:", erro);
    return false;
  }
  return true;
}
