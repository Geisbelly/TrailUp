import assert from "node:assert/strict";
import test from "node:test";

import { referenciaDeAtividade } from "./referenciaDeEvento";

const base = {
  tipoBase: "atividade_acertada",
  atividadeId: 37,
  topicoId: 125,
  itemKey: "atividade-3",
  personalizada: false,
};

test("atividade do professor usa atividade:<id>, como antes", () => {
  assert.deepEqual(referenciaDeAtividade(base), {
    tipo: "atividade_acertada",
    referencia: "atividade:37",
  });
});

test("personalizada usa item:<topico>:<chave>", () => {
  assert.deepEqual(referenciaDeAtividade({ ...base, personalizada: true }), {
    tipo: "topico_atividade_acertada",
    referencia: "item:125:atividade-3",
  });
});

test("o topico vem no SEGUNDO segmento, nao no fim", () => {
  // O resolvedor do banco extrai digitos do FIM quando nao reconhece o
  // prefixo. Com a chave no fim, devolveria a chave em vez do topico -- e
  // classe nula tira o evento do rank.
  const { referencia } = referenciaDeAtividade({
    ...base, personalizada: true, itemKey: "quiz-7",
  });
  assert.equal(referencia.split(":")[1], "125");
});

test("sem chave do item, cai para topico: em vez de inventar uma", () => {
  // Inventar chave viraria dedup ERRADA, que e pior que dedup ausente.
  assert.deepEqual(
    referenciaDeAtividade({ ...base, personalizada: true, itemKey: null }),
    { tipo: "topico_atividade_acertada", referencia: "topico:125" },
  );
  assert.deepEqual(
    referenciaDeAtividade({ ...base, personalizada: true, itemKey: "   " }),
    { tipo: "topico_atividade_acertada", referencia: "topico:125" },
  );
});

test("atividade sem id valido tambem cai no caminho personalizado", () => {
  for (const id of [null, undefined, 0, -3, Number.NaN]) {
    const r = referenciaDeAtividade({ ...base, atividadeId: id as number });
    assert.equal(r.tipo, "topico_atividade_acertada");
    assert.equal(r.referencia, "item:125:atividade-3");
  }
});

test("chave normaliza caixa e espaco: a mesma atividade nao vira duas referencias", () => {
  // Se variasse, a dedup falharia justamente onde deveria agir.
  const a = referenciaDeAtividade({ ...base, personalizada: true, itemKey: "Quiz Final" });
  const b = referenciaDeAtividade({ ...base, personalizada: true, itemKey: "  quiz   final  " });
  assert.equal(a.referencia, b.referencia);
  assert.equal(a.referencia, "item:125:quiz-final");
});

test("topico invalido devolve referencia vazia em vez de 'topico:NaN'", () => {
  const r = referenciaDeAtividade({ ...base, personalizada: true, topicoId: null, itemKey: "x" });
  assert.equal(r.referencia, "");
});

test("os tres tipos base atravessam com o prefixo certo", () => {
  for (const t of ["atividade_acertada", "atividade_errada", "atividade_revisada"]) {
    assert.equal(referenciaDeAtividade({ ...base, tipoBase: t }).tipo, t);
    assert.equal(
      referenciaDeAtividade({ ...base, tipoBase: t, personalizada: true }).tipo,
      `topico_${t}`,
    );
  }
});
