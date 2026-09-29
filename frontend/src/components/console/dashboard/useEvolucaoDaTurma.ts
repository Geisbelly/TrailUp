import { useEffect, useRef, useState } from "react";
import { selectView } from "@/lib/supabaseViews";
import { createRequestGuard } from "@/lib/requestGuard";
import type { EventoDeResposta, JobDePersonalizacao, TopicoComData } from "./evolucao";

export type DadosDeEvolucao = {
  topicos: TopicoComData[];
  atividadeIds: number[];
  eventos: EventoDeResposta[];
  jobs: JobDePersonalizacao[];
};

const VAZIO: DadosDeEvolucao = { topicos: [], atividadeIds: [], eventos: [], jobs: [] };

async function ler<T>(consulta: PromiseLike<{ data: unknown[] | null; error?: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

/**
 * Leitura direta do Supabase para a aba Evolução (sem API: não há modelo de
 * linguagem no meio). eventos_aluno tem a data de cada resposta — o que
 * atividade_aluno.updated_at não tem mais (todas as linhas foram reescritas
 * no mesmo instante).
 */
export function useEvolucaoDaTurma(classIds: number[], alunoIds: string[], desde: string) {
  const [dados, setDados] = useState<DadosDeEvolucao>(VAZIO);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const guarda = useRef(createRequestGuard());

  useEffect(() => {
    const request = guarda.current.next();
    if (classIds.length === 0) {
      setDados(VAZIO);
      return;
    }
    setCarregando(true);
    setErro(null);
    (async () => {
      const [topicos, jobs] = await Promise.all([
        ler<TopicoComData & { classe_id: number }>(selectView("topicos", "id, classe_id, nome, created_at").in("classe_id", classIds)),
        ler<JobDePersonalizacao>(
          selectView("personalizacao_jobs", "kind, topico_id, finished_at")
            .in("classe_id", classIds)
            .eq("status", "completed")
            .gte("finished_at", desde),
        ),
      ]);
      const topicoIds = topicos.map((t) => t.id);
      const atividades = topicoIds.length
        ? await ler<{ id: number }>(selectView("atividades", "id").in("topico_id", topicoIds))
        : [];
      const eventos = alunoIds.length
        ? await ler<EventoDeResposta>(
            selectView("eventos_aluno", "aluno_id, tipo, referencia, criado_em")
              .in("tipo", ["atividade_acertada", "atividade_errada"])
              .in("aluno_id", alunoIds)
              .gte("criado_em", desde),
          )
        : [];
      return { topicos, atividadeIds: atividades.map((a) => a.id), eventos, jobs };
    })()
      .then((r) => {
        if (request.isCurrent()) setDados(r);
      })
      .catch((e: unknown) => {
        if (request.isCurrent()) setErro(e instanceof Error ? e.message : "Não foi possível carregar a evolução.");
      })
      .finally(() => {
        if (request.isCurrent()) setCarregando(false);
      });
  }, [classIds, alunoIds, desde]);

  return { dados, carregando, erro };
}
