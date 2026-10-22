import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToString } = require("react-dom/server");

// No modal BLOQUEADO apareciam DOIS ícones de 54px no mesmo quadrado absoluto: o cadeado (que
// nesse caso é desenhado sem animação, opacidade 1) e o ícone da funcionalidade, cuja opacidade
// vem de `troca` — e a sequência de animação rodava igual quando nada tinha aberto. O resultado
// na tela era um borrão de cadeado + pódio sobrepostos.
//
// A cerimônia é "o cadeado abre e a funcionalidade entra no lugar". Quando nada abriu, não há
// troca para animar.

const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = { id: path, filename: path, loaded: true, exports };
};

function Host({ children }: { children?: React.ReactNode }) {
  return <div>{children}</div>;
}

class ValorAnimado {
  setValue() {}
  interpolate() {
    return 0;
  }
}
const semEfeito = { start: () => undefined };

mockModule("react-native", {
  AccessibilityInfo: { isReduceMotionEnabled: () => Promise.resolve(false) },
  Animated: {
    View: Host,
    Value: ValorAnimado,
    sequence: () => semEfeito,
    parallel: () => semEfeito,
    spring: () => semEfeito,
    timing: () => semEfeito,
    delay: () => semEfeito,
  },
  Easing: { out: () => undefined, cubic: undefined, quad: undefined },
  Modal: Host,
  StyleSheet: { create: (s: unknown) => s, absoluteFill: {} },
  Text: Host,
  TouchableOpacity: Host,
  View: Host,
});
mockModule("@expo/vector-icons", {
  // O nome do glifo vai para o HTML: é por ele que o teste conta os ícones.
  MaterialCommunityIcons: ({ name }: { name: string }) => <i data-icone={name} />,
});
mockModule("expo-linear-gradient", { LinearGradient: Host });
mockModule("@/components/HallTheme", { OrnamentDivider: () => null });
mockModule("@/styles/GlobalStyle", { FontFamily: {} });
// `profileShellTheme` reexporta o construtor da paleta, mas tambem puxa `profileImages`, que
// faz require de PNG e nao carrega no harness. O construtor de verdade mora no modulo abaixo.
mockModule("@/utils/profileShellTheme", require("@/utils/profileShellPalette"));

const DesbloqueioModal = require("./DesbloqueioModal").default;

const icones = (html: string) => (html.match(/data-icone="[^"]+"/g) ?? []).map((m) => m.slice(12, -1));

test("modal bloqueado mostra o cadeado e NADA por cima dele", () => {
  const html = renderToString(
    <DesbloqueioModal funcionalidade="rank" color="#5b3fd9" onClose={() => undefined} bloqueado />
  );
  const desenhados = icones(html).filter((n) => n !== "circle-small");

  assert.deepEqual(
    desenhados,
    ["lock"],
    "dois icones no mesmo quadrado absoluto viram um borrao na tela"
  );
});

test("modal da cerimonia mostra o cadeado abrindo e o icone da funcionalidade", () => {
  const html = renderToString(
    <DesbloqueioModal funcionalidade="rank" color="#5b3fd9" onClose={() => undefined} />
  );
  const desenhados = icones(html).filter((n) => n !== "circle-small");

  assert.deepEqual(
    desenhados,
    ["lock-open-variant", "podium"],
    "a cerimonia e' o cadeado abrindo e a funcionalidade entrando no lugar"
  );
});

test("bloqueado diz o que falta; aberto diz o que o aluno ganhou", () => {
  const bloqueado = renderToString(
    <DesbloqueioModal funcionalidade="rank" color="#5b3fd9" onClose={() => undefined} bloqueado />
  );
  assert.ok(bloqueado.includes("indispon"), "faltou dizer que ainda nao esta' disponivel");

  const aberto = renderToString(
    <DesbloqueioModal funcionalidade="rank" color="#5b3fd9" onClose={() => undefined} />
  );
  assert.ok(!aberto.includes("indispon"), "a cerimonia nao pode falar em indisponivel");
});
