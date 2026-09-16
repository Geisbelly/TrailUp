import test from "node:test";
import assert from "node:assert/strict";

import { buildPersonalizedFlow } from "./usePersonalizedFlow";

test("buildPersonalizedFlow inclui atividades personalizadas no percurso", () => {
  const result = buildPersonalizedFlow({
    topicoId: 125,
    personalizedTopic: {
      topicoId: 125,
      classeId: 32,
      heroFormat: "quiz",
      steps: [
        {
          item_key: "personalized:125:activity:1",
          ordem: 0,
          kind: "activity",
          title: "Desafio personalizado",
          required: true,
          blocks: [],
          activity: {
            id: -1,
            titulo: "Desafio personalizado",
            descricao: "Resolva o desafio.",
            tipo: "quiz",
            status: null,
            pontuacao_maxima: 20,
            data_entrega: null,
            topico_id: 125,
            questoes: [
              {
                id: -1,
                enunciado: "Qual é a resposta?",
                tipo: "quiz",
                alternativas: ["A", "B"],
                resposta_correta: "A",
              },
            ],
          },
        },
      ],
      primaryBlocks: [],
      primaryActivities: [],
      studyCards: [],
      fallbackBlocks: [],
      fallbackActivities: [],
      materialSummaries: [],
      planMeta: {
        recordId: 1,
        cycleId: "cycle-1",
        heroFormat: "quiz",
        formatosGerados: ["quiz"],
        source: "remote",
        uiConfig: {},
        refreshPolicy: { mode: "once", triggerActions: [] },
      },
      nodeHint: {
        topicoId: 125,
        hasPersonalizedContent: true,
        heroFormat: "quiz",
        recommended: true,
        isFocus: false,
        formatos: ["quiz"],
      },
    },
  });

  assert.equal(result.atividades.length, 1);
  assert.equal(result.atividades[0].isPersonalizedLocal, true);
  assert.equal(result.blocks[0].kind, "atividade");
  assert.equal(result.atividades[0].questoes.length, 1);
});
