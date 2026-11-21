import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { IATriggerSignal } from "../interfaces/personalizacao/IAContracts";
import { criarDetectorDeSobrecarga } from "./sinaisDeSobrecarga";

const LIMITES = { errosSeguidos: 5, minutosSemParar: 50, abandonos: 2 };

const erro = (topicoId = 1): IATriggerSignal => ({ type: "activity_wrong", topicoId });
const acerto = (topicoId = 1): IATriggerSignal => ({ type: "activity_correct", topicoId });
const inicio = (activityId: number): IATriggerSignal => ({ type: "activity_start", activityId });
const fim = (activityId: number): IATriggerSignal => ({ type: "activity_complete", activityId });

function vezes<T>(n: number, f: () => T): T[] {
  return Array.from({ length: n }, f);
}

describe("criarDetectorDeSobrecarga", () => {
  it("dispara no 5º erro seguido do mesmo tópico", () => {
    const d = criarDetectorDeSobrecarga(LIMITES);
    assert.deepEqual(vezes(4, () => d.registrarSinal(erro())), [null, null, null, null]);
    assert.deepEqual(d.registrarSinal(erro()), { erros_seguidos: 5 });
  });

  it("acerto zera a sequência", () => {
    const d = criarDetectorDeSobrecarga(LIMITES);
    vezes(4, () => d.registrarSinal(erro()));
    d.registrarSinal(acerto());
    assert.deepEqual(vezes(4, () => d.registrarSinal(erro())), [null, null, null, null]);
  });

  it("erro de outro tópico recomeça a contagem", () => {
    const d = criarDetectorDeSobrecarga(LIMITES);
    vezes(4, () => d.registrarSinal(erro(1)));
    assert.equal(d.registrarSinal(erro(2)), null);
    vezes(3, () => d.registrarSinal(erro(2)));
    assert.deepEqual(d.registrarSinal(erro(2)), { erros_seguidos: 5 });
  });

  it("abandono = activity_start sem activity_complete antes de outro activity_start ou content_open", () => {
    const d = criarDetectorDeSobrecarga(LIMITES);
    d.registrarSinal(inicio(10));
    d.registrarSinal(fim(10));
    d.registrarSinal(inicio(11));
    assert.equal(d.registrarSinal(inicio(11)), null, "reabrir a mesma atividade não é abandono");
    assert.equal(d.registrarSinal(inicio(12)), null, "1º abandono");
    assert.deepEqual(d.registrarSinal({ type: "content_open", contentId: 3 }), { abandonos: 2 });
  });

  it("50 minutos sem parar dispara; pausou() zera", () => {
    const d = criarDetectorDeSobrecarga(LIMITES);
    assert.equal(d.registrarMinutosNaTrilha(30), null);
    d.pausou();
    assert.equal(d.registrarMinutosNaTrilha(70), null, "40 min desde a pausa");
    assert.deepEqual(d.registrarMinutosNaTrilha(80.6), { minutos_sem_parar: 50 });
  });

  it("dispara uma vez só até zerar()", () => {
    const d = criarDetectorDeSobrecarga(LIMITES);
    vezes(4, () => d.registrarSinal(erro()));
    assert.ok(d.registrarSinal(erro()));
    assert.equal(d.registrarSinal(erro()), null);
    assert.equal(d.registrarMinutosNaTrilha(90), null);
    d.zerar();
    vezes(4, () => d.registrarSinal(erro()));
    assert.deepEqual(d.registrarSinal(erro()), { erros_seguidos: 5 });
  });

  it("os fatos levam os outros sinais já contados e ficam no limite do banco", () => {
    const d = criarDetectorDeSobrecarga({ ...LIMITES, minutosSemParar: 5000 });
    d.registrarMinutosNaTrilha(52);
    vezes(4, () => d.registrarSinal(erro()));
    assert.deepEqual(d.registrarSinal(erro()), { erros_seguidos: 5, minutos_sem_parar: 52 });

    const longe = criarDetectorDeSobrecarga({ errosSeguidos: 99, minutosSemParar: 10, abandonos: 99 });
    assert.deepEqual(longe.registrarMinutosNaTrilha(5000), { minutos_sem_parar: 1000 });
  });

  it("wrong_streak não conta em dobro", () => {
    const d = criarDetectorDeSobrecarga(LIMITES);
    vezes(4, () => d.registrarSinal(erro()));
    assert.equal(d.registrarSinal({ type: "wrong_streak", topicoId: 1 }), null);
    assert.deepEqual(d.registrarSinal(erro()), { erros_seguidos: 5 });
  });
});
