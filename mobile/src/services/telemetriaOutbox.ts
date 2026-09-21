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
};

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
): Promise<{ enviados: number; restante: LoteEnfileirado[] }> {
  let enviados = 0;
  for (const lote of fila) {
    try {
      const response = await enviar(lote.payload);
      if (response && typeof response === 'object' && 'persisted' in response && response.persisted !== true) {
        throw new Error('Lote ainda não persistido');
      }
      enviados += 1;
    } catch {
      break;
    }
  }
  return { enviados, restante: fila.slice(enviados) };
}

function parsearFila(bruto: string | null): LoteEnfileirado[] {
  if (!bruto) return [];
  const dados = JSON.parse(bruto);
  if (!Array.isArray(dados)) return [];
  return dados.filter(
    (item): item is LoteEnfileirado =>
      !!item && typeof item.enfileiradoEm === "number" && !!item.payload
  );
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
    const { enviados } = await escoarLotes(fila, enviar);
    const sent = new Set(fila.slice(0, enviados).map((item) => identity(item.payload)));
    const pendentes = await mutateQueue(async () => {
      // Keep batches appended while network delivery was in flight.
      const remaining = podarLotes(await ler(), Date.now()).filter((item) => !sent.has(identity(item.payload)));
      await gravar(remaining);
      return remaining.length;
    });
    return { enviados, pendentes };
  })().finally(() => { drainInFlight = null; });
  return drainInFlight;
}
