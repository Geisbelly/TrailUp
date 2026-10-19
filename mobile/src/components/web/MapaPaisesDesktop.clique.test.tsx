import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToString } = require("react-dom/server");

// No mapa da tela larga, o aluno clica no território do país. Antes só o
// hexágono com o nome respondia, e o resto do país (a maior parte do que se vê)
// não fazia nada. Aqui o SVG vira dublê que guarda o onPress de cada grupo.

const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = { id: path, filename: path, loaded: true, exports };
};
function Host({ children }: { children?: React.ReactNode }) {
  return <div>{children}</div>;
}
const gruposComClique: (() => void)[] = [];
const botoes: (() => void)[] = [];

mockModule("react-native", {
  View: Host,
  Text: Host,
  ScrollView: Host,
  Image: () => null,
  Platform: { OS: "web" },
  StyleSheet: { create: (s: unknown) => s, absoluteFill: {} },
  Pressable: ({ onPress, children }: { onPress?: () => void; children?: React.ReactNode }) => {
    if (onPress) botoes.push(onPress);
    return <div>{typeof children === "function" ? null : children}</div>;
  },
});
const Svg = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
mockModule("react-native-svg", {
  __esModule: true,
  default: Svg,
  G: ({ onPress, children }: { onPress?: () => void; children?: React.ReactNode }) => {
    if (onPress) gruposComClique.push(onPress);
    return <div>{children}</div>;
  },
  Circle: () => null,
  Defs: Host,
  Path: () => null,
  Pattern: Host,
  RadialGradient: Host,
  Stop: () => null,
});
mockModule("@expo/vector-icons", { MaterialCommunityIcons: () => null });
mockModule("@/components/web/HexagonoTopico", { HexagonoTopico: () => null });
mockModule("@/constants/profileImages", { guardianFaceImages: {} });
mockModule("@/constants/brainHexProfiles", { normalizeBrainHexProfile: () => "conqueror" });
mockModule("@/styles/GlobalStyle", { FontFamily: {} });

const { MapaPaisesDesktop } = require("./MapaPaisesDesktop");
const palette = new Proxy({}, { get: () => "#334455" });

test("clicar no território do país chama o mesmo clique do nó", () => {
  const selecionados: string[] = [];
  gruposComClique.length = 0;
  botoes.length = 0;
  renderToString(
    <MapaPaisesDesktop
      topicos={[{ id: "170", nome: "Província", estado: "current", percentual: 15, personalizado: false }]}
      quadro={{ largura: 900, altura: 640 }}
      selecionado="170"
      perfil="conqueror"
      palette={palette}
      onSelecionar={(id: string) => selecionados.push(id)}
    />,
  );
  assert.equal(gruposComClique.length, 1, "o único país tem clique (e não há terra vazia)");
  gruposComClique[0]();
  assert.deepEqual(selecionados, ["170"]);
  assert.equal(botoes.length, 1, "o hexágono com o nome continua clicável");
});
