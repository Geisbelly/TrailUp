import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

/*
 * O parcial do desafio no aparelho, com o AsyncStorage e o Supabase de mentira (molde de
 * `telemetriaOutbox.concurrent.test.ts` e de `desafios.test.ts`).
 */
const guardado = new Map<string, string>();
let falharLeitura = false;
let falharEscrita = false;
const storage = {
  async getItem(chave: string) {
    if (falharLeitura) throw new Error("read failed");
    return guardado.get(chave) ?? null;
  },
  async setItem(chave: string, valor: string) {
    if (falharEscrita) throw new Error("disk full");
    guardado.set(chave, valor);
  },
  async removeItem(chave: string) {
    if (falharEscrita) throw new Error("disk full");
    guardado.delete(chave);
  },
};

type Resposta = { data: unknown; error: unknown; status?: number };
let respostaDaRpc: () => Resposta | Promise<Resposta> = () => ({ data: null, error: null });
const supabaseStub = {
  rpc: () => Promise.resolve().then(respostaDaRpc),
  from: () => {
    throw new Error("o rascunho não lê tabela");
  },
};

/* eslint-disable @typescript-eslint/no-require-imports */
(require.cache as Record<string, unknown>)[require.resolve("@react-native-async-storage/async-storage")] = {
  exports: { __esModule: true, default: storage },
};
(require.cache as Record<string, unknown>)[require.resolve("@/database/supabase")] = {
  exports: { supabase: supabaseStub },
};
const { apagarRascunho, chaveDoRascunho, conferirComRascunho, lerRascunho, salvarRascunho } =
  require("./rascunhoDoDesafio") as typeof import("./rascunhoDoDesafio");
/* eslint-enable @typescript-eslint/no-require-imports */

const GRUPO = "3f1c2a4e-0000-4000-8000-000000000001";
const ALUNO = "aluno-a";
const OUTRO_ALUNO = "aluno-b";
const CHAVE = `desafio:${ALUNO}:${GRUPO}`;
const PARCIAL = { tipo: "cruzadinha" as const, celulas: { "0,0": "B", "0,1": "A" } };
const RESPOSTA = { palavras: { "1h": "BA" } };

beforeEach(() => {
  guardado.clear();
  falharLeitura = false;
  falharEscrita = false;
  respostaDaRpc = () => ({ data: null, error: null });
});

