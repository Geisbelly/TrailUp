import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRequestGuard } from "@/lib/requestGuard";
import type { JanelaTemporal } from "./DashboardHeader";
import { lerPorTopico, periodoDaJanela, type KpiDoTopico } from "./porTopico";

export type KpisPorTopico = {
  topicos: (KpiDoTopico & { nome: string })[] | null;
  carregando: boolean;
  erro: string | null;
};

/**
 * Tempo ativo e abandono por etapa (tópico) de UMA turma, na janela do cabeçalho: a RPC
 * metricas_engajamento_turma, direto no Supabase (sem modelo de linguagem, não passa pela API).
 * A RPC confere que a turma é do professor; turma alheia volta erro, não lista vazia.
 */
export function useKpisPorTopico(classeId: number | null, janela: JanelaTemporal): KpisPorTopico {
  const [estado, setEstado] = useState<KpisPorTopico>({ topicos: null, carregando: false, erro: null });
  const guarda = useRef(createRequestGuard());

  useEffect(() => {
    const request = guarda.current.next();
    if (classeId === null) {
      setEstado({ topicos: null, carregando: false, erro: null });
      return;
    }
    const { inicio, fim } = periodoDaJanela(janela, new Date());
    setEstado((e) => ({ ...e, carregando: true, erro: null }));
    void Promise.all([
      supabase.rpc("metricas_engajamento_turma" as never, {
        p_classe_id: classeId,
        p_inicio: inicio,
        p_fim: fim,
        p_timezone: "America/Sao_Paulo",
      } as never),
      supabase.from("topicos").select("id, nome").eq("classe_id", classeId),
    ]).then(([rpc, topicos]) => {
      if (!request.isCurrent()) return;
      const erro = rpc.error?.message ?? topicos.error?.message ?? null;
      const nomes = new Map((topicos.data ?? []).map((t) => [Number(t.id), String(t.nome)]));
      const lista = erro ? null : lerPorTopico(rpc.data);
      setEstado({
        topicos: lista?.map((t) => ({ ...t, nome: nomes.get(Number(t.topico_id)) ?? `Tópico ${t.topico_id}` })) ?? null,
        carregando: false,
        erro: erro ?? (lista === null ? "A resposta não trouxe a quebra por tópico." : null),
      });
    });
  }, [classeId, janela]);

  return estado;
}
