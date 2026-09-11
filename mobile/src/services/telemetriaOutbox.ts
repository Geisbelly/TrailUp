import type { TelemetryBatchPayload } from "../interfaces/telemetria/TelemetryContracts";
import {
  criarFilaDuravel,
  ehErroPermanente,
  escoarItens,
  podarItens,
  type ItemEnfileirado,
} from "./filaDuravel";

/**
 * Fila durável de lotes de telemetria que não conseguiram ser gravados.
 *
 * Sem ela, um lote que falha vive só na memória do `MetricasContext`: se o
 * sistema mata o app — o caso comum, porque a falha acontece justamente ao ir
 * para segundo plano — o tempo de estudo daquele trecho some. Gravar em disco
 * é a alternativa para a perda de persistência: o lote espera o próximo
 * momento em que o envio volta a funcionar.
 *
 * A MÁQUINA da fila (poda, classificação de erro, escoamento) mora em
 * `filaDuravel`, compartilhada com a fila de progresso e pontos. Aqui fica só
 * o que é de telemetria: os limites e o tipo do payload. Antes esta era a
 * única fila do app e as duas coisas viviam juntas; separá-las evitou copiar a
 * regra para a segunda fila, que é como duas cópias começam a divergir.
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

export type LoteEnfileirado = ItemEnfileirado<TelemetryBatchPayload>;

const fila = criarFilaDuravel<TelemetryBatchPayload>({
  chave: CHAVE,
  maxItens: MAX_LOTES_OUTBOX,
  validadeMs: VALIDADE_OUTBOX_MS,
  rotulo: "telemetriaOutbox",
});

/** Descarta o que venceu e depois o excedente mais antigo. */
export function podarLotes(
  lotes: LoteEnfileirado[],
  agora: number,
): LoteEnfileirado[] {
  return podarItens(lotes, agora, {
    maxItens: MAX_LOTES_OUTBOX,
    validadeMs: VALIDADE_OUTBOX_MS,
  });
}

export { ehErroPermanente };

/** Reenvia do mais antigo para o mais novo. Ver `escoarItens`. */
export async function escoarLotes(
  fila: LoteEnfileirado[],
  enviar: (payload: TelemetryBatchPayload) => Promise<unknown>,
): Promise<{ enviados: number; descartados: number; restante: LoteEnfileirado[] }> {
  return escoarItens(fila, enviar, "telemetriaOutbox");
}

/** Guarda um lote que não pôde ser gravado, para tentar de novo mais tarde. */
export async function enfileirarLoteTelemetria(
  payload: TelemetryBatchPayload,
): Promise<void> {
  await fila.enfileirar(payload);
}

export async function contarLotesPendentes(): Promise<number> {
  return fila.contarPendentes();
}

export async function drenarLotesTelemetria(
  enviar: (payload: TelemetryBatchPayload) => Promise<unknown>,
): Promise<{ enviados: number; descartados: number; pendentes: number }> {
  return fila.drenar(enviar);
}
