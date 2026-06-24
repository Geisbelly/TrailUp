import { PersonalizedTopicPayload } from "@/interfaces/personalizacao/IPersonalizedTopic";
import { buildStableNegativeId, type Conteudo, type Atividade } from "@/utils/trilhaBlocks";

export function normalizePersonalizedStepContent(
  topicoId: number,
  step: PersonalizedTopicPayload["steps"][number],
  index: number
): Conteudo {
  const firstBlockType =
    (step.blocks?.[0]?.tipo as string | undefined) ?? "markdown";
  const personalizedKind = firstBlockType === "cards" ? "cards" : "content";
  const contentId = buildStableNegativeId(
    `topico:${topicoId}:content:${step.item_key}:${index}`
  );

  return {
    id: contentId,
    titulo: step.title || `Conteudo personalizado ${index + 1}`,
    tipo: firstBlockType,
    conteudo: null,
    ordem: 10_000 + index,
    metadata: {
      ...(step.metadata ?? {}),
      itemKey: step.item_key,
      source: "personalizado",
      personalized: true,
    },
    blocks: Array.isArray(step.blocks) ? step.blocks : [],
    midias: [],
    status: null,
    percentual_concluido: 0,
    tempo_gasto_min: 0,
    ultima_visualizacao: null,
    isPersonalizedLocal: true,
    personalizationKey: step.item_key,
    personalizationTitle: step.title || `Conteudo personalizado ${index + 1}`,
    personalizationKind: personalizedKind as "content" | "cards",
  };
}

export function normalizePersonalizedStepActivity(
  topicoId: number,
  step: PersonalizedTopicPayload["steps"][number],
  index: number
): Atividade | null {
  const activity =
    step.activity && typeof step.activity === "object" ? step.activity : null;
  if (!activity) return null;

  const activityId = buildStableNegativeId(
    `topico:${topicoId}:activity:${step.item_key}:${index}`
  );

  const questoes = Array.isArray((activity as any).questoes)
    ? (activity as any).questoes.map((questao: any, questionIndex: number) => {
        const questionId = buildStableNegativeId(
          `topico:${topicoId}:activity:${step.item_key}:question:${questionIndex}`
        );

        return {
          ...questao,
          id:
            Number(questao?.id) > 0
              ? questionId
              : Number(questao?.id ?? questionId),
          isPersonalizedLocal: true,
        };
      })
    : [];

  return {
    ...activity,
    id:
      Number(activity?.id) > 0 ? activityId : Number(activity?.id ?? activityId),
    topico_id: topicoId,
    questoes,
    isPersonalizedLocal: true,
    personalizationKey: step.item_key,
    personalizationTitle:
      step.title || activity?.titulo || "Atividade personalizada",
    personalizationKind: "activity" as const,
  };
}
