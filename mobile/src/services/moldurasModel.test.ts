import assert from "node:assert/strict";
import test from "node:test";

import { molduras } from "@/constants/molduras";
import { FRAME_CANVAS_SIZE, getFrameLayout } from "@/utils/profileFrameLayout";
import { lerCatalogo, mensagemDeErro } from "./moldurasModel";

test("catálogo: lê a linha da RPC e descarta moldura que este build não desenha", () => {
  const r = lerCatalogo([
    { codigo: "folhagem", nome: "Folhagem", origem: "loja", preco: 20, como_ganhar: "20 moedas na loja", tenho: false, equipada: false },
    { codigo: "geada", nome: "Geada", origem: "conquista", preco: null, como_ganhar: "Conquista: X", tenho: true, equipada: true },
    { codigo: "moldura_do_futuro", nome: "Nova", origem: "loja", preco: 30 },
    { codigo: "rosa", nome: "Rosa", origem: "outra_origem" },
  ]);
  assert.deepEqual(r.map((m) => [m.codigo, m.preco, m.tenho, m.equipada]), [
    ["folhagem", 20, false, false],
    ["geada", null, true, true],
  ]);
  assert.deepEqual(lerCatalogo(null), []);
});

test("erro de negócio vira frase; ok não é erro", () => {
  assert.equal(mensagemDeErro({ ok: true }), null);
  assert.equal(mensagemDeErro({ ok: false, erro: "saldo_insuficiente" }), "Moedas insuficientes para esta moldura.");
  assert.equal(mensagemDeErro({ ok: false, erro: "algo_novo" }), "Não foi possível concluir. Tente de novo.");
});

test("toda moldura extra tem abertura que cabe na tela de 256 e centraliza a foto", () => {
  const codigos = Object.keys(molduras);
  assert.equal(codigos.length, 40);
  for (const codigo of codigos) {
    const { opening } = molduras[codigo];
    for (const size of [40, 88, 104, 160]) {
      const { photoSize, photoLeft, photoTop } = getFrameLayout(opening, size);
      const scale = size / FRAME_CANVAS_SIZE;
      assert.ok(Math.abs(photoLeft + photoSize / 2 - opening.x * scale) < 1e-9, codigo);
      assert.ok(photoLeft >= 0 && photoTop >= 0 && photoLeft + photoSize <= size && photoTop + photoSize <= size, codigo);
    }
  }
});
