/**
 * Quem manda no som do aluno: garante que parar para de verdade e que só uma coisa toca por vez.
 *
 * ## `remove()` do `expo-audio` NÃO para o áudio
 *
 * No `expo-audio` 1.1.1 o `remove()` só tira o player do registro do módulo nativo
 * (`registry.remove` no iOS, `players.remove` no Android). Quem pausa e solta o player é o
 * `release()` do `SharedObject`, que é o que o `useAudioPlayer` chama. Chamando só `remove()`, o
 * som continua, a referência se perde e o player sai do registro, então nem a pausa de segundo
 * plano do módulo o alcança: nada mais consegue pará-lo. Por isso `encerrarTocador` existe e é o
 * único caminho de saída.
 *
 * ## Por que a orquestração mora fora do componente
 *
 * Criar o tocador tem `await` no meio, e a tela pode sair durante esses `await`. Sem o controle de
 * geração o tocador nascia depois da saída, ninguém mais o conhecia e ele tocava para sempre. Sem
 * a criação única, dois toques faziam dois tocadores. Aqui dá para testar isso sem renderizar.
 *
 * ## Intenção, não status
 *
 * O botão decide pelo que o aluno pediu (`querTocar`) somado ao `playing` do próprio tocador, e
 * não pelo último status. Enquanto carrega, o status diz `playing: false` (e `isLoaded: false` no
 * Android), e decidir por ele fazia o botão de pausar chamar `play()`.
 */
import type { StatusDeReproducao, TocadorDeAudioMinimo } from "@/utils/tocadorDeAudioWeb";

/** Quem está fazendo som. Áudio e vídeo entram aqui para um calar o outro. */
export type DonoDaReproducao = { pausar: () => void };

let ativo: DonoDaReproducao | null = null;

/** Só uma coisa toca por vez: quem assume cala quem estava tocando. */
export function assumirReproducao(dono: DonoDaReproducao) {
  const anterior = ativo;
  ativo = dono;
  if (!anterior || anterior === dono) return;
  try {
    anterior.pausar();
  } catch {}
}

export function soltarReproducao(dono: DonoDaReproducao) {
  if (ativo === dono) ativo = null;
}

/** Áudio ou vídeo saindo agora: para a telemetria é estudo, mesmo sem toque na tela. */
export function haReproducaoEmCurso() {
  return ativo !== null;
}

/** Cada passo no seu `try`: uma falha no primeiro não pode deixar o áudio tocando. */
export function encerrarTocador(tocador: Pick<TocadorDeAudioMinimo, "pause" | "remove" | "release">) {
  try {
    tocador.pause();
  } catch {}
  try {
    tocador.remove();
  } catch {}
  try {
    tocador.release?.();
  } catch {}
}

/**
 * O que o status diz sobre estar tocando: `null` quando ele ainda não permite concluir. Carregando,
 * `playing` vem falso mesmo com o áudio prestes a sair, e isso não é "o aluno pausou".
 */
export function tocandoSegundoOStatus(status: Partial<StatusDeReproducao> & { isBuffering?: boolean }) {
  if (status.playing) return true;
  if (!status.isLoaded || status.isBuffering) return null;
  return false;
}

type Assinatura = { remove: () => void };

export type OpcoesDoControle = {
  /** Tudo o que precisa acontecer antes de o tocador existir. */
  preparar: () => Promise<void>;
  instanciar: () => TocadorDeAudioMinimo;
  /** Velocidade e retomada, com o tocador já criado. */
  configurar: (tocador: TocadorDeAudioMinimo) => Promise<void>;
  assinar: (tocador: TocadorDeAudioMinimo, controle: ControleDeAudio) => Assinatura;
  aoMudarIntencao: (querTocar: boolean) => void;
  aoCarregar: (carregando: boolean) => void;
  aoFalhar: () => void;
};

