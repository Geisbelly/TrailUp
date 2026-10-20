import assert from "node:assert/strict";
import test from "node:test";

import { formatarFalta, resumirMinhaPosicao } from "./minhaPosicaoRank";

const linha = (id_aluno: string, posicao: number | null, pontuacao: number | null) => ({ id_aluno, nome_aluno: id_aluno.toUpperCase(), posicao, pontuacao });
const LINHAS = [linha("ana", 1, 90), linha("bia", 2, 75), linha("eu", 3, 60), linha("davi", 4, 10)];

test("acha o colega logo acima e quanto falta", () => {
  const r = resumirMinhaPosicao(LINHAS, "eu", "pontuacao");
  assert.equal(r.minha?.id_aluno, "eu");
  assert.equal(r.acima?.id_aluno, "bia");
  assert.equal(r.falta, "15 pontos");
});

test("em primeiro lugar não há ninguém acima", () => {
  const r = resumirMinhaPosicao(LINHAS, "ana", "pontuacao");
  assert.equal(r.acima, null);
  assert.equal(r.falta, null);
});

test("empatado na mesma posição não conta como acima", () => {
  const r = resumirMinhaPosicao([linha("ana", 1, 50), linha("eu", 1, 50)], "eu", "pontuacao");
  assert.equal(r.acima, null);
});

test("sem a minha linha (ou sem posição) não há resumo", () => {
  assert.deepEqual(resumirMinhaPosicao(LINHAS, "ninguem", "pontuacao"), { minha: null, acima: null, falta: null });
  assert.equal(resumirMinhaPosicao([linha("eu", null, 0)], "eu", "tempo").acima, null);
});

test("a diferença sai na unidade do critério", () => {
  assert.equal(formatarFalta(21, "tempo"), "21min");
  assert.equal(formatarFalta(75, "tempo"), "1h 15min");
  assert.equal(formatarFalta(1, "percentual"), "1 ponto percentual");
  assert.equal(formatarFalta(12, "percentual"), "12 pontos percentuais");
  assert.equal(formatarFalta(1, "elo"), "1 ponto de Elo");
  assert.equal(formatarFalta(23.4, "elo"), "23 pontos de Elo");
  assert.equal(formatarFalta(1, "pontuacao"), "1 ponto");
});
