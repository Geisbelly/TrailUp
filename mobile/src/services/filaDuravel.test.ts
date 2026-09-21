import assert from "node:assert/strict";
import test from "node:test";

import {
  ehErroPermanente,
  escoarItens,
  podarItens,
  type ItemEnfileirado,
} from "./filaDuravel";

const AGORA = 1_800_000_000_000;
const OPCOES = { maxItens: 4, validadeMs: 10_000 };

function item(enfileiradoEm: number, marca: string): ItemEnfileirado<string> {
  return { enfileiradoEm, payload: marca };
}

function marcas(itens: ItemEnfileirado<string>[]): string[] {
  return itens.map((i) => i.payload);
}

test("podarItens mantém o que ainda está dentro da validade", () => {
  const fila = [
    item(AGORA - OPCOES.validadeMs, "no-limite"),
    item(AGORA - 1_000, "recente"),
  ];
  assert.deepEqual(marcas(podarItens(fila, AGORA, OPCOES)), [
    "no-limite",
    "recente",
  ]);
});

test("podarItens descarta o vencido", () => {
  const fila = [
    item(AGORA - OPCOES.validadeMs - 1, "vencido"),
    item(AGORA - 1_000, "recente"),
  ];
  assert.deepEqual(marcas(podarItens(fila, AGORA, OPCOES)), ["recente"]);
});

test("ao estourar o teto, descarta o mais antigo e guarda o mais novo", () => {
  const fila = Array.from({ length: OPCOES.maxItens + 2 }, (_, i) =>
    item(AGORA - (OPCOES.maxItens + 2 - i) * 100, `i${i}`),
  );

  const podada = podarItens(fila, AGORA, OPCOES);

  assert.equal(podada.length, OPCOES.maxItens);
  assert.equal(marcas(podada)[0], "i2", "os dois mais antigos saíram");
  assert.equal(
    marcas(podada).at(-1),
    `i${OPCOES.maxItens + 1}`,
    "o mais novo nunca pode ser o descartado",
  );
});

test("23505 é definitivo -- e é isso que torna a retentativa de ponto segura", () => {
  // Com chave de idempotência, a segunda entrega da mesma escrita bate no
  // índice único. Se isso fosse lido como temporário, a escrita JÁ GRAVADA
  // ficaria retentando para sempre, trancando a fila atrás dela.
  assert.equal(ehErroPermanente({ code: "23505" }), true);
});

test("FK, NOT NULL e tipo inválido também são definitivos", () => {
  for (const code of ["23503", "23502", "22P02", "22007"]) {
    assert.equal(ehErroPermanente({ code }), true, code);
  }
});

test("erro sem código conhecido é retentável -- na dúvida, não perder o dado", () => {
  assert.equal(ehErroPermanente(new Error("network request failed")), false);
  assert.equal(ehErroPermanente({ code: "57014" }), false);
  assert.equal(ehErroPermanente(null), false);
  assert.equal(ehErroPermanente({ status: 500 }), false);
});

test("4xx é definitivo, menos 408 e 429", () => {
  assert.equal(ehErroPermanente({ status: 400 }), true);
  assert.equal(ehErroPermanente({ status: 422 }), true);
  assert.equal(
    ehErroPermanente({ status: 408 }),
    false,
    "timeout volta a funcionar",
  );
  assert.equal(
    ehErroPermanente({ status: 429 }),
    false,
    "rate limit não pode custar o progresso do aluno",
  );
});

test("escoarItens envia do mais antigo para o mais novo", async () => {
  const enviados: string[] = [];
  const fila = [item(AGORA - 3_000, "a"), item(AGORA - 2_000, "b")];

  const r = await escoarItens(
    fila,
    async (p) => {
      enviados.push(p);
    },
    "teste",
  );

  assert.deepEqual(enviados, ["a", "b"]);
  assert.equal(r.enviados, 2);
  assert.equal(r.descartados, 0);
  assert.equal(r.restante.length, 0);
});

test("erro retentável para a fila e preserva o item que falhou", async () => {
  const tentados: string[] = [];
  const fila = [
    item(AGORA - 3_000, "a"),
    item(AGORA - 2_000, "b"),
    item(AGORA, "c"),
  ];

  const r = await escoarItens(
    fila,
    async (p) => {
      tentados.push(p);
      if (p === "b") throw new Error("sem rede");
    },
    "teste",
  );

  assert.deepEqual(tentados, ["a", "b"], "não insiste nos seguintes");
  assert.equal(r.enviados, 1);
  assert.deepEqual(
    marcas(r.restante),
    ["b", "c"],
    "o que falhou continua na fila, e não é pulado",
  );
});

test("erro definitivo não tranca a fila atrás dele", async () => {
  const enviados: string[] = [];
  const fila = [item(AGORA - 3_000, "já-gravado"), item(AGORA, "novo")];

  const r = await escoarItens(
    fila,
    async (p) => {
      if (p === "já-gravado") throw { code: "23505" };
      enviados.push(p);
    },
    "teste",
  );

  assert.deepEqual(enviados, ["novo"], "o item seguinte chegou ao banco");
  assert.equal(r.enviados, 1);
  assert.equal(r.descartados, 1);
  assert.equal(r.restante.length, 0, "a fila esvaziou");
});