export type ControleDeAudio = DonoDaReproducao & {
  tocador: () => TocadorDeAudioMinimo | null;
  obter: () => Promise<TocadorDeAudioMinimo | null>;
  tocar: (antes?: (tocador: TocadorDeAudioMinimo) => Promise<void> | void) => Promise<void>;
  alternar: () => Promise<void>;
  /** Fim da faixa: sem pausar antes do `seekTo(0)`, o Android recomeça sozinho. */
  terminou: () => void;
  sincronizar: (tocando: boolean | null) => void;
  encerrar: () => void;
};

export function criarControleDeAudio(opcoes: OpcoesDoControle): ControleDeAudio {
  let tocador: TocadorDeAudioMinimo | null = null;
  let assinatura: Assinatura | null = null;
  let criacao: Promise<TocadorDeAudioMinimo | null> | null = null;
  // Sobe a cada encerramento: o que estava em `await` descobre que não vale mais.
  let geracao = 0;
  let querTocar = false;

  const definirIntencao = (valor: boolean) => {
    if (querTocar === valor) return;
    querTocar = valor;
    opcoes.aoMudarIntencao(valor);
  };

  const soltarTocador = () => {
    const atual = tocador;
    tocador = null;
    try {
      assinatura?.remove();
    } catch {}
    assinatura = null;
    if (atual) encerrarTocador(atual);
  };

  const abrir = async (daGeracao: number) => {
    await opcoes.preparar();
    if (daGeracao !== geracao) return null;

    const novo = opcoes.instanciar();
    tocador = novo;
    await opcoes.configurar(novo);
    // `encerrar` já cuidou deste tocador; assinar um player liberado lança no nativo.
    if (daGeracao !== geracao) return null;

    assinatura = opcoes.assinar(novo, controle);
    return novo;
  };

  const controle: ControleDeAudio = {
    tocador: () => tocador,

    obter: () => {
      if (tocador && assinatura) return Promise.resolve(tocador);
      if (criacao) return criacao;

      const daGeracao = geracao;
      opcoes.aoCarregar(true);
      const emCurso: Promise<TocadorDeAudioMinimo | null> = abrir(daGeracao)
        .catch(() => {
          if (daGeracao !== geracao) return null;
          soltarTocador();
          opcoes.aoFalhar();
          return null;
        })
        .finally(() => {
          if (criacao !== emCurso) return;
          criacao = null;
          opcoes.aoCarregar(false);
        });
      criacao = emCurso;
      return emCurso;
    },

    tocar: async (antes) => {
      // Assume no toque, não depois de carregar: quem carrega devagar não pode calar quem foi
      // tocado depois dele.
      definirIntencao(true);
      assumirReproducao(controle);

      const pronto = await controle.obter();
      if (!pronto) {
        controle.pausar();
        return;
      }
      await antes?.(pronto);
      // Pausou, saiu da tela ou outro áudio assumiu enquanto isto carregava.
      if (!querTocar || tocador !== pronto) return;
      pronto.play();
    },

    pausar: () => {
      definirIntencao(false);
      soltarReproducao(controle);
      try {
        tocador?.pause();
      } catch {}
    },

    alternar: async () => {
      if (querTocar || tocador?.playing) {
        controle.pausar();
        return;
      }
      await controle.tocar();
    },

    terminou: () => {
      const atual = tocador;
      controle.pausar();
      try {
        void atual?.seekTo(0);
      } catch {}
    },

    sincronizar: (tocando) => {
      if (tocando === null) return;
      definirIntencao(tocando);
      // Pausa que não passou pelo botão (ligação, fone desconectado): o som parou.
      if (!tocando) soltarReproducao(controle);
    },

    encerrar: () => {
      geracao += 1;
      if (criacao) {
        criacao = null;
        opcoes.aoCarregar(false);
      }
      definirIntencao(false);
      soltarReproducao(controle);
      soltarTocador();
    },
  };

  return controle;
}
