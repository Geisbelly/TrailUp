import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBlocksForTopico,
  contarProgressoDeBlocos,
  type AtividadeResolvida,
} from "./trilhaBlocks";

const conteudo = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  titulo: `Conteudo ${id}`,
  ...extra,
});

const atividade = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  titulo: `Atividade ${id}`,
  ...extra,
});

function progresso(params: {
  conteudos: any[];
  atividades: any[];
  vistos?: number[];
  resolvidas?: number[];
}) {
  const blocks = buildBlocksForTopico(
    params.conteudos,
    params.atividades,
    "conteudo_primeiro"
  );
  const resolvidas = new Map<number, AtividadeResolvida>();
  (params.resolvidas ?? []).forEach((id) =>
    resolvidas.set(id, { correto: true, acertosPercentual: 100 })
  );

  return contarProgressoDeBlocos({
    blocks,
    conteudosVistosLocal: new Set(params.vistos ?? []),
    atividadesResolvidasLocal: resolvidas,
  });
}

test("conta conteudo e atividade no mesmo denominador", () => {
  const resultado = progresso({
    conteudos: [conteudo(1), conteudo(2)],
    atividades: [atividade(10), atividade(11)],
  });

  assert.equal(resultado.total, 4);
  assert.equal(resultado.concluidos, 0);
  assert.equal(resultado.pct, 0);
});

test("passo personalizado concluido move a barra", () => {
  // Era o bug principal: material personalizado ficava fora do somatorio, entao
  // a tela avancava e a barra ficava parada.
  const resultado = progresso({
    conteudos: [conteudo(1), conteudo(2, { isPersonalizedLocal: true })],
    atividades: [],
    vistos: [2],
  });

  assert.equal(resultado.total, 2);
  assert.equal(resultado.concluidos, 1);
  assert.equal(resultado.pct, 50);
});

test("percentual bate com a contagem exibida ao lado", () => {
  // Numerador, denominador e rotulo tem que sair do mesmo universo -- era o que
  // nao acontecia.
  const resultado = progresso({
    conteudos: [conteudo(1), conteudo(2), conteudo(3)],
    atividades: [atividade(10)],
    vistos: [1, 2],
    resolvidas: [10],
  });

  assert.equal(resultado.concluidos, 3);
  assert.equal(resultado.total, 4);
  assert.equal(Math.round(resultado.pct), 75);
});

test("tudo concluido da exatamente 100", () => {
  const resultado = progresso({
    conteudos: [conteudo(1)],
    atividades: [atividade(10)],
    vistos: [1],
    resolvidas: [10],
  });

  assert.equal(resultado.pct, 100);
});

test("status vindo do banco conta sem depender do estado local", () => {
  // Quem ja tinha concluido antes de abrir a tela nao volta pra zero.
  const resultado = progresso({
    conteudos: [conteudo(1, { status: "concluido" }), conteudo(2, { percentual_concluido: 100 })],
    atividades: [atividade(10, { resposta_aluno: "b" })],
  });

  assert.equal(resultado.concluidos, 3);
  assert.equal(resultado.pct, 100);
});

test("topico sem bloco nenhum nao divide por zero", () => {
  const resultado = progresso({ conteudos: [], atividades: [] });

  assert.equal(resultado.total, 0);
  assert.equal(resultado.pct, 0);
});

test("atividade vinculada nao e contada duas vezes", () => {
  // Ela aparece uma vez no percurso, ancorada no conteudo; contar de novo
  // inflaria o denominador e faria 100% ficar inalcancavel.
  const resultado = progresso({
    conteudos: [conteudo(1)],
    atividades: [atividade(10, { conteudo_id: 1 })],
    vistos: [1],
    resolvidas: [10],
  });

  assert.equal(resultado.total, 2);
  assert.equal(resultado.pct, 100);
});

test("pct fica entre 0 e 100 mesmo com marcacao sobrando", () => {
  // Set de vistos pode carregar id de conteudo que nao esta neste topico.
  const resultado = progresso({
    conteudos: [conteudo(1)],
    atividades: [],
    vistos: [1, 999, 1000],
  });

  assert.equal(resultado.pct, 100);
});

test("lista de blocos ausente nao quebra", () => {
  const resultado = contarProgressoDeBlocos({
    blocks: undefined as never,
    conteudosVistosLocal: new Set(),
    atividadesResolvidasLocal: new Map(),
  });

  assert.equal(resultado.total, 0);
  assert.equal(resultado.pct, 0);
});

// --- conclusao do topico ---------------------------------------------------
//
// A regra vive na tela (depende de `topico.status` e do estado de carga da
// personalizacao), mas o predicado que ela usa e este: percurso completo =
// concluidos >= total, sobre TODOS os blocos.

const percursoCompleto = (r: { total: number; concluidos: number }) =>
  r.total > 0 && r.concluidos >= r.total;

test("topico so conclui quando o passo personalizado tambem esta feito", () => {
  // Antes o passo personalizado ficava fora da conta: o topico era dado como
  // concluido com o material personalizado intocado.
  const soAcademico = progresso({
    conteudos: [conteudo(1), conteudo(2, { isPersonalizedLocal: true })],
    atividades: [atividade(10)],
    vistos: [1],
    resolvidas: [10],
  });

  assert.equal(percursoCompleto(soAcademico), false);

  const tudo = progresso({
    conteudos: [conteudo(1), conteudo(2, { isPersonalizedLocal: true })],
    atividades: [atividade(10)],
    vistos: [1, 2],
    resolvidas: [10],
  });

  assert.equal(percursoCompleto(tudo), true);
});

test("id negativo do conteudo personalizado e marcado como qualquer outro", () => {
  // normalizePersonalizedStepContent gera id negativo estavel; se a marcacao
  // nao casasse, o topico ficaria impossivel de concluir.
  const resultado = progresso({
    conteudos: [conteudo(-8172634)],
    atividades: [],
    vistos: [-8172634],
  });

  assert.equal(percursoCompleto(resultado), true);
});

test("dois personalizados distintos nao se confundem", () => {
  // Ids negativos diferentes; concluir um nao pode concluir o outro.
  const resultado = progresso({
    conteudos: [
      conteudo(-1, { isPersonalizedLocal: true }),
      conteudo(-2, { isPersonalizedLocal: true }),
    ],
    atividades: [],
    vistos: [-1],
  });

  assert.equal(resultado.concluidos, 1);
  assert.equal(percursoCompleto(resultado), false);
});

test("topico vazio nao se declara concluido", () => {
  // total 0 daria 0/0; concluir um topico sem bloco nenhum seria mentira.
  assert.equal(percursoCompleto(progresso({ conteudos: [], atividades: [] })), false);
});
