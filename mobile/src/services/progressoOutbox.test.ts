import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_ITENS_OUTBOX,
  VALIDADE_OUTBOX_MS,
  escoarItens,
  mesclarItemOutbox,
  podarItens,
  type ItemEnfileirado,
  type ProgressoItemPayload,
} from "./progressoOutbox";

const AGORA = 1_800_000_000_000;

function basePayload(overrides: Partial<ProgressoItemPayload> = {}): ProgressoItemPayload {
  return {
    aluno_id: "aluno-1",
    personalizacao_id: 42,
    classe_id: 7,
    topico_id: 131,
    item_key: "content:192",
    item_kind: "content",
    item_title: "Conteúdo",
    status: "em_andamento",
    percentual_concluido: 20,
    acertos_percentual: null,
    tempo_gasto_min: 1,
    pontuacao_obtida: null,
    pontuacao_maxima: null,
    metadata: {},
    ...overrides,
  };
}

function item(enfileiradoEm: number, payload: Partial<ProgressoItemPayload> = {}): ItemEnfileirado {
  return { enfileiradoEm, payload: basePayload(payload) };
}

test("podarItens mantém o que ainda está dentro da validade", () => {
  const fila = [
    item(AGORA - VALIDADE_OUTBOX_MS + 1_000, { item_key: "no-limite" }),
    item(AGORA - 60_000, { item_key: "recente" }),
  ];
  assert.deepEqual(
    podarItens(fila, AGORA).map((i) => i.payload.item_key),
    ["no-limite", "recente"]
  );
});

test("podarItens descarta o item vencido", () => {
  const fila = [
    item(AGORA - VALIDADE_OUTBOX_MS - 1, { item_key: "vencido" }),
    item(AGORA - 60_000, { item_key: "recente" }),
  ];
  assert.deepEqual(
    podarItens(fila, AGORA).map((i) => i.payload.item_key),
    ["recente"]
  );
});

test("ao estourar o teto, descarta o mais antigo e guarda o mais novo", () => {
  const fila = Array.from({ length: MAX_ITENS_OUTBOX + 3 }, (_, i) =>
    item(AGORA - (MAX_ITENS_OUTBOX + 3 - i) * 1_000, { item_key: `i${i}` })
  );
  const podada = podarItens(fila, AGORA);

  assert.equal(podada.length, MAX_ITENS_OUTBOX);
  assert.equal(podada[0].payload.item_key, "i3");
  assert.equal(podada.at(-1)!.payload.item_key, `i${MAX_ITENS_OUTBOX + 2}`);
});

test("escoarItens envia do mais antigo para o mais novo", async () => {
  const enviados: string[] = [];
  const fila = [
    item(AGORA - 3_000, { item_key: "a" }),
    item(AGORA - 2_000, { item_key: "b" }),
  ];

  const r = await escoarItens(fila, async (p) => {
    enviados.push(p.item_key);
  });

  assert.deepEqual(enviados, ["a", "b"]);
  assert.equal(r.enviados, 2);
  assert.deepEqual(r.restante, []);
});

test("escoarItens para no primeiro erro e preserva o que faltou", async () => {
  const tentados: string[] = [];
  const fila = [
    item(AGORA - 3_000, { item_key: "a" }),
    item(AGORA - 2_000, { item_key: "b" }),
    item(AGORA - 1_000, { item_key: "c" }),
  ];

  const r = await escoarItens(fila, async (p) => {
    tentados.push(p.item_key);
    if (p.item_key === "b") throw new Error("rede fora");
  });

  assert.deepEqual(tentados, ["a", "b"]);
  assert.equal(r.enviados, 1);
  assert.deepEqual(r.restante.map((i) => i.payload.item_key), ["b", "c"]);
});

test("mesclarItemOutbox nunca regride percentual nem status concluído", () => {
  const atual = item(AGORA - 5_000, { percentual_concluido: 60, status: "concluido", tempo_gasto_min: 2 });
  const novo = item(AGORA, { percentual_concluido: 30, status: "em_andamento", tempo_gasto_min: 1 });

  const mesclado = mesclarItemOutbox(atual, novo);

  assert.equal(mesclado.payload.percentual_concluido, 60);
  assert.equal(mesclado.payload.status, "concluido");
});

test("mesclarItemOutbox soma tempo_gasto_min em vez de substituir", () => {
  const atual = item(AGORA - 5_000, { tempo_gasto_min: 2 });
  const novo = item(AGORA, { tempo_gasto_min: 1.5 });

  const mesclado = mesclarItemOutbox(atual, novo);

  assert.equal(mesclado.payload.tempo_gasto_min, 3.5);
});

test("mesclarItemOutbox usa o máximo de acertos_percentual, preservando null como ausência", () => {
  const atual = item(AGORA - 5_000, { acertos_percentual: 40 });
  const semAcerto = item(AGORA, { acertos_percentual: null });

  assert.equal(mesclarItemOutbox(atual, semAcerto).payload.acertos_percentual, 40);
  assert.equal(
    mesclarItemOutbox(item(AGORA - 5_000, { acertos_percentual: 40 }), item(AGORA, { acertos_percentual: 90 }))
      .payload.acertos_percentual,
    90
  );
});
