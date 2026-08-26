/**
 * Ponte de sintese de voz entre o deck (HTML) e o TTS nativo.
 *
 * O deck gerado pelo BrainHexPDF narra os slides com a Web Speech API
 * (`new SpeechSynthesisUtterance(...)` + `speechSynthesis.speak`). O WebView do
 * Android **nao implementa** essa API -- nenhuma flag liga --, entao o proprio
 * deck caia no guard `if (!('speechSynthesis' in window))` e mostrava um alert
 * "Seu navegador nao suporta sintese de voz.". O botao de narrar existia e nunca
 * funcionava.
 *
 * A solucao nao e mexer no deck: ele tambem roda em navegador, onde a API existe
 * de verdade. Aqui injetamos um polyfill com a MESMA superficie que o deck usa,
 * que encaminha o texto para o TTS nativo (expo-speech) e devolve os callbacks.
 *
 * Superficie coberta (exatamente a que `toggleNarration` usa):
 *   - `'speechSynthesis' in window`
 *   - `new SpeechSynthesisUtterance(texto)` com `lang`, `rate`, `onend`, `onerror`
 *   - `speechSynthesis.speak(utterance)` e `speechSynthesis.cancel()`
 */

const CANAL = "__trailupSpeech";

export type PedidoDeFala =
  | { acao: "speak"; id: string; texto: string; lang: string | null; rate: number | null }
  | { acao: "cancel" };

/**
 * Script injetado ANTES do conteudo carregar.
 *
 * Tem que ser antes: o deck testa `'speechSynthesis' in window` no clique, mas
 * define `SpeechSynthesisUtterance` no escopo do proprio script -- se o polyfill
 * chegasse depois, o construtor real ja teria faltado no parse.
 *
 * Nao sobrescreve uma implementacao nativa existente (navegador/iOS): so entra
 * quando a API realmente nao existe.
 */
export const SCRIPT_PONTE_DE_VOZ = `
(function () {
  if (window.speechSynthesis && typeof window.speechSynthesis.speak === 'function') return;
  if (!window.ReactNativeWebView) return;

  var pendentes = {};
  var sequencia = 0;

  function enviar(payload) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    } catch (e) {}
  }

  function Utterance(texto) {
    this.text = String(texto == null ? '' : texto);
    this.lang = 'pt-BR';
    this.rate = 1;
    this.pitch = 1;
    this.volume = 1;
    this.onend = null;
    this.onerror = null;
    this.onstart = null;
  }

  window.SpeechSynthesisUtterance = Utterance;

  window.speechSynthesis = {
    speaking: false,
    pending: false,
    paused: false,
    getVoices: function () { return []; },
    speak: function (utterance) {
      if (!utterance) return;
      sequencia += 1;
      var id = 'u' + sequencia;
      pendentes[id] = utterance;
      this.speaking = true;
      if (typeof utterance.onstart === 'function') {
        try { utterance.onstart(); } catch (e) {}
      }
      enviar({
        ${CANAL}: 'speak',
        id: id,
        texto: utterance.text,
        lang: utterance.lang || null,
        rate: typeof utterance.rate === 'number' ? utterance.rate : null
      });
    },
    cancel: function () {
      this.speaking = false;
      pendentes = {};
      enviar({ ${CANAL}: 'cancel' });
    },
    pause: function () { this.cancel(); },
    resume: function () {}
  };

  // Chamados pelo lado nativo quando o TTS termina ou falha. Sem isso o deck
  // ficaria com o botao travado em "Pausar" para sempre.
  window.__trailupSpeechDone = function (id) {
    var u = pendentes[id];
    delete pendentes[id];
    window.speechSynthesis.speaking = false;
    if (u && typeof u.onend === 'function') {
      try { u.onend(); } catch (e) {}
    }
  };
  window.__trailupSpeechError = function (id) {
    var u = pendentes[id];
    delete pendentes[id];
    window.speechSynthesis.speaking = false;
    if (u && typeof u.onerror === 'function') {
      try { u.onerror(); } catch (e) {}
    }
  };
})();
true;
`;

/**
 * Le uma mensagem do WebView e devolve o pedido de fala, ou null.
 *
 * Devolve null para tudo que nao e desta ponte -- o mesmo `onMessage` recebe
 * tambem os eventos de progresso do deck.
 */
export function parsePedidoDeFala(raw: unknown): PedidoDeFala | null {
  if (typeof raw !== "string" || !raw.includes(CANAL)) return null;

  let dados: any;
  try {
    dados = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!dados || typeof dados !== "object") return null;

  const acao = dados[CANAL];
  if (acao === "cancel") return { acao: "cancel" };
  if (acao !== "speak") return null;

  const texto = String(dados.texto ?? "").trim();
  const id = String(dados.id ?? "").trim();
  // Sem texto nao ha o que falar, e sem id o `onend` do deck nunca voltaria --
  // o botao ficaria preso em "Pausar".
  if (!texto || !id) return null;

  const rate = Number(dados.rate);
  return {
    acao: "speak",
    id,
    texto,
    lang: typeof dados.lang === "string" && dados.lang.trim() ? dados.lang.trim() : null,
    // Faixa do expo-speech; fora dela o Android ignora a fala inteira.
    rate: Number.isFinite(rate) && rate > 0 ? Math.min(2, Math.max(0.1, rate)) : null,
  };
}

/** JS a injetar de volta no WebView quando o TTS nativo termina. */
export function scriptDeConclusao(id: string, comErro = false): string {
  const alvo = comErro ? "__trailupSpeechError" : "__trailupSpeechDone";
  return `window.${alvo} && window.${alvo}(${JSON.stringify(id)}); true;`;
}
