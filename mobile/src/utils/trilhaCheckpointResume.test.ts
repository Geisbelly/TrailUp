import assert from "node:assert/strict";
import test from "node:test";

import { buildBlocksForTopico, resolveCheckpointPosition } from "./trilhaBlocks";

const conteudo = (id: number) => ({ id, titulo: `Conteudo ${id}` });
const atividade = (id: number) => ({ id, titulo: `Atividade ${id}` });

// Personalizados entram com id negativo estavel (normalizePersonalizedStepContent)
// e vao pro fim da ordem.
const blocosDoProfessor = () =>
  buildBlocksForTopico([conteudo(1), conteudo(2)], [atividade(10)], "conteudo_primeiro");

const blocosCompletos = () =>
  buildBlocksForTopico(
    [conteudo(1), conteudo(2), conteudo(-999)],
    [atividade(10)],
    "conteudo_primeiro"
  );

test("acha o bloco onde o aluno parou", () => {
  assert.equal(resolveCheckpointPosition(blocosDoProfessor(), "conteudo", 2), 1);
});

test("checkpoint em bloco personalizado nao resolve na lista parcial", () => {
  // E o coracao do bug: enquanto a personalizacao carrega, `blocks` so tem o
  // material do professor. Resolver aqui devolve -1, o hook cai no fallback de
  // inicio e marca primeiraVez=false -- nao tenta de novo quando o resto chega.
  assert.equal(resolveCheckpointPosition(blocosDoProfessor(), "conteudo", -999), -1);
});

test("com a lista completa, o mesmo checkpoint resolve", () => {
  // Por isso a hidratacao passou a esperar `blocosProntos`.
  assert.ok(resolveCheckpointPosition(blocosCompletos(), "conteudo", -999) >= 0);
});

test("atividade e conteudo de mesmo id nao se confundem", () => {
  const blocks = buildBlocksForTopico([conteudo(7)], [atividade(7)], "conteudo_primeiro");

  assert.notEqual(
    resolveCheckpointPosition(blocks, "conteudo", 7),
    resolveCheckpointPosition(blocks, "atividade", 7)
  );
});

test("checkpoint sem bloco gravado nao aponta pra lugar nenhum", () => {
  assert.equal(resolveCheckpointPosition(blocosDoProfessor(), null, 2), -1);
  assert.equal(resolveCheckpointPosition(blocosDoProfessor(), "conteudo", null), -1);
});

test("bloco que saiu do topico nao resolve", () => {
  // Professor removeu o conteudo: melhor cair no fallback do que apontar pro
  // indice errado.
  assert.equal(resolveCheckpointPosition(blocosDoProfessor(), "conteudo", 4242), -1);
});
