import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRequestGuard } from "@/lib/requestGuard";
import { eMigracaoPendente, ordenarPorPerfil, type FalaDoBoss } from "./bossFalas";

export type EstadoDasFalas = { tipo: "carregando" } | { tipo: "pronto" } | { tipo: "indisponivel" } | { tipo: "erro"; detalhe: string };

const COLUNAS = "id, conteudo_id, perfil, nome, falas, ativa, desativada_em, gerado_em";

/**
 * Falas do boss de um conteúdo, uma linha por perfil. Lê e liga/desliga direto no Supabase (RLS
 * `boss_falas_minhas_classes_sel`/`boss_falas_professor_upd`, GRANT por coluna só em `ativa`): nada
 * passa pela API, então com ela fora do ar o professor ainda lê e desliga. Quem esconde a fala do
 * aluno é a policy de leitura dele, não o app.
 */
export function useFalasDoBoss(conteudoId: number | null) {
  const [linhas, setLinhas] = useState<FalaDoBoss[]>([]);
  const [estado, setEstado] = useState<EstadoDasFalas>({ tipo: "carregando" });
  const guarda = useRef(createRequestGuard());

  const carregar = useCallback(async () => {
    const request = guarda.current.next();
    if (conteudoId === null) {
      setLinhas([]);
      setEstado({ tipo: "pronto" });
      return;
    }
    const { data, error } = await supabase.from("boss_falas").select(COLUNAS).eq("conteudo_id", conteudoId);
    if (!request.isCurrent()) return;
    if (error) {
      setEstado(eMigracaoPendente(error) ? { tipo: "indisponivel" } : { tipo: "erro", detalhe: error.message });
      return;
    }
    setLinhas(ordenarPorPerfil((data ?? []) as unknown as FalaDoBoss[]));
    setEstado({ tipo: "pronto" });
  }, [conteudoId]);

  useEffect(() => {
    setEstado({ tipo: "carregando" });
    void carregar();
  }, [carregar]);

  const definirAtiva = useCallback(
    async (id: number, ativa: boolean) => {
      const anterior = linhas.find((l) => l.id === id);
      if (!anterior || anterior.ativa === ativa) return;
      setLinhas((atual) => atual.map((l) => (l.id === id ? { ...l, ativa, desativada_em: ativa ? null : new Date().toISOString() } : l)));
      const { data, error } = await supabase.from("boss_falas").update({ ativa }).eq("id", id).select("id");
      // Sem erro e sem linha = a policy barrou em silêncio.
      if (error || !data || data.length === 0) {
        setLinhas((atual) => atual.map((l) => (l.id === id ? anterior : l)));
        throw new Error(error?.message ?? "Sem permissão para alterar esta fala.");
      }
    },
    [linhas],
  );

  return { linhas, estado, definirAtiva };
}
