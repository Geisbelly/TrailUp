import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_LOTES_OUTBOX,
  VALIDADE_OUTBOX_MS,
  ehErroPermanente,
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

// ---------------------------------------------------------------------------
// A4: um lote definitivamente rejeitado nao pode trancar a fila
// ---------------------------------------------------------------------------

/** Erro do PostgREST/Postgres como ele chega: objeto com `code`. */
function erroDoBanco(code: string) {
  return Object.assign(new Error(`erro ${code}`), { code });
}

test("lote ja gravado (23505) e descartado e a fila SEGUE", async () => {
  // O caso que motivou A4: a resposta se perde depois de a gravacao dar certo,
  // o lote volta pela fila e a chave unica o rejeita para sempre. Antes ele
  // ficava na cabeca trancando todos os outros ate vencerem os 7 dias.
  const tentados: string[] = [];
  const fila = [
    lote(AGORA - 3_000, "duplicado"),
    lote(AGORA - 2_000, "b"),
    lote(AGORA - 1_000, "c"),
  ];

  const r = await escoarLotes(fila, async (p) => {
    const marca = String(p.sessao_id);
    tentados.push(marca);
    if (marca === "duplicado") throw erroDoBanco("23505");
  });

  assert.deepEqual(tentados, ["duplicado", "b", "c"], "os de tras precisam passar");
  assert.equal(r.enviados, 2);
  assert.equal(r.descartados, 1);
  assert.deepEqual(r.restante, [], "a fila esvazia");
});

test("FK quebrada (23503) tambem nao tranca", async () => {
  // Acontece de verdade: classe removida com telemetria pendente (ver a issue da
  // limpeza de classe). O lote nunca vai ser aceito.
  const fila = [lote(AGORA - 2_000, "orfao"), lote(AGORA - 1_000, "bom")];

  const r = await escoarLotes(fila, async (p) => {
    if (String(p.sessao_id) === "orfao") throw erroDoBanco("23503");
  });

  assert.equal(r.enviados, 1);
  assert.equal(r.descartados, 1);
  assert.deepEqual(r.restante, []);
});

test("erro de rede continua parando a fila", async () => {
  // A distincao e o ponto: "ainda nao da" preserva, "nunca vai passar" descarta.
  const tentados: string[] = [];
  const fila = [lote(AGORA - 2_000, "a"), lote(AGORA - 1_000, "b")];

  const r = await escoarLotes(fila, async (p) => {
    tentados.push(String(p.sessao_id));
    throw new Error("Network request failed");
  });

  assert.deepEqual(tentados, ["a"], "nao insiste nos seguintes");
  assert.equal(r.enviados, 0);
  assert.equal(r.descartados, 0);
  assert.deepEqual(marcas(r.restante), ["a", "b"], "nada e perdido");
});

test("erro desconhecido preserva o lote: na duvida, retentar", async () => {
  // Descartar por um erro que era temporario perde tempo de estudo para sempre.
  const r = await escoarLotes([lote(AGORA - 1_000, "a")], async () => {
    throw new Error("algo inesperado sem codigo");
  });

  assert.equal(r.descartados, 0);
  assert.deepEqual(marcas(r.restante), ["a"]);
});

test("ehErroPermanente separa validacao de indisponibilidade", () => {
  assert.equal(ehErroPermanente(erroDoBanco("23505")), true);
  assert.equal(ehErroPermanente(erroDoBanco("23503")), true);
  assert.equal(ehErroPermanente({ status: 422 }), true);
  assert.equal(ehErroPermanente({ status: 400 }), true);

  // Temporarios: precisam ser retentados.
  assert.equal(ehErroPermanente({ status: 429 }), false, "rate limit passa depois");
  assert.equal(ehErroPermanente({ status: 408 }), false, "timeout passa depois");
  assert.equal(ehErroPermanente({ status: 500 }), false);
  assert.equal(ehErroPermanente({ status: 503 }), false, "API hibernando");
  assert.equal(ehErroPermanente(new Error("Network request failed")), false);
  assert.equal(ehErroPermanente(null), false);
});
