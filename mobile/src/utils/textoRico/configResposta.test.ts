import assert from "node:assert/strict";
import test from "node:test";

import { configsDaResposta, lerConfigResposta } from "./configResposta";

test("lê só o público, e o que vier torto vira vazio", () => {
  assert.deepEqual(lerConfigResposta({ linguagem: " python " }), { linguagem: "python", variaveis: [], dimensao: null });
  assert.deepEqual(lerConfigResposta('{"variaveis":["x"," y ",3,""]}'), { linguagem: null, variaveis: ["x", "y"], dimensao: null });
  assert.deepEqual(lerConfigResposta({ dimensao: "velocidade", tolerancia: 0.01 }), {
    linguagem: null,
    variaveis: [],
    dimensao: "velocidade",
  });
  assert.deepEqual(lerConfigResposta("{quebrado"), { linguagem: null, variaveis: [], dimensao: null });
  assert.deepEqual(lerConfigResposta([1]), { linguagem: null, variaveis: [], dimensao: null });
});

function cliente(resposta: { data: unknown[] | null; error: unknown } | Error) {
  const pedidos: { tabela: string; colunas: string; ids: number[] }[] = [];
  return {
    pedidos,
    from: (tabela: string) => ({
      select: (colunas: string) => ({
        in: (_coluna: string, ids: number[]) => {
          pedidos.push({ tabela, colunas, ids });
          return resposta instanceof Error ? Promise.reject(resposta) : Promise.resolve(resposta);
        },
      }),
    }),
  };
}

test("consulta só a coluna, uma vez, sem id repetido nem inválido", async () => {
  const c = cliente({ data: [{ id: 7, config_resposta: { linguagem: "java" } }, { id: 8, config_resposta: null }], error: null });
  const configs = await configsDaResposta(c, [7, 7, 8, -3, Number.NaN]);
  assert.deepEqual(c.pedidos, [{ tabela: "questoes", colunas: "id, config_resposta", ids: [7, 8] }]);
  assert.equal(configs.get(7)?.linguagem, "java");
  assert.equal(configs.has(8), false);
});

test("banco sem a coluna, ou rede caída, não derruba nada", async () => {
  assert.equal((await configsDaResposta(cliente({ data: null, error: { code: "42703" } }), [1])).size, 0);
  assert.equal((await configsDaResposta(cliente(new Error("rede")), [1])).size, 0);
  const vazio = cliente({ data: [], error: null });
  await configsDaResposta(vazio, []);
  assert.equal(vazio.pedidos.length, 0);
});
