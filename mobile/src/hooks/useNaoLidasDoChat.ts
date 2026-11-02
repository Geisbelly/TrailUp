import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";

import type { NaoLidas } from "@/services/social/chatNaoLidasModel";
import { criarLojaDeNaoLidas } from "@/services/social/naoLidasStore";
import { carregarNaoLidas, marcarConversaLida } from "@/services/social/socialService";

/** A contagem do app inteiro: barra de baixo, barra lateral do desktop e aba Social. */
export const naoLidasDoChat = criarLojaDeNaoLidas(carregarNaoLidas, marcarConversaLida);

export function useNaoLidasDoChat(): NaoLidas {
  return useSyncExternalStore(naoLidasDoChat.assinar, naoLidasDoChat.atual, naoLidasDoChat.atual);
}

const INTERVALO_MS = 30_000;

/**
 * Mantém a contagem em dia enquanto o app está aberto: lê ao montar, ao voltar do segundo plano e
 * a cada 30 s com o app em primeiro plano. Montado uma vez só, no layout das abas. Com o app
 * fechado, quem avisa é o push do banco (`20261102_06`).
 *
 * `alunoId` vazio quer dizer sem aluno ou com o Social ainda bloqueado: não há o que contar. Trocar
 * de aluno recomeça do zero, para o número da conta anterior não sobrar na barra.
 */
export function useContagemDeNaoLidas(alunoId: string | null | undefined): void {
  useEffect(() => {
    if (!alunoId) {
      naoLidasDoChat.limpar();
      return;
    }
    const ler = () => void naoLidasDoChat.atualizar();
    ler();
    let id: ReturnType<typeof setInterval> | null = AppState.currentState === "active" ? setInterval(ler, INTERVALO_MS) : null;
    const assinatura = AppState.addEventListener("change", (estado) => {
      if (estado === "active") {
        ler();
        if (!id) id = setInterval(ler, INTERVALO_MS);
      } else if (id) {
        clearInterval(id);
        id = null;
      }
    });
    return () => {
      assinatura.remove();
      if (id) clearInterval(id);
      naoLidasDoChat.limpar();
    };
  }, [alunoId]);
}
