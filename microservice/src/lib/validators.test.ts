import { test } from "node:test";
import assert from "node:assert/strict";
import { isSafeFonteUrl, validatePersonalizarBody } from "./validators";

// ───────────── isSafeFonteUrl ─────────────

test("SSRF: aceita https público", () => {
  assert.equal(isSafeFonteUrl("https://supabase.co/storage/v1/object/...pdf"), true);
  assert.equal(isSafeFonteUrl("http://example.com/file.pdf"), true);
});

test("SSRF: rejeita protocolos não-http (file, ftp, javascript)", () => {
  assert.equal(isSafeFonteUrl("file:///etc/passwd"),     false);
  assert.equal(isSafeFonteUrl("ftp://example.com/x"),    false);
  assert.equal(isSafeFonteUrl("javascript:alert(1)"),    false);
  assert.equal(isSafeFonteUrl("data:text/plain,hello"),  false);
});

test("SSRF: rejeita URL malformada", () => {
  assert.equal(isSafeFonteUrl("not-a-url"),  false);
  assert.equal(isSafeFonteUrl(""),           false);
});

test("SSRF: rejeita localhost e variantes", () => {
  assert.equal(isSafeFonteUrl("http://localhost/x"),       false);
  assert.equal(isSafeFonteUrl("http://localhost:8080/x"),  false);
  assert.equal(isSafeFonteUrl("http://127.0.0.1/x"),       false);
  assert.equal(isSafeFonteUrl("http://127.5.5.5/x"),       false);
});

test("SSRF: rejeita RFC 1918 (10.x, 172.16-31.x, 192.168.x)", () => {
  assert.equal(isSafeFonteUrl("http://10.0.0.1/x"),        false);
  assert.equal(isSafeFonteUrl("http://10.255.255.255/x"),  false);
  assert.equal(isSafeFonteUrl("http://172.16.0.1/x"),      false);
  assert.equal(isSafeFonteUrl("http://172.31.255.255/x"),  false);
  assert.equal(isSafeFonteUrl("http://192.168.1.1/x"),     false);
  // 172.15.x e 172.32.x NÃO são privados
  assert.equal(isSafeFonteUrl("http://172.15.0.1/x"),      true);
  assert.equal(isSafeFonteUrl("http://172.32.0.1/x"),      true);
});

test("SSRF: rejeita link-local 169.254.x (AWS metadata!)", () => {
  assert.equal(isSafeFonteUrl("http://169.254.169.254/latest/meta-data/"), false);
  assert.equal(isSafeFonteUrl("http://169.254.1.1/x"),                     false);
});

test("SSRF: rejeita 0.0.0.0/8 e .local", () => {
  assert.equal(isSafeFonteUrl("http://0.0.0.0/x"),    false);
  assert.equal(isSafeFonteUrl("http://router.local/"), false);
});

test("SSRF: rejeita IPv6 loopback e link-local", () => {
  assert.equal(isSafeFonteUrl("http://[::1]/x"),         false);
  assert.equal(isSafeFonteUrl("http://[fe80::1]/x"),     false);
  assert.equal(isSafeFonteUrl("http://[fc00::1]/x"),     false);
  assert.equal(isSafeFonteUrl("http://[fd12::1]/x"),     false);
});

test("SSRF: allowPrivate=true libera tudo (dev)", () => {
  assert.equal(isSafeFonteUrl("http://localhost/x",       true), true);
  assert.equal(isSafeFonteUrl("http://10.0.0.1/x",        true), true);
  assert.equal(isSafeFonteUrl("http://169.254.169.254/x", true), true);
  // mesmo com allowPrivate, protocolo inválido ainda é rejeitado
  assert.equal(isSafeFonteUrl("file:///etc/passwd",       true), false);
});

// ───────────── validatePersonalizarBody ─────────────

const validBody = () => ({
  profile: "mastermind",
  personalizacao_id: 42,
  fontes: [
    { url: "https://supabase.co/file.pdf", mime_type: "application/pdf", tipo: "pdf" },
  ],
  classe_id: 30,
  topico_id: 114,
  ciclo_id:  "uuid-here",
  source_hash: "hash-here",
  generation_key: "uuid-here:hash-here",
  aluno_id:  "aluno-uuid",
});

test("body válido passa", () => {
  const r = validatePersonalizarBody(validBody());
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.profile, "mastermind");
    assert.equal(r.value.personalizacao_id, 42);
    assert.equal(r.value.fontes.length, 1);
    assert.equal(r.value.generation_key, "uuid-here:hash-here");
    assert.equal(r.value.wait_for_completion, false);
  }
});

test("wait_for_completion so e ativado pelo booleano true", () => {
  const enabled = validatePersonalizarBody({ ...validBody(), wait_for_completion: true });
  const stringValue = validatePersonalizarBody({ ...validBody(), wait_for_completion: "true" });

  assert.equal(enabled.ok, true);
  if (enabled.ok) assert.equal(enabled.value.wait_for_completion, true);
  assert.equal(stringValue.ok, true);
  if (stringValue.ok) assert.equal(stringValue.value.wait_for_completion, false);
});

