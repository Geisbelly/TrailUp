import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import {
  SCRIPT_CALAR_FALA,
  SCRIPT_PONTE_DE_VOZ,
  calarVozDoIframe,
  observarFalaDoIframe,
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
  const vozNativa = { speak: () => {}, cancel: () => {} };
  const { janela } = pagina(vozNativa);

  assert.equal(janela.speechSynthesis, vozNativa);
  assert.equal(janela.SpeechSynthesisUtterance, undefined);
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

/** Roda os scripts como o WebView: uma pagina, com ou sem a Web Speech API nativa. */
function pagina(vozNativa?: { speak: (u: unknown) => void; cancel: () => void }) {
  const mensagens: string[] = [];
  const janela: any = {
    ReactNativeWebView: { postMessage: (m: string) => mensagens.push(m) },
    ...(vozNativa ? { speechSynthesis: vozNativa } : {}),
  };
  janela.window = janela;
  const contexto = vm.createContext(janela);
  vm.runInContext(SCRIPT_PONTE_DE_VOZ, contexto);
  return { janela, mensagens, rodar: (script: string) => vm.runInContext(script, contexto) };
}

test("no iOS a fala continua no WebKit e o app fica sabendo", () => {
  const faladas: unknown[] = [];
  const vozNativa = { speak: (u: unknown) => void faladas.push(u), cancel: () => {} };
  const { janela, mensagens } = pagina(vozNativa);

  janela.speechSynthesis.speak("fala");

  assert.deepEqual(faladas, ["fala"]);
  assert.equal(mensagens.length, 1);
  assert.deepEqual(parsePedidoDeFala(mensagens[0]), { acao: "fala-nativa" });
  assert.equal(janela.__trailupSpeechDone, undefined, "o polyfill nao entra com a API nativa");
});

test("calar para a voz do WebKit", () => {
  let canceladas = 0;
  const { rodar } = pagina({ speak: () => {}, cancel: () => void (canceladas += 1) });

  rodar(SCRIPT_CALAR_FALA);

  assert.equal(canceladas, 1);
});

test("calar nao prende o botao do deck no Android", () => {
  const { janela, rodar } = pagina();
  const utterance = new janela.SpeechSynthesisUtterance("Slide 1.");
  let terminou = 0;
  utterance.onend = () => {
    terminou += 1;
  };
  janela.speechSynthesis.speak(utterance);

  rodar(SCRIPT_CALAR_FALA);
  // O que o `onStopped` do expo-speech faz depois de `Speech.stop()`.
  rodar(scriptDeConclusao("u1"));

  assert.equal(terminou, 1);
});

test("pagina sem a API e sem ponte nao quebra ao calar", () => {
  const contexto = vm.createContext({ window: {} });

  assert.equal(vm.runInContext(SCRIPT_CALAR_FALA, contexto), true);
});

test("na web o app fica sabendo da fala antes de ela sair", () => {
  const ordem: string[] = [];
  const janela = {
    speechSynthesis: {
      speak: (fala: string) => void ordem.push(fala),
      cancel: () => {},
    },
  };

  observarFalaDoIframe(janela, () => ordem.push("aviso"));
  janela.speechSynthesis.speak("fala");

  assert.deepEqual(ordem, ["aviso", "fala"]);
});

test("calar alcanca a voz do iframe", () => {
  let canceladas = 0;
  const janela = { speechSynthesis: { speak: () => {}, cancel: () => void (canceladas += 1) } };

  calarVozDoIframe(janela);

  assert.equal(canceladas, 1);
});

test("iframe de outra origem nao quebra quem o observa nem quem o cala", () => {
  const outraOrigem = {
    get speechSynthesis(): never {
      throw new Error("SecurityError");
    },
  };

  assert.doesNotThrow(() => observarFalaDoIframe(outraOrigem, () => {}));
  assert.doesNotThrow(() => calarVozDoIframe(outraOrigem));
  assert.doesNotThrow(() => calarVozDoIframe(null));
});
