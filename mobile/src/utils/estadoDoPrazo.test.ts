import assert from "node:assert/strict";
import test from "node:test";

import { estadoDoPrazo, rotuloDoPrazo, urgenciaDoPrazo } from "./estadoDoPrazo";

const emLocal = (a: number, m: number, d: number, h = 12) => new Date(a, m - 1, d, h);
const iso = (a: number, m: number, d: number, h = 23, min = 59) =>
  new Date(a, m - 1, d, h, min).toISOString();

test("sem prazo quando o valor falta ou e invalido", () => {
  for (const v of [null, undefined, "", "   ", "nao e data"]) {
    assert.deepEqual(estadoDoPrazo(v, emLocal(2026, 9, 20)), { tipo: "sem_prazo" });
  }
});

test("conta por calendario, nao por blocos de 24h", () => {
  // O caso que a issue descreve: aluno abre as 14h, prazo e hoje as 23h.
  // Divisao por 24 daria 0.375 -> "faltam 0 dias", lido como "e hoje" -- que
  // por acaso acerta. O inverso e que quebra: prazo AMANHA as 23h, aberto hoje
  // as 14h, sao 33 horas -> divisao daria 1 dia, e tambem acerta. O caso ruim e
  // prazo amanha as 00:30, aberto hoje as 23h: 1.5h -> divisao daria 0 dias,
  // "entrega hoje", quando e amanha.
  const agora = emLocal(2026, 9, 20, 23);
  const amanhaCedo = new Date(2026, 8, 21, 0, 30).toISOString();
  assert.deepEqual(estadoDoPrazo(amanhaCedo, agora), { tipo: "amanha" });
});

test("hoje, amanha e futuro", () => {
  const agora = emLocal(2026, 9, 20);
  assert.deepEqual(estadoDoPrazo(iso(2026, 9, 20), agora), { tipo: "hoje" });
  assert.deepEqual(estadoDoPrazo(iso(2026, 9, 21), agora), { tipo: "amanha" });
  assert.deepEqual(estadoDoPrazo(iso(2026, 9, 25), agora), { tipo: "futuro", dias: 5 });
});

test("atrasado conta dias inteiros, sempre positivo", () => {
  const agora = emLocal(2026, 9, 20);
  assert.deepEqual(estadoDoPrazo(iso(2026, 9, 19), agora), { tipo: "atrasado", dias: 1 });
  assert.deepEqual(estadoDoPrazo(iso(2026, 9, 13), agora), { tipo: "atrasado", dias: 7 });
});

test("a hora do dia em que o aluno abre o app nao muda o resultado", () => {
  // Imunidade que a contagem por meia-noite garante.
  const prazo = iso(2026, 9, 25);
  for (const hora of [0, 6, 12, 18, 23]) {
    assert.deepEqual(estadoDoPrazo(prazo, emLocal(2026, 9, 20, hora)), {
      tipo: "futuro", dias: 5,
    });
  }
});

test("rotulo nao diz '0 dias' nem '1 dias'", () => {
  const agora = emLocal(2026, 9, 20);
  assert.equal(rotuloDoPrazo(estadoDoPrazo(iso(2026, 9, 20), agora)), "Entrega hoje");
  assert.equal(rotuloDoPrazo(estadoDoPrazo(iso(2026, 9, 21), agora)), "Entrega amanhã");
  assert.equal(rotuloDoPrazo(estadoDoPrazo(iso(2026, 9, 19), agora)), "Atrasada 1 dia");
  assert.equal(rotuloDoPrazo(estadoDoPrazo(iso(2026, 9, 18), agora)), "Atrasada 2 dias");
  assert.equal(rotuloDoPrazo(estadoDoPrazo(null, agora)), null);
});

test("urgencia separa atrasado de proximo de vencer", () => {
  const agora = emLocal(2026, 9, 20);
  assert.equal(urgenciaDoPrazo(estadoDoPrazo(iso(2026, 9, 19), agora)), "critica");
  assert.equal(urgenciaDoPrazo(estadoDoPrazo(iso(2026, 9, 20), agora)), "atencao");
  assert.equal(urgenciaDoPrazo(estadoDoPrazo(iso(2026, 9, 21), agora)), "atencao");
  assert.equal(urgenciaDoPrazo(estadoDoPrazo(iso(2026, 9, 30), agora)), "nenhuma");
  assert.equal(urgenciaDoPrazo(estadoDoPrazo(null, agora)), "nenhuma");
});

test("virada de mes e de ano nao quebram a contagem", () => {
  assert.deepEqual(estadoDoPrazo(iso(2026, 10, 1), emLocal(2026, 9, 30)), { tipo: "amanha" });
  assert.deepEqual(estadoDoPrazo(iso(2027, 1, 1), emLocal(2026, 12, 31)), { tipo: "amanha" });
  assert.deepEqual(estadoDoPrazo(iso(2026, 12, 31), emLocal(2027, 1, 2)), {
    tipo: "atrasado", dias: 2,
  });
});
