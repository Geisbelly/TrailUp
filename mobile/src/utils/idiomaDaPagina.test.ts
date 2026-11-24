import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { fixarIdiomaDaPagina, IDIOMA_DA_PAGINA } from "./idiomaDaPagina";

function documentoFalso(lang = "en", comMeta = false) {
  const atributos: Record<string, string> = {};
  const classes: string[] = [];
  const metas: Record<string, string>[] = comMeta ? [{ name: "google", content: "notranslate" }] : [];
  return {
    atributos,
    classes,
    metas,
    documentElement: {
      lang,
      setAttribute: (nome: string, valor: string) => void (atributos[nome] = valor),
      classList: { add: (c: string) => void classes.push(c) },
    },
    head: { appendChild: (no: unknown) => metas.push((no as { attrs: Record<string, string> }).attrs) },
    querySelector: (seletor: string) =>
      seletor === 'meta[name="google"]' ? metas.find((m) => m.name === "google") ?? null : null,
    createElement: () => {
      const attrs: Record<string, string> = {};
      return { attrs, setAttribute: (nome: string, valor: string) => void (attrs[nome] = valor) };
    },
  };
}

test("página publicada com lang=en (24/11) passa a português, sem tradução automática", () => {
  const doc = documentoFalso("en");
  fixarIdiomaDaPagina(doc);
  assert.equal(doc.documentElement.lang, "pt-BR");
  assert.equal(doc.atributos.translate, "no");
  assert.deepEqual(doc.classes, ["notranslate"]);
  assert.deepEqual(doc.metas, [{ name: "google", content: "notranslate" }]);
});

test("não duplica a meta quando ela já existe", () => {
  const doc = documentoFalso("pt-BR", true);
  fixarIdiomaDaPagina(doc);
  assert.equal(doc.metas.length, 1);
});

test("o HTML gerado pelo Expo declara pt-BR (web.lang do app.json)", () => {
  const app = JSON.parse(readFileSync(join(__dirname, "..", "..", "app.json"), "utf8"));
  assert.equal(app.expo.web.lang, IDIOMA_DA_PAGINA);
});

test("os rótulos da barra lateral continuam os do protótipo", () => {
  // O que a autora viu ("Não", "Classificação", "configurações") era o tradutor do navegador.
  const fonte = readFileSync(join(__dirname, "..", "components", "web", "DesktopSidebar.tsx"), "utf8");
  for (const rotulo of ['rotulo: "Notificações"', 'rotulo: "Ranking"', '"Configurações"', '"Sair"']) {
    assert.ok(fonte.includes(rotulo), rotulo);
  }
});
