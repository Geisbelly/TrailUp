import assert from "node:assert/strict";
import test from "node:test";

import { quandoCurto, ultimasAtividades } from "@/utils/ultimaAtividade";

const agora = new Date(2026, 9, 12, 20, 0);

test("quando: hoje com hora, ontem, e data curta antes disso", () => {
  assert.equal(quandoCurto(new Date(2026, 9, 12, 18, 40).toISOString(), agora), "Hoje, 18:40");
  assert.equal(quandoCurto(new Date(2026, 9, 11, 9, 0).toISOString(), agora), "Ontem");
  assert.equal(quandoCurto(new Date(2026, 8, 27, 9, 0).toISOString(), agora), "27/09");
  assert.equal(quandoCurto(null, agora), "");
});

test("as três mais recentes, com frase e pontos por tipo", () => {
  const eventos = [
    { id: 1, tipo: "conteudo_concluido", valor: 2, criado_em: new Date(2026, 9, 10).toISOString() },
    { id: 2, tipo: "atividade_acertada", valor: 1, criado_em: new Date(2026, 9, 12, 18, 40).toISOString() },
    { id: 3, tipo: "atividade_concluida", valor: 3, criado_em: new Date(2026, 9, 11).toISOString() },
    { id: 4, tipo: "conteudo_concluido", valor: null, criado_em: new Date(2026, 9, 1).toISOString() },
  ];
  const linhas = ultimasAtividades(eventos, agora);
  assert.deepEqual(linhas.map((l) => l.id), ["2", "3", "1"]);
  assert.deepEqual(linhas.map((l) => l.texto), ["Acertou uma atividade", "Concluiu uma atividade", "Concluiu um conteúdo"]);
  assert.deepEqual(linhas.map((l) => l.pontos), [1, 3, 2]);
});

test("tipos que o app grava ganham frase própria", () => {
  const frase = (tipo: string) => ultimasAtividades([{ id: 1, tipo, valor: 0, criado_em: agora.toISOString() }], agora)[0].texto;
  assert.equal(frase("atividade_revisada"), "Revisou uma atividade");
  assert.equal(frase("revisao_feita"), "Revisou uma atividade");
  assert.equal(frase("atividade_errada"), "Tentou uma atividade");
  assert.equal(frase("topico_atividade_acertada"), "Acertou uma atividade");
  assert.equal(frase("topico_iniciado"), "Começou um tópico");
  assert.equal(frase("presenca_aula"), "Presença registrada em aula");
  assert.equal(frase("evento_classe_pontos"), "Pontos de um evento da turma");
});

test("tipo sem frase aparece legível; sem data fica de fora", () => {
  const linhas = ultimasAtividades(
    [
      { id: 9, tipo: "bonus_semanal", valor: 0, criado_em: new Date(2026, 9, 12, 8, 5).toISOString() },
      { id: 8, tipo: "atividade_concluida", valor: 3, criado_em: null },
    ],
    agora,
  );
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].texto, "Bonus semanal");
  assert.equal(linhas[0].icone, "star-four-points-outline");
});
