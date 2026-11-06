import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { assumirReproducao, soltarReproducao, type DonoDaReproducao } from "./controleDeAudio";
import { criarNarracaoDoDeck } from "./narracaoDoDeck";

function narracaoFalsa() {
  const chamadas: string[] = [];
  const narracao = criarNarracaoDoDeck({
    pararVozDoApp: () => chamadas.push("app"),
    pararVozDoDeck: () => chamadas.push("deck"),
  });
  return { narracao, chamadas };
}

function outraMidia() {
  const midia = {
    pausadas: 0,
    dono: {
      pausar: () => {
        midia.pausadas += 1;
        soltarReproducao(midia.dono);
      },
    } satisfies DonoDaReproducao,
  };
  return midia;
}

test("sair da tela cala as duas vozes", () => {
  const { narracao, chamadas } = narracaoFalsa();
  narracao.comecou("u1");

  narracao.pausar();

  assert.deepEqual(chamadas, ["app", "deck"]);
});

test("falha na voz do app nao deixa a voz do deck ligada", () => {
  const chamadas: string[] = [];
  const narracao = criarNarracaoDoDeck({
    pararVozDoApp: () => {
      throw new Error("modulo nativo fora");
    },
    pararVozDoDeck: () => chamadas.push("deck"),
  });

  narracao.pausar();

  assert.deepEqual(chamadas, ["deck"]);
});

test("tocar audio ou video cala a narracao", () => {
  const { narracao, chamadas } = narracaoFalsa();
  const midia = outraMidia();
  narracao.comecou("u1");

  assumirReproducao(midia.dono);

  assert.deepEqual(chamadas, ["app", "deck"]);
  soltarReproducao(midia.dono);
});

test("narrar cala o audio ou o video que estava tocando", () => {
  const { narracao, chamadas } = narracaoFalsa();
  const midia = outraMidia();
  assumirReproducao(midia.dono);

  narracao.comecou("u1");

  assert.equal(midia.pausadas, 1);
  assert.deepEqual(chamadas, [], "a narracao que assume nao se cala");
  narracao.pausar();
});

test("o aviso atrasado da fala anterior nao solta a fala nova", () => {
  const { narracao, chamadas } = narracaoFalsa();
  const midia = outraMidia();
  narracao.comecou("u1");
  narracao.comecou("u2");

  narracao.terminou("u1");
  assumirReproducao(midia.dono);

  assert.deepEqual(chamadas, ["app", "deck"], "a fala u2 ainda precisa ser calada pelo audio");
  soltarReproducao(midia.dono);
});

test("a fala que acabou sozinha nao e calada por quem assume depois", () => {
  const { narracao, chamadas } = narracaoFalsa();
  const midia = outraMidia();
  narracao.comecou("u1");
  narracao.terminou("u1");

  assumirReproducao(midia.dono);

  assert.deepEqual(chamadas, []);
  soltarReproducao(midia.dono);
});

test("o frame cala a narracao ao sair da tela e ao desmontar", async () => {
  // O componente nao renderiza em node:test, e sem esta ligacao a narracao volta a seguir tocando.
  const fonte = await readFile(resolve("src/components/WebContentFrame.tsx"), "utf8");

  assert.match(fonte, /usePausarAoSairDaTela\(narracao\.pausar\)/);
  assert.match(fonte, /useLayoutEffect\(\(\) => narracao\.pausar, \[narracao\]\)/);
});
