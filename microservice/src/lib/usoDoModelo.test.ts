import assert from "node:assert/strict";
import test from "node:test";

import {
  medirUso,
  novoUso,
  registrarUso,
  registrarUsoGemini,
  registrarUsoOpenAI,
  somarUso,
} from "./usoDoModelo";

test("fora de um pedido medido, registrar não faz nada", () => {
  assert.doesNotThrow(() => registrarUso("gemini", { entrada: 10, saida: 5 }));
});

test("soma por modelo e no total, com raciocínio do Gemini na saída", async () => {
  const uso = novoUso();
  await medirUso(uso, async () => {
    registrarUsoGemini("gemini-flash", { promptTokenCount: 100, candidatesTokenCount: 40, thoughtsTokenCount: 10 });
    registrarUsoGemini("gemini-flash", { promptTokenCount: 50, candidatesTokenCount: 5 });
    registrarUsoOpenAI("gpt-4o-mini", { input_tokens: 30, output_tokens: 20 });
    registrarUsoOpenAI("gpt-4o-mini", { prompt_tokens: 3, completion_tokens: 2 });
    registrarUso("gpt-4o-mini-tts", { caracteres: 1200 });
  });
  assert.deepEqual(uso, {
    chamadas: 5,
    tokens_entrada: 183,
    tokens_saida: 77,
    caracteres: 1200,
    por_modelo: {
      "gemini-flash": { chamadas: 2, tokens_entrada: 150, tokens_saida: 55, caracteres: 0 },
      "gpt-4o-mini": { chamadas: 2, tokens_entrada: 33, tokens_saida: 22, caracteres: 0 },
      "gpt-4o-mini-tts": { chamadas: 1, tokens_entrada: 0, tokens_saida: 0, caracteres: 1200 },
    },
  });
});

test("pedidos simultâneos não misturam o uso", async () => {
  const a = novoUso();
  const b = novoUso();
  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
  await Promise.all([
    medirUso(a, async () => { await espera(5); registrarUso("m", { entrada: 1 }); }),
    medirUso(b, async () => { registrarUso("m", { entrada: 7 }); await espera(1); registrarUso("m", { entrada: 7 }); }),
  ]);
  assert.equal(a.tokens_entrada, 1);
  assert.equal(b.tokens_entrada, 14);
});

test("o uso devolvido por outro serviço entra na soma; lixo é ignorado", async () => {
  const uso = novoUso();
  await medirUso(uso, async () => {
    somarUso({ por_modelo: { "gemini-pro": { chamadas: 3, tokens_entrada: 900, tokens_saida: 400, caracteres: 0 } } });
    somarUso(null);
    somarUso({ por_modelo: "x" });
    somarUso({ por_modelo: { ruim: null, negativo: { chamadas: -2, tokens_entrada: -5 } } });
  });
  assert.equal(uso.chamadas, 3);
  assert.equal(uso.tokens_entrada, 900);
  assert.equal(uso.tokens_saida, 400);
});

test("o uso segue medido quando a função falha", async () => {
  const uso = novoUso();
  await assert.rejects(
    medirUso(uso, async () => {
      registrarUso("m", { saida: 9 });
      throw new Error("falhou");
    }),
  );
  assert.equal(uso.tokens_saida, 9);
});
