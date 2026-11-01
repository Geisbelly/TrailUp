import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  TIPOS_DO_BONUS,
  type AtividadeDoResumo,
  type BonusPago,
  type EscolhaDoCronometro,
  type LinhaDeTentativa,
  type RegraDoCronometro,
  regraDoCronometro,
  resumirTentativas,
  type ResumoDaAtividade,
} from "./tentativas";

type Erro = { message: string } | null;
type Resposta<T> = PromiseLike<{ data: T | null; error: Erro }>;
type Consulta = {
  select: (colunas: string) => Consulta;
  eq: (coluna: string, valor: unknown) => Consulta;
  in: (coluna: string, valores: unknown[]) => Consulta;
  order: (coluna: string, opcoes?: { ascending?: boolean }) => Consulta;
  maybeSingle: () => Resposta<unknown>;
} & Resposta<unknown[]>;

// `aluno_cronometro` e `atividade_tentativas` (20261101_13) ainda não estão nos tipos gerados.
const de = (tabela: string) => supabase.from(tabela as never) as unknown as Consulta;

async function ler<T>(consulta: Resposta<unknown>): Promise<T> {
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return data as T;
}

export type TentativasDoAluno = {
  escolha: EscolhaDoCronometro | null;
  regra: RegraDoCronometro;
  atividades: ResumoDaAtividade[];
};

const VAZIO: TentativasDoAluno = { escolha: null, regra: { duracaoSeg: null, toleranciaSeg: null, faixas: [] }, atividades: [] };

/**
 * Direto do Supabase: o professor lê as tentativas da turma dele e o cronômetro dos alunos dele
 * pelas policies da 20261101_13, o bônus em `eventos_aluno` pela posse do aluno, e a regra em
 * `app_config` (pública desde a 20261101_15) e `eventos_pontuacao`.
 */
export function useTentativasDoAluno(alunoId: string, classeId: number) {
  const [dados, setDados] = useState<TentativasDoAluno>(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    (async () => {
      const [escolha, tentativas, config, pontuacao] = await Promise.all([
        ler<EscolhaDoCronometro | null>(
          de("aluno_cronometro").select("ligado, origem, motivo, atualizado_em").eq("aluno_id", alunoId).maybeSingle(),
        ),
        ler<LinhaDeTentativa[]>(
          de("atividade_tentativas")
            .select(
              "atividade_id, numero, iniciada_em, respondida_em, cronometrada, limite_seg, no_tempo," +
                " acertos_percentual, pontuacao_obtida, pontuacao_maxima",
            )
            .eq("aluno_id", alunoId)
            .eq("classe_id", classeId)
            .order("numero"),
        ),
        ler<{ chave: string; valor: string | null }[]>(
          de("app_config").select("chave, valor").in("chave", ["cronometro_atividade_padrao_seg", "cronometro_tolerancia_seg"]),
        ),
        ler<{ tipo: string; pontos: number | string | null }[]>(
          de("eventos_pontuacao").select("tipo, pontos").in("tipo", [...TIPOS_DO_BONUS]),
        ),
      ]);
      const ids = [...new Set((tentativas ?? []).map((t) => t.atividade_id))];
      const [atividades, bonus] = ids.length
        ? await Promise.all([
            ler<AtividadeDoResumo[]>(de("atividades").select("id, titulo, tentativas_max").in("id", ids)),
            ler<BonusPago[]>(
              de("eventos_aluno")
                .select("referencia, valor")
                .eq("aluno_id", alunoId)
                .in("tipo", [...TIPOS_DO_BONUS])
                .in(
                  "referencia",
                  ids.map((id) => `atividade:${id}`),
                ),
            ),
          ])
        : [[], []];
      return {
        escolha,
        regra: regraDoCronometro(config ?? [], pontuacao ?? []),
        atividades: resumirTentativas(tentativas ?? [], atividades ?? [], bonus ?? []),
      };
    })()
      .then((r) => {
        if (vivo) setDados(r);
      })
      .catch((e: unknown) => {
        if (vivo) setErro(e instanceof Error ? e.message : "Não foi possível carregar as tentativas.");
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [alunoId, classeId]);

  return { dados, carregando, erro };
}
