import assert from "node:assert/strict";
import test from "node:test";

/* eslint-disable @typescript-eslint/no-require-imports */
// Só a parte pura (fases da respiração e o texto fixo); a tela usa Animated e Modal.
const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
};
mockModule("react-native", { StyleSheet: { create: (s: unknown) => s } });
mockModule("@expo/vector-icons", { MaterialCommunityIcons: () => null });
mockModule("@/styles/GlobalStyle", { FontFamily: {} });
mockModule("@/hooks/useMovimentoReduzido", { useMovimentoReduzido: () => false });

const { faseDaRespiracao, TECNICAS } = require("./TecnicasDeCalma") as typeof import("./TecnicasDeCalma");

test("respiração 4-4-6: 4 s inspira, 4 s segura, 6 s solta, 4 ciclos", () => {
  assert.deepEqual(faseDaRespiracao(0), { fase: "inspira", ciclo: 1, restante: 4, duracao: 4 });
  assert.deepEqual(faseDaRespiracao(3), { fase: "inspira", ciclo: 1, restante: 1, duracao: 4 });
  assert.deepEqual(faseDaRespiracao(4), { fase: "segura", ciclo: 1, restante: 4, duracao: 4 });
  assert.deepEqual(faseDaRespiracao(8), { fase: "solta", ciclo: 1, restante: 6, duracao: 6 });
  assert.deepEqual(faseDaRespiracao(14), { fase: "inspira", ciclo: 2, restante: 4, duracao: 4 });
  assert.deepEqual(faseDaRespiracao(55), { fase: "solta", ciclo: 4, restante: 1, duracao: 6 });
  assert.equal(faseDaRespiracao(56), null);
});

test("técnicas são texto fixo: 5-4-3-2-1 e a pausa de 5 minutos", () => {
  assert.equal(TECNICAS.aterramento.passos.length, 5);
  assert.match(TECNICAS.aterramento.passos[0], /^Cinco coisas que você vê/);
  assert.equal(TECNICAS.levantar.corpo, "Levante, beba água, volte em 5 minutos.");
});

test("o CVV e o SAMU estão na tela de técnicas, em texto fixo, para todos", () => {
  assert.equal(
    TECNICAS.conversar.corpo,
    "CVV 188 (ligação gratuita, 24 h, também por chat em cvv.org.br). Em perigo imediato, SAMU 192.",
  );
});
