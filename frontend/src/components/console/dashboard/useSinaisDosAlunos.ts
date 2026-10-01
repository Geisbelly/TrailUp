import { useEffect, useRef, useState } from "react";
import { selectView } from "@/lib/supabaseViews";
import { createRequestGuard } from "@/lib/requestGuard";
import { JANELA_SESSOES_DIAS } from "./risco";
import { juntarSinais, type LinhaEngajamento, type LinhaSessao, type SinaisDoAluno } from "./sinais";

/**
 * Abandono por aluno (vw_metricas_engajamento_aluno_classe) e última sessão de
 * estudo na turma (vw_metricas_sessoes_aluno_dia, só a janela de
 * JANELA_SESSOES_DIAS). Leitura direta do Supabase — sem modelo de linguagem,
 * não passa pela API (regra de fronteira do CLAUDE.md).
 */
export function useSinaisDosAlunos(classIds: number[]) {
  const [sinais, setSinais] = useState<Map<string, SinaisDoAluno>>(new Map());
  const [temAbandono, setTemAbandono] = useState(false);
  const guarda = useRef(createRequestGuard());

  useEffect(() => {
    const request = guarda.current.next();
    if (classIds.length === 0) {
      setSinais(new Map());
      setTemAbandono(false);
      return;
    }
    const desde = new Date(Date.now() - JANELA_SESSOES_DIAS * 86_400_000).toISOString().slice(0, 10);
    void Promise.all([
      selectView("vw_metricas_engajamento_aluno_classe", "aluno_id, classe_id, taxa_abandono_pct").in("classe_id", classIds),
      selectView("vw_metricas_sessoes_aluno_dia", "aluno_id, classe_id, dia").in("classe_id", classIds).gte("dia", desde),
    ]).then(([{ data: engajamento }, { data: sessoes }]) => {
      if (!request.isCurrent()) return;
      const linhasEngajamento = (engajamento ?? []) as LinhaEngajamento[];
      setSinais(juntarSinais(linhasEngajamento, (sessoes ?? []) as LinhaSessao[]));
      setTemAbandono(linhasEngajamento.some((l) => l.taxa_abandono_pct !== null));
    });
  }, [classIds]);

  return { sinais, temAbandono };
}