test("content_blocks enriquecidos são normalizados e preservados", () => {
  const r = validatePersonalizarBody({
    ...validBody(),
    content_blocks: [{
      id: "bloco-01",
      ordem: 1,
      tema: "Redes",
      topico: "DNS",
      objetivos: ["Compreender resolução de nomes"],
      conteudo_base: "DNS resolve nomes.",
      conteudo_aprofundado: "DNS conecta nomes legíveis a endereços.",
      conceitos_chave: ["DNS"],
      exemplos_contextos: ["Abrir um site"],
      ponte_proximo_bloco: "Agora veremos HTTP.",
      source_ids: ["conteudo:1"],
    }],
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.content_blocks.length, 1);
    assert.equal(r.value.content_blocks[0].id, "bloco-01");
  }
});

test("content_blocks sem conteúdo aprofundado são rejeitados", () => {
  const r = validatePersonalizarBody({
    ...validBody(),
    content_blocks: [{ id: "bloco-01" }],
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /conteudo_aprofundado/);
});

test("body não-objeto rejeitado", () => {
  for (const v of [null, undefined, "string", 42, [], true]) {
    const r = validatePersonalizarBody(v);
    assert.equal(r.ok, false);
  }
});

test("profile inválido rejeitado", () => {
  for (const profile of [undefined, "invalido", "MASTERMIND", "", 42, null]) {
    const r = validatePersonalizarBody({ ...validBody(), profile });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /profile/);
  }
});

test("personalizacao_id ausente/zero/negativo/não-inteiro rejeitado", () => {
  const bad = [undefined, null, 0, -1, 1.5, "abc", NaN, Infinity];
  for (const personalizacao_id of bad) {
    const r = validatePersonalizarBody({ ...validBody(), personalizacao_id });
    assert.equal(r.ok, false, `aceitou indevidamente: ${personalizacao_id}`);
  }
});

test("personalizacao_id aceita string numérica positiva", () => {
  const r = validatePersonalizarBody({ ...validBody(), personalizacao_id: "42" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.personalizacao_id, 42);
});

test("fontes não-array rejeitado", () => {
  const r = validatePersonalizarBody({ ...validBody(), fontes: "not-array" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /fontes deve ser um array/);
});

test("fontes vazias passam (warning é no runtime, não bloqueante)", () => {
  const r = validatePersonalizarBody({ ...validBody(), fontes: [] });
  assert.equal(r.ok, true);
});

test("fonte sem url/mime_type/tipo rejeitada", () => {
  const cases = [
    { fontes: [{ mime_type: "application/pdf", tipo: "pdf" }] },                          // sem url
    { fontes: [{ url: "https://x.com/a.pdf", tipo: "pdf" }] },                            // sem mime
    { fontes: [{ url: "https://x.com/a.pdf", mime_type: "application/pdf" }] },           // sem tipo
    { fontes: [{ url: "", mime_type: "application/pdf", tipo: "pdf" }] },                 // url vazia
  ];
  for (const partial of cases) {
    const r = validatePersonalizarBody({ ...validBody(), ...partial });
    assert.equal(r.ok, false);
  }
});

test("fonte com URL privada rejeitada por padrão", () => {
  const r = validatePersonalizarBody({
    ...validBody(),
    fontes: [{ url: "http://169.254.169.254/meta", mime_type: "application/pdf", tipo: "pdf" }],
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /url rejeitada/);
});

test("fonte com URL privada passa quando allowPrivateFonteUrls=true", () => {
  const r = validatePersonalizarBody(
    { ...validBody(), fontes: [{ url: "http://localhost:9000/x.pdf", mime_type: "application/pdf", tipo: "pdf" }] },
    { allowPrivateFonteUrls: true }
  );
  assert.equal(r.ok, true);
});

test("erro indica índice da fonte problemática", () => {
  const r = validatePersonalizarBody({
    ...validBody(),
    fontes: [
      { url: "https://ok.com/a.pdf", mime_type: "application/pdf", tipo: "pdf" },
      { url: "https://ok.com/b.pdf", mime_type: "application/pdf", tipo: "pdf" },
      { url: "javascript:alert(1)",  mime_type: "application/pdf", tipo: "pdf" },
    ],
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /fontes\[2\]/);
});

test("campos opcionais (classe_id/topico_id/ciclo_id/aluno_id) preservados", () => {
  const r = validatePersonalizarBody(validBody());
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.classe_id, 30);
    assert.equal(r.value.topico_id, 114);
    assert.equal(r.value.ciclo_id,  "uuid-here");
    assert.equal(r.value.aluno_id,  "aluno-uuid");
  }
});
