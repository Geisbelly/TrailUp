import assert from "node:assert/strict";
import test from "node:test";

import {
  chaveDoItem,
  contarDestaquesDoTopico,
  resumirAlteracoes,
  type LinhaAlteracaoAluno,
} from "./alteracoesDoProfessor";

function linha(campos: Partial<LinhaAlteracaoAluno>): LinhaAlteracaoAluno {
  return {
    id: 1,
    conteudo_id: null,
    atividade_id: 500,
    topico_id: 10,
    decisao_efetiva: "destacar",
    resumo: null,
    vista_em: null,
    revisada_em: null,
    ...campos,
  };
}

test("sem decisao e cosmetica nao viram destaque", () => {
  const r = resumirAlteracoes([
    linha({ id: 1, decisao_efetiva: "pendente_analise" }),
    linha({ id: 2, atividade_id: 501, decisao_efetiva: "cosmetica" }),
  ]);
  assert.equal(r.destaques.size, 0);
  assert.equal(r.revisoesPendentes.size, 0);
});

test("destaque some quando visto; a revisao so quando refeita", () => {
  const vista = "2026-11-01T12:00:00Z";
  const r = resumirAlteracoes([
    linha({ id: 1, decisao_efetiva: "revisar", resumo: "A questão 2 mudou.", vista_em: vista }),
    linha({ id: 2, atividade_id: null, conteudo_id: 700, resumo: "Texto reescrito." }),
  ]);
  assert.deepEqual([...r.destaques.keys()], [chaveDoItem("conteudo", 700)]);
  assert.deepEqual(r.revisoesPendentes.get(500), { resumo: "A questão 2 mudou." });

  const refeita = resumirAlteracoes([linha({ decisao_efetiva: "revisar", vista_em: vista, revisada_em: vista })]);
  assert.equal(refeita.revisoesPendentes.size, 0);
});

test("varias alteracoes no mesmo item: vale o resumo da mais nova que tem resumo", () => {
  const r = resumirAlteracoes([
    linha({ id: 3, resumo: "  " }),
    linha({ id: 1, resumo: "Primeira." }),
    linha({ id: 2, resumo: "Segunda." }),
  ]);
  assert.deepEqual(r.destaques.get(chaveDoItem("atividade", 500)), { resumo: "Segunda." });
});

test("contagem por topico", () => {
  const linhas = [
    linha({ id: 1 }),
    linha({ id: 2, atividade_id: 501 }),
    linha({ id: 3, atividade_id: 502, topico_id: 11 }),
    linha({ id: 4, atividade_id: 503, vista_em: "2026-11-01T12:00:00Z" }),
  ];
  assert.equal(contarDestaquesDoTopico(linhas, 10), 2);
  assert.equal(contarDestaquesDoTopico(linhas, 11), 1);
});
