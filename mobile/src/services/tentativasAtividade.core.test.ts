import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACERTO_MINIMO_DO_BONUS,
  MENSAGEM_DA_RECUSA,
  TentativaRecusada,
  guardarRetorno,
  lerRetorno,
  lerSituacao,
  linhasDoRetorno,
  questoesParaRefazer,
  rotuloDasRestantes,
  tentativasLivres,
  lerTentativa,
  mensagemDaRecusa,
  motivoDoErro,
  retornoDesde,
  segundosRestantes,
  type RetornoTentativa,
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

test("mensagemDaRecusa: recusa do banco vira a mensagem; o resto, nada", () => {
  // A resposta de questão gravada direto depois do prazo (20261102_04).
  assert.deepEqual(mensagemDaRecusa({ message: "prazo_expirado", code: "P0001" }), MENSAGEM_DA_RECUSA.prazo_expirado);
  assert.equal(mensagemDaRecusa({ message: "Could not find the function", code: "PGRST202" }), null);
  assert.equal(mensagemDaRecusa({ message: "Failed to fetch" }), null);
  assert.equal(mensagemDaRecusa(null), null);
});

const RETORNO: RetornoTentativa = {
  tentativaId: 3, numero: 1, cronometrada: true, noTempo: true, acertosPercentual: 85,
  pontuacaoObtida: 8.5, pontuacaoMaxima: 10, xpBonus: 20, restantes: null,
};

test("linhasDoRetorno: no tempo com bônus diz quanto XP entrou", () => {
  assert.deepEqual(linhasDoRetorno(RETORNO), ["Dentro do tempo: +20 XP de bônus."]);
});

test("linhasDoRetorno: fora do tempo a nota vale e o bônus não", () => {
  assert.deepEqual(linhasDoRetorno({ ...RETORNO, noTempo: false, xpBonus: 0 }), [
    "Fora do tempo: a nota vale, mas sem bônus de XP.",
  ]);
});

test("linhasDoRetorno: no tempo sem bônus distingue acerto baixo de faixa já paga", () => {
  assert.deepEqual(linhasDoRetorno({ ...RETORNO, acertosPercentual: ACERTO_MINIMO_DO_BONUS - 1, xpBonus: 0 }), [
    "Dentro do tempo. O bônus de XP começa em 70% de acerto.",
  ]);
  assert.deepEqual(linhasDoRetorno({ ...RETORNO, acertosPercentual: 85, xpBonus: 0 }), [
    "Dentro do tempo. O bônus desta faixa já foi pago nesta atividade.",
  ]);
});

test("linhasDoRetorno: sem cronômetro não fala de tempo; fala das tentativas quando há o que refazer", () => {
  const semCronometro = { ...RETORNO, cronometrada: false, noTempo: false, xpBonus: 0 };
  assert.deepEqual(linhasDoRetorno(semCronometro), []);
  assert.deepEqual(linhasDoRetorno({ ...semCronometro, restantes: 2 }), [
    "Restam 2 tentativas para refazer as questões que você errou.",
  ]);
  assert.deepEqual(linhasDoRetorno({ ...semCronometro, restantes: 1 }), [
    "Resta 1 tentativa para refazer as questões que você errou.",
  ]);
  // Tudo certo: não há o que refazer.
  assert.deepEqual(linhasDoRetorno({ ...semCronometro, restantes: 2, acertosPercentual: 100 }), []);
  assert.deepEqual(linhasDoRetorno({ ...semCronometro, restantes: 0 }), [
    "Esta foi a sua última tentativa nesta atividade.",
  ]);
});

test("retornoDesde: entrega o retorno desta resposta uma vez, e nunca o de antes", () => {
  guardarRetorno(41, RETORNO, 1_000);
  assert.equal(retornoDesde(41, 2_000), null, "retorno anterior ao pedido não é desta resposta");
  guardarRetorno(41, { ...RETORNO, numero: 2 }, 3_000);
  assert.equal(retornoDesde(41, 2_000)?.numero, 2);
  assert.equal(retornoDesde(41, 2_000), null, "quem lê consome");
  assert.equal(retornoDesde(42, 0), null);
});

test("lerSituacao: lê a RPC e não inventa máximo", () => {
  assert.deepEqual(lerSituacao({ maximo: 3, feitas: "1", aberta: true, restantes: 2 }), {
    maximo: 3, feitas: 1, aberta: true, restantes: 2,
  });
  assert.equal(lerSituacao({ feitas: 1 }), null);
  assert.equal(lerSituacao(null), null);
});

test("tentativasLivres: a aberta já está em uso; livre é a que nem começou", () => {
  assert.equal(tentativasLivres({ maximo: 3, feitas: 1, aberta: false, restantes: 2 }), 2);
  assert.equal(tentativasLivres({ maximo: 3, feitas: 1, aberta: true, restantes: 2 }), 1);
  // A última tentativa aberta: agora a segunda chance da loja pode valer.
  assert.equal(tentativasLivres({ maximo: 3, feitas: 2, aberta: true, restantes: 1 }), 0);
  assert.equal(tentativasLivres({ maximo: 3, feitas: 3, aberta: false, restantes: 0 }), 0);
});

test("questoesParaRefazer: só as que o aluno não acertou", () => {
  assert.deepEqual(
    questoesParaRefazer([
      { id: 1, correta_aluno: true },
      { id: 2, correta_aluno: false },
      { id: "3", correta_aluno: null }, // sem resposta também reabre
      { id: 4, correta_aluno: true },
    ]),
    [2, 3]
  );
  assert.deepEqual(questoesParaRefazer([{ id: 1, correta_aluno: true }]), []);
  assert.deepEqual(questoesParaRefazer(undefined), []);
});

test("rotuloDasRestantes: singular e plural", () => {
  assert.equal(rotuloDasRestantes(1), "Resta 1 tentativa");
  assert.equal(rotuloDasRestantes(3), "Restam 3 tentativas");
});
