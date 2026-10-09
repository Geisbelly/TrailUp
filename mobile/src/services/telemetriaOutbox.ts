import AsyncStorage from "@react-native-async-storage/async-storage";

import type { TelemetryBatchPayload } from "../interfaces/telemetria/TelemetryContracts";

/**
 * Fila durável de lotes de telemetria que não conseguiram ser gravados.
 *
 * Sem ela, um lote que falha vive só na memória do `MetricasContext`: se o
 * sistema mata o app — o caso comum, porque a falha acontece justamente ao ir
 * para segundo plano — o tempo de estudo daquele trecho some. Gravar em disco
 * é a alternativa para a perda de persistência: o lote espera o próximo
 * momento em que o envio volta a funcionar.
 *
 * As regras de poda e de escoamento ficam em funções puras (`podarLotes`,
 * `escoarLotes`) para poderem ser testadas sem AsyncStorage.
 */

const CHAVE = "trailup:telemetria-outbox";

/**
 * Teto de lotes guardados. A fila é um seguro contra falha temporária, não um
 * arquivo: um aluno offline por dias encheria o armazenamento do aparelho, e o
 * lote mais antigo é também o menos útil para a análise. Ao estourar, descarta
 * do começo.
 */
export const MAX_LOTES_OUTBOX = 50;

/**
 * Depois disso o lote é velho demais para realimentar o ciclo de
 * personalização — entra no banco só para distorcer médias de tempo recentes.
 */
export const VALIDADE_OUTBOX_MS = 7 * 24 * 60 * 60 * 1000;

export type LoteEnfileirado = {
  enfileiradoEm: number;
  payload: TelemetryBatchPayload;
  /**
   * Quantas vezes este lote especifico ja' falhou. Opcional para a fila que ja'
   * esta' em disco continuar valendo — ausente conta como zero.
   */
  tentativas?: number;
};

/**
 * Teto de tentativas por lote.
 *
 * O `break` do `escoarLotes` esta' certo para falha TRANSITORIA: se a rede
 * caiu, insistir nos seguintes so' gasta bateria. Mas ele nao distingue isso de
 * falha PERMANENTE -- um lote que o servidor sempre recusa fica na cabeca da
 * fila e bloqueia todos os de tras ate vencer, sete dias depois.
 *
 * O contador resolve sem desfazer o `break`: enquanto o lote estiver abaixo do
 * teto, a fila continua parando nele (comportamento atual, bateria preservada).
 * Ao passar do teto, ele e' descartado e a fila volta a andar.
 *
 * 5 e' generoso de proposito: uma queda de rede comum nao chega la', e quem
 * chega provavelmente nao vai passar nunca.
 */
export const MAX_TENTATIVAS_POR_LOTE = 5;

/** Descarta o que venceu e depois o excedente mais antigo. */
export function podarLotes(
  lotes: LoteEnfileirado[],
  agora: number
): LoteEnfileirado[] {
  const vigentes = lotes.filter(
    (lote) => agora - lote.enfileiradoEm <= VALIDADE_OUTBOX_MS
  );
  return vigentes.slice(-MAX_LOTES_OUTBOX);
}

/**
 * Reenvia do mais antigo para o mais novo e **para no primeiro que falhar**:
 * se o envio ainda não voltou, insistir nos seguintes só gasta bateria e rede.
 * O que já passou sai da fila mesmo assim, então o progresso parcial não é
 * perdido.
 */
export async function escoarLotes(
  fila: LoteEnfileirado[],
  enviar: (payload: TelemetryBatchPayload) => Promise<unknown>
): Promise<{ enviados: number; restante: LoteEnfileirado[]; falhou: LoteEnfileirado | null }> {
  let enviados = 0;
  for (const lote of fila) {
    try {
      const response = await enviar(lote.payload);
      if (response && typeof response === 'object' && 'persisted' in response && response.persisted !== true) {
        throw new Error('Lote ainda não persistido');
      }
      enviados += 1;
    } catch {
      // Continua parando aqui — quem decide se este lote sobrevive e'
      // `registrarFalha`, com o contador de tentativas.
      return { enviados, restante: fila.slice(enviados), falhou: lote };
    }
  }
  return { enviados, restante: [], falhou: null };
}

/**
 * Soma uma tentativa ao lote que falhou e descarta se passou do teto.
 *
 * Pura de proposito: a decisao de jogar fora dado do aluno nao pode depender de
 * AsyncStorage para ser testada.
 */
