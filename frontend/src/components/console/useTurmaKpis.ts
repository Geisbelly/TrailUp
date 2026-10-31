import { useEffect, useRef, useState } from "react";
import { selectView } from "@/lib/supabaseViews";
import { createRequestGuard } from "@/lib/requestGuard";

// Colunas da F5 (migration 20261031_05): a taxa de abandono e o retorno por intervalo de dias
// saíram; null = sem dado (nunca 0 fabricado).
export type TurmaGeralMetricas = {
  classe_id: number;
  total_alunos: number;
  tempo_medio_uso_seg: number | null;
  tempo_ativo_medio_seg: number | null;
  sessoes_medias_por_aluno: number | null;
  retorno_semanal_pct: number | null;
  retorno_semanal_elegiveis: number;
  alunos_inativos: number;
  alunos_estagnados: number;
  alunos_evadidos: number;
  alunos_sem_dado: number;
  taxa_media_conclusao_pct: number | null;
  /** Taxa de abandono: % dos alunos com dado na faixa alta do modelo de evasão do core (20261031_08). */
  taxa_risco_abandono_pct: number | null;
  alunos_risco_alto: number;
  alunos_risco_atencao: number;
  alunos_risco_com_dado: number;
  media_nota_turma: number;
  taxa_media_acertos_pct: number;
  taxa_media_acertos_sem_erro_pct: number;
  eficiencia_media_aprendizagem: number;
  media_tentativas_por_questao: number;
  taxa_revisitas_pct: number;
  taxa_interrupcoes_pct: number;
  frequencia_chat_media_sessao: number;
  taxa_media_uso_chat_pct: number;
  tempo_medio_chat_seg: number;
  uso_chat_apos_erro_pct: number;
};

export type TurmaPerfilMetricas = {
  classe_id: number;
  segmento: string;
  perfil_nome: string;
  total_alunos_segmento: number;
  alunos_inativos: number;
  alunos_estagnados: number;
  tempo_ativo_medio_seg: number | null;
  taxa_risco_abandono_pct: number | null;
  alunos_risco_alto: number;
  alunos_risco_com_dado: number;
  media_nota: number;
  taxa_acertos_pct: number;
  taxa_uso_chat_pct: number;
  uso_chat_apos_erro_pct: number;
};

export type TurmaDistribuicao = {
  classe_id: number;
  metrica: string;
  faixa: string;
  total_alunos: number;
  percentual: number;
};

export type TurmaKpis = {
  turmaMetricas: TurmaGeralMetricas[];
  perfilMetricas: TurmaPerfilMetricas[];
  distribuicaoMetricas: TurmaDistribuicao[];
  isLoading: boolean;
  /** Leitura falhou (RLS, rede): o card mostra erro, não vazio nem zero. */
  erro: string | null;
};

// Le direto das views agregadas do Supabase (versionadas na F5). Os numeros por
// topico e com janela vem da RPC metricas_engajamento_turma (useKpisPorTopico).
export function useTurmaKpis(classIds: number[]): TurmaKpis {
  const [turmaMetricas, setTurmaMetricas] = useState<TurmaGeralMetricas[]>([]);
  const [perfilMetricas, setPerfilMetricas] = useState<TurmaPerfilMetricas[]>([]);
  const [distribuicaoMetricas, setDistribuicaoMetricas] = useState<TurmaDistribuicao[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const requestGuard = useRef(createRequestGuard());

  useEffect(() => {
    const request = requestGuard.current.next();

    if (classIds.length === 0) {
      setTurmaMetricas([]);
      setPerfilMetricas([]);
      setDistribuicaoMetricas([]);
      setErro(null);
      return;
    }

    setIsLoading(true);
    void Promise.all([
      selectView("vw_metricas_turma_geral_classe").in("classe_id", classIds),
      selectView("vw_metricas_turma_perfil_classe").in("classe_id", classIds),
      selectView("vw_metricas_distribuicao_turma_classe").in("classe_id", classIds),
    ])
      .then(([turma, perfil, distribuicao]) => {
        if (!request.isCurrent()) return;
        const { data: turmaData } = turma;
        const { data: perfilData } = perfil;
        const { data: distribuicaoData } = distribuicao;
        setErro(turma.error?.message ?? perfil.error?.message ?? distribuicao.error?.message ?? null);
        setTurmaMetricas((turmaData ?? []) as TurmaGeralMetricas[]);
        setPerfilMetricas((perfilData ?? []) as TurmaPerfilMetricas[]);
        setDistribuicaoMetricas((distribuicaoData ?? []) as TurmaDistribuicao[]);
      })
      .finally(() => {
        if (request.isCurrent()) setIsLoading(false);
      });
  }, [classIds]);

  return { turmaMetricas, perfilMetricas, distribuicaoMetricas, isLoading, erro };
}
