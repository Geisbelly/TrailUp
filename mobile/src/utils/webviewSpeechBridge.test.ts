import assert from "node:assert/strict";
import test from "node:test";

import {
  SCRIPT_PONTE_DE_VOZ,
  parsePedidoDeFala,
  scriptDeConclusao,
} from "./webviewSpeechBridge";

/** Le um pedido e afirma que e de fala, para estreitar o union. */
function fala(raw: string) {
  const resultado = parsePedidoDeFala(raw);
  assert.ok(resultado && resultado.acao === "speak", "esperava pedido de fala");
  return resultado;
}

const pedido = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    __trailupSpeech: "speak",
    id: "u1",
    texto: "Manual de Sobrevivência.",
    lang: "pt-BR",
    rate: 1.05,
    ...extra,
  });

// --- leitura das mensagens -------------------------------------------------

test("le um pedido de fala do deck", () => {
  const resultado = parsePedidoDeFala(pedido());

  assert.deepEqual(resultado, {
    acao: "speak",
    id: "u1",
    texto: "Manual de Sobrevivência.",
    lang: "pt-BR",
    rate: 1.05,
  });
});

test("le o cancelamento", () => {
  assert.deepEqual(parsePedidoDeFala(JSON.stringify({ __trailupSpeech: "cancel" })), {
    acao: "cancel",
  });
});

test("mensagem de outro canal nao e confundida com fala", () => {
  // O mesmo onMessage recebe os eventos de progresso do deck.
  assert.equal(parsePedidoDeFala(JSON.stringify({ type: "deck-progress", slide: 2 })), null);
  assert.equal(parsePedidoDeFala("qualquer coisa"), null);
  assert.equal(parsePedidoDeFala(null), null);
  assert.equal(parsePedidoDeFala(42), null);
});

test("json quebrado nao derruba o handler", () => {
  assert.equal(parsePedidoDeFala('{"__trailupSpeech":'), null);
});

test("pedido sem texto e descartado", () => {
  assert.equal(parsePedidoDeFala(pedido({ texto: "   " })), null);
});

test("pedido sem id e descartado", () => {
  // Sem id o `onend` nunca volta e o botao do deck fica preso em "Pausar".
  assert.equal(parsePedidoDeFala(pedido({ id: "" })), null);
});

test("rate fora da faixa do expo-speech e contido", () => {
  // Fora de 0.1..2 o Android ignora a fala inteira, em silencio.
  assert.equal(fala(pedido({ rate: 9 })).rate, 2);
  assert.equal(fala(pedido({ rate: 0.01 })).rate, 0.1);
});

test("rate invalido vira null em vez de zero", () => {
  // Zero seria lido como "nao fale".
  assert.equal(fala(pedido({ rate: "rapido" })).rate, null);
  assert.equal(fala(pedido({ rate: -1 })).rate, null);
});

test("lang vazio vira null e deixa o nativo escolher", () => {
  assert.equal(fala(pedido({ lang: "  " })).lang, null);
});

// --- contrato do polyfill --------------------------------------------------

test("polyfill cobre exatamente o que o deck usa", () => {
  for (const trecho of [
    "window.SpeechSynthesisUtterance",
    "window.speechSynthesis",
    "speak: function",
    "cancel: function",
    "__trailupSpeechDone",
    "__trailupSpeechError",
  ]) {
    assert.ok(SCRIPT_PONTE_DE_VOZ.includes(trecho), `falta ${trecho}`);
  }
});

test("polyfill nao sobrescreve implementacao nativa existente", () => {
  // Em navegador e no iOS a API existe de verdade; substituir seria piorar.
  assert.ok(
    SCRIPT_PONTE_DE_VOZ.includes(
      "if (window.speechSynthesis && typeof window.speechSynthesis.speak === 'function') return;"
    )
  );
});

test("polyfill nao roda fora do WebView", () => {
  assert.ok(SCRIPT_PONTE_DE_VOZ.includes("if (!window.ReactNativeWebView) return;"));
});

test("script injetado termina em true", () => {
  // injectedJavaScript no Android reclama quando o script avalia para undefined.
  assert.ok(SCRIPT_PONTE_DE_VOZ.trim().endsWith("true;"));
  assert.ok(scriptDeConclusao("u1").trim().endsWith("true;"));
});

test("conclusao chama o callback certo e escapa o id", () => {
  assert.ok(scriptDeConclusao("u1").includes('__trailupSpeechDone("u1")'));
  assert.ok(scriptDeConclusao("u1", true).includes('__trailupSpeechError("u1")'));
  // Id vindo da pagina: escapar evita quebrar o script injetado.
  assert.ok(scriptDeConclusao('u"1').includes('"u\\"1"'));
});

test("conclusao nao explode se o polyfill nao existir", () => {
  // A pagina pode ter recarregado entre o pedido e o fim da fala.
  assert.ok(scriptDeConclusao("u1").startsWith("window.__trailupSpeechDone &&"));
});
