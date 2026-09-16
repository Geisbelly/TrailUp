import { useMemo } from "react";

import { PersonalizedTopicPayload } from "@/interfaces/personalizacao/IPersonalizedTopic";
import {
  type Atividade,
  type Block,
  type Conteudo,
} from "@/utils/trilhaBlocks";
import {
  normalizePersonalizedStepActivity,
  normalizePersonalizedStepContent,
} from "@/utils/personalizedFlow";

export type PersonalizedFlowResult = {
  conteudos: Conteudo[];
  atividades: Atividade[];
  blocks: Block[];
};

export function buildPersonalizedFlow(args: {
  personalizedTopic: PersonalizedTopicPayload | null;
  topicoId: number | null;
}): PersonalizedFlowResult {
  const { personalizedTopic, topicoId } = args;

  const empty: PersonalizedFlowResult = { conteudos: [], atividades: [], blocks: [] };
  if (!personalizedTopic || !topicoId || !Array.isArray(personalizedTopic.steps)) {
    return empty;
  }

  const orderedSteps = [...personalizedTopic.steps].sort(
    (left, right) => Number(left.ordem ?? 0) - Number(right.ordem ?? 0)
  );
  const conteudosPersonalizados: Conteudo[] = [];
  const atividadesPersonalizadas: Atividade[] = [];
  const blocksPersonalizados: Block[] = [];

  orderedSteps.forEach((step, index) => {
    const stepKind = String((step as any)?.kind ?? "content");
    if (stepKind === "content" || stepKind === "cards") {
      const conteudo = normalizePersonalizedStepContent(topicoId, step, index);
      conteudosPersonalizados.push(conteudo);
      blocksPersonalizados.push({
        kind: "conteudo",
        id: `pc-${conteudo.id}`,
        conteudo,
      });
      return;
    }

    if (stepKind === "activity") {
      const atividade = normalizePersonalizedStepActivity(topicoId, step, index);
      if (!atividade) return;
      atividadesPersonalizadas.push(atividade);
      blocksPersonalizados.push({
        kind: "atividade",
        id: `pa-${atividade.id}`,
        atividade,
      });
    }
  });

  return {
    conteudos: conteudosPersonalizados,
    atividades: atividadesPersonalizadas,
    blocks: blocksPersonalizados,
  };
}

export function usePersonalizedFlow(args: {
  personalizedTopic: PersonalizedTopicPayload | null;
  topicoId: number | null;
}): PersonalizedFlowResult {
  const { personalizedTopic, topicoId } = args;
  return useMemo(
    () => buildPersonalizedFlow({ personalizedTopic, topicoId }),
    [personalizedTopic, topicoId],
  );
}
