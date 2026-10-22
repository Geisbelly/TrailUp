/**
 * Estado de reprodução de áudio, em MILISSEGUNDOS, a partir do status do `expo-audio`.
 *
 * Esta função existe por causa de uma troca de unidade. O `expo-av` reportava
 * `positionMillis`/`durationMillis`; o `expo-audio` reporta `currentTime`/`duration` em
 * **segundos**. O componente inteiro — barra de progresso, formatação de tempo, retomada
 * persistida, troca de imagem por cue — trabalha em milissegundos, e um fator 1000 errado aqui
 * não quebra nada de forma visível: a barra fica parada no início, o tempo mostra 00:00 e a
 * retomada passa a gravar a posição errada. É o tipo de defeito que só aparece com o aluno.
 *
 * Por isso a conversão fica num lugar só, com teste.
 *
 * ## Os valores sujos são a regra, não a exceção
 *
 * Enquanto o áudio carrega — e na web isso dura mais — `duration` chega `NaN` ou `Infinity`, e
 * `currentTime` pode vir negativo. `Math.round(NaN)` é `NaN`, e `NaN` numa largura de barra
 * apaga a barra sem erro no console. Daí o saneamento explícito.
 */

export type EstadoDeReproducao = {
  isLoaded: boolean;
  isPlaying: boolean;
  durationMillis: number;
  positionMillis: number;
};

export const AUDIO_PARADO: EstadoDeReproducao = {
  isLoaded: false,
  isPlaying: false,
  durationMillis: 0,
  positionMillis: 0,
};

/** Segundos (possivelmente `NaN`, `Infinity` ou negativo) -> milissegundos inteiros e >= 0. */
export function millisDeSegundos(segundos: unknown): number {
  const valor = Number(segundos);
  if (!Number.isFinite(valor) || valor <= 0) return 0;
  return Math.round(valor * 1000);
}

/** Milissegundos -> segundos, que é o que `player.seekTo` espera. */
export function segundosDeMillis(millis: unknown): number {
  const valor = Number(millis);
  if (!Number.isFinite(valor) || valor <= 0) return 0;
  return valor / 1000;
}

type StatusDoExpoAudio = {
  isLoaded?: boolean;
  playing?: boolean;
  duration?: number;
  currentTime?: number;
  didJustFinish?: boolean;
};

/**
 * O status do `expo-audio` no formato que o player do aluno usa.
 *
 * `isLoaded` falso devolve tudo zerado, como o `expo-av` fazia: a tela já trata esse estado como
 * "ainda carregando" e mostrar duração de um áudio não carregado daria barra pulando.
 */
export function estadoDeAudio(status: StatusDoExpoAudio | null | undefined): EstadoDeReproducao {
  if (!status || !status.isLoaded) return AUDIO_PARADO;

  const durationMillis = millisDeSegundos(status.duration);
  const positionMillis = millisDeSegundos(status.currentTime);

  return {
    isLoaded: true,
    isPlaying: Boolean(status.playing),
    durationMillis,
    // A posição nunca passa da duração: no fim da faixa o `currentTime` às vezes ultrapassa por
    // alguns milissegundos, e isso faria a barra estourar o trilho.
    positionMillis: durationMillis > 0 ? Math.min(positionMillis, durationMillis) : positionMillis,
  };
}
