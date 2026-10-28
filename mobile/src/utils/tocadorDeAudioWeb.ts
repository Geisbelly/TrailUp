/**
 * O player de áudio do aluno, na web, falando a mesma língua do `expo-audio`.
 *
 * ## Por que existe
 *
 * O `AudioPlayer` tem uma tela inteira no padrão do sistema: botão em `palette.accent`, trilho
 * arrastável, tempo decorrido/total, botão de reiniciar — tudo derivado da cor-assinatura do
 * perfil BrainHex. Na web nada disso aparecia: o componente caía num `<audio controls>` cru, e o
 * aluno via a barra cinza do navegador dentro de um card escuro. Mesmo áudio, duas aparências.
 *
 * Trocar o `<audio>` pelo `expo-audio` na web não é o caminho: o ramo web dele depende de
 * `AudioContext` e de permissões que o elemento nativo já resolve. O que faltava era o
 * **adaptador** — o elemento do HTML com a mesma superfície que o componente já consome.
 *
 * ## A superfície
 *
 * É só o que o `AudioPlayer` chama: `play`, `pause`, `seekTo` (em SEGUNDOS, como no `expo-audio`),
 * `remove` e `addListener("playbackStatusUpdate")`. O status emitido tem os campos que
 * `estadoDeAudio` lê — `isLoaded`, `playing`, `duration`, `currentTime`, `didJustFinish` — e
 * `duration`/`currentTime` saem em segundos, que é o que o elemento do HTML já dá. Assim a
 * conversão para milissegundos continua acontecendo num lugar só.
 *
 * `duration` vem `NaN` antes dos metadados e `Infinity` em stream sem tamanho conhecido. Não é
 * saneado aqui de propósito: `estadoDeAudio` já trata os dois, e sanear nos dois lugares
 * esconderia uma regressão lá.
 */

/** O pedaço do player do `expo-audio` que o `AudioPlayer` realmente usa. */
export type TocadorDeAudioMinimo = {
  play: () => void;
  pause: () => void;
  seekTo: (segundos: number) => Promise<void> | void;
  /** 1 = normal. No `expo-audio` é `setPlaybackRate`; na web, o `playbackRate` do elemento. */
  setPlaybackRate: (velocidade: number) => void;
  remove: () => void;
  addListener: (
    evento: "playbackStatusUpdate",
    ouvinte: (status: StatusDeReproducao) => void
  ) => { remove: () => void };
};

export type StatusDeReproducao = {
  isLoaded: boolean;
  playing: boolean;
  duration: number;
  currentTime: number;
  didJustFinish: boolean;
};

/** O mínimo do `HTMLAudioElement` — declarado para o teste poder dublá-lo sem DOM. */
export type ElementoDeAudio = {
  src: string;
  preload: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  readyState: number;
  playbackRate: number;
  play: () => Promise<void> | void;
  pause: () => void;
  addEventListener: (evento: string, ouvinte: () => void) => void;
  removeEventListener: (evento: string, ouvinte: () => void) => void;
};

/** `HAVE_METADATA`: a partir daqui `duration` vale alguma coisa. */
const METADADOS_PRONTOS = 1;

/**
 * Eventos que mudam o estado visível do player. `timeupdate` é o pulso (o navegador emite a cada
 * ~250 ms durante a reprodução, mais fino que os 350 ms do `updateInterval` nativo); os outros
 * cobrem as transições que o `timeupdate` sozinho atrasaria — apertar pausar e a barra só reagir
 * no próximo pulso é visível.
 */
const EVENTOS = ["loadedmetadata", "durationchange", "timeupdate", "play", "playing", "pause", "seeked", "ended"] as const;

export function criarTocadorDeAudioWeb(
  uri: string,
  criarElemento: () => ElementoDeAudio = () => new Audio() as unknown as ElementoDeAudio
): TocadorDeAudioMinimo {
  const elemento = criarElemento();
  elemento.preload = "metadata";
  elemento.src = uri;

  const ouvintes = new Set<(status: StatusDeReproducao) => void>();
  let terminou = false;

  const emitir = () => {
    const status: StatusDeReproducao = {
      isLoaded: elemento.readyState >= METADADOS_PRONTOS,
      playing: !elemento.paused,
      duration: elemento.duration,
      currentTime: elemento.currentTime,
      // `didJustFinish` é um PULSO, não um estado: o componente usa para zerar a posição salva, e
      // repeti-lo a cada emissão seguinte apagaria uma retomada legítima do aluno.
      didJustFinish: terminou,
    };
    terminou = false;
    ouvintes.forEach((ouvinte) => ouvinte(status));
  };

  const aoTerminar = () => {
    terminou = true;
    emitir();
  };

  for (const evento of EVENTOS) {
    elemento.addEventListener(evento, evento === "ended" ? aoTerminar : emitir);
  }

  return {
    play: () => {
      // O navegador rejeita a promessa quando falta gesto do usuário. Quem chama já veio de um
      // toque no botão; engolir aqui evita um "unhandled rejection" no console por um caso que a
      // tela não tem como tratar melhor.
      void Promise.resolve(elemento.play()).catch(() => undefined);
    },
    pause: () => elemento.pause(),
    setPlaybackRate: (velocidade: number) => {
      elemento.playbackRate = velocidade;
    },
    seekTo: (segundos: number) => {
      elemento.currentTime = Math.max(0, Number(segundos) || 0);
      emitir();
    },
    remove: () => {
      for (const evento of EVENTOS) {
        elemento.removeEventListener(evento, evento === "ended" ? aoTerminar : emitir);
      }
      ouvintes.clear();
      try {
        elemento.pause();
      } catch {}
      // Solta o download em curso: sem isto o áudio continua baixando depois de a tela sair.
      elemento.src = "";
    },
    addListener: (_evento, ouvinte) => {
      ouvintes.add(ouvinte);
      // O elemento pode já ter metadados (cache do navegador) antes de alguém assinar. Sem este
      // primeiro disparo a tela ficaria em "Áudio disponível" com a barra zerada até o aluno
      // apertar play.
      if (elemento.readyState >= METADADOS_PRONTOS) emitir();
      return {
        remove: () => {
          ouvintes.delete(ouvinte);
        },
      };
    },
  };
}
