import assert from "node:assert/strict";
import test from "node:test";

import {
  agruparPorDia,
  descreverCredito,
  formatarDia,
  iconeDoCredito,
  rotularTipoDeCredito,
  somarPontos,
  type CreditoDoAluno,
} from "./creditosDoAluno";

function credito(patch: Partial<CreditoDoAluno> = {}): CreditoDoAluno {
  return {
    id: 1,
    tipo: "presenca_aula",
    valor: 10,
    motivo: null,
    data_credito: "2026-09-09",
    classe_id: 32,
    ...patch,
  };
}

test("rotula os três tipos concedidos", () => {
  assert.equal(rotularTipoDeCredito("presenca_aula"), "Presença");
  assert.equal(rotularTipoDeCredito("participacao_aula"), "Participação");
  assert.equal(rotularTipoDeCredito("participacao_extra"), "Atividade em sala");
});

test("tipo desconhecido aparece cru em vez de sumir", () => {
  // Sumir esconderia pontos que o aluno tem: melhor mostrar o nome técnico.
  assert.equal(rotularTipoDeCredito("participacao_nova"), "participacao_nova");
  assert.equal(iconeDoCredito("participacao_nova"), "star-outline");
});

test("cada tipo tem seu ícone, e eles não se repetem", () => {
  const icones = [
    iconeDoCredito("presenca_aula"),
    iconeDoCredito("participacao_aula"),
    iconeDoCredito("participacao_extra"),
  ];
  assert.equal(new Set(icones).size, 3);
});

test("soma os pontos", () => {
  assert.equal(somarPontos([credito({ valor: 10 }), credito({ valor: 8 })]), 18);
  assert.equal(somarPontos([]), 0);
});

test("valor nulo ou não numérico não contamina a soma", () => {
  assert.equal(
    somarPontos([
      credito({ valor: 10 }),
      credito({ valor: null }),
      credito({ valor: Number.NaN }),
    ]),
    10,
  );
});

test("agrupa por dia, do mais recente para o mais antigo", () => {
  const dias = agruparPorDia([
    credito({ id: 1, data_credito: "2026-09-02" }),
    credito({ id: 2, data_credito: "2026-09-11" }),
    credito({ id: 3, data_credito: "2026-09-09" }),
  ]);

  assert.deepEqual(
    dias.map((d) => d.data),
    ["2026-09-11", "2026-09-09", "2026-09-02"],
  );
});

test("dois créditos no mesmo dia ficam juntos, com a soma do dia", () => {
  const dias = agruparPorDia([
    credito({ id: 1, valor: 10 }),
    credito({ id: 2, valor: 8, tipo: "participacao_extra", motivo: "Seminário" }),
  ]);

  assert.equal(dias.length, 1);
  assert.equal(dias[0].creditos.length, 2);
  assert.equal(dias[0].pontos, 18);
});

test("dentro do dia, o maior crédito vem primeiro", () => {
  const dias = agruparPorDia([
    credito({ id: 1, valor: 3 }),
    credito({ id: 2, valor: 12 }),
    credito({ id: 3, valor: 7 }),
  ]);

  assert.deepEqual(
    dias[0].creditos.map((c) => c.valor),
    [12, 7, 3],
  );
});

test("linha sem data vai para o FIM, não para o começo", () => {
  // Comparar string vazia junto com as datas a jogaria para o fim por
  // acidente; sem a regra explícita, uma linha defeituosa poderia aparecer
  // como se fosse a mais recente.
  const dias = agruparPorDia([
    credito({ id: 1, data_credito: null }),
    credito({ id: 2, data_credito: "2026-09-09" }),
  ]);

  assert.deepEqual(
    dias.map((d) => d.data),
    ["2026-09-09", ""],
  );
});

test("lista vazia devolve lista vazia", () => {
  assert.deepEqual(agruparPorDia([]), []);
});

test("formata o dia, e diz quando não sabe", () => {
  assert.equal(formatarDia("2026-09-11"), "11/09/2026");
  assert.equal(formatarDia(""), "Sem data");
  assert.equal(formatarDia("11/09/2026"), "Sem data");
});

test("a descrição usa o motivo quando ele existe", () => {
  assert.equal(
    descreverCredito(
      credito({ tipo: "participacao_extra", motivo: "Exercício de fixação" }),
    ),
    "Exercício de fixação",
  );
});

test("sem motivo, a descrição não repete o rótulo do tipo", () => {
  // Motivo só existe em atividade em sala, e é obrigatório lá -- a ausência em
  // presença não é dado faltando.
  const presenca = descreverCredito(credito({ tipo: "presenca_aula", motivo: null }));
  assert.equal(presenca, "Aula registrada pelo professor");
  assert.notEqual(presenca, rotularTipoDeCredito("presenca_aula"));
});

test("motivo só de espaços conta como ausente", () => {
  assert.equal(
    descreverCredito(credito({ tipo: "participacao_aula", motivo: "   " })),
    "Participação em aula",
  );
});
