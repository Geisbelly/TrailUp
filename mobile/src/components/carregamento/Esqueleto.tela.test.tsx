import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToString } = require("react-dom/server");

// O esqueleto tem de: ser um nó só para o leitor de tela (barra de progresso ocupada,
// com rótulo), esconder os blocos da árvore, pintar com a cor derivada da superfície e
// ficar parado com "Reduzir movimento" (o núcleo puro está em esqueleto.test.ts).

const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = { id: path, filename: path, loaded: true, exports };
};

type PropsDeHost = {
  children?: React.ReactNode;
  style?: unknown;
  accessibilityRole?: string;
  accessibilityLabel?: string;
  accessibilityState?: unknown;
  importantForAccessibility?: string;
};
// O dublê joga estilo e acessibilidade para o HTML: é por eles que o teste enxerga a tela.
function Host({ children, style, accessibilityRole, accessibilityLabel, accessibilityState, importantForAccessibility }: PropsDeHost) {
  return (
    <div
      data-estilo={JSON.stringify(style ?? null)}
      data-papel={accessibilityRole}
      data-rotulo={accessibilityLabel}
      data-estado={accessibilityState ? JSON.stringify(accessibilityState) : undefined}
      data-oculto={importantForAccessibility}
    >
      {children}
    </div>
  );
}

class ValorAnimado {
  constructor(public valor: number) {}
  interpolate() { return this; }
  stopAnimation() {}
  toJSON() { return "animado"; }
}
const animacao = () => ({ start: () => undefined, stop: () => undefined });

mockModule("react-native", {
  AccessibilityInfo: { isReduceMotionEnabled: () => Promise.resolve(false), addEventListener: () => ({ remove: () => undefined }) },
  Animated: { Value: ValorAnimado, View: Host, timing: animacao, loop: animacao, sequence: animacao },
  Easing: { ease: (t: number) => t, inOut: (f: unknown) => f },
  Platform: { OS: "web" },
  StyleSheet: { create: (s: unknown) => s },
  View: Host,
});
let movimentoReduzido = false;
mockModule("@/hooks/useMovimentoReduzido", { useMovimentoReduzido: () => movimentoReduzido });

const { EsqueletoGrupo, EsqueletoLinha, EsqueletoTexto, EsqueletoRepetir } = require("./Esqueleto");
const nucleo = require("@/utils/esqueleto");

const SUPERFICIE = "#161c33";
const desenhar = () =>
  renderToString(
    <EsqueletoGrupo rotulo="Carregando ranking" superficie={SUPERFICIE}>
      <EsqueletoRepetir quantos={3}>{() => <EsqueletoLinha />}</EsqueletoRepetir>
      <EsqueletoTexto linhas={2} />
    </EsqueletoGrupo>,
  );

test("um nó só para o leitor de tela, com os blocos fora da árvore", () => {
  const html = desenhar();
  assert.equal([...html.matchAll(/data-papel="progressbar"/g)].length, 1);
  assert.match(html, /data-rotulo="Carregando ranking"/);
  assert.match(html, /data-estado="\{&quot;busy&quot;:true\}"/);
  assert.match(html, /data-oculto="no-hide-descendants"/);
});

test("sem rótulo, o grupo é só decorativo: nenhum nó novo para o leitor de tela", () => {
  const html = renderToString(
    <EsqueletoGrupo superficie={SUPERFICIE}>
      <EsqueletoTexto linhas={1} />
    </EsqueletoGrupo>,
  );
  assert.doesNotMatch(html, /data-papel=/);
  assert.match(html, /data-oculto="no-hide-descendants"/);
});

test("os blocos usam a cor derivada da superfície", () => {
  const html = desenhar();
  const cor = nucleo.corDoEsqueleto(SUPERFICIE);
  // 3 linhas × (círculo + 2 linhas) + 2 linhas de texto.
  assert.equal([...html.matchAll(new RegExp(`&quot;backgroundColor&quot;:&quot;${cor}&quot;`, "g"))].length, 11);
});

test("com movimento reduzido, a opacidade é fixa; sem ele, vem do pulso", () => {
  try {
    movimentoReduzido = true;
    assert.match(desenhar(), new RegExp(`&quot;opacity&quot;:${nucleo.OPACIDADE_PARADA}`));
  } finally {
    movimentoReduzido = false;
  }
  const animada = desenhar();
  assert.doesNotMatch(animada, new RegExp(`&quot;opacity&quot;:${nucleo.OPACIDADE_PARADA}`));
  assert.match(animada, /&quot;opacity&quot;:&quot;animado&quot;/);
});

test("com rótulo, o estilo de layout fica no nó que contém os blocos", () => {
  // No nó de fora, `row` + `wrap` valiam para um filho só, e a grade da Biblioteca virava
  // uma coluna de células espremidas (visto no print).
  const html = renderToString(
    <EsqueletoGrupo rotulo="Carregando conquistas" superficie={SUPERFICIE} style={{ flexDirection: "row", flexWrap: "wrap" }}>
      <EsqueletoTexto linhas={1} />
    </EsqueletoGrupo>,
  );
  assert.match(html, /data-estilo="\{&quot;flexDirection&quot;:&quot;row&quot;,&quot;flexWrap&quot;:&quot;wrap&quot;\}" data-oculto="no-hide-descendants"/);
  assert.match(html, /data-estilo="null" data-papel="progressbar"/);
});
