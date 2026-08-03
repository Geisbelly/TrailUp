import assert from "node:assert/strict";
import { test } from "node:test";
import { buildImmersiveDeckHtml } from "./slideShell";

test("lança se a lista de slides estiver vazia", () => {
  assert.throws(() => buildImmersiveDeckHtml([], "seeker"), /pelo menos 1 slide/);
});

test("gera um iframe sandboxed por slide, na ordem recebida", () => {
  const html = buildImmersiveDeckHtml(
    ["<section>Slide A</section>", "<section>Slide B</section>"],
    "mastermind",
  );
  const iframeMatches = [...html.matchAll(/<iframe\b[^>]*>/g)];
  assert.equal(iframeMatches.length, 2);
  for (const [tag] of iframeMatches) {
    assert.match(tag, /sandbox="allow-scripts"/);
    assert.doesNotMatch(tag, /allow-same-origin/);
  }
});

test("apenas o primeiro iframe começa ativo", () => {
  const html = buildImmersiveDeckHtml(
    ["<section>A</section>", "<section>B</section>", "<section>C</section>"],
    "seeker",
  );
  const classes = [...html.matchAll(/<iframe class="([^"]*)"/g)].map((m) => m[1]);
  assert.equal(classes[0].includes("active"), true);
  assert.equal(classes[1].includes("active"), false);
  assert.equal(classes[2].includes("active"), false);
});

test("cada iframe embute o conteúdo do slide num mini-documento com CSP restritiva", () => {
  const html = buildImmersiveDeckHtml(["<section>Conteúdo <b>rico</b></section>"], "achiever");
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  // o conteúdo do slide foi HTML-escapado dentro do atributo srcdoc, e não
  // aparece como marcação crua no documento externo
  assert.doesNotMatch(html, /<b>rico<\/b>/);
  assert.match(html, /Conte.do/);
});

test("usa a cor-assinatura do perfil como acento dos indicadores de progresso", () => {
  const html = buildImmersiveDeckHtml(["<section>A</section>"], "daredevil");
  assert.match(html, /#d7263d/i);
});

test("viewport é responsivo (largura do dispositivo, não fixa)", () => {
  const html = buildImmersiveDeckHtml(["<section>A</section>"], "conqueror");
  assert.match(html, /width=device-width/);
  assert.doesNotMatch(html, /width=1280/);
});
