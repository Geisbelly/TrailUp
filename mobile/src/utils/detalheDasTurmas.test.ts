import assert from "node:assert/strict";
import test from "node:test";
import { carregarDetalhesDasTurmas, comUmaNovaTentativa, manterDetalheAnterior } from "./detalheDasTurmas";

const semEspera = { esperar: async () => undefined };

test("uma turma que falha não derruba as outras", async () => {
  const timeout = { message: "canceling statement due to statement timeout", code: "57014" };
  const resultado = await carregarDetalhesDasTurmas(
    [32, 54, 61],
    async (classeId) => {
      if (classeId === 54) throw timeout;
      return [`tópico da ${classeId}`];
    },
    semEspera,
  );
  assert.deepEqual(resultado[0], { topicos: ["tópico da 32"], erro: null });
  assert.deepEqual(resultado[2], { topicos: ["tópico da 61"], erro: null });
  assert.deepEqual(resultado[1].topicos, []);
  assert.ok(resultado[1].erro instanceof Error);
  assert.equal(resultado[1].erro?.message, timeout.message);
  assert.equal((resultado[1].erro as Error & { code?: string }).code, "57014");
});

test("a falha passageira é refeita uma vez, depois da espera", async () => {
  const esperas: number[] = [];
  const chamadas = new Map<number, number>();
  const resultado = await carregarDetalhesDasTurmas(
    [32, 54],
    async (classeId) => {
      const n = (chamadas.get(classeId) ?? 0) + 1;
      chamadas.set(classeId, n);
      if (classeId === 54 && n === 1) throw new Error("500");
      return [classeId];
    },
    { esperaMs: 1500, esperar: async (ms) => { esperas.push(ms); } },
  );
  assert.deepEqual(resultado, [{ topicos: [32], erro: null }, { topicos: [54], erro: null }]);
  assert.deepEqual(esperas, [1500]);
  assert.equal(chamadas.get(32), 1);
  assert.equal(chamadas.get(54), 2);
});

test("são duas tentativas no máximo", async () => {
  let chamadas = 0;
  await assert.rejects(
    comUmaNovaTentativa(async () => { chamadas += 1; throw new Error(`falha ${chamadas}`); }, semEspera),
    /falha 2/,
  );
  assert.equal(chamadas, 2);
});

test("todas falhando, cada turma volta com o próprio erro", async () => {
  const resultado = await carregarDetalhesDasTurmas([1, 2], async () => { throw new Error("rede"); }, semEspera);
  assert.equal(resultado.length, 2);
  assert.ok(resultado.every((r) => r.erro?.message === "rede" && r.topicos.length === 0));
});

test("no Atualizar, a turma que falhou fica com o detalhe que já estava na tela", () => {
  const erro = new Error("500");
  const anteriores = [
    { aluno_id: "a", classe_id: 32, topicos: ["velho 32"], detalheErro: null },
    { aluno_id: "a", classe_id: 54, topicos: [], detalheErro: erro },
  ];
  const novas = [
    { aluno_id: "a", classe_id: 32, topicos: [] as unknown[], detalheErro: erro as Error | null },
    { aluno_id: "a", classe_id: 54, topicos: [] as unknown[], detalheErro: erro as Error | null },
    { aluno_id: "a", classe_id: 61, topicos: ["novo 61"] as unknown[], detalheErro: null as Error | null },
  ];
  manterDetalheAnterior(novas, anteriores);
  assert.deepEqual(novas[0], { aluno_id: "a", classe_id: 32, topicos: ["velho 32"], detalheErro: null });
  // Sem detalhe bom antes, o erro continua: a tela mostra o aviso dessa turma.
  assert.equal(novas[1].detalheErro, erro);
  assert.deepEqual(novas[2].topicos, ["novo 61"]);
});

test("não reaproveita detalhe de outro aluno", () => {
  const erro = new Error("500");
  const novas = [{ aluno_id: "b", classe_id: 32, topicos: [] as unknown[], detalheErro: erro as Error | null }];
  manterDetalheAnterior(novas, [{ aluno_id: "a", classe_id: 32, topicos: ["do outro"], detalheErro: null }]);
  assert.equal(novas[0].detalheErro, erro);
  assert.deepEqual(novas[0].topicos, []);
});
