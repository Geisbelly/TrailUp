import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_LOTES_OUTBOX,
  VALIDADE_OUTBOX_MS,
  escoarLotes,
  podarLotes,
  type LoteEnfileirado,
} from "./telemetriaOutbox";

const AGORA = 1_800_000_000_000;

function lote(enfileiradoEm: number, marca: string): LoteEnfileirado {
  return { enfileiradoEm, payload: { sessao_id: marca } as any };
}

function marcas(lotes: LoteEnfileirado[]): string[] {
  return lotes.map((l) => String(l.payload.sessao_id));
}

test("podarLotes mantém o que ainda está dentro da validade", () => {
  const fila = [
    lote(AGORA - VALIDADE_OUTBOX_MS + 1_000, "no-limite"),
    lote(AGORA - 60_000, "recente"),
  ];
  assert.deepEqual(marcas(podarLotes(fila, AGORA)), ["no-limite", "recente"]);
});

test("podarLotes descarta o lote vencido", () => {
  const fila = [
    lote(AGORA - VALIDADE_OUTBOX_MS - 1, "vencido"),
    lote(AGORA - 60_000, "recente"),
  ];
  assert.deepEqual(marcas(podarLotes(fila, AGORA)), ["recente"]);
});

test("ao estourar o teto, descarta o mais antigo e guarda o mais novo", () => {
  const fila = Array.from({ length: MAX_LOTES_OUTBOX + 3 }, (_, i) =>
    lote(AGORA - (MAX_LOTES_OUTBOX + 3 - i) * 1_000, `l${i}`)
  );
  const podada = podarLotes(fila, AGORA);

  assert.equal(podada.length, MAX_LOTES_OUTBOX);
  // O primeiro sobrevivente é o quarto original: os três mais antigos caíram.
  assert.equal(marcas(podada)[0], "l3");
  assert.equal(
    marcas(podada).at(-1),
    `l${MAX_LOTES_OUTBOX + 2}`,
    "o mais novo nunca pode ser o descartado"
  );
});

test("escoarLotes envia do mais antigo para o mais novo", async () => {
  const enviados: string[] = [];
  const fila = [lote(AGORA - 3_000, "a"), lote(AGORA - 2_000, "b")];

  const r = await escoarLotes(fila, async (p) => {
    enviados.push(String(p.sessao_id));
  });

  assert.deepEqual(enviados, ["a", "b"]);
  assert.equal(r.enviados, 2);
  assert.deepEqual(r.restante, []);
});

test("escoarLotes para no primeiro erro e preserva o que faltou", async () => {
  const tentados: string[] = [];
  const fila = [
    lote(AGORA - 3_000, "a"),
    lote(AGORA - 2_000, "b"),
    lote(AGORA - 1_000, "c"),
  ];

  const r = await escoarLotes(fila, async (p) => {
    const marca = String(p.sessao_id);
    tentados.push(marca);
    if (marca === "b") throw new Error("rede fora");
  });

  // Se o envio ainda não voltou, insistir em "c" só gastaria bateria.
  assert.deepEqual(tentados, ["a", "b"]);
  assert.equal(r.enviados, 1);
  // "a" saiu da fila mesmo com a falha seguinte: progresso parcial não volta.
  assert.deepEqual(marcas(r.restante), ["b", "c"]);
});

test("escoarLotes com fila vazia não chama o envio", async () => {
  let chamadas = 0;
  const r = await escoarLotes([], async () => {
    chamadas += 1;
  });

  assert.equal(chamadas, 0);
  assert.equal(r.enviados, 0);
});
