import assert from "node:assert/strict";
import test from "node:test";

/* eslint-disable @typescript-eslint/no-require-imports */
const supabaseModulePath = require.resolve("@/database/supabase");
(require.cache as Record<string, unknown>)[supabaseModulePath] = {
  exports: { supabase: {} },
};

const { buildClasseResumoFallback, buildClasseAcademicMetrics } = require("./classeMetrics") as typeof import("./classeMetrics");

test('tempos de conteúdo e atividade inclusivos não duplicam o total canônico', () => {
  const metrics=buildClasseAcademicMetrics({resumo:{tempoGastoMin:1},topicos:[{
    tempo_gasto_min:1,conteudos:[{tempo_gasto_min:1}],atividades:[{id:1,tempo_gasto_min:1}],
  }]} as any);
  assert.equal(metrics.tempoTotalMin,1);
});

test('tempo canônico zero não é trocado por tempo antigo do cache', () => {
  const metrics=buildClasseAcademicMetrics({resumo:{tempoGastoMin:0},topicos:[{
    tempo_gasto_min:20,conteudos:[],atividades:[],
  }]} as any);
  assert.equal(metrics.tempoTotalMin,0);
});

test('métricas não mostram 100% só porque o material do professor foi concluído', () => {
  const metrics = buildClasseAcademicMetrics({ topicos: [{ percentual_concluido: 25,
    conteudos: [{ status: 'concluido' }], atividades: [] }] } as any);
  assert.equal(metrics.progressPct, 25);
  assert.equal(metrics.isComplete, false);
});

test('sem resumo, a média inclui o progresso parcial de cada tópico', () => {
  const metrics = buildClasseAcademicMetrics({ topicos: [
    { percentual_concluido: 100, conteudos: [], atividades: [] },
    { percentual_concluido: 50, conteudos: [], atividades: [] },
  ] } as any);
  assert.equal(metrics.progressPct, 75);
});

test('resumo confirmado em zero vence materiais e tópicos do cache', () => {
  const metrics = buildClasseAcademicMetrics({ resumo: { porcentagemConcluida: 0, isComplete: false },
    topicos: [{ percentual_concluido: 100, conteudos: [{ status: 'concluido' }], atividades: [] }] } as any);
  assert.equal(metrics.progressPct, 0);
  assert.equal(metrics.isComplete, false);
});

test('tópico completo não exige material bônus do professor para mostrar 100%', () => {
  const metrics = buildClasseAcademicMetrics({ topicos: [{ percentual_concluido: 100,
    conteudos: [{ percentual_concluido: 0 }], atividades: [] }] } as any);
  assert.equal(metrics.progressPct, 100);
  assert.equal(metrics.isComplete, true);
});

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
