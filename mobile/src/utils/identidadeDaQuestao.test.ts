import assert from "node:assert/strict";
import test from "node:test";

import { identidadeDaQuestao, posicaoNaAtividade } from "./identidadeDaQuestao";

test("os sete formatos tem identidade propria", () => {
  const tipos = [
    "multipla",
    "verdadeiro_falso",
    "fill_blank",
    "dissertativa",
    "multipla_resposta",
    "associacao",
    "ordenacao",
  ];
  const rotulos = new Set<string>();
  for (const tipo of tipos) {
    const id = identidadeDaQuestao(tipo);
    assert.ok(id, `sem identidade: ${tipo}`);
    assert.ok(id!.rotulo && id!.instrucao && id!.icone, tipo);
    rotulos.add(id!.rotulo);
  }
  // Dois formatos com o mesmo rotulo nao distinguem nada -- o selo passaria a
  // ser enfeite.
  assert.equal(rotulos.size, tipos.length, "ha rotulo repetido entre formatos");
});

test("os apelidos do banco, da API e do microservice casam", () => {
  assert.equal(identidadeDaQuestao("quiz")!.rotulo, identidadeDaQuestao("multipla")!.rotulo);
  assert.equal(identidadeDaQuestao("true_false")!.rotulo, identidadeDaQuestao("verdadeiro_falso")!.rotulo);
  assert.equal(identidadeDaQuestao("essay")!.rotulo, identidadeDaQuestao("dissertativa")!.rotulo);
  assert.equal(identidadeDaQuestao("ligar_termos")!.rotulo, identidadeDaQuestao("associacao")!.rotulo);
  assert.equal(identidadeDaQuestao("ordering")!.rotulo, identidadeDaQuestao("ordenacao")!.rotulo);
});

test("acento e caixa nao impedem o reconhecimento", () => {
  assert.equal(identidadeDaQuestao("ASSOCIAÇÃO")!.rotulo, "Ligar termos");
  assert.equal(identidadeDaQuestao("  Ordenação  ")!.rotulo, "Colocar em ordem");
});

test("o tipo da ATIVIDADE serve de reserva, nao de primeira escolha", () => {
  // A questao manda; a atividade so responde quando a questao nao diz nada.
  assert.equal(
    identidadeDaQuestao("multipla_resposta", "multipla")!.rotulo,
    "Marque todas"
  );
  assert.equal(identidadeDaQuestao(null, "ordenacao")!.rotulo, "Colocar em ordem");
  assert.equal(identidadeDaQuestao("", "quiz")!.rotulo, "Escolha única");
});

test("tipo irreconhecivel devolve null em vez de chutar", () => {
  // Selo com o formato ERRADO e pior que selo nenhum: o aluno confia nele e
  // responde no formato que leu.
  assert.equal(identidadeDaQuestao("formato_que_nao_existe"), null);
  assert.equal(identidadeDaQuestao(null), null);
  assert.equal(identidadeDaQuestao(undefined, undefined), null);
  assert.equal(identidadeDaQuestao(42), null);
});

test("a instrucao fala da ACAO, nao do nome do tipo", () => {
  // "multipla resposta" e jargao de quem cadastrou; "marque todas" e acionavel.
  for (const tipo of ["multipla_resposta", "associacao", "ordenacao"]) {
    const instrucao = identidadeDaQuestao(tipo)!.instrucao.toLowerCase();
    assert.ok(
      /^(marque|ligue|coloque|escolha|escreva|a afirmacao|a afirmação)/.test(instrucao),
      `instrucao nao e imperativa: ${instrucao}`
    );
  }
});

test("posicao some quando a atividade tem uma questao so", () => {
  // "Questao 1 de 1" ocupa espaco para nao dizer nada.
  assert.equal(posicaoNaAtividade(0, 1), null);
  assert.equal(posicaoNaAtividade(0, 8), "Questão 1 de 8");
  assert.equal(posicaoNaAtividade(7, 8), "Questão 8 de 8");
});

test("posicao fora da faixa nao inventa numero", () => {
  assert.equal(posicaoNaAtividade(-1, 8), null);
  assert.equal(posicaoNaAtividade(8, 8), null);
  assert.equal(posicaoNaAtividade(1.5 as unknown as number, 8), null);
  assert.equal(posicaoNaAtividade(0, NaN), null);
});
