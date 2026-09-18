import assert from "node:assert/strict";
import test from "node:test";

/* eslint-disable @typescript-eslint/no-require-imports */
const supabaseModulePath = require.resolve("@/database/supabase");
(require.cache as Record<string, unknown>)[supabaseModulePath] = {
  exports: { supabase: {} },
};

const { buildClasseResumoFallback } = require("./classeMetrics") as typeof import("./classeMetrics");

test("resumo remoto continua sendo a autoridade dos agregados da classe", () => {
  const classe = {
    aluno_id: "aluno-1",
    classe_id: 7,
    topicos: [
      {
        status: "concluido",
        percentual_concluido: 100,
        conteudos: [],
        atividades: [],
      },
    ],
  } as any;

  const resumo = buildClasseResumoFallback(classe, {
    aluno_id: "aluno-1",
    classe_id: 7,
    materia_nome: "História",
    materia_descricao: null,
    professor_nome: null,
    professor_descricao: null,
    notaMedia: 8,
    tempoMedioPorAtividade: 4,
    acertosPercentual: 88,
    porcentagemConcluida: 35,
    ultimaAtividade: 12,
    tempoGastoMin: 12,
    isComplete: false,
    atividadesConcluidas: [99],
    recomendacaoTrilha: null,
    modoOperacao: null,
    insights: null,
    perfisDetectados: null,
  });

  assert.ok(resumo);
  assert.equal(resumo.porcentagemConcluida, 35);
  assert.equal(resumo.tempoMedioPorAtividade, 4);
  assert.equal(resumo.acertosPercentual, 88);
  assert.equal(resumo.tempoGastoMin, 12);
  assert.equal(resumo.isComplete, false);
  assert.deepEqual(resumo.atividadesConcluidas, [99]);
});
