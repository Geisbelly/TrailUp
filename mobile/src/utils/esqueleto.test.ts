import assert from "node:assert/strict";
import test from "node:test";
import tinycolor from "tinycolor2";
import { getProfileShellPalette } from "./profileShellTheme";
import {
  CONTRASTE_DO_BLOCO,
  OPACIDADE_DO_PULSO,
  OPACIDADE_PARADA,
  contrasteComposto,
  esperandoPrimeiraCarga,
  corDoEsqueleto,
  larguraDaLinha,
} from "./esqueleto";

const PERFIS = [null, "seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever"] as const;

for (const perfil of PERFIS) {
  const paleta = getProfileShellPalette(perfil);
  for (const superficie of [paleta.background, paleta.surface, paleta.surfaceElevated]) {
    test(`${perfil ?? "neutro"}: bloco visível sobre ${superficie}, sem perder a cor do perfil`, () => {
      const cor = corDoEsqueleto(superficie);
      // Parado (movimento reduzido) é o pior caso que precisa ser visto.
      assert.ok(
        contrasteComposto(cor, superficie, OPACIDADE_PARADA) >= CONTRASTE_DO_BLOCO,
        `contraste ${contrasteComposto(cor, superficie, OPACIDADE_PARADA).toFixed(2)}`,
      );
      // Só a luminosidade sobe: matiz e saturação são os da superfície.
      const a = tinycolor(superficie).toHsl();
      const b = tinycolor(cor).toHsl();
      assert.ok(b.l >= a.l, "a luminosidade só sobe");
      if (a.s > 0.05) {
        const distancia = Math.min(Math.abs(a.h - b.h), 360 - Math.abs(a.h - b.h));
        assert.ok(distancia < 3, `matiz ${a.h.toFixed(1)} → ${b.h.toFixed(1)}`);
        assert.ok(Math.abs(a.s - b.s) < 0.03, `saturação ${a.s.toFixed(3)} → ${b.s.toFixed(3)}`);
      }
    });
  }
}

test("cor inválida cai num cinza-azulado escuro, sem estourar", () => {
  assert.equal(corDoEsqueleto("não é cor"), "#2a3150");
});

test("o pulso nunca apaga o bloco por inteiro, e a parada fica dentro dele", () => {
  const [baixo, alto] = OPACIDADE_DO_PULSO;
  assert.ok(baixo > 0.3 && baixo < alto && alto <= 1);
  assert.ok(OPACIDADE_PARADA >= baixo && OPACIDADE_PARADA <= alto);
});

test("linhas de texto falsas variam e a última é a mais curta", () => {
  assert.equal(larguraDaLinha(0, 1), "70%");
  const tres = [0, 1, 2].map((i) => larguraDaLinha(i, 3));
  assert.deepEqual(tres, ["92%", "78%", "45%"]);
  assert.ok(new Set(tres).size === 3);
});

test("esqueleto só na primeira carga da chave; recarga da mesma chave mantém o conteúdo", () => {
  assert.equal(esperandoPrimeiraCarga(false, 0, 1, null), false, "sem carregar, nunca");
  assert.equal(esperandoPrimeiraCarga(true, 0, 1, 1), true, "nada na tela ainda");
  assert.equal(esperandoPrimeiraCarga(true, 8, 1, null), true, "itens que ainda não são desta turma");
  assert.equal(esperandoPrimeiraCarga(true, 8, 2, 1), true, "trocou de turma");
  assert.equal(esperandoPrimeiraCarga(true, 8, 1, 1), false, "recarga da mesma turma");
  assert.equal(esperandoPrimeiraCarga(true, 8, "1", 1), false, "id como texto ou número é o mesmo");
});
