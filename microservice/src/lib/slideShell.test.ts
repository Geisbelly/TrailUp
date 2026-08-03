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

function unescapeSrcdocAttribute(value: string): string {
  // ordem inversa de escapeForSrcdocAttribute: lt/gt/quot primeiro, &amp; por
  // último — assim um &amp;quot; (produzido quando a ordem de escape original
  // está errada, isto é, quando " é escapado antes de &) não é confundido
  // com um &quot; legítimo.
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

test("escapa & antes de \"/</> no srcdoc, sem corromper a CSP do mini-documento", () => {
  const fragment = `<section data-note="A & B">referência</section>`;
  const html = buildImmersiveDeckHtml([fragment], "seeker");

  const match = html.match(/srcdoc="([^]*?)"><\/iframe>/);
  assert.ok(match, "atributo srcdoc não encontrado no iframe");
  const miniDocument = unescapeSrcdocAttribute(match![1]);

  // se a ordem de escape estivesse errada (" antes de &), o & inserido pelo
  // escape de aspas seria re-escapado, sobrando "&amp;quot;" em vez de um
  // "&quot;" limpo — o que, uma vez desfeito aqui, deixaria "&quot;" residual
  // em vez das aspas literais abaixo.
  assert.doesNotMatch(miniDocument, /&quot;/);
  assert.doesNotMatch(miniDocument, /&amp;quot;/);
  assert.match(
    miniDocument,
    /content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:"/,
  );
  assert.match(miniDocument, /data-note="A & B"/);
});

test("região aria-live anuncia o slide atual", () => {
  const html = buildImmersiveDeckHtml(
    ["<section>A</section>", "<section>B</section>"],
    "seeker",
  );
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Slide 1 de 2/);
});

test("zonas de navegação são acessíveis por teclado e leitor de tela", () => {
  const html = buildImmersiveDeckHtml(["<section>A</section>"], "seeker");
  assert.match(html, /aria-label="Slide anterior"/);
  assert.match(html, /aria-label="Próximo slide"/);

  const prevZoneTag = html.match(/<div class="nav-zone prev"[^>]*>/)?.[0];
  const nextZoneTag = html.match(/<div class="nav-zone next"[^>]*>/)?.[0];
  assert.ok(prevZoneTag);
  assert.ok(nextZoneTag);
  assert.match(prevZoneTag!, /role="button"/);
  assert.match(prevZoneTag!, /tabindex="0"/);
  assert.match(nextZoneTag!, /role="button"/);
  assert.match(nextZoneTag!, /tabindex="0"/);
});

test("script embutido conecta as setas do teclado à navegação", () => {
  const html = buildImmersiveDeckHtml(["<section>A</section>"], "seeker");
  assert.match(html, /ArrowLeft/);
  assert.match(html, /ArrowRight/);
});
