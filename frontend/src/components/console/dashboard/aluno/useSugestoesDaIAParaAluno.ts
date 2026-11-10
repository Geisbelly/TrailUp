import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRequestGuard } from "@/lib/requestGuard";
import { avisarQueRecomendacoesMudaram } from "../../recomendacoes/eventoRecomendacoes";
import type { Insight, MotivoDescarte } from "../insights";

const COLUNAS =
  "id, classe_id, aluno_id, escopo, natureza, texto, base, contexto, status, motivo_descarte, geracao_id, created_at, resolved_at";
const LIMITE = 3;

// `intervencoes` está nos tipos gerados: a tabela tipada direto evita a união de builders (TS2589).
const tabela = () => supabase.from("intervencoes");

/**
 * As sugestões que a IA já gravou para ESTE aluno e que esperam o professor (`intervencoes`, escopo
 * aluno, pendentes): as do `agente_intervencao` e as da geração de Insights. Só lê o que existe; não
 * pede geração nova, então não gasta modelo. Lê e decide direto no Supabase (RLS
 * `intervencoes_professor_*`): funciona com a API fora do ar. Falha de leitura vira lista vazia,
 * porque a sugestão pela regra continua na tela.
 */
export function useSugestoesDaIAParaAluno(alunoId: string, classeId: number) {
  const [linhas, setLinhas] = useState<Insight[]>([]);
  const guarda = useRef(createRequestGuard());

  useEffect(() => {
    const request = guarda.current.next();
    setLinhas([]);
    void tabela()
      .select(COLUNAS)
      .eq("aluno_id", alunoId)
      .eq("classe_id", classeId)
      .eq("escopo", "aluno")
      .eq("natureza", "sugestao")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(LIMITE)
      .then(({ data, error }) => {
        if (!request.isCurrent()) return;
        setLinhas(error ? [] : ((data ?? []) as unknown as Insight[]).filter((l) => Boolean(l.texto?.trim())));
      });
  }, [alunoId, classeId]);

  const decidir = useCallback(
    async (id: string, status: "applied" | "dismissed", motivo: MotivoDescarte | null) => {
      const mudanca = { status, motivo_descarte: status === "dismissed" ? motivo : null, resolved_at: new Date().toISOString() };
      const { data, error } = await tabela().update(mudanca).eq("id", id).select("id");
      // Sem erro e sem linha = a policy barrou em silêncio.
      if (error || !data || (data as unknown[]).length === 0) {
        throw new Error(error?.message ?? "Sem permissão para decidir esta sugestão.");
      }
      // Decidida sai daqui (a lista é só de pendentes) e o selo do menu se atualiza.
      setLinhas((atual) => atual.filter((l) => l.id !== id));
      avisarQueRecomendacoesMudaram();
    },
    [],
  );

  return { linhas, decidir };
}
