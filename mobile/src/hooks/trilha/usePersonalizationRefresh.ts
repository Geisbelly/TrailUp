import { useEffect, useRef } from "react";

import { PersonalizedTopicPayload } from "@/interfaces/personalizacao/IPersonalizedTopic";
import { TelemetryAnalysisResponse } from "@/interfaces/telemetria/TelemetryContracts";

export function usePersonalizationRefresh(args: {
  topicoId: number | null;
  topico: any;
  personalizedTopic: PersonalizedTopicPayload | null;
  lastAnalysis: TelemetryAnalysisResponse | null;
  ensureTopicoPersonalizado: (
    topicoId: number,
    opts?: { forceRefresh?: boolean; triggerCycleId?: string | null }
  ) => Promise<PersonalizedTopicPayload | null>;
  setPersonalizacaoCarregando: (v: boolean) => void;
}) {
  const {
    topicoId,
    topico,
    personalizedTopic,
    lastAnalysis,
    ensureTopicoPersonalizado,
    setPersonalizacaoCarregando,
  } = args;

  const latestAnalysisCycleIdRef = useRef<string | null>(null);
  const analysisRefreshBaselineRef = useRef<string | null>(null);
  const analysisRefreshAppliedRef = useRef<Set<string>>(new Set());

  // `personalizedTopic`/`topico` mudam de referencia como CONSEQUENCIA do
  // proprio ensureTopicoPersonalizado em andamento (setPersonalizedTopics no
  // TrilhaContext roda antes da promise resolver). Isso reexecuta o efeito
  // abaixo e o React roda o cleanup antigo antes do .finally() original
  // disparar — um `ativo` local ficaria false e o spinner travaria ligado
  // para sempre. So o desmonte real do componente deve invalidar a chamada.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    latestAnalysisCycleIdRef.current = lastAnalysis?.ciclo_id ?? null;
  }, [lastAnalysis?.ciclo_id]);

  useEffect(() => {
    analysisRefreshBaselineRef.current = latestAnalysisCycleIdRef.current;
    analysisRefreshAppliedRef.current.clear();
  }, [topicoId]);

  useEffect(() => {
    if (!topicoId || !topico || !personalizedTopic || !lastAnalysis?.ciclo_id) return;

    const refreshPolicy = personalizedTopic.planMeta.refreshPolicy;
    if (refreshPolicy.mode !== "analysis") return;
    if (analysisRefreshBaselineRef.current === lastAnalysis.ciclo_id) return;

    const normalizedActions = new Set(
      (lastAnalysis.acoes_aplicadas ?? []).map((action) =>
        String(action ?? "").trim().toLowerCase()
      )
    );
    const shouldRefresh = refreshPolicy.triggerActions.some((action) =>
      normalizedActions.has(String(action).trim().toLowerCase())
    );

    if (!shouldRefresh) return;

    const refreshKey = `${topicoId}:${lastAnalysis.ciclo_id}`;
    if (analysisRefreshAppliedRef.current.has(refreshKey)) return;
    analysisRefreshAppliedRef.current.add(refreshKey);

    setPersonalizacaoCarregando(true);

    ensureTopicoPersonalizado(topicoId, {
      forceRefresh: true,
      triggerCycleId: lastAnalysis.ciclo_id,
    })
      .catch((err) => {
        console.warn("[TrilhaConteudo] Falha ao atualizar personalizacao apos analise:", err);
      })
      .finally(() => {
        if (isMountedRef.current) setPersonalizacaoCarregando(false);
      });
  }, [ensureTopicoPersonalizado, lastAnalysis, personalizedTopic, setPersonalizacaoCarregando, topico, topicoId]);
}
