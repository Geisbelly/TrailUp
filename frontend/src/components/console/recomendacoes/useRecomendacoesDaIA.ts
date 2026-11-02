import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRequestGuard } from "@/lib/requestGuard";
import { eMigracaoPendente, JANELA_DE_ACEITACAO_DIAS, type Insight, type MotivoDescarte } from "../dashboard/insights";
import { EVENTO_RECOMENDACOES_MUDOU } from "./eventoRecomendacoes";
import { contarPendentesDeMissao } from "./missoesIaApi";

export type EstadoDasRecomendacoes =
  | { tipo: "carregando" }
  | { tipo: "pronto" }
  | { tipo: "indisponivel" } // migration 20260929_01 ainda não aplicada
  | { tipo: "erro"; detalhe: string };

const COLUNAS =
  "id, classe_id, aluno_id, escopo, natureza, texto, base, contexto, status, motivo_descarte, geracao_id, created_at, resolved_at";
const LIMITE = 200;

// `intervencoes` está nos tipos gerados: usar a tabela tipada direto evita a união de 208 builders (TS2589).
const tabela = () => supabase.from("intervencoes");

/**
 * Recomendações da IA: lê e decide direto no Supabase (RLS `intervencoes_professor_*`). Nada passa
 * pela API, então a aba continua funcionando com a API fora do ar — o que ela mostra é o que a IA
 * já gravou. Gerar sínteses novas continua sendo o botão da aba Insights.
 */
export function useRecomendacoesDaIA(classIds: number[]) {
  const [linhas, setLinhas] = useState<Insight[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [estado, setEstado] = useState<EstadoDasRecomendacoes>({ tipo: "carregando" });
  const guarda = useRef(createRequestGuard());

  const carregar = useCallback(async () => {
    const request = guarda.current.next();
    if (classIds.length === 0) {
      setLinhas([]);
      setEstado({ tipo: "pronto" });
      return;
    }
    const desde = new Date(Date.now() - JANELA_DE_ACEITACAO_DIAS * 86_400_000).toISOString();
    const [pendentes, resolvidas] = await Promise.all([
      tabela().select(COLUNAS).in("classe_id", classIds).eq("natureza", "sugestao").eq("status", "pending").order("created_at", { ascending: false }).limit(LIMITE),
      tabela().select(COLUNAS).in("classe_id", classIds).eq("natureza", "sugestao").neq("status", "pending").gte("resolved_at", desde).order("resolved_at", { ascending: false }).limit(LIMITE),
    ]);
    if (!request.isCurrent()) return;
    const erro = pendentes.error ?? resolvidas.error;
    if (erro) {
      setEstado(eMigracaoPendente(erro) ? { tipo: "indisponivel" } : { tipo: "erro", detalhe: erro.message });
      return;
    }
    const todas = [...((pendentes.data ?? []) as unknown as Insight[]), ...((resolvidas.data ?? []) as unknown as Insight[])];
    setLinhas(todas);

    const ids = [...new Set(todas.map((l) => l.aluno_id).filter((id): id is string => Boolean(id)))];
    if (ids.length > 0) {
      const { data } = await supabase.from("alunos").select("id, nome").in("id", ids);
      if (request.isCurrent()) setNomes(Object.fromEntries((data ?? []).map((a) => [a.id, a.nome ?? ""])));
    }
    setEstado({ tipo: "pronto" });
  }, [classIds]);

  useEffect(() => {
    setEstado({ tipo: "carregando" });
    void carregar();
  }, [carregar]);

  const decidir = useCallback(
    async (id: string, status: "applied" | "dismissed", motivo: MotivoDescarte | null) => {
      const anterior = linhas.find((l) => l.id === id);
      if (!anterior) return;
      const mudanca = { status, motivo_descarte: status === "dismissed" ? motivo : null, resolved_at: new Date().toISOString() };
      setLinhas((atual) => atual.map((l) => (l.id === id ? { ...l, ...mudanca } : l)));
      const { data, error } = await tabela().update(mudanca).eq("id", id).select("id");
      // Sem erro e sem linha = a policy barrou em silêncio.
      if (error || !data || (data as unknown[]).length === 0) {
        setLinhas((atual) => atual.map((l) => (l.id === id ? anterior : l)));
        throw new Error(error?.message ?? "Sem permissão para decidir esta recomendação.");
      }
    },
    [linhas],
  );

  return { linhas, nomes, estado, decidir, recarregar: carregar };
}

/**
 * Quantas recomendações esperam decisão, para o selo do menu. A RLS já limita às turmas do
 * professor, então não precisa dos ids delas. Falha (inclusive migration pendente) vira zero: um
 * selo não deve quebrar o menu.
 */
export function useContagemDeRecomendacoes(ativo: boolean) {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    const ler = async () => {
      // As sugestões sobre a turma e as missões que a IA propôs: as duas esperam o professor. Cada
      // contagem que falha (inclusive migration pendente) vira zero, e o selo nunca quebra o menu.
      const [sugestoes, missoes] = await Promise.all([
        tabela().select("id", { count: "exact", head: true }).eq("natureza", "sugestao").eq("status", "pending"),
        contarPendentesDeMissao(),
      ]);
      if (vivo) setTotal((sugestoes.error ? 0 : (sugestoes.count ?? 0)) + missoes);
    };
    void ler();
    const timer = window.setInterval(() => void ler(), 60_000);
    const aoVoltar = () => void ler();
    window.addEventListener("focus", aoVoltar);
    window.addEventListener(EVENTO_RECOMENDACOES_MUDOU, aoVoltar);
    return () => {
      vivo = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", aoVoltar);
      window.removeEventListener(EVENTO_RECOMENDACOES_MUDOU, aoVoltar);
    };
  }, [ativo]);
  return total;
}
