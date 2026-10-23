import assert from "node:assert/strict";
import test from "node:test";

import { diasDePrazoUsados, filtrarExtrato, formatarQuando, limitesDaTurma, montarExtrato } from "./extratoModel";

const AGORA = new Date(2026, 9, 11, 20, 0);

test("quando: hoje com hora, ontem, e data curta antes disso", () => {
  assert.equal(formatarQuando(new Date(2026, 9, 11, 18, 40).toISOString(), AGORA), "Hoje, 18:40");
  assert.equal(formatarQuando(new Date(2026, 9, 10, 9, 0).toISOString(), AGORA), "Ontem");
  assert.equal(formatarQuando(new Date(2026, 9, 3, 9, 0).toISOString(), AGORA), "03/10");
  assert.equal(formatarQuando("lixo", AGORA), "");
});

test("cada motivo do razão vira uma descrição", () => {
  const linhas = [
    { id: 1, delta: "3", motivo: "evento", evento_tipo: "atividade_concluida", compra_id: null, criado_em: AGORA.toISOString() },
    { id: 2, delta: -5, motivo: "compra", evento_tipo: null, compra_id: 9, criado_em: AGORA.toISOString() },
    { id: 3, delta: -4, motivo: "compra", evento_tipo: null, compra_id: 10, criado_em: AGORA.toISOString() },
    { id: 4, delta: 2, motivo: "dotacao", evento_tipo: null, compra_id: null, criado_em: AGORA.toISOString() },
    { id: 5, delta: 1, motivo: "novo_motivo", evento_tipo: null, compra_id: null, criado_em: AGORA.toISOString() },
  ];
  const r = montarExtrato(linhas, new Map([[9, "Dica"]]), AGORA);
  assert.deepEqual(r.map((m) => [m.valor, m.descricao]), [
    [3, "Atividade concluída"],
    [-5, "Compra · Dica"],
    [-4, "Compra"],
    [2, "Dotação da turma"],
    [1, "novo_motivo"],
  ]);
});

test("filtro do extrato separa compra de ganho", () => {
  const linhas = montarExtrato(
    [
      { id: 1, delta: 3, motivo: "evento", evento_tipo: "atividade_concluida", compra_id: null, criado_em: AGORA.toISOString() },
      { id: 2, delta: -5, motivo: "compra", evento_tipo: null, compra_id: 9, criado_em: AGORA.toISOString() },
    ],
    new Map([[9, "Dica"]]),
    AGORA,
  );
  assert.deepEqual(filtrarExtrato(linhas, "compra").map((m) => m.id), [2]);
  assert.equal(filtrarExtrato(linhas, "todos").length, 2);
});

test("limites: sem linha da turma valem os padrões da tabela", () => {
  assert.deepEqual(limitesDaTurma(null), {
    prazoDiasTotal: 2,
    prazoPorAtividade: 2,
    segundaChancePorTopico: 1,
    prazoMinDias: 1,
    prazoMaxDias: 1,
    tempoMinMinutos: 5,
    tempoMaxMinutos: 15,
    tempoPorAtividade: 30,
  });
  assert.equal(limitesDaTurma({ prazo_max_dias_total: 4 }).prazoDiasTotal, 4);
  assert.equal(limitesDaTurma({ prazo_extensao_max_dias: 3 }).prazoMaxDias, 3);
});

test("extrato nomeia aprovação, conclusão configurada e meta", () => {
  const linhas = [
    { id: 1, delta: 4, motivo: "evento", evento_tipo: "atividade_aprovada", compra_id: null, criado_em: AGORA.toISOString() },
    { id: 2, delta: 2, motivo: "evento", evento_tipo: "atividade_conclusao_config", compra_id: null, criado_em: AGORA.toISOString() },
    { id: 3, delta: 6, motivo: "evento", evento_tipo: "meta_atingida", compra_id: null, criado_em: AGORA.toISOString() },
  ];
  assert.deepEqual(montarExtrato(linhas, new Map(), AGORA).map((m) => m.descricao), [
    "Atividade aprovada",
    "Conclusão da atividade",
    "Meta alcançada",
  ]);
});

test("prazo usado: soma os dias só das atividades desta turma", () => {
  const linhas = [
    { dias_extras: 1, atividades: { topicos: { classe_id: 65 } } },
    { dias_extras: 2, atividades: [{ topicos: [{ classe_id: 65 }] }] },
    { dias_extras: 3, atividades: { topicos: { classe_id: 66 } } },
    { dias_extras: null, atividades: { topicos: { classe_id: 65 } } },
    { dias_extras: 1, atividades: null },
  ];
  assert.equal(diasDePrazoUsados(linhas, 65), 3);
  assert.equal(diasDePrazoUsados(linhas, 66), 3);
  assert.equal(diasDePrazoUsados([], 65), 0);
  assert.equal(diasDePrazoUsados(null, 65), 0);
});
