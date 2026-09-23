/**
 * Orquestração do ciclo da sessão de telemetria: abrir, descarregar lote,
 * encerrar e o timer de envio. Fica fora de `MetricasContext.tsx` (que importa
 * react-native) para ser testável com node:test, como `acumuladorLote.ts`.
 *
 * O ciclo não conhece o formato do lote nem do payload: quem monta o retrato
 * (`capturar`) e quem envia (`enviar`) é o contexto.
 */

export type RefSessao<S> = { current: S | null };

export type DependenciasCicloSessao<S, C, R> = {
  /** A sessão ativa (o `sessionRef` do contexto). */
  sessao: RefSessao<S>;
  /**
   * Retrato síncrono do lote da sessão ativa: fecha o tempo até agora, monta o
   * payload e gira o acumulador. `null` sem sessão.
   */
  capturar: (motivo: string) => C | null;
  /** Envia um retrato já tirado (rede, depois fila em disco). */
  enviar: (capturado: C) => Promise<R | null>;
  /** Grava o evento de fim da sessão ativa no lote dela. */
  registrarFim: (motivo: string) => void;
  /** Zera o estado local da sessão que acabou (lote, contexto, câmera, flag de ativa). */
  limpar: (motivo: string) => void;
  agendar: (fn: () => void, ms: number) => unknown;
  cancelar: (id: unknown) => void;
  intervaloMs: number;
};

export type CicloSessao<R> = {
  abrir: (criar: () => void) => void;
  descarregar: (motivo: string) => Promise<R | null>;
  encerrar: (motivo: string) => Promise<R | null>;
  iniciarTimer: () => void;
  pararTimer: () => void;
};

/**
 * Por que o encerramento não espera a rede (medido em 23/09, turma 54): cada
 * lote levava ~64 s (a API inalcançável estourava e o cliente caía na gravação
 * direta), e os envios são uma fila só. O fim da sessão entrava nessa fila e só
 * fechava a sessão DEPOIS da sua vez — 24 min depois, no caso medido. Enquanto
 * esperava, uma guarda fazia todo outro encerramento voltar sem fazer nada, a
 * abertura do tópico seguinte criava a sessão nova por cima da velha, e o fim
 * atrasado, quando finalmente rodava, lia a sessão ativa NAQUELE momento: mandou
 * o 'screen_blur' com o id de outra sessão e derrubou a sessão errada.
 *
 * Agora o fim é local e imediato: o retrato do lote é tirado na hora, a sessão é
 * zerada na hora, e só o envio desse retrato espera a fila.
 */
export function criarCicloSessao<S, C, R>(deps: DependenciasCicloSessao<S, C, R>): CicloSessao<R> {
  let fila: Promise<unknown> = Promise.resolve();
  let intervaloPendente: Promise<R | null> | null = null;
  let timer: unknown = null;

  function naFila<T>(tarefa: () => Promise<T>): Promise<T> {
    const proxima = fila.catch(() => undefined).then(tarefa);
    fila = proxima;
    return proxima;
  }

  function descarregar(motivo: string): Promise<R | null> {
    // Um intervalo ainda não iniciado já cobre este pedido: ele tira o retrato
    // quando roda e leva tudo o que acumulou até lá. Sem isto, cada intervalo
    // fechado do relógio de estudo empilhava um envio de ~64 s na fila.
    if (motivo === 'interval' && intervaloPendente) return intervaloPendente;
    const pedido: Promise<R | null> = naFila(() => {
      if (intervaloPendente === pedido) intervaloPendente = null;
      const capturado = deps.capturar(motivo);
      return capturado ? deps.enviar(capturado) : Promise.resolve(null);
    });
    if (motivo === 'interval') intervaloPendente = pedido;
    return pedido;
  }

  function pararTimer() {
    if (timer != null) {
      deps.cancelar(timer);
      timer = null;
    }
  }

  function iniciarTimer() {
    pararTimer();
    if (!deps.sessao.current) return;
    timer = deps.agendar(() => {
      void descarregar('interval').catch(() => undefined);
    }, deps.intervaloMs);
  }

  /**
   * Fecha a sessão ativa NA HORA e devolve o envio do lote final. Tudo antes do
   * `return` é síncrono: quem chama sem `await` já encontra a sessão zerada.
   * O envio não rejeita — a falha já foi registrada por `enviar`, e quem chama
   * com `void` não pode ficar com uma rejeição solta.
   */
  function encerrar(motivo: string): Promise<R | null> {
    if (!deps.sessao.current) return Promise.resolve(null);
    deps.registrarFim(motivo);
    const capturado = deps.capturar(motivo);
    pararTimer();
    deps.limpar(motivo);
    if (!capturado) return Promise.resolve(null);
    return naFila(() => deps.enviar(capturado)).catch(() => null);
  }

  /** Troca de sessão: encerra a ativa (se houver) e abre a nova com `criar`. */
  function abrir(criar: () => void): void {
    if (deps.sessao.current) void encerrar('session_end');
    criar();
    iniciarTimer();
  }

  return { abrir, descarregar, encerrar, iniciarTimer, pararTimer };
}
