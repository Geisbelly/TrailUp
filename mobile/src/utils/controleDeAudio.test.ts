import assert from "node:assert/strict";
import test from "node:test";

import {
  assumirReproducao,
  criarControleDeAudio,
  encerrarTocador,
  haReproducaoEmCurso,
  soltarReproducao,
  tocandoSegundoOStatus,
  type ControleDeAudio,
} from "./controleDeAudio";
import type { TocadorDeAudioMinimo } from "./tocadorDeAudioWeb";

/**
 * Imita o nativo do `expo-audio` 1.1.1, inclusive no que importa: `remove()` NÃO para o som. Só
 * `pause()` e `release()` param. Um dublê mais gentil deixaria passar o defeito que este arquivo
 * existe para travar.
 */
function tocadorFalso() {
  const chamadas: string[] = [];
  const tocador = {
    chamadas,
    audivel: false,
    liberado: false,
    get playing() {
      return tocador.audivel;
    },
    play() {
      chamadas.push("play");
      tocador.audivel = true;
    },
    pause() {
      chamadas.push("pause");
      tocador.audivel = false;
    },
    seekTo() {
      chamadas.push("seekTo");
    },
    setPlaybackRate() {},
    remove() {
      chamadas.push("remove");
    },
    release() {
      chamadas.push("release");
      tocador.audivel = false;
      tocador.liberado = true;
    },
    addListener() {
      if (tocador.liberado) throw new Error("player liberado");
      return { remove() {} };
    },
  };
  return tocador;
}

function adiado() {
  let soltar!: () => void;
  const promessa = new Promise<void>((resolver) => {
    soltar = resolver;
  });
  return { promessa, soltar };
}

function montar(extra: { preparar?: () => Promise<void>; configurar?: () => Promise<void> } = {}) {
  const criados: ReturnType<typeof tocadorFalso>[] = [];
  const estado = { querTocar: false, carregando: false, falhou: false };
  const controle: ControleDeAudio = criarControleDeAudio({
    preparar: extra.preparar ?? (async () => undefined),
    instanciar: () => {
      const novo = tocadorFalso();
      criados.push(novo);
      return novo as unknown as TocadorDeAudioMinimo;
    },
    configurar: extra.configurar ?? (async () => undefined),
    assinar: (tocador) => tocador.addListener("playbackStatusUpdate", () => undefined),
    aoMudarIntencao: (valor) => {
      estado.querTocar = valor;
    },
    aoCarregar: (valor) => {
      estado.carregando = valor;
    },
    aoFalhar: () => {
      estado.falhou = true;
    },
  });
  return { controle, criados, estado };
}

test("sair da tela tocando cala o audio de verdade", async () => {
  const { controle, criados } = montar();
  await controle.tocar();
  assert.equal(criados[0].audivel, true);

  controle.encerrar();

  assert.equal(criados[0].audivel, false, "o audio continuou tocando depois de encerrar");
  assert.equal(criados[0].liberado, true, "sem release o player nativo fica vivo");
  assert.equal(controle.tocador(), null);
});

test("encerrar pausa antes de remover e libera por ultimo", () => {
  const tocador = tocadorFalso();
  encerrarTocador(tocador as unknown as TocadorDeAudioMinimo);
  assert.deepEqual(tocador.chamadas, ["pause", "remove", "release"]);
});

test("falha em um passo nao impede os seguintes", () => {
  const tocador = tocadorFalso();
  tocador.pause = () => {
    throw new Error("nativo recusou");
  };
  encerrarTocador(tocador as unknown as TocadorDeAudioMinimo);
  assert.equal(tocador.liberado, true);
});

test("sair enquanto o tocador ainda nao existe nao cria audio orfao", async () => {
  const preparo = adiado();
  const { controle, criados, estado } = montar({ preparar: () => preparo.promessa });

  const tocando = controle.tocar();
  controle.encerrar();
  preparo.soltar();
  await tocando;

  assert.equal(criados.length, 0, "tocador nasceu depois de a tela sair");
  assert.equal(estado.querTocar, false);
  assert.equal(estado.carregando, false);
});

test("sair durante a retomada nao toca nem assina player liberado", async () => {
  const retomada = adiado();
  const { controle, criados, estado } = montar({ configurar: () => retomada.promessa });

  const tocando = controle.tocar();
  await new Promise((resolver) => setImmediate(resolver));
  assert.equal(criados.length, 1);

  controle.encerrar();
  retomada.soltar();
  await tocando;

  assert.equal(criados[0].audivel, false);
  assert.equal(criados[0].liberado, true);
  assert.equal(estado.falhou, false, "sair da tela nao e falha do audio");
});

test("dois pedidos ao mesmo tempo criam um tocador so", async () => {
  const preparo = adiado();
  const { controle, criados } = montar({ preparar: () => preparo.promessa });

  const pedidos = [controle.tocar(), controle.obter(), controle.tocar()];
  preparo.soltar();
  await Promise.all(pedidos);

  assert.equal(criados.length, 1, "o segundo tocador ficaria orfao, tocando sem controle");
});

