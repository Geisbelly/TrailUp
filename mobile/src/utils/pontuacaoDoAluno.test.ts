import assert from "node:assert/strict";
import test from "node:test";

import {
  criteriosDoRanking,
  descreverPosicaoDaPontuacao,
  extrairPontuacao,
  rotularPontuacao,
} from "./pontuacaoDoAluno";

// A classe de demonstração, medida em produção: três ranks, três unidades.
const CRITERIOS = [
  { rank_id: 7, criterio: "pontuacao" },
  { rank_id: 8, criterio: "tempo" },
  { rank_id: 9, criterio: "percentual" },
];

const POSICOES = [
  { rank_id: 8, posicao: 1, pontuacao: 0.39 }, // minutos
  { rank_id: 9, posicao: 1, pontuacao: 75 }, // por cento
  { rank_id: 7, posicao: 1, pontuacao: 122 }, // pontos
];

test("pega os pontos do rank de pontuação, não a primeira linha", () => {
  // A ordem da lista é a que vem do banco. Pegar a primeira devolveria 0,39
  // minuto com rótulo de ponto.
  const valor = extrairPontuacao(POSICOES, CRITERIOS);
  assert.equal(valor.pontos, 122);
  assert.equal(valor.posicao, 1);
  assert.equal(valor.semRankDePontuacao, false);
});

test("não confunde percentual nem tempo com pontuação", () => {
  const valor = extrairPontuacao(POSICOES, CRITERIOS);
  assert.notEqual(valor.pontos, 75);
  assert.notEqual(valor.pontos, 0.39);
});

test("critério vem normalizado", () => {
  const valor = extrairPontuacao(
    [{ rank_id: 3, posicao: 4, pontuacao: 88 }],
    [{ rank_id: 3, criterio: "  Pontuacao " }],
  );
  assert.equal(valor.pontos, 88);
});

test("turma sem rank de pontuação não mostra zero", () => {
  // Zero seria mentira: o aluno pode ter pontos, a turma é que não ranqueia
  // por eles.
  const valor = extrairPontuacao(
    [{ rank_id: 9, posicao: 1, pontuacao: 75 }],
    [{ rank_id: 9, criterio: "percentual" }],
  );
  assert.equal(valor.semRankDePontuacao, true);
  assert.equal(valor.pontos, null);
  assert.equal(rotularPontuacao(valor), "—");
  assert.equal(descreverPosicaoDaPontuacao(valor), "turma sem rank de pontuação");
});

test("rank existe mas o aluno não aparece nele", () => {
  // Fora do corte de 15 e sem a própria linha. É sem dado, não sem rank.
  const valor = extrairPontuacao([], CRITERIOS);
  assert.equal(valor.semRankDePontuacao, false);
  assert.equal(valor.pontos, null);
  assert.equal(descreverPosicaoDaPontuacao(valor), "sem posição no rank de pontuação");
});

test("pontuação nula no rank conta como zero", () => {
  // Aqui zero é verdade: o aluno está no rank e não pontuou.
  const valor = extrairPontuacao(
    [{ rank_id: 7, posicao: 9, pontuacao: null }],
    CRITERIOS,
  );
  assert.equal(valor.pontos, 0);
  assert.equal(valor.posicao, 9);
  assert.equal(rotularPontuacao(valor), "0");
});

test("o rótulo arredonda e a posição vem do rank certo", () => {
  const valor = extrairPontuacao(
    [
      { rank_id: 7, posicao: 3, pontuacao: 601.6 },
      { rank_id: 8, posicao: 1, pontuacao: 0.39 },
    ],
    CRITERIOS,
  );
  assert.equal(rotularPontuacao(valor), "602");
  assert.equal(descreverPosicaoDaPontuacao(valor), "3º no rank de pontuação");
});

test("lista de critérios vazia", () => {
  assert.equal(extrairPontuacao(POSICOES, []).semRankDePontuacao, true);
});

test("criteriosDoRanking projeta os ranks no par que extrairPontuacao espera", () => {
  const ranking = {
    ranks: [
      { info: { rank_id: 7, criterio: "pontuacao" } },
      { info: { rank_id: 8, criterio: "tempo" } },
    ],
  };

  assert.deepEqual(criteriosDoRanking(ranking), [
    { rank_id: 7, criterio: "pontuacao" },
    { rank_id: 8, criterio: "tempo" },
  ]);
});

test("criteriosDoRanking aguenta ranking ausente", () => {
  // A trilha renderiza antes de o ranking carregar; sem isto o cabeçalho
  // quebraria no primeiro quadro.
  assert.deepEqual(criteriosDoRanking(null), []);
  assert.deepEqual(criteriosDoRanking(undefined), []);
  assert.deepEqual(criteriosDoRanking({ ranks: null }), []);
});

test("a projeção alimenta extrairPontuacao e escolhe a linha em pontos", () => {
  // O caminho inteiro, ponta a ponta: é o que a trilha faz. As três linhas
  // chegam no mesmo campo `pontuacao` -- 794 pontos, 2,37 minutos e 99,06 por
  // cento -- e só o critério distingue.
  const ranking = {
    ranks: [
      { info: { rank_id: 7, criterio: "pontuacao" } },
      { info: { rank_id: 8, criterio: "tempo" } },
      { info: { rank_id: 9, criterio: "percentual" } },
    ],
  };
  const posicoes = [
    { rank_id: 8, posicao: 1, pontuacao: 2.37 },
    { rank_id: 9, posicao: 1, pontuacao: 99.06 },
    { rank_id: 7, posicao: 1, pontuacao: 794 },
  ];

  const valor = extrairPontuacao(posicoes, criteriosDoRanking(ranking));

  assert.equal(valor.pontos, 794);
  assert.equal(rotularPontuacao(valor), "794");
  assert.equal(descreverPosicaoDaPontuacao(valor), "1º no rank de pontuação");
});
