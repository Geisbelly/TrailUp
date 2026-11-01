import assert from "node:assert/strict";
import test from "node:test";

import { ladoDoBalao, retanguloDoDestaque, setaDoBalao } from "@/utils/destaqueTour.core";

const tela = { width: 375, height: 812 };
// Botão "?" da Trilha, medido no preview web (375×812).
const botaoGuia = { x: 323, y: 18, width: 32, height: 32 };

test("na web o recorte fica em cima do elemento, com o respiro de 8 px", () => {
  assert.deepEqual(retanguloDoDestaque(botaoGuia, tela, { plataforma: "web", insetTopo: 0 }), {
    top: 10,
    left: 315,
    width: 48,
    height: 48,
  });
});

test("no iOS a barra de status não é somada: a medida já parte do topo da tela", () => {
  const ios = retanguloDoDestaque({ x: 16, y: 120, width: 343, height: 60 }, tela, { plataforma: "ios", insetTopo: 59 });
  assert.equal(ios?.top, 112);
});

test("no Android a barra de status é somada: a medida começa abaixo dela", () => {
  const android = retanguloDoDestaque({ x: 16, y: 120, width: 343, height: 60 }, tela, { plataforma: "android", insetTopo: 32 });
  assert.equal(android?.top, 144);
});

test("o recorte é preso à tela sem perder o lado oposto", () => {
  const largo = retanguloDoDestaque({ x: 0, y: 700, width: 375, height: 200 }, tela, { plataforma: "web", insetTopo: 0 });
  assert.deepEqual(largo, { top: 692, left: 0, width: 375, height: 120 });
  const canto = retanguloDoDestaque({ x: 350, y: 4, width: 60, height: 30 }, tela, { plataforma: "web", insetTopo: 0 });
  assert.deepEqual(canto, { top: 0, left: 342, width: 33, height: 42 });
});

test("sem tamanho ainda (tela trocando) não há recorte", () => {
  assert.equal(retanguloDoDestaque({ x: 10, y: 10, width: 0, height: 0 }, tela, { plataforma: "web", insetTopo: 0 }), null);
  assert.equal(retanguloDoDestaque({ x: 10, y: 10, width: 300, height: 1 }, tela, { plataforma: "web", insetTopo: 0 }), null);
});

test("inteiro fora da tela não há recorte, nem grampeado na borda", () => {
  const opcoes = { plataforma: "web", insetTopo: 0 };
  assert.equal(retanguloDoDestaque({ x: 16, y: 900, width: 343, height: 60 }, tela, opcoes), null);
  assert.equal(retanguloDoDestaque({ x: 16, y: -80, width: 343, height: 60 }, tela, opcoes), null);
  // Tela entrando pela direita, no meio da animação de troca.
  assert.equal(retanguloDoDestaque({ x: 400, y: 120, width: 343, height: 60 }, tela, opcoes), null);
  assert.equal(retanguloDoDestaque({ x: -400, y: 120, width: 343, height: 60 }, tela, opcoes), null);
});

test("no Android o fora da tela é decidido depois de somar a barra de status", () => {
  // y = 790 + 32 de barra passa da altura: fora.
  assert.equal(retanguloDoDestaque({ x: 16, y: 790, width: 343, height: 10 }, tela, { plataforma: "android", insetTopo: 32 }), null);
});

// Balão do celular: de `dialogLeft` (105) até 12 px da borda direita.
const balaoX = { left: 105, right: 363 };

test("balão abaixo do alvo: a seta sobe da borda de cima do balão até a de baixo do alvo", () => {
  // Interruptor do Chat, na metade de baixo da tela, com o balão logo embaixo.
  const chat = { top: 380, left: 10, width: 355, height: 90 };
  const balao = { ...balaoX, top: 482, height: 230 };
  assert.equal(ladoDoBalao(chat, balao), "abaixo");
  assert.deepEqual(setaDoBalao(chat, balao, 375), { inicio: { x: 234, y: 482 }, fim: { x: 187.5, y: 470 } });
});

test("balão acima do alvo: a seta desce da borda de baixo do balão até a de cima do alvo", () => {
  const abas = { top: 730, left: 0, width: 375, height: 82 };
  const balao = { ...balaoX, top: 470, height: 248 };
  assert.equal(ladoDoBalao(abas, balao), "acima");
  assert.deepEqual(setaDoBalao(abas, balao, 375), { inicio: { x: 234, y: 718 }, fim: { x: 187.5, y: 730 } });
});

test("balão por cima de um alvo alto: sem seta, para a ponta não cair no vizinho", () => {
  // Lista das Configurações: a ponta parava no campo "Pesquisar".
  const lista = { top: 172, left: 18, width: 339, height: 640 };
  const balao = { ...balaoX, top: 578, height: 214 };
  assert.equal(ladoDoBalao(lista, balao), "sobre");
  assert.equal(setaDoBalao(lista, balao, 375), null);
});

test("a ponta da seta fica longe das bordas laterais", () => {
  const botaoGuia = { top: 10, left: 315, width: 48, height: 48 };
  const seta = setaDoBalao(botaoGuia, { ...balaoX, top: 70, height: 200 }, 375);
  assert.equal(seta?.fim.x, 339);
  const cantoEsquerdo = setaDoBalao({ top: 10, left: 0, width: 20, height: 20 }, { ...balaoX, top: 70, height: 200 }, 375);
  assert.equal(cantoEsquerdo?.fim.x, 22);
});
