import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MAX_RESTYLES_PER_MATERIAL,
  buildRestylePrompt,
  isRestyleEnabled,
  maxRestylesPerMaterial,
  podeReilustrar,
  selecionarParaReilustrar,
} from "./profileImageRestyle";

const PNG = { mimeType: "image/png" };
const JPEG = { mimeType: "image/jpeg" };
const GIF = { mimeType: "image/gif" };

test("vem DESLIGADA por padrao (nao gasta sem alguem mandar)", () => {
  assert.equal(isRestyleEnabled({}), false);
  assert.equal(isRestyleEnabled({ PROFILE_IMAGE_RESTYLE: "" }), false);
  assert.equal(isRestyleEnabled({ PROFILE_IMAGE_RESTYLE: "0" }), false);
  assert.equal(isRestyleEnabled({ PROFILE_IMAGE_RESTYLE: "false" }), false);
});

test("liga com 1/true/on, sem depender de caixa", () => {
  for (const valor of ["1", "true", "TRUE", "on", " On "]) {
    assert.equal(isRestyleEnabled({ PROFILE_IMAGE_RESTYLE: valor }), true, valor);
  }
});

test("teto por material tem padrao e respeita o configurado", () => {
  assert.equal(maxRestylesPerMaterial({}), DEFAULT_MAX_RESTYLES_PER_MATERIAL);
  assert.equal(maxRestylesPerMaterial({ PROFILE_IMAGE_RESTYLE_MAX: "5" }), 5);
});

test("teto invalido ou nao positivo cai no padrao, nao em zero nem em infinito", () => {
  assert.equal(maxRestylesPerMaterial({ PROFILE_IMAGE_RESTYLE_MAX: "abc" }), DEFAULT_MAX_RESTYLES_PER_MATERIAL);
  assert.equal(maxRestylesPerMaterial({ PROFILE_IMAGE_RESTYLE_MAX: "0" }), DEFAULT_MAX_RESTYLES_PER_MATERIAL);
  assert.equal(maxRestylesPerMaterial({ PROFILE_IMAGE_RESTYLE_MAX: "-3" }), DEFAULT_MAX_RESTYLES_PER_MATERIAL);
});

test("teto absoluto impede um valor gigante virar fatura", () => {
  assert.equal(maxRestylesPerMaterial({ PROFILE_IMAGE_RESTYLE_MAX: "9999" }), 12);
});

test("GIF nunca e reilustrado (perderia a animacao, que e o conteudo)", () => {
  assert.equal(podeReilustrar("image/gif"), false);
  assert.equal(podeReilustrar("IMAGE/GIF"), false);
});

test("png/jpeg/webp podem ser reilustrados", () => {
  for (const mime of ["image/png", "image/jpeg", "image/webp", "image/bmp"]) {
    assert.equal(podeReilustrar(mime), true, mime);
  }
});

test("o que nao e imagem nao entra", () => {
  assert.equal(podeReilustrar("application/pdf"), false);
  assert.equal(podeReilustrar(undefined), false);
  assert.equal(podeReilustrar(""), false);
});

test("desligada: nao seleciona nada, mesmo com imagem elegivel", () => {
  assert.deepEqual(selecionarParaReilustrar([PNG, JPEG], {}), []);
});

test("ligada: seleciona ate o teto, na ordem", () => {
  const env = { PROFILE_IMAGE_RESTYLE: "1", PROFILE_IMAGE_RESTYLE_MAX: "2" };
  assert.deepEqual(selecionarParaReilustrar([PNG, JPEG, PNG, PNG], env), [0, 1]);
});

test("ligada: pula o gif e segue pra proxima elegivel, sem desperdicar o teto", () => {
  const env = { PROFILE_IMAGE_RESTYLE: "1", PROFILE_IMAGE_RESTYLE_MAX: "2" };
  assert.deepEqual(selecionarParaReilustrar([GIF, PNG, GIF, JPEG], env), [1, 3]);
});

test("ligada, sem imagem elegivel: devolve vazio", () => {
  const env = { PROFILE_IMAGE_RESTYLE: "1" };
  assert.deepEqual(selecionarParaReilustrar([GIF, { mimeType: "application/pdf" }], env), []);
});

test("prompt manda preservar o conteudo tecnico, nao so trocar a paleta", () => {
  const prompt = buildRestylePrompt("conqueror", { assunto: "sockets TCP" });

  assert.match(prompt, /mesmo conteúdo/i);
  assert.match(prompt, /sockets TCP/);
  assert.match(prompt, /não invente/i);
});

test("prompt carrega a identidade do perfil (cor e guardiao)", () => {
  const conquistador = buildRestylePrompt("conqueror");
  const explorador = buildRestylePrompt("seeker");

  assert.match(conquistador, /#1e4fd6/i);
  assert.match(explorador, /#17a398/i);
  assert.match(explorador, /Amara/);
  assert.notEqual(conquistador, explorador);
});

test("prompt funciona sem contexto de assunto", () => {
  assert.match(buildRestylePrompt("mastermind"), /o conteúdo da aula/);
});