test("pausar enquanto carrega impede o audio de sair depois", async () => {
  const preparo = adiado();
  const { controle, criados } = montar({ preparar: () => preparo.promessa });

  const tocando = controle.tocar();
  controle.pausar();
  preparo.soltar();
  await tocando;

  assert.equal(criados[0].audivel, false);
});

test("o botao pausa durante o carregamento, quando o status diz parado", async () => {
  const { controle, criados, estado } = montar();
  await controle.tocar();
  // Android carregando: `isLoaded` falso e `playing` falso. Não diz nada sobre o que o aluno quer.
  controle.sincronizar(tocandoSegundoOStatus({ isLoaded: false, playing: false, isBuffering: true }));
  assert.equal(estado.querTocar, true);

  await controle.alternar();

  assert.equal(criados[0].audivel, false, "o botao de pausar chamou play");
  assert.equal(criados[0].chamadas.at(-1), "pause");
});

test("o botao pausa quando o tocador toca sem a tela saber", async () => {
  const { controle, criados, estado } = montar();
  await controle.tocar();
  controle.sincronizar(false);
  assert.equal(estado.querTocar, false);
  assert.equal(criados[0].audivel, true);

  await controle.alternar();

  assert.equal(criados[0].audivel, false);
});

test("a telemetria sabe quando ha som saindo, inclusive em pausa fora do botao", async () => {
  const { controle } = montar();

  await controle.tocar();
  assert.equal(haReproducaoEmCurso(), true);

  controle.sincronizar(null);
  assert.equal(haReproducaoEmCurso(), true, "carregando nao e pausa");

  controle.sincronizar(false);
  assert.equal(haReproducaoEmCurso(), false);
});

test("alternar pausa e volta no mesmo tocador", async () => {
  const { controle, criados } = montar();
  await controle.alternar();
  await controle.alternar();
  assert.equal(criados[0].audivel, false);
  await controle.alternar();
  assert.equal(criados[0].audivel, true);
  assert.equal(criados.length, 1);
  controle.encerrar();
});

test("tocar outro audio cala o que estava tocando", async () => {
  const a = montar();
  const b = montar();
  await a.controle.tocar();
  await b.controle.tocar();

  assert.equal(a.criados[0].audivel, false, "dois audios tocando juntos");
  assert.equal(a.estado.querTocar, false, "a tela do primeiro continuou dizendo Reproduzindo");
  assert.equal(b.criados[0].audivel, true);
  b.controle.encerrar();
});

test("quem carrega devagar nao cala quem foi tocado depois", async () => {
  const preparo = adiado();
  const lento = montar({ preparar: () => preparo.promessa });
  const rapido = montar();

  const tocandoLento = lento.controle.tocar();
  await rapido.controle.tocar();
  preparo.soltar();
  await tocandoLento;

  assert.equal(lento.criados[0].audivel, false);
  assert.equal(rapido.criados[0].audivel, true);
  rapido.controle.encerrar();
});

test("status atrasado de quem foi calado nao cala quem assumiu", async () => {
  const a = montar();
  const b = montar();
  await a.controle.tocar();
  await b.controle.tocar();

  a.controle.sincronizar(true);

  assert.equal(b.criados[0].audivel, true);
  b.controle.encerrar();
  a.controle.encerrar();
});

test("o fim da faixa pausa antes de voltar ao inicio", async () => {
  const { controle, criados, estado } = montar();
  await controle.tocar();

  controle.terminou();

  assert.deepEqual(criados[0].chamadas.slice(-2), ["pause", "seekTo"]);
  assert.equal(estado.querTocar, false);
});

test("falha ao criar avisa a tela e solta a intencao", async () => {
  const { controle, estado } = montar({
    preparar: async () => {
      throw new Error("sem modo de audio");
    },
  });

  await controle.tocar();

  assert.equal(estado.falhou, true);
  assert.equal(estado.querTocar, false);
  assert.equal(estado.carregando, false);
});

test("o controle continua usavel depois de encerrar", async () => {
  // A troca de URL encerra e a mesma instância toca a fonte nova; o StrictMode faz o mesmo.
  const { controle, criados } = montar();
  await controle.tocar();
  controle.encerrar();
  await controle.tocar();

  assert.equal(criados.length, 2);
  assert.equal(criados[1].audivel, true);
  controle.encerrar();
});

test("solto, o dono nao e pausado por quem assume depois", () => {
  let pausou = false;
  const dono = { pausar: () => { pausou = true; } };
  const outro = { pausar: () => undefined };

  assumirReproducao(dono);
  soltarReproducao(dono);
  assumirReproducao(outro);

  assert.equal(pausou, false);
  soltarReproducao(outro);
});

test("o status so conclui quando ha o que concluir", () => {
  assert.equal(tocandoSegundoOStatus({ isLoaded: true, playing: true }), true);
  assert.equal(tocandoSegundoOStatus({ isLoaded: true, playing: false }), false);
  assert.equal(tocandoSegundoOStatus({ isLoaded: false, playing: false }), null);
  assert.equal(tocandoSegundoOStatus({ isLoaded: true, playing: false, isBuffering: true }), null);
});
