import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeLatin1 } from "./textSanitize";

test("aceita null e undefined sem crash", () => {
  assert.equal(sanitizeLatin1(null), "");
  assert.equal(sanitizeLatin1(undefined), "");
  assert.equal(sanitizeLatin1(""), "");
});

test("preserva todos os acentos do PT-BR (Latin-1)", () => {
  const ptBR = "Açãoêíôúüãõçà";
  assert.equal(sanitizeLatin1(ptBR), ptBR);
});

test("converte aspas tipograficas curly para retas", () => {
  // U+2018 left single, U+2019 right single, U+02BC modifier letter apostrophe
  const input = "It’s a ‘test’ withʼ apostrophe";
  const out = sanitizeLatin1(input);
  assert.equal(out, "It's a 'test' with' apostrophe");
});

test("converte aspas duplas curly U+201C/U+201D/U+201E", () => {
  const input = "“Hello” and „Hi”";
  const out = sanitizeLatin1(input);
  assert.equal(out, '"Hello" and "Hi"');
});

test("converte en-dash e em-dash para hifen", () => {
  // U+2013 en, U+2014 em, U+2015 horizontal bar
  const input = "page 1–3 — see―";
  const out = sanitizeLatin1(input);
  assert.equal(out, "page 1-3 - see-");
});

test("converte reticencias U+2026 em tres pontos", () => {
  assert.equal(sanitizeLatin1("wait… ok"), "wait... ok");
});

test("converte bullet U+2022 para middle dot U+00B7", () => {
  assert.equal(sanitizeLatin1("• item"), "· item");
});

test("remove qualquer caractere fora de Latin-1 (ex: emoji, CJK)", () => {
  const input = "hello \u{1F600} 中文 world";
  const out = sanitizeLatin1(input);
  // emoji vira 2 espacos (surrogate pair), CJK vira 2 espacos
  // .trim() depois colapsa o leading/trailing
  assert.match(out, /^hello/);
  assert.match(out, /world$/);
  assert.ok(!/\u{1F600}/u.test(out));
  assert.ok(!/[一-鿿]/.test(out));
});

test("aplica trim no resultado final", () => {
  assert.equal(sanitizeLatin1("  hello  "), "hello");
});

test("multiplas substituicoes na mesma string", () => {
  const input = "“Hello”—world…";
  assert.equal(sanitizeLatin1(input), '"Hello"-world...');
});
