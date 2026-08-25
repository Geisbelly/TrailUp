import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_MAX_RESTYLES_PER_MATERIAL,
  applyProfileRestyle,
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

// --- applyProfileRestyle ---------------------------------------------------

const LIGADA = { PROFILE_IMAGE_RESTYLE: "1", PROFILE_IMAGE_RESTYLE_MAX: "2" };

function imagem(nome: string, mimeType = "image/png") {
  return { data: `dados-${nome}`, mimeType, url: `data:${mimeType};base64,dados-${nome}`, name: nome };
}

const geradorFake = async () => ({ data: "NOVA", mimeType: "image/png" });

test("desligada: nao chama o gerador nem toca nas imagens", async () => {
  let chamou = false;
  const entrada = [imagem("a")];

  const r = await applyProfileRestyle(entrada, {
    profile: "seeker",
    environment: {},
    restyle: async () => {
      chamou = true;
      return { data: "x", mimeType: "image/png" };
    },
  });

  assert.equal(chamou, false);
  assert.equal(r.reilustradas, 0);
  assert.deepEqual(r.imagens, entrada);
});

test("ligada: troca os bytes E a url (senao o markdown apontaria pro conteudo antigo)", async () => {
  const r = await applyProfileRestyle([imagem("a")], {
    profile: "conqueror",
    environment: LIGADA,
    restyle: geradorFake,
  });

  assert.equal(r.reilustradas, 1);
  assert.equal(r.imagens[0].data, "NOVA");
  assert.equal(r.imagens[0].url, "data:image/png;base64,NOVA");
});

test("preserva os metadados de origem da imagem (nome, contexto)", async () => {
  const original = { ...imagem("a"), sourceText: "slide sobre sockets", sourceOrder: 3 };

  const r = await applyProfileRestyle([original], {
    profile: "seeker",
    environment: LIGADA,
    restyle: geradorFake,
  });

  assert.equal(r.imagens[0].sourceText, "slide sobre sockets");
  assert.equal(r.imagens[0].sourceOrder, 3);
  assert.equal(r.imagens[0].name, "a");
});

test("respeita o teto: 3 imagens, teto 2, so duas trocadas", async () => {
  const r = await applyProfileRestyle([imagem("a"), imagem("b"), imagem("c")], {
    profile: "seeker",
    environment: LIGADA,
    restyle: geradorFake,
  });

  assert.equal(r.reilustradas, 2);
  assert.equal(r.imagens[2].data, "dados-c");
});

test("gif fica intacto mesmo com a camada ligada", async () => {
  const r = await applyProfileRestyle([imagem("anim", "image/gif"), imagem("b")], {
    profile: "seeker",
    environment: LIGADA,
    restyle: geradorFake,
  });

  assert.equal(r.imagens[0].data, "dados-anim");
  assert.equal(r.imagens[1].data, "NOVA");
});

test("falha numa imagem mantem a original e segue pras outras", async () => {
  let chamadas = 0;
  const r = await applyProfileRestyle([imagem("a"), imagem("b")], {
    profile: "seeker",
    environment: LIGADA,
    restyle: async () => {
      chamadas += 1;
      if (chamadas === 1) throw new Error("modelo recusou");
      return { data: "NOVA", mimeType: "image/png" };
    },
  });

  assert.equal(r.imagens[0].data, "dados-a", "a original tem que sobreviver");
  assert.equal(r.imagens[1].data, "NOVA");
  assert.equal(r.reilustradas, 1);
});

test("gerador devolvendo vazio nao apaga a imagem original", async () => {
  const r = await applyProfileRestyle([imagem("a")], {
    profile: "seeker",
    environment: LIGADA,
    restyle: async () => null,
  });

  assert.equal(r.imagens[0].data, "dados-a");
  assert.equal(r.reilustradas, 0);
});

test("cota esgotada interrompe o resto do material (nao insiste imagem por imagem)", async () => {
  let chamadas = 0;
  const r = await applyProfileRestyle([imagem("a"), imagem("b")], {
    profile: "seeker",
    environment: { PROFILE_IMAGE_RESTYLE: "1", PROFILE_IMAGE_RESTYLE_MAX: "5" },
    restyle: async () => {
      chamadas += 1;
      throw new Error("429 RESOURCE_EXHAUSTED: quota");
    },
  });

  assert.equal(chamadas, 1, "parou na primeira, nao tentou a segunda");
  assert.equal(r.interrompidoPor, "cota");
  assert.equal(r.imagens[1].data, "dados-b");
});

test("avisa quem chamou sobre cada falha, sem lancar", async () => {
  const avisos: string[] = [];

  await applyProfileRestyle([imagem("a")], {
    profile: "seeker",
    environment: LIGADA,
    restyle: async () => {
      throw new Error("boom");
    },
    onAviso: (m) => avisos.push(m),
  });

  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /falha ao reilustrar/i);
});

test("lista vazia nao quebra", async () => {
  const r = await applyProfileRestyle([], { profile: "seeker", environment: LIGADA, restyle: geradorFake });
  assert.deepEqual(r.imagens, []);
  assert.equal(r.reilustradas, 0);
});
