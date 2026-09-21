import assert from "node:assert/strict";
import test from "node:test";

import {
  ehMissao,
  normalizarTipoDeAtividade,
  resolverTipoDeRenderizacao,
  rotularTipoDeAtividade,
  TIPO_DE_MISSAO,
} from "./tiposDeAtividade";

test("missão com itens renderiza como questão", () => {
  // É a regressão que a #150 pede: o app já renderizava missão antes da
  // feature existir, porque tipo desconhecido COM questões cai em
  // `QuestionActivity`. Este teste garante que continua.
  assert.equal(resolverTipoDeRenderizacao("missao", true), "questao");
});

test("missão SEM itens também renderiza -- o enunciado dela é a tarefa", () => {
  // Pelo caminho antigo (tipo desconhecido + sem questões) não renderizava
  // nada, e uma missão em branco pareceria defeito do app.
  assert.equal(resolverTipoDeRenderizacao("missao", false), "questao");
});

test("os formatos conhecidos renderizam como questão, com ou sem itens", () => {
  for (const tipo of ["quiz", "true_false", "fill_blank", "essay"]) {
    assert.equal(resolverTipoDeRenderizacao(tipo, true), "questao", tipo);
    assert.equal(resolverTipoDeRenderizacao(tipo, false), "questao", tipo);
  }
});

test("vídeo e texto têm componente próprio", () => {
  assert.equal(resolverTipoDeRenderizacao("video", false), "video");
  assert.equal(resolverTipoDeRenderizacao("texto", false), "texto");
});

test("tipo desconhecido com questões ainda renderiza", () => {
  // `atividades.tipo` foi texto livre por muito tempo; o que já está gravado
  // não pode sumir da tela.
  assert.equal(resolverTipoDeRenderizacao("formato_antigo", true), "questao");
});

test("tipo desconhecido e sem questões não renderiza nada", () => {
  // "nada" é resposta legítima: inventar um componente seria pior que não
  // mostrar.
  assert.equal(resolverTipoDeRenderizacao("formato_antigo", false), "nada");
});

test("tipo vazio cai em quiz, não em nada", () => {
  assert.equal(resolverTipoDeRenderizacao(null, false), "questao");
  assert.equal(resolverTipoDeRenderizacao("", false), "questao");
});

test("normaliza os dois vocabulários", () => {
  assert.equal(normalizarTipoDeAtividade("multipla"), "quiz");
  assert.equal(normalizarTipoDeAtividade("dissertativa"), "essay");
  assert.equal(normalizarTipoDeAtividade("verdadeiro_falso"), "true_false");
  assert.equal(normalizarTipoDeAtividade("  MISSAO "), "missao");
});

test("tipo desconhecido é preservado, não trocado por um padrão", () => {
  // Aqui é diferente do lado da API: lá o desconhecido vira `quiz` porque está
  // prestes a ser GRAVADO. Aqui é leitura, e trocar apagaria o que o banco tem.
  assert.equal(normalizarTipoDeAtividade("formato_antigo"), "formato_antigo");
});

test("ehMissao reconhece os apelidos", () => {
  assert.equal(ehMissao("missao"), true);
  assert.equal(ehMissao("mission"), true);
  assert.equal(ehMissao(" MISSAO "), true);
  assert.equal(ehMissao("quiz"), false);
  assert.equal(ehMissao(null), false);
  assert.equal(TIPO_DE_MISSAO, "missao");
});

test("rotula em português, e não deixa a atividade sem nome", () => {
  assert.equal(rotularTipoDeAtividade("missao"), "Missão");
  assert.equal(rotularTipoDeAtividade("essay"), "Dissertação");
  assert.equal(rotularTipoDeAtividade("formato_antigo"), "Atividade");
});
