import assert from "node:assert/strict";
import test from "node:test";

import { ALTURA_CENA_COM_TECLADO, alturaDaCena, SOBREPOSICAO } from "./alturaDaCena";

test("tela alta: a cena mantém os ~31% e a frase", () => {
  const r = alturaDaCena({ alturaTela: 915, topo: 24, alturaFolha: 560, compacta: false });
  assert.equal(r.altura, Math.round(915 * 0.31) + 28 + 24);
  assert.equal(r.comFrase, true);
});

test("tela baixa: a cena cede o que falta para a folha caber inteira", () => {
  const alturaTela = 640;
  const alturaFolha = 520;
  const r = alturaDaCena({ alturaTela, topo: 0, alturaFolha, compacta: false });
  // A folha começa SOBREPOSICAO acima do fim da cena e vai até o fim da tela: cabe exatamente.
  assert.equal(alturaTela - (r.altura - SOBREPOSICAO), alturaFolha);
  assert.ok(r.altura < Math.round(alturaTela * 0.31) + 28);
});

test("a frase sai quando a cena fica baixa demais para ela", () => {
  const r = alturaDaCena({ alturaTela: 640, topo: 0, alturaFolha: 560, compacta: false });
  assert.equal(r.comFrase, false);
});

test("nunca encolhe abaixo da faixa da marca: aí a folha rola", () => {
  const r = alturaDaCena({ alturaTela: 568, topo: 20, alturaFolha: 900, compacta: false });
  assert.equal(r.altura, 20 + ALTURA_CENA_COM_TECLADO);
  assert.equal(r.comFrase, false);
});

test("antes de medir a folha vale a altura de sempre", () => {
  const r = alturaDaCena({ alturaTela: 640, topo: 0, alturaFolha: 0, compacta: false });
  assert.equal(r.altura, Math.round(640 * 0.31) + 28);
});

test("digitando: faixa estreita, sem frase, qualquer que seja a folha", () => {
  const r = alturaDaCena({ alturaTela: 915, topo: 24, alturaFolha: 300, compacta: true });
  assert.deepEqual(r, { altura: 24 + ALTURA_CENA_COM_TECLADO, comFrase: false });
});
