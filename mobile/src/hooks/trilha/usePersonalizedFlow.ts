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

type Result = {
  conteudos: Conteudo[];
  atividades: Atividade[];
  blocks: Block[];
};

export function usePersonalizedFlow(args: {
  personalizedTopic: PersonalizedTopicPayload | null;
  topicoId: number | null;
}): Result {
  const { personalizedTopic, topicoId } = args;

  return useMemo(() => {
    const empty: Result = { conteudos: [], atividades: [], blocks: [] };
    if (
      !personalizedTopic ||
      !topicoId ||
      !Array.isArray(personalizedTopic.steps)
    ) {
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
        const conteudo = normalizePersonalizedStepContent(
          topicoId,
          step,
          index
        );
        conteudosPersonalizados.push(conteudo);
        blocksPersonalizados.push({
          kind: "conteudo",
          id: `pc-${conteudo.id}`,
          conteudo,
        });
        return;
      }

      if (stepKind === "activity") {
        // Regra de produto: questoes devem vir do professor.
        // Mantemos apenas conteudos personalizados neste fluxo.
        void normalizePersonalizedStepActivity(topicoId, step, index);
        return;
      }
    });

    return {
      conteudos: conteudosPersonalizados,
      atividades: atividadesPersonalizadas,
      blocks: blocksPersonalizados,
    };
  }, [personalizedTopic, topicoId]);
}
