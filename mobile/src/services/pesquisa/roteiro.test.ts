import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ETAPAS_DO_ALUNO,
  TITULOS_DO_ROTEIRO,
  andamentoDoRoteiro,
  anotacoesPorEtapa,
  lerAnotacoes,
  lerMeuRoteiro,
  mostraPainelDoRoteiro,
  proximaEtapaDoAluno,
  textoDaAnotacao,
  tituloDaEtapa,
} from "./roteiro";

test("só o aluno de teste de um avaliador vê o painel", () => {
  assert.equal(mostraPainelDoRoteiro(lerMeuRoteiro(null)), false);
  assert.equal(mostraPainelDoRoteiro(lerMeuRoteiro({ papel: "professor", marcas: [] })), false);
  assert.equal(mostraPainelDoRoteiro(lerMeuRoteiro({ papel: "outro" })), false);
  assert.equal(mostraPainelDoRoteiro(lerMeuRoteiro({ papel: "aluno", classe_id: 7, marcas: [] })), true);
});

test("lê as marcas e ignora o que não é etapa", () => {
  const roteiro = lerMeuRoteiro({ papel: "aluno", classe_id: 7, marcas: [{ etapa: "t7" }, { etapa: 3 }, null, "t8"] });
  assert.deepEqual([...(roteiro?.marcadas ?? [])], ["t7"]);
  assert.equal(roteiro?.classeId, 7);
});

test("próxima etapa do app segue a ordem e some quando tudo foi feito", () => {
  assert.equal(proximaEtapaDoAluno(new Set())?.id, "aluno-acesso");
  assert.equal(proximaEtapaDoAluno(new Set(["aluno-acesso"]))?.id, "t7");
  assert.equal(proximaEtapaDoAluno(new Set(["aluno-acesso", "t7", "t8"])), null);
});

test("andamento conta o roteiro inteiro e, à parte, o que é do app", () => {
  const a = andamentoDoRoteiro(new Set(["t1", "t7", "inventada"]));
  assert.deepEqual(a, { feitas: 2, total: TITULOS_DO_ROTEIRO.length, doApp: 1, totalDoApp: 3 });
});

test("as etapas do app estão no roteiro, na mesma ordem e com o mesmo título", () => {
  const ids = TITULOS_DO_ROTEIRO.map(([id]) => id);
  const posicoes = ETAPAS_DO_ALUNO.map((e) => ids.indexOf(e.id));
  assert.ok(posicoes.every((p) => p >= 0));
  assert.deepEqual([...posicoes].sort((a, b) => a - b), posicoes);
  for (const e of ETAPAS_DO_ALUNO) {
    assert.equal(tituloDaEtapa(e.id), e.tarefa ? `${e.tarefa}. ${e.titulo}` : e.titulo);
  }
  for (const id of ids) assert.match(id, /^[a-z0-9-]{1,40}$/);
});

test("anotações agrupadas na ordem do roteiro, soltas por último", () => {
  const anotacoes = lerAnotacoes([
    { id: 3, etapa: "t7", plataforma: "app", texto: "c", criada_em: "2026-11-23T10:02:00Z" },
    { id: 1, etapa: "t1", plataforma: "console", texto: "a", criada_em: "2026-11-23T10:00:00Z" },
    { id: 2, etapa: null, plataforma: "app", texto: "b", criada_em: "2026-11-23T10:01:00Z" },
    { id: 4, etapa: "t7", plataforma: "app", texto: "d", criada_em: "2026-11-23T10:01:30Z" },
    { id: 5, etapa: "t7", plataforma: "web", texto: "fora", criada_em: "2026-11-23T10:00:00Z" },
  ]);
  const grupos = anotacoesPorEtapa(anotacoes);
  assert.deepEqual(
    grupos.map((g) => [g.titulo, g.anotacoes.map((a) => a.texto)]),
    [
      ["T1. Conhecer a turma", ["a"]],
      ["T7. Estudar como aluno", ["d", "c"]],
      ["Sem etapa", ["b"]],
    ],
  );
});

test("texto da anotação: sem espaço sobrando e com limite", () => {
  assert.equal(textoDaAnotacao("   "), null);
  assert.equal(textoDaAnotacao("  oi  "), "oi");
  assert.equal(textoDaAnotacao("x".repeat(2500))?.length, 2000);
});
