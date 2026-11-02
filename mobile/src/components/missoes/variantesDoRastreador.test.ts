import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { comGuia, prazoApertado, segmentosDosFeitos, varianteDoRastreador } from "./variantesDoRastreador";

const PERFIS = ["seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever"] as const;

describe("variantesDoRastreador", () => {
  it("nenhum perfil repete a combinação de moldura, emblema e progresso", () => {
    const assinaturas = PERFIS.map((p) => {
      const v = varianteDoRastreador(p);
      return JSON.stringify([v.moldura, v.emblema, v.progresso]);
    });
    assert.equal(new Set(assinaturas).size, PERFIS.length);
  });

  it("cada perfil tem a sua folha", () => {
    assert.equal(new Set(PERFIS.map((p) => varianteDoRastreador(p).tituloDaFolha)).size, PERFIS.length);
  });

  it("cada perfil tem o seu emblema", () => {
    assert.equal(new Set(PERFIS.map((p) => varianteDoRastreador(p).emblema)).size, PERFIS.length);
  });

  it("aceita o nome em português e cai no padrão sem perfil", () => {
    assert.equal(varianteDoRastreador("Estrategista").moldura, "hexagono");
    assert.equal(varianteDoRastreador("sobrevivente").moldura, "placa");
    assert.equal(varianteDoRastreador(null).perfil, "mastermind");
  });

  it("o guia entra no texto, em caixa alta no sobretítulo", () => {
    const v = varianteDoRastreador("socializer");
    assert.equal(comGuia(v.tituloDaFolha, "Mateo e Zuri"), "Pedidos de Mateo e Zuri");
    assert.equal(comGuia(v.rotulo, "Mateo e Zuri", true), "PEDIDO DE MATEO E ZURI");
    assert.equal(comGuia("Desafios", "Ember"), "Desafios");
  });
});

describe("segmentosDosFeitos", () => {
  it("um segmento por missão, até 8, na proporção", () => {
    assert.deepEqual(segmentosDosFeitos(1, 3), { total: 3, acesos: 1 });
    assert.deepEqual(segmentosDosFeitos(6, 12), { total: 8, acesos: 4 });
    assert.deepEqual(segmentosDosFeitos(0, 0), { total: 0, acesos: 0 });
    assert.deepEqual(segmentosDosFeitos(5, 5), { total: 5, acesos: 5 });
  });
});

describe("prazoApertado", () => {
  const agora = new Date(2026, 10, 1, 12, 0, 0);
  const daqui = (h: number) => new Date(agora.getTime() + h * 3600_000).toISOString();

  it("só nas últimas 3 horas: a diária que termina à meia-noite não pulsa ao meio-dia", () => {
    assert.equal(prazoApertado(daqui(12), agora), false);
    assert.equal(prazoApertado(daqui(3), agora), true);
    assert.equal(prazoApertado(daqui(0.5), agora), true);
  });

  it("vencido ou sem prazo não pulsa", () => {
    assert.equal(prazoApertado(daqui(-1), agora), false);
    assert.equal(prazoApertado(null, agora), false);
    assert.equal(prazoApertado("não é data", agora), false);
  });
});

describe("um ícone, um significado (CLAUDE.md)", () => {
  const aqui = dirname(fileURLToPath(import.meta.url));
  const src = join(aqui, "..", "..");
  const arquivos: string[] = [];
  (function andar(d: string) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== "assets") andar(p);
      } else if (/\.tsx?$/.test(e.name) && !p.startsWith(aqui)) arquivos.push(p);
    }
  })(src);
  const textos = arquivos.map((p) => [relative(src, p), readFileSync(p, "utf8")] as const);

  // Os emblemas dos perfis e os ícones que só a folha de missões usa. Ícone de ESTADO com o
  // mesmo sentido em todo o app (check = concluído, cadeado = bloqueado, atualizar, fechar)
  // pode se repetir; estes não, porque aqui querem dizer "missão".
  const deMissao = [
    ...PERFIS.map((p) => varianteDoRastreador(p).emblema),
    "calendar-today", // missão do dia
    "gift-open-outline", // recompensa
    "calendar-clock", // prazo
    "school", // missão do professor
    "timer-sand-complete", // missão expirada
  ];

  it("a varredura enxerga o app (controle: a bússola do mapa é achada)", () => {
    assert.ok(textos.length > 100);
    const re = /["'`]compass-rose["'`]/;
    assert.ok(textos.some(([p, t]) => p.includes("MapaViewStable") && re.test(t)));
  });

  for (const icone of deMissao) {
    it(`"${icone}" só aparece nas missões`, () => {
      const re = new RegExp(`["'\`]${icone}["'\`]`);
      assert.deepEqual(
        textos.filter(([, t]) => re.test(t)).map(([p]) => p),
        [],
        `"${icone}" já quer dizer outra coisa nesses arquivos: troque o ícone de um dos lados.`,
      );
    });
  }
});
