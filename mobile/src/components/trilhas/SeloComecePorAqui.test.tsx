import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToString } = require("react-dom/server");

// O selo "Comece por aqui" mostra o motivo escrito para o aluno quando ele vem,
// e só o destaque quando não vem. O ícone é a placa de caminho, que não tem
// outro dono no app ("um ícone, um significado").

const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = { id: path, filename: path, loaded: true, exports };
};
function Host({ children }: { children?: React.ReactNode }) {
  return <div>{children}</div>;
}
const icones: string[] = [];

mockModule("react-native", {
  View: Host,
  Text: Host,
  StyleSheet: { create: (s: unknown) => s },
});
mockModule("@expo/vector-icons", {
  MaterialCommunityIcons: ({ name }: { name: string }) => {
    icones.push(name);
    return null;
  },
});
mockModule("@/styles/GlobalStyle", { FontFamily: {} });

const { SeloComecePorAqui, rotuloComecePorAqui } =
  require("./SeloComecePorAqui") as typeof import("./SeloComecePorAqui");

const palette = { accent: "#123456", text: "#000000" } as never;

test("com motivo_aluno, mostra o destaque e a frase", () => {
  icones.length = 0;
  const html = renderToString(
    <SeloComecePorAqui
      motivo="Este conteúdo depende de imagens: comece pela apresentação."
      palette={palette}
    />
  );

  assert.match(html, /Comece por aqui/);
  assert.match(html, /comece pela apresentação/);
  assert.deepEqual(icones, ["sign-direction"]);
});

test("sem motivo, mostra só o destaque", () => {
  const html = renderToString(<SeloComecePorAqui motivo={null} palette={palette} />);
  const vazio = renderToString(<SeloComecePorAqui motivo="   " palette={palette} />);

  assert.equal(html, "<div><div><div>Comece por aqui</div></div></div>");
  assert.equal(vazio, html);
});

test("leitor de tela ouve o motivo junto do título", () => {
  assert.equal(rotuloComecePorAqui("Ouça primeiro."), "Comece por aqui. Ouça primeiro.");
  assert.equal(rotuloComecePorAqui(null), "Comece por aqui.");
});
