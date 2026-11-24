import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToString } = require("react-dom/server");

// O "respondendo" do Guia tem de: ser um nó só para o leitor de tela, numa região viva que anuncia
// "<nome> está respondendo", esconder os pontos, pulsar e ficar parado com "Reduzir movimento".

const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = { id: path, filename: path, loaded: true, exports };
};

type PropsDeHost = {
  children?: React.ReactNode;
  accessibilityRole?: string;
  accessibilityLabel?: string;
  accessibilityLiveRegion?: string;
  importantForAccessibility?: string;
  "aria-live"?: string;
};
function Host({ children, accessibilityRole, accessibilityLabel, accessibilityLiveRegion, importantForAccessibility, ...resto }: PropsDeHost) {
  return (
    <div
      data-papel={accessibilityRole}
      data-rotulo={accessibilityLabel}
      data-regiao={accessibilityLiveRegion}
      data-aria-live={resto["aria-live"]}
      data-oculto={importantForAccessibility}
    >
      {children}
    </div>
  );
}

let animacoesIniciadas = 0;
let animacoesParadas = 0;
let valoresFixados: number[] = [];
class ValorAnimado {
  constructor(public valor: number) {}
  setValue(v: number) { valoresFixados.push(v); }
  toJSON() { return "animado"; }
}
const animacao = () => ({ start: () => { animacoesIniciadas += 1; }, stop: () => { animacoesParadas += 1; } });

mockModule("react-native", {
  Animated: { Value: ValorAnimado, View: Host, timing: animacao, loop: animacao, sequence: animacao, stagger: animacao },
  Easing: { ease: (t: number) => t },
  StyleSheet: { create: (s: unknown) => s },
  View: Host,
});
const movimentoReduzido = false;
mockModule("@/hooks/useMovimentoReduzido", { useMovimentoReduzido: () => movimentoReduzido });

const { IndicadorRespondendo, rotuloRespondendo } = require("./IndicadorRespondendo");

const desenhar = (nome?: string) =>
  renderToString(<IndicadorRespondendo nome={nome} cor="#fff" fundo="#000" borda="#333" />);

test("um nó para o leitor de tela, em região viva, com os pontos fora da árvore", () => {
  const html = desenhar("Idris");
  assert.match(html, /data-rotulo="Idris está respondendo"/);
  assert.match(html, /data-regiao="polite"/);
  assert.match(html, /data-aria-live="polite"/);
  assert.equal([...html.matchAll(/data-oculto="no"/g)].length, 3);
});

test("sem nome, o rótulo fala do Guia", () => {
  assert.equal(rotuloRespondendo(undefined), "Guia está respondendo");
  assert.equal(rotuloRespondendo("  "), "Guia está respondendo");
  assert.equal(rotuloRespondendo("Lumi"), "Lumi está respondendo");
});

test("os pontos pulsam e param ao sair; com Reduzir movimento ficam parados e acesos", () => {
  const { iniciarPulso } = require("./IndicadorRespondendo");
  const valores = [new ValorAnimado(0.35), new ValorAnimado(0.35), new ValorAnimado(0.35)];

  animacoesIniciadas = 0;
  animacoesParadas = 0;
  valoresFixados = [];
  const parar = iniciarPulso(valores, false);
  assert.equal(animacoesIniciadas, 1);
  assert.equal(typeof parar, "function");
  parar();
  assert.equal(animacoesParadas, 1);

  animacoesIniciadas = 0;
  assert.equal(iniciarPulso(valores, true), undefined);
  assert.equal(animacoesIniciadas, 0);
  assert.deepEqual(valoresFixados, [0.7, 0.7, 0.7]);
});
