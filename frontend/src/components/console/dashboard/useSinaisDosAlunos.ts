import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { selectView } from "@/lib/supabaseViews";
import { createRequestGuard } from "@/lib/requestGuard";
import type { SinaisDoBanco } from "./risco";
import { faltaColunaDoMotivo, juntarSinais, type LinhaEngajamento } from "./sinais";

const COLUNAS =
  "aluno_id, classe_id, sem_dado, ultima_atividade_em, inativo_desde, evadido_desde, estagnado_desde, estagnado_topico_id, risco_abandono_faixa, risco_abandono_origem";

/**
 * A faixa de risco de abandono (modelo de evasão do core-trailup) e os três sinais de cada aluno (inatividade, evasão e estagnação) já calculados no banco, em
 * vw_metricas_engajamento_aluno_classe (F5, 20261031_05), e o nome dos tópicos para dizer onde o
 * aluno parou. Leitura direta do Supabase — sem modelo de linguagem, não passa pela API (regra de
 * fronteira do CLAUDE.md).
 */
export function useSinaisDosAlunos(classIds: number[]) {
  const [sinais, setSinais] = useState<Map<string, SinaisDoBanco>>(new Map());
  const [erro, setErro] = useState<string | null>(null);
  const guarda = useRef(createRequestGuard());

  useEffect(() => {
    const request = guarda.current.next();
    if (classIds.length === 0) {
      setSinais(new Map());
      setErro(null);
      return;
    }
    const ler = (colunas: string) => selectView("vw_metricas_engajamento_aluno_classe", colunas).in("classe_id", classIds);
    // O motivo do modelo (20261110_01) pode ainda não estar no banco: sem ele, lê o resto e a
    // sugestão do risco alto fica genérica, em vez de o painel inteiro perder os sinais.
    const engajamentoComMotivo = async () => {
      const comMotivo = await ler(`${COLUNAS}, risco_abandono_motivo`);
      return faltaColunaDoMotivo(comMotivo.error) ? ler(COLUNAS) : comMotivo;
    };
    void Promise.all([
      engajamentoComMotivo(),
      supabase.from("topicos").select("id, nome").in("classe_id", classIds),
    ]).then(([engajamento, topicos]) => {
      if (!request.isCurrent()) return;
      const falha = engajamento.error?.message ?? topicos.error?.message ?? null;
      setErro(falha);
      const nomes = new Map((topicos.data ?? []).map((t) => [Number(t.id), String(t.nome)]));
      setSinais(juntarSinais((engajamento.data ?? []) as LinhaEngajamento[], nomes));
    });
  }, [classIds]);

  return { sinais, erro };
}
