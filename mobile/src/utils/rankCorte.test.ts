import assert from "node:assert/strict";
import test from "node:test";

import { aplicarCorteDoRank, descreverCorte, type LinhaDoRank } from "@/utils/rankCorte";

function linha(posicao: number | null, id_aluno: string): LinhaDoRank {
  return { id_aluno, posicao };
}

/** Topo de 15 posicoes, sem a linha do aluno que consulta. */
function topo(ate = 15): LinhaDoRank[] {
  return Array.from({ length: ate }, (_, i) => linha(i + 1, `colega-${i + 1}`));
}

test("aluno fora do corte: a propria linha sai da lista e fica so no rodape", () => {
  const corte = aplicarCorteDoRank([...topo(), linha(18, "eu")], "eu");

  assert.equal(corte.foraDoCorte, true);
  assert.equal(corte.visiveis.length, 15);
  assert.equal(corte.minhaLinha?.posicao, 18);

  // Duplicar seria mostrar a mesma pessoa na lista e no rodape.
  assert.equal(
    corte.visiveis.some((l) => l.id_aluno === "eu"),
    false,
  );
});

test("aluno dentro do corte: a linha continua na lista, sem duplicar", () => {
  const dentro = [...topo(14), linha(7, "eu")];
  const corte = aplicarCorteDoRank(dentro, "eu");

  assert.equal(corte.foraDoCorte, false);
  assert.equal(corte.visiveis.length, 15);
  assert.equal(corte.visiveis.filter((l) => l.id_aluno === "eu").length, 1);
  assert.equal(corte.minhaLinha?.posicao, 7);
});

test("empate com o ultimo visivel conta como dentro", () => {
  // `dense_rank` repete a posicao no empate; `>` e' o que mantem o empate dentro.
  const corte = aplicarCorteDoRank([...topo(), linha(15, "eu")], "eu");

  assert.equal(corte.foraDoCorte, false);
  assert.equal(corte.visiveis.length, 16);
});

test("professor recebe a turma inteira e nao tem linha propria", () => {
  const corte = aplicarCorteDoRank(topo(20), "professor");

  assert.equal(corte.minhaLinha, null);
  assert.equal(corte.foraDoCorte, false);
  assert.equal(corte.visiveis.length, 20);
});

test("turma de um aluno nao inventa corte", () => {
  const corte = aplicarCorteDoRank([linha(1, "eu")], "eu");

  assert.equal(corte.foraDoCorte, false);
  assert.equal(corte.visiveis.length, 1);
});

test("posicao ausente nao empurra o aluno para fora", () => {
  const corte = aplicarCorteDoRank([...topo(), linha(null, "eu")], "eu");

  assert.equal(corte.foraDoCorte, false);
  assert.equal(corte.visiveis.length, 16);
});

test("lista vazia devolve estado neutro", () => {
  const corte = aplicarCorteDoRank([], "eu");

  assert.deepEqual(corte.visiveis, []);
  assert.equal(corte.minhaLinha, null);
  assert.equal(corte.foraDoCorte, false);
  assert.equal(corte.ultimaPosicaoVisivel, null);
});

test("o texto explica o corte, com o total da turma quando ha", () => {
  const corte = aplicarCorteDoRank([...topo(), linha(18, "eu")], "eu");

  assert.equal(descreverCorte(corte, 20), "Primeiras 15 posições de 20");
  assert.equal(descreverCorte(corte, null), "Primeiras 15 posições");
});

test("turma que cabe inteira no corte nao ganha aviso", () => {
  // Explicar um corte que nao aconteceu e' ruido -- e sugere que ha alguem
  // escondido quando nao ha.
  const corte = aplicarCorteDoRank(topo(8), "eu");

  assert.equal(descreverCorte(corte, 8), null);
});
