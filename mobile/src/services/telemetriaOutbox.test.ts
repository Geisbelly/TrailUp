import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_LOTES_OUTBOX,
  VALIDADE_OUTBOX_MS,
  escoarLotes,
  podarLotes,
  registrarFalha,
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

test('resposta persisted:false não remove o lote pendente', async () => {
  const fila = [lote(AGORA, 'a')];
  const result = await escoarLotes(fila, async () => ({ persisted: false }));
  assert.equal(result.enviados, 0);
  assert.deepEqual(result.restante, fila);
});

// --- Teto de tentativas (issue #94, metade que faltava) ---------------------

test("escoarLotes diz QUAL lote falhou, nao so quantos passaram", async () => {
  const fila = [lote(AGORA, "a"), lote(AGORA, "b"), lote(AGORA, "c")];
  const r = await escoarLotes(fila, async (p) => {
    if (p.sessao_id === "b") throw new Error("recusado");
    return { persisted: true };
  });
  assert.equal(r.enviados, 1);
  assert.equal(r.falhou?.payload.sessao_id, "b");
});

test("sem falha, nao ha quem culpar", async () => {
  const r = await escoarLotes([lote(AGORA, "a")], async () => ({ persisted: true }));
  assert.equal(r.falhou, null);
  assert.equal(r.enviados, 1);
});

test("a fila CONTINUA parando no primeiro erro", async () => {
  // O `break` e deliberado: se a rede caiu, insistir so gasta bateria.
  const tentados: string[] = [];
  const fila = [lote(AGORA, "a"), lote(AGORA, "b"), lote(AGORA, "c")];
  await escoarLotes(fila, async (p) => {
    tentados.push(p.sessao_id);
    throw new Error("rede fora");
  });
  assert.deepEqual(tentados, ["a"]);
});

test("falha abaixo do teto apenas conta, e o lote permanece", () => {
  const fila = [lote(AGORA, "a"), lote(AGORA, "b")];
  const r = registrarFalha(fila, fila[0], 5);
  assert.equal(r.descartado, null);
  assert.equal(r.fila.length, 2);
  assert.equal(r.fila[0].tentativas, 1);
  assert.equal(r.fila[1].tentativas ?? 0, 0, "o lote de tras nao e penalizado");
});

test("ao passar do teto, o lote sai e a fila volta a andar", () => {
  // O defeito da issue: um lote ruim bloqueava os de tras por sete dias.
  let fila = [{ ...lote(AGORA, "ruim"), tentativas: 4 }, lote(AGORA, "bom")];
  const r = registrarFalha(fila, fila[0], 5);
  assert.equal(r.descartado?.payload.sessao_id, "ruim");
  assert.equal(r.fila.length, 1);
  assert.equal(r.fila[0].payload.sessao_id, "bom");
});

test("cinco falhas seguidas descartam; quatro nao", () => {
  let fila = [lote(AGORA, "x"), lote(AGORA, "y")];
  for (let i = 1; i <= 4; i += 1) {
    const r = registrarFalha(fila, fila[0], 5);
    assert.equal(r.descartado, null, `tentativa ${i} nao deveria descartar`);
    assert.equal(r.fila[0].tentativas, i);
    fila = r.fila;
  }
  const quinta = registrarFalha(fila, fila[0], 5);
  assert.equal(quinta.descartado?.payload.sessao_id, "x");
  assert.equal(quinta.fila.length, 1);
});

test("sucesso nao e punido: lote que nao falhou nao acumula tentativa", () => {
  const fila = [lote(AGORA, "a"), lote(AGORA, "b")];
  const r = registrarFalha(fila, fila[1], 5);
  assert.equal(r.fila[0].tentativas ?? 0, 0);
  assert.equal(r.fila[1].tentativas, 1);
});

test("falha em lote que ja saiu da fila nao quebra nem inventa linha", () => {
  const fila = [lote(AGORA, "a")];
  const r = registrarFalha(fila, lote(AGORA, "sumiu"), 5);
  assert.equal(r.descartado, null);
  assert.deepEqual(r.fila.map((i) => i.payload.sessao_id), ["a"]);
});

test("falha nula e no-op", () => {
  const fila = [lote(AGORA, "a")];
  const r = registrarFalha(fila, null, 5);
  assert.equal(r.fila, fila);
  assert.equal(r.descartado, null);
});
