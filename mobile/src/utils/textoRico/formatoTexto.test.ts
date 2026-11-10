import assert from "node:assert/strict";
import test from "node:test";

import { formatoDoTexto, idsComTextoRico } from "./formatoTexto";

function clienteQueResponde(resposta: { data: unknown[] | null; error: unknown } | Error) {
  const chamadas: { tabela: string; colunas: string; ids: number[] }[] = [];
  const cliente = {
    from: (tabela: string) => ({
      select: (colunas: string) => ({
        in: (_coluna: string, ids: number[]) => {
          chamadas.push({ tabela, colunas, ids });
          return resposta instanceof Error ? Promise.reject(resposta) : Promise.resolve(resposta);
        },
      }),
    }),
  };
  return { cliente, chamadas };
}

test("só 'rico' exatamente é rico", () => {
  assert.equal(formatoDoTexto("rico"), "rico");
  for (const outro of ["texto", "RICO", null, undefined, 1, ""]) assert.equal(formatoDoTexto(outro), "texto");
});

test("pede só id e formato_texto, sem repetir id e sem id local negativo", async () => {
  const { cliente, chamadas } = clienteQueResponde({
    data: [
      { id: 1, formato_texto: "rico" },
      { id: 2, formato_texto: "texto" },
      { id: "3", formato_texto: "rico" },
    ],
    error: null,
  });
  const ricos = await idsComTextoRico(cliente, "questoes", [1, 2, 3, 1, -7]);
  assert.deepEqual([...ricos].sort(), [1, 3]);
  assert.deepEqual(chamadas, [{ tabela: "questoes", colunas: "id, formato_texto", ids: [1, 2, 3] }]);
});

test("banco sem a coluna (42703), sem permissão ou sem rede: tudo texto, sem lançar", async () => {
  const semColuna = clienteQueResponde({ data: null, error: { code: "42703", message: "column does not exist" } });
  assert.equal((await idsComTextoRico(semColuna.cliente, "atividades", [1])).size, 0);
  const semRede = clienteQueResponde(new Error("Network request failed"));
  assert.equal((await idsComTextoRico(semRede.cliente, "atividades", [1])).size, 0);
});

test("lista vazia não consulta", async () => {
  const { cliente, chamadas } = clienteQueResponde({ data: [], error: null });
  await idsComTextoRico(cliente, "questoes", []);
  assert.equal(chamadas.length, 0);
});
