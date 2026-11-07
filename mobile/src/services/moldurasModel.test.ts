import assert from "node:assert/strict";
import test from "node:test";

import { molduras } from "@/constants/molduras";
import { definirMoldurasRemotas, molduraRemota } from "@/utils/moldurasRemotas";
import { FRAME_CANVAS_SIZE, getFrameLayout } from "@/utils/profileFrameLayout";
import { lerCatalogo, mensagemDeErro, moldurasDaSecao, type MolduraDoCatalogo } from "./moldurasModel";

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

test("moldura com imagem cadastrada entra no catálogo mesmo sem desenho no pacote", () => {
  const linha = { codigo: "nova_do_console", nome: "Nova", origem: "loja", preco: 10 };
  definirMoldurasRemotas([]);
  assert.deepEqual(lerCatalogo([linha]), []);
  definirMoldurasRemotas([{ codigo: "nova_do_console", imagem_url: "https://x/y.webp", abertura: { x: 128, y: 128, radius: 90 } }]);
  assert.equal(lerCatalogo([linha]).length, 1);
  definirMoldurasRemotas([]);
});

test("imagem cadastrada: guarda URI e abertura, e ignora linha incompleta", () => {
  definirMoldurasRemotas([
    { codigo: "boa", imagem_url: "https://x/y.webp", abertura: { x: 120, y: 130, radius: 80 } },
    { codigo: "http", imagem_url: "http://x/y.webp", abertura: { x: 1, y: 1, radius: 1 } },
    { codigo: "sem_abertura", imagem_url: "https://x/y.webp", abertura: { x: 1 } },
    { imagem_url: "https://x/y.webp", abertura: { x: 1, y: 1, radius: 1 } },
    null,
  ]);
  assert.deepEqual(molduraRemota("boa"), { source: { uri: "https://x/y.webp" }, opening: { x: 120, y: 130, radius: 80 } });
  assert.equal(molduraRemota("http"), null);
  assert.equal(molduraRemota("sem_abertura"), null);
  assert.equal(molduraRemota("toString"), null);
  definirMoldurasRemotas(null);
  assert.equal(molduraRemota("boa"), null);
});

test("seções: Loja vende, Conquistas reúne conquista e rara, Bag mostra só as que o aluno tem", () => {
  const m = (codigo: string, origem: MolduraDoCatalogo["origem"], tenho: boolean): MolduraDoCatalogo =>
    ({ codigo, nome: codigo, origem, preco: origem === "loja" ? 10 : null, comoGanhar: "", tenho, equipada: false });
  const itens = [m("a", "loja", false), m("b", "loja", true), m("c", "conquista", false), m("d", "acao", true)];
  assert.deepEqual(moldurasDaSecao(itens, "loja").map((x) => x.codigo), ["a", "b"]);
  assert.deepEqual(moldurasDaSecao(itens, "conquistas").map((x) => x.codigo), ["c", "d"]);
  assert.deepEqual(moldurasDaSecao(itens, "minhas").map((x) => x.codigo), ["b", "d"]);
});
