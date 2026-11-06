/**
 * Quem cala a narração do deck: ela entra no coordenador de `controleDeAudio` como áudio e vídeo.
 *
 * ## São duas vozes, e `Speech.stop()` só alcança uma
 *
 * No Android o WebView não tem Web Speech: o polyfill manda o texto para o `expo-speech`. No iOS o
 * WKWebView tem a API, o polyfill fica de fora e quem fala é o próprio WebKit. Medido no simulador:
 * com a narração no ar, `speechSynthesis.speaking` é `true` e `Speech.isSpeakingAsync()` é `false`.
 * Por isso calar exige os dois braços, cada um no seu `try`, para a falha de um não deixar a voz
 * ligada.
 *
 * ## Por que `terminou` recebe o id
 *
 * Trocar de fala para a anterior, e o `onStopped` dela chega depois de a nova assumir. Sem conferir
 * o id, esse aviso atrasado soltaria a narração nova, e áudio nenhum conseguiria mais calá-la.
 *
 * No iOS o app só fica sabendo que a fala começou, não que acabou. Sobra, no máximo, um dono que
 * cala uma voz já parada, o que não tem efeito.
 */
import {
  assumirReproducao,
  soltarReproducao,
  type DonoDaReproducao,
} from "@/utils/controleDeAudio";

export type OpcoesDaNarracao = {
  /** A voz do `expo-speech`, a que o polyfill usa. */
  pararVozDoApp: () => void;
  /** A voz do WebKit, que só se cala de dentro da página. */
  pararVozDoDeck: () => void;
};

export type NarracaoDoDeck = DonoDaReproducao & {
  /** Antes de a voz sair: quem estava tocando se cala primeiro. */
  comecou: (id: string) => void;
  terminou: (id: string) => void;
};

export function criarNarracaoDoDeck(opcoes: OpcoesDaNarracao): NarracaoDoDeck {
  let falaAtual: string | null = null;

  const narracao: NarracaoDoDeck = {
    comecou: (id) => {
      falaAtual = id;
      assumirReproducao(narracao);
    },

    terminou: (id) => {
      if (id !== falaAtual) return;
      falaAtual = null;
      soltarReproducao(narracao);
    },

    pausar: () => {
      falaAtual = null;
      soltarReproducao(narracao);
      try {
        opcoes.pararVozDoApp();
      } catch {}
      try {
        opcoes.pararVozDoDeck();
      } catch {}
    },
  };

  return narracao;
}
