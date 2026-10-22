import test from "node:test";
import assert from "node:assert/strict";
import { AUDIO_PARADO, estadoDeAudio, millisDeSegundos, segundosDeMillis } from "./estadoDeAudio";

test("segundos do expo-audio viram milissegundos (a troca de unidade da #25)", () => {
  // O `expo-av` dava `positionMillis`; o `expo-audio` da' `currentTime` em SEGUNDOS. Errar o
  // fator aqui deixa a barra parada e a retomada gravando a posicao errada, sem erro nenhum.
  const estado = estadoDeAudio({ isLoaded: true, playing: true, duration: 125.5, currentTime: 12.25 });
  assert.equal(estado.durationMillis, 125500);
  assert.equal(estado.positionMillis, 12250);
  assert.equal(estado.isPlaying, true);
});

test("duracao suja durante o carregamento vira zero, nao NaN", () => {
  // `NaN` numa largura de barra apaga a barra sem reclamar. Na web isso dura mais.
  assert.equal(millisDeSegundos(Number.NaN), 0);
  assert.equal(millisDeSegundos(Number.POSITIVE_INFINITY), 0);
  assert.equal(millisDeSegundos(-5), 0);
  assert.equal(millisDeSegundos(undefined), 0);
  const estado = estadoDeAudio({ isLoaded: true, playing: false, duration: Number.NaN, currentTime: 3 });
  assert.equal(estado.durationMillis, 0);
  assert.equal(Number.isNaN(estado.positionMillis), false);
});

test("posicao nunca passa da duracao", () => {
  // No fim da faixa o `currentTime` as vezes ultrapassa por alguns ms e a barra estouraria.
  const estado = estadoDeAudio({ isLoaded: true, playing: false, duration: 10, currentTime: 10.4 });
  assert.equal(estado.positionMillis, 10000);
});

test("audio nao carregado devolve tudo zerado, como o expo-av fazia", () => {
  assert.deepEqual(estadoDeAudio({ isLoaded: false, playing: false }), AUDIO_PARADO);
  assert.deepEqual(estadoDeAudio(null), AUDIO_PARADO);
  assert.deepEqual(estadoDeAudio(undefined), AUDIO_PARADO);
});

test("millis -> segundos para o seekTo, que e o caminho de volta", () => {
  assert.equal(segundosDeMillis(12250), 12.25);
  assert.equal(segundosDeMillis(0), 0);
  assert.equal(segundosDeMillis(-1), 0);
  assert.equal(segundosDeMillis(Number.NaN), 0);
});

test("ida e volta nao acumula erro na posicao retomada", () => {
  // A retomada grava millis e o `seekTo` recebe segundos: se a conversao nao fechar, cada
  // pausa/retomada desloca o ponto de retorno.
  let millis = 61_500;
  for (let i = 0; i < 5; i += 1) {
    millis = millisDeSegundos(segundosDeMillis(millis));
  }
  assert.equal(millis, 61_500);
});
