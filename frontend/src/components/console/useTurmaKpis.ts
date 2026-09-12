import { useEffect, useRef, useState } from "react";
import { selectView } from "@/lib/supabaseViews";
import { createRequestGuard } from "@/lib/requestGuard";

export type TurmaGeralMetricas = {
  classe_id: number;
  total_alunos: number;
  tempo_medio_uso_seg: number;
  sessoes_medias_por_aluno: number;
  taxa_media_retorno_pct: number;
  taxa_media_abandono_pct: number;
  taxa_media_conclusao_pct: number;
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
  taxa_abandono_pct: number;
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
};

// Fonte de dado isolada e stub-marcada (#56): hoje le direto das views
// agregadas do Supabase. Quando o endpoint de KPIs de engajamento e
// aprendizagem da turma existir (#12), troca so o corpo do fetch aqui —
// DashboardSection consome o retorno do hook e nao precisa mudar.
export function useTurmaKpis(classIds: number[]): TurmaKpis {
  const [turmaMetricas, setTurmaMetricas] = useState<TurmaGeralMetricas[]>([]);
  const [perfilMetricas, setPerfilMetricas] = useState<TurmaPerfilMetricas[]>([]);
  const [distribuicaoMetricas, setDistribuicaoMetricas] = useState<TurmaDistribuicao[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const requestGuard = useRef(createRequestGuard());

  useEffect(() => {
    const request = requestGuard.current.next();

    if (classIds.length === 0) {
      setTurmaMetricas([]);
      setPerfilMetricas([]);
      setDistribuicaoMetricas([]);
      return;
    }

    setIsLoading(true);
    void Promise.all([
      selectView("vw_metricas_turma_geral_classe").in("classe_id", classIds),
      selectView("vw_metricas_turma_perfil_classe").in("classe_id", classIds),
      selectView("vw_metricas_distribuicao_turma_classe").in("classe_id", classIds),
    ])
      .then(([{ data: turmaData }, { data: perfilData }, { data: distribuicaoData }]) => {
        if (!request.isCurrent()) return;
        setTurmaMetricas((turmaData ?? []) as TurmaGeralMetricas[]);
        setPerfilMetricas((perfilData ?? []) as TurmaPerfilMetricas[]);
        setDistribuicaoMetricas((distribuicaoData ?? []) as TurmaDistribuicao[]);
      })
      .finally(() => {
        if (request.isCurrent()) setIsLoading(false);
      });
  }, [classIds]);

  return { turmaMetricas, perfilMetricas, distribuicaoMetricas, isLoading };
}
