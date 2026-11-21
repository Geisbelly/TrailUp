import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToString } = require("react-dom/server") as {
  renderToString: (element: React.ReactElement) => string;
};

// O aviso do sinal de uso fala do USO (DAT-45): o detector conta erros, tempo e abandonos e não
// sabe o que o aluno sente. Nunca vermelho, e o ícone tem dono único no app.

const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
};
function Host({ children }: { children?: React.ReactNode }) {
  return <div>{children}</div>;
}
const botoes: { rotulo: string; onPress: () => void }[] = [];
function textoDe(no: React.ReactNode): string {
  if (no == null || typeof no === "boolean") return "";
  if (typeof no === "string" || typeof no === "number") return String(no);
  if (Array.isArray(no)) return no.map(textoDe).join("");
  if (React.isValidElement(no)) return textoDe((no.props as { children?: React.ReactNode }).children);
  return "";
}
const icones: string[] = [];
const estilos: unknown[] = [];

mockModule("react-native", {
  Modal: Host,
  View: ({ children, style }: { children?: React.ReactNode; style?: unknown }) => {
    estilos.push(style);
    return <div>{children}</div>;
  },
  Text: ({ children, style }: { children?: React.ReactNode; style?: unknown }) => {
    estilos.push(style);
    return <span>{children}</span>;
  },
  TouchableOpacity: ({ children, onPress, style }: { children?: React.ReactNode; onPress: () => void; style?: unknown }) => {
    estilos.push(style);
    botoes.push({ rotulo: textoDe(children), onPress });
    return <button>{children}</button>;
  },
  StyleSheet: { create: (s: unknown) => s },
});
mockModule("@expo/vector-icons", {
  MaterialCommunityIcons: ({ name }: { name: string }) => {
    icones.push(name);
    return null;
  },
});
mockModule("@/styles/GlobalStyle", { FontFamily: {} });

const { AvisoDeCuidado, COPY_AVISO_USO, ICONE_DO_CUIDADO } =
  require("./AvisoDeCuidado") as typeof import("./AvisoDeCuidado");

const palette = {
  accent: "#3a7bd5",
  accentSoft: "#dde9f8",
  background: "#ffffff",
  surfaceElevated: "#f7f9fc",
  border: "#cfd8e3",
  borderStrong: "#9fb0c4",
  text: "#111111",
  textMuted: "#444444",
} as never;

const PROIBIDAS = /ansiedade|ansios[oa]|crise/i;

function renderizar() {
  botoes.length = 0;
  icones.length = 0;
  estilos.length = 0;
  const chamadas: string[] = [];
  const html = renderToString(
    <AvisoDeCuidado
      visivel
      palette={palette}
      onPausar={() => chamadas.push("pausar")}
      onContinuar={() => chamadas.push("continuar")}
    />
  );
  return { html, chamadas };
}

test("o aviso do sinal de uso não usa as palavras ansiedade, crise nem ansioso", () => {
  for (const texto of Object.values(COPY_AVISO_USO)) assert.doesNotMatch(texto, PROIBIDAS);
  const { html } = renderizar();
  assert.doesNotMatch(html, PROIBIDAS);
  assert.match(html, /Você está há um tempo nisso\. 🌿/);
  assert.match(html, /Que tal uma pausa de 5 minutos\?/);
});

test("Fazer uma pausa e Continuar chamam quem decide", () => {
  const { chamadas } = renderizar();
  assert.deepEqual(
    botoes.map((b) => b.rotulo),
    ["Fazer uma pausa", "Continuar"]
  );
  botoes[0].onPress();
  botoes[1].onPress();
  assert.deepEqual(chamadas, ["pausar", "continuar"]);
});

test("sem vermelho: só cores da paleta do perfil", () => {
  renderizar();
  const permitidas = new Set(Object.values(palette as Record<string, string>));
  const cores = JSON.stringify(estilos).match(/#[0-9a-f]{3,8}\b/gi) ?? [];
  assert.ok(cores.length > 0);
  for (const cor of cores) assert.ok(permitidas.has(cor), `cor fora da paleta: ${cor}`);
  assert.doesNotMatch(JSON.stringify(estilos), /red|danger|error/i);
});

test("o ícone é o do modo de cuidado", () => {
  renderizar();
  assert.deepEqual(icones, [ICONE_DO_CUIDADO]);
});

test("fechado, não desenha nada", () => {
  const html = renderToString(
    <AvisoDeCuidado visivel={false} palette={palette} onPausar={() => undefined} onContinuar={() => undefined} />
  );
  assert.equal(html, "");
});
