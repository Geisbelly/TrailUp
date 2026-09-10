import assert from "node:assert/strict";
import test from "node:test";

import { escolherTempoDaClasse, escolherTempoMedio } from "./tempoDaClasse";

// Medido em producao, classe 32.
const CLASSE_32 = {
  doBanco: 2.26,       // = soma dos topicos = o que o rank mostra
  academicoMin: 2.89,  // = soma de conteudos (2,30) + atividades (0,59)
  unificadoMin: 2.89,
  temEstrutura: true,
};

test("o banco vence a conta local", () => {
  // A divergencia relatada: rank 2,26 e metrica 2,89. A conta local soma
  // conteudo + atividade, e os escopos da telemetria sao INCLUSIVOS -- o
  // escopo `topic` ja conta o mesmo intervalo.
  assert.equal(escolherTempoDaClasse(CLASSE_32), 2.26);
});

test("zero do banco e resposta, nao ausencia", () => {
  // Se o aluno nao estudou, o banco diz 0 e a tela tem de dizer 0 -- nao cair
  // numa conta local que pode ter tempo de item sem tempo de topico.
  assert.equal(
    escolherTempoDaClasse({ ...CLASSE_32, doBanco: 0 }),
    0
  );
});

test("sem numero do banco, o maximo local e a reserva", () => {
  // A razao do maximo e legitima: se a escrita em `topico_aluno` falhar, o
  // tempo do topico fica em zero enquanto os itens tem tempo gravado. Isso e
  // reserva, nao preferencia.
  assert.equal(
    escolherTempoDaClasse({ ...CLASSE_32, doBanco: null, academicoMin: 0, unificadoMin: 1.5 }),
    1.5
  );
  assert.equal(
    escolherTempoDaClasse({ ...CLASSE_32, doBanco: undefined, academicoMin: 4, unificadoMin: 1 }),
    4
  );
});

test("sem estrutura carregada, so o unificado responde", () => {
  assert.equal(
    escolherTempoDaClasse({
      doBanco: null,
      academicoMin: 9,
      unificadoMin: 2,
      temEstrutura: false,
    }),
    2
  );
});

test("valor invalido do banco cai na reserva", () => {
  assert.equal(
    escolherTempoDaClasse({ ...CLASSE_32, doBanco: Number.NaN }),
    2.89
  );
});

test("negativo nao passa", () => {
  assert.equal(escolherTempoDaClasse({ ...CLASSE_32, doBanco: -3 }), 0);
  assert.equal(
    escolherTempoDaClasse({ ...CLASSE_32, doBanco: null, academicoMin: -1, unificadoMin: -2 }),
    0
  );
});

test("a media por atividade segue a mesma ordem", () => {
  assert.equal(escolherTempoMedio({ doBanco: 0.06, localMin: 0.24, temAtividades: true }), 0.06);
  assert.equal(escolherTempoMedio({ doBanco: null, localMin: 0.24, temAtividades: true }), 0.24);
});

test("sem atividades a media e zero, nao a conta local", () => {
  assert.equal(escolherTempoMedio({ doBanco: null, localMin: 5, temAtividades: false }), 0);
});
