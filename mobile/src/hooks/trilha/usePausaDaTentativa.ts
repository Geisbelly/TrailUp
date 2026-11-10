/**
 * Sair da atividade pausa o cronômetro dela; voltar continua de onde parou (`20261110_05`).
 *
 * "Sair" é qualquer uma destas: ir para outro bloco do tópico, sair da tela, mandar o app para
 * segundo plano. A pausa é no aparelho na hora (a tela para mesmo sem rede) e no banco, que desconta
 * o tempo fora do "no tempo" da tentativa.
 */

import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { pausarTentativa, retomarTentativa } from "@/services/tentativasAtividade";

export function usePausaDaTentativa(atividadeId: number | null, tentativaId: number | null, telaFocada: boolean) {
  const [appAtivo, setAppAtivo] = useState(AppState.currentState === "active");
  useEffect(() => {
    const assinatura = AppState.addEventListener("change", (estado) => setAppAtivo(estado === "active"));
    return () => assinatura.remove();
  }, []);

  const correndo = atividadeId != null && tentativaId != null && telaFocada && appAtivo;
  useEffect(() => {
    if (!correndo || atividadeId == null) return;
    // Tentativa reaberta pausada (o aluno saiu antes) também volta a correr aqui.
    retomarTentativa(atividadeId);
    return () => {
      pausarTentativa(atividadeId);
    };
  }, [atividadeId, correndo, tentativaId]);
}
