import { useEffect, useState } from "react";

import { usePersonalizacaoProvider } from "@/services/personalizacao/PersonalizacaoProviderContext";
import type { SugestaoMaterialResponse } from "@/services/personalizacao/types";

/**
 * Ordem aconselhada de consumo do material do aluno naquele tópico.
 *
 * Uma chamada por (aluno × tópico). Não refaz a busca quando a telemetria roda:
 * a revisão acontece no servidor e vale para o próximo tópico aberto — reordenar
 * o material embaixo de quem está lendo seria pior do que não sugerir nada.
 */
export function useMaterialSuggestion(params: {
  alunoId: string | null | undefined;
  topicoId: number | null | undefined;
}) {
  const provider = usePersonalizacaoProvider();
  const [sugestao, setSugestao] = useState<SugestaoMaterialResponse | null>(null);

  const alunoId = params.alunoId ?? null;
  const topicoId =
    typeof params.topicoId === "number" && Number.isFinite(params.topicoId)
      ? params.topicoId
      : null;

  useEffect(() => {
    if (!alunoId || topicoId == null) {
      setSugestao(null);
      return;
    }

    let ativo = true;
    // Zera antes de buscar: manter a sugestão do tópico anterior aplicaria a
    // ordem de um material que não é este.
    setSugestao(null);

    provider
      .obterSugestaoMaterial({ alunoId, topicoId })
      .then((resposta) => {
        if (ativo) setSugestao(resposta);
      })
      .catch(() => {
        if (ativo) setSugestao(null);
      });

    return () => {
      ativo = false;
    };
  }, [alunoId, provider, topicoId]);

  return sugestao;
}
