import assert from "node:assert/strict";
import { test } from "node:test";
import {
  avisoDaDoacao,
  faltaParaAMeta,
  mensagemDaDoacao,
  normalizarFundo,
  opcoesDeDoacao,
  progressoDoFundo,
  textoDoProgresso,
  type FundoDaTurma,
} from "./fundoTurmaModel";

const fundo = (campos: Partial<FundoDaTurma> = {}): FundoDaTurma => ({
  id: 1,
  titulo: "Dia extra",
  beneficio: "+1 dia de prazo",
  meta: 50,
  arrecadado: 30,
  status: "aberto",
  ...campos,
});

test("normaliza a linha da tabela e recusa linha estranha", () => {
  assert.deepEqual(
    normalizarFundo({ id: "7", titulo: "T", beneficio: "B", meta: 40, arrecadado: "12", status: "aberto" }),
    { id: 7, titulo: "T", beneficio: "B", meta: 40, arrecadado: 12, status: "aberto" },
  );
  assert.equal(normalizarFundo({ id: 1, meta: 0, status: "aberto" }), null);
  assert.equal(normalizarFundo({ id: 1, meta: 10, status: "outro" }), null);
  assert.equal(normalizarFundo(null), null);
});

test("progresso e o que falta", () => {
  assert.equal(progressoDoFundo(fundo()), 60);
  assert.equal(progressoDoFundo(fundo({ arrecadado: 80 })), 100);
  assert.equal(faltaParaAMeta(fundo()), 20);
  assert.equal(textoDoProgresso(fundo()), "30 de 50 moedas (60%)");
});

test("opções de doação cabem no saldo e no que falta, e fechar a meta aparece quando dá", () => {
  assert.deepEqual(opcoesDeDoacao(fundo(), 100), [5, 10, 20]); // falta 20: o 20 já fecha
  assert.deepEqual(opcoesDeDoacao(fundo({ arrecadado: 43 }), 100), [5, 7]); // falta 7
  assert.deepEqual(opcoesDeDoacao(fundo(), 12), [5, 10]); // saldo não fecha a meta
  assert.deepEqual(opcoesDeDoacao(fundo(), 0), []);
  assert.deepEqual(opcoesDeDoacao(fundo(), null), []);
  assert.deepEqual(opcoesDeDoacao(fundo({ status: "atingido" }), 100), []);
});

test("mensagens da RPC", () => {
  assert.equal(mensagemDaDoacao({ ok: true, moedas: 10 }), null);
  assert.equal(mensagemDaDoacao({ ok: false, erro: "saldo_insuficiente" }), "Você não tem moedas suficientes para essa doação.");
  assert.equal(mensagemDaDoacao({ ok: false, erro: "desconhecido" }), "Não foi possível registrar a doação.");
  assert.equal(avisoDaDoacao({ moedas: 20, status: "atingido" }), "Você doou 20 moedas e a turma bateu a meta!");
  assert.equal(avisoDaDoacao({ moedas: 5, status: "aberto" }), "Você doou 5 moedas para o fundo da turma.");
});