export function registrarFalha(
  fila: LoteEnfileirado[],
  falhou: LoteEnfileirado | null,
  limite: number = MAX_TENTATIVAS_POR_LOTE
): { fila: LoteEnfileirado[]; descartado: LoteEnfileirado | null } {
  if (!falhou) return { fila, descartado: null };

  const alvo = identity(falhou.payload);
  let descartado: LoteEnfileirado | null = null;

  const proxima = fila.flatMap((item) => {
    if (identity(item.payload) !== alvo) return [item];
    const tentativas = (item.tentativas ?? 0) + 1;
    if (tentativas >= limite) {
      descartado = { ...item, tentativas };
      return [];
    }
    return [{ ...item, tentativas }];
  });

  return { fila: proxima, descartado };
}

function parsearFila(bruto: string | null): LoteEnfileirado[] {
  if (!bruto) return [];
  const dados = JSON.parse(bruto);
  if (!Array.isArray(dados)) return [];
  return dados
    .filter(
      (item): item is LoteEnfileirado =>
        !!item && typeof item.enfileiradoEm === "number" && !!item.payload
    )
    .map((item) => ({
      ...item,
      // Valor estranho vira 0 em vez de descartar o lote: perder dado do aluno
      // por causa de um campo de controle seria pior que recomecar a contagem.
      tentativas:
        typeof item.tentativas === "number" && Number.isFinite(item.tentativas) && item.tentativas > 0
          ? Math.floor(item.tentativas)
          : 0,
    }));
}

async function ler(): Promise<LoteEnfileirado[]> {
  // Falhar não significa fila vazia: sobrescrevê-la perderia lotes pendentes.
  return parsearFila(await AsyncStorage.getItem(CHAVE));
}

async function gravar(lotes: LoteEnfileirado[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAVE, JSON.stringify(lotes));
  } catch (erro) {
    console.warn("[telemetriaOutbox] Não foi possível gravar a fila:", erro);
    throw erro;
  }
}

let queueWrite: Promise<unknown> = Promise.resolve();
function mutateQueue<T>(action: () => Promise<T>): Promise<T> {
  const result = queueWrite.catch(() => undefined).then(action);
  queueWrite = result.catch(() => undefined);
  return result;
}
function identity(payload: TelemetryBatchPayload) {
  return `${payload.sessao_id}:${payload.captured_at}:${payload.flush_reason}`;
}

/** Guarda um lote que não pôde ser gravado, para tentar de novo mais tarde. */
export async function enfileirarLoteTelemetria(
  payload: TelemetryBatchPayload
): Promise<void> {
  await mutateQueue(async () => {
    const fila = await ler();
    if (!fila.some((item) => identity(item.payload) === identity(payload))) {
      fila.push({ enfileiradoEm: Date.now(), payload });
    }
    await gravar(podarLotes(fila, Date.now()));
  });
}

export async function contarLotesPendentes(): Promise<number> {
  return podarLotes(await ler(), Date.now()).length;
}

let drainInFlight: Promise<{ enviados: number; pendentes: number }> | null = null;
export function drenarLotesTelemetria(
  enviar: (payload: TelemetryBatchPayload) => Promise<unknown>
): Promise<{ enviados: number; pendentes: number }> {
  if (drainInFlight) return drainInFlight;
  drainInFlight = (async () => {
    const fila = await mutateQueue(async () => podarLotes(await ler(), Date.now()));
    const { enviados, falhou } = await escoarLotes(fila, enviar);
    const sent = new Set(fila.slice(0, enviados).map((item) => identity(item.payload)));
    const pendentes = await mutateQueue(async () => {
      // Keep batches appended while network delivery was in flight.
      const remaining = podarLotes(await ler(), Date.now()).filter((item) => !sent.has(identity(item.payload)));
      const { fila: atualizada, descartado } = registrarFalha(remaining, falhou);
      if (descartado) {
        // Descarte de dado do aluno nunca acontece em silencio.
        console.warn(
          `[telemetriaOutbox] lote descartado apos ${descartado.tentativas} tentativas; ` +
            "a fila estava travada nele.",
          identity(descartado.payload)
        );
      }
      await gravar(atualizada);
      return atualizada.length;
    });
    return { enviados, pendentes };
  })().finally(() => { drainInFlight = null; });
  return drainInFlight;
}
