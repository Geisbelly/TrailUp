import test from "node:test";
import assert from "node:assert/strict";

import { mapClasseResumoRow } from "./classeResumo";

test("mapClasseResumoRow preserva as colunas camelCase da view", () => {
  const resumo = mapClasseResumoRow({
    aluno_id: "aluno-1",
    classe_id: 32,
    notaMedia: 8.5,
    tempoMedioPorAtividade: 12,
    acertosPercentual: 76,
    porcentagemConcluida: 43,
    ultimaAtividade: 123,
    tempoGastoMin: 90,
    isComplete: false,
    atividadesConcluidas: { concluidas: 3, total: 7 },
    recomendacaoTrilha: "revisar",
    modoOperacao: "foco",
    perfisDetectados: ["seeker"],
  });

  assert.equal(resumo.porcentagemConcluida, 43);
  assert.equal(resumo.tempoGastoMin, 90);
  assert.equal(resumo.notaMedia, 8.5);
  assert.equal(resumo.isComplete, false);
  assert.deepEqual(resumo.atividadesConcluidas, { concluidas: 3, total: 7 });
});