describe("rascunho do desafio", () => {
  it("rascunho salva e relê o parcial", async () => {
    await salvarRascunho(ALUNO, GRUPO, PARCIAL);
    assert.equal(chaveDoRascunho(ALUNO, GRUPO), `desafio:aluno-a:${GRUPO}`);
    assert.ok(guardado.has(CHAVE));
    assert.deepEqual(await lerRascunho(ALUNO, GRUPO), PARCIAL);

    await salvarRascunho(ALUNO, GRUPO, { tipo: "logica", resposta: "42" });
    assert.deepEqual(await lerRascunho(ALUNO, GRUPO), { tipo: "logica", resposta: "42" });
  });

  it("rascunho é apagado ao acertar", async () => {
    await salvarRascunho(ALUNO, GRUPO, PARCIAL);
    respostaDaRpc = () => ({
      data: { acertou: true, ja_concluida: false, palavras_certas: 3, palavras_total: 3 },
      error: null,
    });
    const r = await conferirComRascunho({ alunoId: ALUNO, missaoId: 9, grupo: GRUPO, rascunho: PARCIAL, resposta: RESPOSTA });
    assert.deepEqual(r, { acertou: true, ja_concluida: false, palavras_certas: 3, palavras_total: 3 });
    assert.equal(await lerRascunho(ALUNO, GRUPO), null);
    assert.equal(guardado.has(CHAVE), false);
  });

  it("conferirDesafio com falha de rede devolve erro rede e mantém o rascunho", async () => {
    respostaDaRpc = () => ({ data: null, error: { code: "", message: "TypeError: Network request failed" }, status: 0 });
    const r = await conferirComRascunho({ alunoId: ALUNO, missaoId: 9, grupo: GRUPO, rascunho: PARCIAL, resposta: RESPOSTA });
    assert.deepEqual(r, { erro: "rede" });
    // O que estava na tela foi guardado ANTES de ir à rede, e nada o apagou.
    assert.deepEqual(await lerRascunho(ALUNO, GRUPO), PARCIAL);

    respostaDaRpc = () => {
      throw new TypeError("Network request failed");
    };
    assert.deepEqual(await conferirComRascunho({ alunoId: ALUNO, missaoId: 9, grupo: GRUPO, rascunho: PARCIAL, resposta: RESPOSTA }), {
      erro: "rede",
    });
    assert.deepEqual(await lerRascunho(ALUNO, GRUPO), PARCIAL);
  });

  it("dois alunos do mesmo grupo não veem o rascunho um do outro (tablet da escola)", async () => {
    await salvarRascunho(ALUNO, GRUPO, PARCIAL);
    assert.equal(await lerRascunho(OUTRO_ALUNO, GRUPO), null);
    await salvarRascunho(OUTRO_ALUNO, GRUPO, { tipo: "logica", resposta: "outra" });
    assert.deepEqual(await lerRascunho(ALUNO, GRUPO), PARCIAL);
    assert.deepEqual(await lerRascunho(OUTRO_ALUNO, GRUPO), { tipo: "logica", resposta: "outra" });
    // O acerto de um apaga só o dele.
    respostaDaRpc = () => ({ data: { acertou: true, ja_concluida: false, palavras_certas: 3, palavras_total: 3 }, error: null });
    await conferirComRascunho({ alunoId: OUTRO_ALUNO, missaoId: 9, grupo: GRUPO, rascunho: PARCIAL, resposta: RESPOSTA });
    assert.equal(await lerRascunho(OUTRO_ALUNO, GRUPO), null);
    assert.deepEqual(await lerRascunho(ALUNO, GRUPO), PARCIAL);
  });

  it("sem aluno, não lê nem grava rascunho, e o Conferir vai ao banco assim mesmo", async () => {
    guardado.set(`desafio:${GRUPO}`, JSON.stringify(PARCIAL));
    guardado.set(`desafio::${GRUPO}`, JSON.stringify(PARCIAL));
    assert.equal(await lerRascunho(null, GRUPO), null);
    await salvarRascunho(null, GRUPO, PARCIAL);
    await apagarRascunho(null, GRUPO);
    assert.equal(guardado.size, 2);
    respostaDaRpc = () => ({ data: { acertou: false, ja_concluida: false, palavras_certas: 1, palavras_total: 3 }, error: null });
    const r = await conferirComRascunho({ alunoId: null, missaoId: 9, grupo: GRUPO, rascunho: PARCIAL, resposta: RESPOSTA });
    assert.deepEqual(r, { acertou: false, ja_concluida: false, palavras_certas: 1, palavras_total: 3 });
    assert.equal(guardado.size, 2);
  });

  it("já resolvido antes (ja_concluida) também apaga o rascunho", async () => {
    await salvarRascunho(ALUNO, GRUPO, PARCIAL);
    respostaDaRpc = () => ({ data: { acertou: false, ja_concluida: true, palavras_certas: 1, palavras_total: 3 }, error: null });
    await conferirComRascunho({ alunoId: ALUNO, missaoId: 9, grupo: GRUPO, rascunho: PARCIAL, resposta: RESPOSTA });
    assert.equal(await lerRascunho(ALUNO, GRUPO), null);
  });

  it("errar, bater no limite ou outro erro também mantêm o rascunho", async () => {
    const casos: Resposta[] = [
      { data: { acertou: false, ja_concluida: false, palavras_certas: 1, palavras_total: 3 }, error: null },
      { data: null, error: { code: "P0001", message: "limite_de_tentativas" }, status: 400 },
      { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" }, status: 500 },
    ];
    for (const caso of casos) {
      guardado.clear();
      respostaDaRpc = () => caso;
      await conferirComRascunho({ alunoId: ALUNO, missaoId: 9, grupo: GRUPO, rascunho: PARCIAL, resposta: RESPOSTA });
      assert.deepEqual(await lerRascunho(ALUNO, GRUPO), PARCIAL, JSON.stringify(caso));
    }
  });

  it("aparelho sem espaço ou leitura quebrada não derruba a tela nem o Conferir", async () => {
    falharEscrita = true;
    await salvarRascunho(ALUNO, GRUPO, PARCIAL);
    await apagarRascunho(ALUNO, GRUPO);
    respostaDaRpc = () => ({ data: { acertou: true, ja_concluida: false, palavras_certas: 3, palavras_total: 3 }, error: null });
    const r = await conferirComRascunho({ alunoId: ALUNO, missaoId: 9, grupo: GRUPO, rascunho: PARCIAL, resposta: RESPOSTA });
    assert.equal("acertou" in r && r.acertou, true);

    falharEscrita = false;
    falharLeitura = true;
    assert.equal(await lerRascunho(ALUNO, GRUPO), null);
  });

  it("o que não é rascunho no aparelho é ignorado, casa a casa", async () => {
    guardado.set(CHAVE, "{não é json");
    assert.equal(await lerRascunho(ALUNO, GRUPO), null);
    guardado.set(CHAVE, JSON.stringify({ tipo: "outro" }));
    assert.equal(await lerRascunho(ALUNO, GRUPO), null);
    guardado.set(
      CHAVE,
      JSON.stringify({ tipo: "cruzadinha", celulas: { "0,0": "B", "0,1": 7, "x,y": "C", "1,1": "ABC", "2,2": "" } }),
    );
    assert.deepEqual(await lerRascunho(ALUNO, GRUPO), { tipo: "cruzadinha", celulas: { "0,0": "B" } });
    guardado.set(CHAVE, JSON.stringify({ tipo: "logica", resposta: 42 }));
    assert.equal(await lerRascunho(ALUNO, GRUPO), null);
  });
});
