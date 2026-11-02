import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRequestGuard } from "@/lib/requestGuard";
import type { JanelaTemporal } from "./DashboardHeader";
import { lerKpisOperacionais, parametrosDaJanela, type KpisOperacionais } from "./kpisOperacionais";

export type EstadoDosKpisOperacionais = {
  kpis: KpisOperacionais | null;
  carregando: boolean;
  erro: string | null;
};

/**
 * KPIs operacionais da fila de personalização (#14) de UMA turma, na janela do cabeçalho: a RPC
 * personalizacao_kpis_operacionais, direto no Supabase (agregar não tem modelo de linguagem, não passa
 * pela API). A RPC confere que a turma é do professor; turma alheia volta erro, não painel zerado.
 */
export function useKpisOperacionais(classeId: number | null, janela: JanelaTemporal): EstadoDosKpisOperacionais {
  const [estado, setEstado] = useState<EstadoDosKpisOperacionais>({ kpis: null, carregando: false, erro: null });
  const guarda = useRef(createRequestGuard());

  useEffect(() => {
    const request = guarda.current.next();
    if (classeId === null) {
      setEstado({ kpis: null, carregando: false, erro: null });
      return;
    }
    setEstado((e) => ({ ...e, carregando: true, erro: null }));
    void supabase
      .rpc("personalizacao_kpis_operacionais" as never, {
        p_classe_id: classeId,
        ...parametrosDaJanela(janela, new Date()),
      } as never)
      .then(({ data, error }) => {
        if (!request.isCurrent()) return;
        const kpis = error ? null : lerKpisOperacionais(data);
        setEstado({
          kpis,
          carregando: false,
          erro: error?.message ?? (kpis === null ? "A resposta não trouxe os KPIs da fila." : null),
        });
      });
  }, [classeId, janela]);

  return estado;
}
