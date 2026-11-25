import assert from "node:assert/strict";
import test from "node:test";

import { limitarSub, paginasDoTopico, posicaoDaPagina, type BlocoParaPaginas } from "./paginasDoTopico";

const conteudo = (paginas: number, feito = false): BlocoParaPaginas => ({
  tipo: "conteudo",
  paginas,
  feito,
  liberaSeguinte: true,
});
const atividade = (paginas: number, respondidas: boolean[], resolvida = false): BlocoParaPaginas => ({
  tipo: "atividade",
  paginas,
  feito: resolvida,
  liberaSeguinte: resolvida,
  respondidas,
});

test("cada questão e cada bloco de conteúdo vira uma página", () => {
  const paginas = paginasDoTopico([conteudo(2), atividade(3, [])], { bloco: 0, sub: 0 });
  assert.equal(paginas.length, 5);
  assert.deepEqual(
    paginas.map((p) => [p.bloco, p.sub, p.inicioDoBloco]),
    [
      [0, 0, true],
      [0, 1, false],
      [1, 0, true],
      [1, 1, false],
      [1, 2, false],
    ]
  );
  assert.equal(posicaoDaPagina(paginas, 1, 2), 4);
});

test("a questão só abre depois da anterior respondida", () => {
  const paginas = paginasDoTopico([atividade(3, [true, false, false])], { bloco: 0, sub: 1 });
  assert.deepEqual(
    paginas.map((p) => p.liberada),
    [true, true, false]
  );
  assert.deepEqual(
    paginas.map((p) => p.estado),
    ["feito", "atual", "pendente"]
  );
});

test("atividade em aberto segura tudo o que vem depois", () => {
  const paginas = paginasDoTopico([atividade(2, [true, true]), conteudo(2)], { bloco: 0, sub: 1 });
  assert.deepEqual(
    paginas.map((p) => p.liberada),
    [true, true, false, false]
  );
});

test("atividade resolvida libera tudo e conta como feita", () => {
  const paginas = paginasDoTopico([atividade(2, [], true), conteudo(1)], { bloco: 1, sub: 0 });
  assert.deepEqual(
    paginas.map((p) => [p.liberada, p.estado]),
    [
      [true, "feito"],
      [true, "feito"],
      [true, "atual"],
    ]
  );
});

test("conteúdo aberto marca como feito só o que ficou para trás", () => {
  const paginas = paginasDoTopico([conteudo(3, true)], { bloco: 0, sub: 1 });
  assert.deepEqual(
    paginas.map((p) => p.estado),
    ["feito", "atual", "pendente"]
  );
});

test("a página atual fica liberada mesmo quando a regra a travaria", () => {
  const paginas = paginasDoTopico([atividade(2, [false, false])], { bloco: 0, sub: 1 });
  assert.equal(paginas[1].liberada, true);
});

test("sem bloco aberto (resumo), nenhuma página é a atual", () => {
  const paginas = paginasDoTopico([conteudo(1, true), atividade(1, [])], null);
  assert.deepEqual(
    paginas.map((p) => p.estado),
    ["feito", "pendente"]
  );
});

test("limitarSub fica entre 0 e a última página", () => {
  assert.equal(limitarSub(5, 3), 2);
  assert.equal(limitarSub(-1, 3), 0);
  assert.equal(limitarSub(undefined, 3), 0);
  assert.equal(limitarSub(Number.NaN, 0), 0);
});
