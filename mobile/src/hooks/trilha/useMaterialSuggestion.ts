import { useEffect, useRef, useState } from "react";

import { usePersonalizacaoProvider } from "@/services/personalizacao/PersonalizacaoProviderContext";
import type { SugestaoMaterialResponse } from "@/services/personalizacao/types";
import {
  avancarSugestaoCongelada,
  type EstadoSugestaoCongelada,
  type SugestaoMaterial,
} from "@/utils/materialSuggestion";

/**
 * Chama a API da ordem aconselhada ao abrir o tópico (uma vez por aluno ×
 * tópico). É ela que CRIA a sugestão e aplica revisões pendentes.
 *
 * O resultado NÃO reordena a tela aberta: vai para `aoReceber`, que guarda no
 * mapa/cache do `TrilhaContext` para a PRÓXIMA abertura. A ordem desta visita
 * já foi decidida antes da retomada (`useSugestaoCongelada`). Se a API falhar,
 * nada muda.
 */
export function useMaterialSuggestion(params: {
  alunoId: string | null | undefined;
  topicoId: number | null | undefined;
  aoReceber?: (topicoId: number, sugestao: SugestaoMaterialResponse) => void;
}) {
  const provider = usePersonalizacaoProvider();
  const [sugestao, setSugestao] = useState<SugestaoMaterialResponse | null>(null);
  const aoReceberRef = useRef(params.aoReceber);
  aoReceberRef.current = params.aoReceber;

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
        if (!ativo) return;
        setSugestao(resposta);
        if (resposta) aoReceberRef.current?.(topicoId, resposta);
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

/**
 * A sugestão que a tela do tópico usa: acompanha a disponível até os blocos
 * ficarem prontos e congela nesse render (ver `avancarSugestaoCongelada`).
 *
 * Calculada durante o render, não num efeito: o render em que `pronta` vira
 * `true` é o mesmo em que a retomada lê os blocos, e um efeito só aplicaria o
 * congelamento um render depois.
 */
export function useSugestaoCongelada(entrada: {
  topicoId: number | null;
  disponivel: SugestaoMaterial | null | undefined;
  pronta: boolean;
}): SugestaoMaterial | null {
  const estadoRef = useRef<EstadoSugestaoCongelada | null>(null);
  estadoRef.current = avancarSugestaoCongelada(estadoRef.current, entrada);
  return estadoRef.current.sugestao;
}
