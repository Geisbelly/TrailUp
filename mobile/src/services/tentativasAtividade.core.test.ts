import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MENSAGEM_DA_RECUSA,
  TentativaRecusada,
  lerRetorno,
  lerTentativa,
  motivoDoErro,
  segundosRestantes,
} from "./tentativasAtividade.core";

const INICIO = "2026-11-01T12:00:00.000Z";

test("lerTentativa: o desvio é relógio do servidor menos o do aparelho", () => {
  const local = Date.parse("2026-11-01T12:00:00.000Z") - 30_000; // aparelho 30 s atrasado
  const t = lerTentativa(
    { tentativa_id: 7, numero: 2, cronometrada: true, limite_seg: 120, iniciada_em: INICIO, agora: INICIO, prazo: null, restantes: 1 },
    local
  );
  assert.deepEqual(t, {
    tentativaId: 7, numero: 2, cronometrada: true, limiteSeg: 120, iniciadaEm: INICIO, desvioMs: 30_000, prazo: null, restantes: 1,
  });
});

test("lerTentativa: resposta sem id ou sem início não vira tentativa", () => {
  assert.equal(lerTentativa({ numero: 1 }, 0), null);
  assert.equal(lerTentativa(null, 0), null);
  assert.equal(lerTentativa([1], 0), null);
});

test("segundosRestantes conta pelo relógio do servidor, mesmo com o aparelho adiantado", () => {
  const t = lerTentativa({ tentativa_id: 1, cronometrada: true, limite_seg: 120, iniciada_em: INICIO, agora: INICIO }, Date.parse(INICIO) + 3_600_000)!;
  // O aparelho está 1 h adiantado; 30 s depois, pelo servidor, faltam 90.
  assert.equal(segundosRestantes(t, Date.parse(INICIO) + 3_600_000 + 30_000), 90);
  assert.equal(segundosRestantes(t, Date.parse(INICIO) + 3_600_000 + 500_000), 0);
});

test("segundosRestantes: sem cronômetro é null", () => {
  const t = lerTentativa({ tentativa_id: 1, cronometrada: false, limite_seg: null, iniciada_em: INICIO, agora: INICIO }, 0)!;
  assert.equal(segundosRestantes(t, 0), null);
});

test("lerRetorno lê números que o PostgREST manda como texto", () => {
  assert.deepEqual(
    lerRetorno({ tentativa_id: 3, numero: 1, cronometrada: true, no_tempo: true, acertos_percentual: "85", pontuacao_obtida: "8.5", pontuacao_maxima: 10, xp_bonus: 20, restantes: null }),
    { tentativaId: 3, numero: 1, cronometrada: true, noTempo: true, acertosPercentual: 85, pontuacaoObtida: 8.5, pontuacaoMaxima: 10, xpBonus: 20, restantes: null }
  );
  assert.equal(lerRetorno({}), null);
});

test("motivoDoErro: recusa do servidor, função ausente e falha comum", () => {
  assert.equal(motivoDoErro({ message: "prazo_expirado", code: "P0001" }), "prazo_expirado");
  assert.equal(motivoDoErro({ message: "sem_tentativas", code: "P0001" }), "sem_tentativas");
  assert.equal(motivoDoErro({ message: "sem_matricula", code: "42501" }), "sem_matricula");
  assert.equal(motivoDoErro({ message: "Could not find the function", code: "PGRST202" }), "rpc_indisponivel");
  assert.equal(motivoDoErro({ message: "Failed to fetch" }), null);
  assert.equal(motivoDoErro(null), null);
});

test("TentativaRecusada carrega o motivo e a mensagem para o aluno", () => {
  const erro = new TentativaRecusada("sem_tentativas");
  assert.equal(erro.motivo, "sem_tentativas");
  assert.equal(erro.message, MENSAGEM_DA_RECUSA.sem_tentativas.descricao);
  assert.ok(erro instanceof Error);
});
