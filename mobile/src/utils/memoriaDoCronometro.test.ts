import assert from "node:assert/strict";
import test from "node:test";

import { criarMemoriaDoCronometro } from "./memoriaDoCronometro";

test("voltar à atividade continua de onde parou, não da duração cheia", () => {
  const m = criarMemoriaDoCronometro();
  assert.equal(m.restante("item:activity:1", 120), 120);
  m.guardar("item:activity:1", 120, 75);
  assert.equal(m.restante("item:activity:1", 120), 75);
  assert.equal(m.restante("item:activity:2", 90), 90); // outra atividade tem o relógio dela
});

test("minutos comprados somam ao que falta sem apagar o que já correu", () => {
  const m = criarMemoriaDoCronometro();
  m.guardar("a", 120, 20);
  assert.equal(m.restante("a", 180), 80);
});

test("esgotado continua esgotado, e esquecer recomeça", () => {
  const m = criarMemoriaDoCronometro();
  m.guardar("a", 60, 0);
  assert.equal(m.restante("a", 60), 0);
  m.esquecer("a");
  assert.equal(m.restante("a", 60), 60);
});

test("a memória não cresce sem limite: o escopo mais antigo sai", () => {
  const m = criarMemoriaDoCronometro(2);
  m.guardar("a", 60, 10);
  m.guardar("b", 60, 10);
  m.guardar("c", 60, 10);
  assert.equal(m.restante("a", 60), 60);
  assert.equal(m.restante("c", 60), 10);
});
