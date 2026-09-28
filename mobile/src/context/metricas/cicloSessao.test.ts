import assert from 'node:assert/strict';
import test from 'node:test';
import { criarCicloSessao } from './cicloSessao';

type Sessao = { id: string; lote: string[] };
type Retrato = { sessaoId: string; motivo: string; eventos: string[] };

/**
 * Sessão falsa cujo lote é a lista de eventos. `lento` segura cada envio até
 * `liberarTodos` — é o que acontecia com a API inalcançável, em que cada lote
 * levava ~64 s (23/09, turma 54).
 */
function montar() {
  const sessao: { current: Sessao | null } = { current: null };
  const iniciados: Retrato[] = [];
  const pendentes: Array<() => void> = [];
  const timers = new Map<number, () => void>();
  let proximoTimer = 1;
  let lento = false;

  const ciclo = criarCicloSessao<Sessao, Retrato, string>({
    sessao,
    capturar: (motivo) => {
      const ativa = sessao.current;
      if (!ativa) return null;
      const retrato = { sessaoId: ativa.id, motivo, eventos: [...ativa.lote] };
      ativa.lote = [];
      return retrato;
    },
    enviar: (retrato) => {
      iniciados.push(retrato);
      if (!lento) return Promise.resolve('ok');
      return new Promise((resolve) => pendentes.push(() => resolve('ok')));
    },
    registrarFim: (motivo) => {
      sessao.current?.lote.push(`fim:${motivo}`);
    },
    limpar: () => {
      sessao.current = null;
    },
    agendar: (fn) => {
      const id = proximoTimer++;
      timers.set(id, fn);
      return id;
    },
    cancelar: (id) => {
      timers.delete(id as number);
    },
    intervaloMs: 60_000,
  });

  return {
    ciclo,
    sessao,
    iniciados,
    timers,
    criar: (id: string) => () => {
      sessao.current = { id, lote: [`inicio:${id}`] };
    },
    lento: () => {
      lento = true;
    },
    liberarTodos: async () => {
      await microtarefas();
      while (pendentes.length) {
        pendentes.shift()!();
        await microtarefas();
      }
    },
  };
}

const microtarefas = () => new Promise((resolve) => setImmediate(resolve));

test('sair do tópico encerra a sessão na hora, sem esperar a rede', async () => {
  const h = montar();
  h.lento();
  await h.ciclo.abrir(h.criar('S135'));

  void h.ciclo.encerrar('screen_blur');

  assert.equal(h.sessao.current, null);
  assert.equal(h.timers.size, 0, 'o timer de envio da sessão encerrada continuou vivo');
});

test('com o envio anterior pendente, a sessão seguinte também é encerrada com o fim dela', async () => {
  // 131 -> 133: o fim do 131 esperava a rede, e o do 133 batia na guarda e
  // não fazia nada — o 133 nunca chegou ao banco.
  const h = montar();
  h.lento();
  await h.ciclo.abrir(h.criar('S131'));
  void h.ciclo.encerrar('screen_blur');
  await h.ciclo.abrir(h.criar('S133'));
  void h.ciclo.encerrar('screen_blur');
  await h.liberarTodos();

  const finais = h.iniciados.filter((r) => r.motivo === 'screen_blur');
  assert.deepEqual(
    finais.map((r) => [r.sessaoId, r.eventos]),
    [
      ['S131', ['inicio:S131', 'fim:screen_blur']],
      ['S133', ['inicio:S133', 'fim:screen_blur']],
    ],
  );
});

test('o lote final leva a sessão que acabou, mesmo esperando atrás de outro envio', async () => {
  // O 'screen_blur' chegou ao banco 24 min depois, com o id de OUTRA sessão e
  // sem o evento de fim: ele lia a sessão ativa na hora em que rodava.
  const h = montar();
  h.lento();
  await h.ciclo.abrir(h.criar('S131'));
  void h.ciclo.descarregar('interval');
  void h.ciclo.encerrar('screen_blur');
  await h.ciclo.abrir(h.criar('S135'));
  await h.liberarTodos();

  const final = h.iniciados.find((r) => r.motivo === 'screen_blur');
  assert.equal(final?.sessaoId, 'S131');
  assert.ok(final?.eventos.includes('fim:screen_blur'), JSON.stringify(final));
});

test('o fim atrasado da sessão anterior não derruba a sessão nova', async () => {
  const h = montar();
  h.lento();
  await h.ciclo.abrir(h.criar('S134'));
  void h.ciclo.encerrar('screen_blur');
  await h.ciclo.abrir(h.criar('S135'));
  await h.liberarTodos();

  assert.equal(h.sessao.current?.id, 'S135');
  assert.equal(h.timers.size, 1, 'a sessão nova ficou sem timer de envio');
});

test('abrir outra sessão não espera a rede para encerrar a anterior', async () => {
  const h = montar();
  h.lento();
  await h.ciclo.abrir(h.criar('S1'));

  void h.ciclo.abrir(h.criar('S2'));
  await microtarefas();

  assert.equal(h.sessao.current?.id, 'S2');
  await h.liberarTodos();
  const fimDaAnterior = h.iniciados.find((r) => r.sessaoId === 'S1' && r.eventos.includes('fim:session_end'));
  assert.ok(fimDaAnterior, JSON.stringify(h.iniciados));
});

test('pedidos de intervalo enquanto um envio está em voo viram um só', async () => {
  // O relógio de estudo pede um lote a cada intervalo fechado. Com cada envio
  // levando ~64 s, a fila crescia sem parar — e era atrás dela que o fim da
  // sessão esperava.
  const h = montar();
  h.lento();
  await h.ciclo.abrir(h.criar('S1'));
  void h.ciclo.descarregar('interval');
  await microtarefas();
  assert.equal(h.iniciados.length, 1, 'o primeiro envio devia estar em voo');
  for (let i = 0; i < 5; i++) void h.ciclo.descarregar('interval');
  await h.liberarTodos();

  assert.equal(h.iniciados.filter((r) => r.motivo === 'interval').length, 2);
});

test('motivos com significado não são fundidos', async () => {
  const h = montar();
  h.lento();
  await h.ciclo.abrir(h.criar('S1'));
  void h.ciclo.descarregar('interval');
  void h.ciclo.descarregar('topic_complete');
  void h.ciclo.descarregar('activity_complete');
  await h.liberarTodos();

  assert.deepEqual(h.iniciados.map((r) => r.motivo), ['interval', 'topic_complete', 'activity_complete']);
});

test('encerrar duas vezes a mesma sessão manda um lote final só', async () => {
  const h = montar();
  await h.ciclo.abrir(h.criar('S1'));
  void h.ciclo.encerrar('screen_blur');
  void h.ciclo.encerrar('app_background');
  await h.liberarTodos();

  assert.equal(h.iniciados.filter((r) => r.eventos.some((e) => e.startsWith('fim:'))).length, 1);
});
