import assert from "node:assert/strict";
import test from "node:test";

import {
  formatarMinutos,
  formatarMinutosPreciso,
  formatarTempoDaSessao,
} from "./tempoDeEstudo";

test("estudo curto nao vira zero", () => {
  // A regra inteira deste modulo. `Math.round(0.39)` dava 0 e a tela dizia
  // "0 min" a quem estudou -- medido em producao antes da 20260910_03.
  assert.equal(formatarMinutos(0.39), "23s");
  // E a media por atividade (2,17 / 12) continuava saindo zero depois de a
  // origem do numero ser consertada.
  assert.equal(formatarMinutos(0.18), "11s");
});

test("meio segundo ainda e mais que nada", () => {
  // Arredondar 0,004 min daria 0s e voltariamos a dizer que nao houve estudo.
  assert.equal(formatarMinutos(0.004), "1s");
});

test("zero de verdade continua zero", () => {
  assert.equal(formatarMinutos(0), "0 min");
  assert.equal(formatarMinutos(null), "0 min");
  assert.equal(formatarMinutos(undefined), "0 min");
  assert.equal(formatarMinutos(-5), "0 min");
  assert.equal(formatarMinutos(Number.NaN), "0 min");
});

test("minutos inteiros e horas", () => {
  assert.equal(formatarMinutos(1), "1 min");
  assert.equal(formatarMinutos(2.17), "2 min");
  assert.equal(formatarMinutos(59), "59 min");
  assert.equal(formatarMinutos(60), "1h");
  assert.equal(formatarMinutos(90), "1h 30min");
  assert.equal(formatarMinutos(125), "2h 5min");
});

test("59,7 nao vira 60 min", () => {
  // `Math.round` leva a 60; sem o ramo de horas a tela mostraria "60 min".
  assert.equal(formatarMinutos(59.7), "1h");
});

test("sessao sem medicao diz que nao tem, e nao zero", () => {
  // O cartao "Tempo ativo" mostrava `0s` sem lote de telemetria nenhum, com
  // "ritmo alto" no rodape -- que vem de dias ativos, nao de tempo. As duas
  // frases eram verdadeiras e juntas mentiam.
  assert.equal(formatarTempoDaSessao(0, false), "—");
  assert.equal(formatarTempoDaSessao(120, false), "—");
});

test("sessao medida em zero pode dizer zero", () => {
  // Aqui zero e verdade: houve medicao e ela deu zero.
  assert.equal(formatarTempoDaSessao(0, true), "0s");
});

test("segundos e minutos da sessao", () => {
  assert.equal(formatarTempoDaSessao(45, true), "45s");
  assert.equal(formatarTempoDaSessao(60, true), "1min");
  assert.equal(formatarTempoDaSessao(130, true), "2min 10s");
});

test("o formato preciso distingue ausente de zero", () => {
  assert.equal(formatarMinutosPreciso(null), "—");
  assert.equal(formatarMinutosPreciso(undefined), "—");
  assert.equal(formatarMinutosPreciso(0), "0min 0s");
  assert.equal(formatarMinutosPreciso(2.17), "2min 10s");
});
