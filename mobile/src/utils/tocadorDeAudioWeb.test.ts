import assert from "node:assert/strict";
import test from "node:test";

import { criarTocadorDeAudioWeb, type ElementoDeAudio, type StatusDeReproducao } from "./tocadorDeAudioWeb";

/** Dublê do `<audio>`: guarda os ouvintes e deixa o teste disparar o evento na mão. */
function elementoFalso(inicial: Partial<ElementoDeAudio> = {}) {
  const ouvintes = new Map<string, Set<() => void>>();
  const elemento: ElementoDeAudio & { disparar: (evento: string) => void; tocou: number; pausou: number } = {
    src: "",
    preload: "",
    currentTime: 0,
    duration: Number.NaN,
    paused: true,
    readyState: 0,
    playbackRate: 1,
    tocou: 0,
    pausou: 0,
    play() { elemento.tocou += 1; elemento.paused = false; return Promise.resolve(); },
    pause() { elemento.pausou += 1; elemento.paused = true; },
    addEventListener(evento, ouvinte) {
      if (!ouvintes.has(evento)) ouvintes.set(evento, new Set());
      ouvintes.get(evento)!.add(ouvinte);
    },
    removeEventListener(evento, ouvinte) { ouvintes.get(evento)?.delete(ouvinte); },
    disparar(evento) { ouvintes.get(evento)?.forEach((ouvinte) => ouvinte()); },
    ...inicial,
  };
  return elemento;
}

function tocadorCom(inicial: Partial<ElementoDeAudio> = {}) {
  const elemento = elementoFalso(inicial);
  const tocador = criarTocadorDeAudioWeb("https://exemplo.test/aula.mp3", () => elemento);
  const recebidos: StatusDeReproducao[] = [];
  const assinatura = tocador.addListener("playbackStatusUpdate", (status) => recebidos.push(status));
  return { elemento, tocador, recebidos, assinatura };
}

test("a fonte entra no elemento e o preload pede só os metadados", () => {
  const { elemento } = tocadorCom();
  assert.equal(elemento.src, "https://exemplo.test/aula.mp3");
  assert.equal(elemento.preload, "metadata");
});

test("o status sai em SEGUNDOS, como o do expo-audio", () => {
  // Trocar por millis aqui faria `estadoDeAudio` multiplicar de novo: 90s viraria 25 horas.
  const { elemento, recebidos } = tocadorCom({ readyState: 1, duration: 90, currentTime: 12.5 });
  elemento.disparar("timeupdate");

  const ultimo = recebidos.at(-1)!;
  assert.equal(ultimo.duration, 90);
  assert.equal(ultimo.currentTime, 12.5);
});

test("isLoaded acompanha o readyState, e nao o fato de ter URL", () => {
  const { elemento, recebidos } = tocadorCom({ readyState: 0 });
  elemento.disparar("timeupdate");
  assert.equal(recebidos.at(-1)!.isLoaded, false, "sem metadados a barra nao pode se dizer pronta");

  elemento.readyState = 1;
  elemento.disparar("loadedmetadata");
  assert.equal(recebidos.at(-1)!.isLoaded, true);
});

test("assinar com metadados ja prontos emite na hora", () => {
  // Cache do navegador: o `loadedmetadata` ja passou antes de alguem assinar. Sem o disparo
  // inicial a tela ficaria com a barra zerada ate o aluno apertar play.
  const { recebidos } = tocadorCom({ readyState: 1, duration: 42 });
  assert.equal(recebidos.length, 1);
  assert.equal(recebidos[0].duration, 42);
});

test("didJustFinish e um pulso: vale uma emissao, nao um estado", () => {
  // O componente usa esse sinal para ZERAR a posicao salva. Grudado em true, toda emissao
  // seguinte apagaria a retomada do aluno.
  const { elemento, recebidos } = tocadorCom({ readyState: 1, duration: 10 });
  elemento.disparar("ended");
  assert.equal(recebidos.at(-1)!.didJustFinish, true);

  elemento.disparar("timeupdate");
  assert.equal(recebidos.at(-1)!.didJustFinish, false);
});

test("seekTo recebe SEGUNDOS e emite o novo ponto", () => {
  const { elemento, tocador, recebidos } = tocadorCom({ readyState: 1, duration: 300 });
  void tocador.seekTo(65);

  assert.equal(elemento.currentTime, 65);
  assert.equal(recebidos.at(-1)!.currentTime, 65, "sem emitir, a barra so ande no proximo timeupdate");
});

test("seekTo nunca manda o elemento para tras do zero nem para NaN", () => {
  const { elemento, tocador } = tocadorCom({ readyState: 1 });
  void tocador.seekTo(-5);
  assert.equal(elemento.currentTime, 0);

  void tocador.seekTo(Number.NaN);
  assert.equal(elemento.currentTime, 0, "NaN em currentTime quebra o elemento de audio");
});

test("play rejeitado pela politica de autoplay nao vira rejeicao solta", async () => {
  const { tocador } = tocadorCom({ play: () => Promise.reject(new Error("NotAllowedError")) });
  assert.doesNotThrow(() => tocador.play());
  await new Promise((resolve) => setImmediate(resolve));
});

test("remove solta ouvinte, pausa e larga o download", () => {
  const { elemento, tocador, recebidos } = tocadorCom({ readyState: 1, duration: 10 });
  const antes = recebidos.length;

  tocador.remove();
  elemento.disparar("timeupdate");

  assert.equal(recebidos.length, antes, "ouvinte sobreviveu ao remove e vai escrever em tela morta");
  assert.equal(elemento.pausou, 1);
  assert.equal(elemento.src, "", "sem zerar o src o audio continua baixando depois da tela sair");
});

test("remover a assinatura para de entregar, sem derrubar o tocador", () => {
  const { elemento, tocador, recebidos, assinatura } = tocadorCom({ readyState: 1, duration: 10 });
  const outros: StatusDeReproducao[] = [];
  tocador.addListener("playbackStatusUpdate", (status) => outros.push(status));

  assinatura.remove();
  elemento.disparar("timeupdate");

  assert.equal(recebidos.at(-1)!.currentTime, 0);
  assert.ok(outros.length > 0, "a outra assinatura tinha de continuar recebendo");
});

test("a velocidade escolhida chega ao <audio> da web", async () => {
  const { criarTocadorDeAudioWeb } = await import("./tocadorDeAudioWeb");
  const elemento = elementoFalso();
  const tocador = criarTocadorDeAudioWeb("https://exemplo.test/a.mp3", () => elemento);
  tocador.setPlaybackRate(1.5);
  assert.equal(elemento.playbackRate, 1.5);
});
