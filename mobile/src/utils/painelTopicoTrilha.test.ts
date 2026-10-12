import assert from "node:assert/strict";
import test from "node:test";

import { estadoDoTopico, montarPainelTopico, topicoInicial } from "./painelTopicoTrilha";

const no = (id: string, sequence: number, extra: { locked?: boolean; completed?: boolean } = {}) => ({
  id,
  titulo: `Tópico ${id}`,
  sequence,
  locked: extra.locked ?? false,
  completed: extra.completed ?? false,
});
const NOS = [no("1", 1, { completed: true }), no("2", 2), no("3", 3, { locked: true })];
const ARESTAS = [
  { from: "1", to: "2" },
  { from: "2", to: "3" },
];

test("estado: bloqueado vence tudo; depois concluído; depois onde parou", () => {
  assert.equal(estadoDoTopico({ id: "3", locked: true, completed: true }, "3"), "locked");
  assert.equal(estadoDoTopico({ id: "1", locked: false, completed: true }, "1"), "done");
  assert.equal(estadoDoTopico({ id: "2", locked: false, completed: false }, "2"), "current");
  assert.equal(estadoDoTopico({ id: "2", locked: false, completed: false }, null), "open");
});

test("painel de um tópico em andamento", () => {
  const p = montarPainelTopico(NOS[1], { id: 2, percentual_concluido: 43.4, conteudos: [1, 2], atividades: [1] }, "2", NOS, ARESTAS);
  assert.equal(p.eyebrow, "Você parou aqui");
  assert.equal(p.acao, "Continuar");
  assert.equal(p.percentual, 43);
  assert.equal(p.conteudos, 2);
  assert.equal(p.atividades, 1);
  assert.deepEqual(p.prerequisitos, []);
});

test("bloqueado lista os pré-requisitos e não tem botão", () => {
  const p = montarPainelTopico(NOS[2], undefined, "2", NOS, ARESTAS);
  assert.equal(p.estado, "locked");
  assert.equal(p.acao, null);
  assert.deepEqual(p.prerequisitos, [{ id: "2", titulo: "Tópico 2" }]);
});

test("concluído mostra 100% e oferece revisar", () => {
  const p = montarPainelTopico(NOS[0], { id: 1, percentual_concluido: 80 }, null, NOS, ARESTAS);
  assert.equal(p.percentual, 100);
  assert.equal(p.acao, "Revisar tópico");
});

test("o painel abre onde o aluno parou; senão no próximo liberado", () => {
  assert.equal(topicoInicial(NOS, "2"), "2");
  assert.equal(topicoInicial(NOS, "99"), "2");
  assert.equal(topicoInicial([no("5", 1, { locked: true })], null), "5");
  assert.equal(topicoInicial([], null), null);
});
