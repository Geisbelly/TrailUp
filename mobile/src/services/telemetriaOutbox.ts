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
 * Códigos que significam "este lote NUNCA vai ser aceito": chave única violada,
 * FK apontando para linha que não existe mais (classe removida, por exemplo),
 * NOT NULL, tipo inválido. Retentar não muda o resultado.
 */
const CODIGOS_PERMANENTES = new Set(["23505", "23503", "23502", "22P02", "22007"]);

function codigoDoErro(erro: unknown): string | null {
  if (!erro || typeof erro !== "object") return null;
  const codigo = (erro as { code?: unknown }).code;
  return typeof codigo === "string" ? codigo : null;
}

/**
 * Distingue "ainda não dá" de "isto nunca vai passar".
 *
 * Na dúvida, RETENTAR: descartar um lote por um erro que era temporário perde
 * tempo de estudo do aluno para sempre. Só o que é reconhecidamente definitivo
 * sai da fila.
 */
export function ehErroPermanente(erro: unknown): boolean {
  const codigo = codigoDoErro(erro);
  if (codigo && CODIGOS_PERMANENTES.has(codigo)) return true;

  const status = (erro as { status?: unknown } | null)?.status;
  // 4xx de validação; 408 e 429 são temporários e ficam de fora de propósito.
  if (typeof status === "number" && status >= 400 && status < 500) {
    return status !== 408 && status !== 429;
  }

  return false;
}

/**
 * Reenvia do mais antigo para o mais novo.
 *
 * Para no primeiro erro **retentável**: se o envio ainda não voltou, insistir
 * nos seguintes só gasta bateria e rede.
 *
 * Mas um erro DEFINITIVO não pode parar a fila. Antes qualquer falha dava
 * `break`, e um lote que nunca seria aceito — o caso comum era 23505, o lote já
 * gravado voltando porque a resposta se perdeu — ficava na cabeça da fila
 * trancando **todos os que estavam atrás dele** até vencerem os 7 dias. Uma
 * resposta perdida custava uma semana de telemetria, não um lote.
 */
export async function escoarLotes(
  fila: LoteEnfileirado[],
  enviar: (payload: TelemetryBatchPayload) => Promise<unknown>
): Promise<{ enviados: number; descartados: number; restante: LoteEnfileirado[] }> {
  let enviados = 0;
  let descartados = 0;
  let indice = 0;

  for (; indice < fila.length; indice += 1) {
    try {
      await enviar(fila[indice].payload);
      enviados += 1;
    } catch (erro) {
      if (!ehErroPermanente(erro)) break;

      descartados += 1;
      console.warn(
        "[telemetriaOutbox] Lote descartado por erro definitivo; a fila segue.",
        erro
      );
    }
  }

  return { enviados, descartados, restante: fila.slice(indice) };
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
  try {
    return parsearFila(await AsyncStorage.getItem(CHAVE));
  } catch {
    // Fila corrompida não pode derrubar a telemetria viva. Perder a fila é
    // ruim; travar a coleta em curso é pior.
    return [];
  }
}

async function gravar(lotes: LoteEnfileirado[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CHAVE, JSON.stringify(lotes));
  } catch (erro) {
    console.warn("[telemetriaOutbox] Não foi possível gravar a fila:", erro);
  }
}

/** Guarda um lote que não pôde ser gravado, para tentar de novo mais tarde. */
export async function enfileirarLoteTelemetria(
  payload: TelemetryBatchPayload
): Promise<void> {
  const fila = await ler();
  fila.push({ enfileiradoEm: Date.now(), payload });
  await gravar(podarLotes(fila, Date.now()));
}

export async function contarLotesPendentes(): Promise<number> {
  return podarLotes(await ler(), Date.now()).length;
}

export async function drenarLotesTelemetria(
  enviar: (payload: TelemetryBatchPayload) => Promise<unknown>
): Promise<{ enviados: number; descartados: number; pendentes: number }> {
  const fila = podarLotes(await ler(), Date.now());
  if (fila.length === 0) {
    return { enviados: 0, descartados: 0, pendentes: 0 };
  }

  const { enviados, descartados, restante } = await escoarLotes(fila, enviar);
  await gravar(restante);
  return { enviados, descartados, pendentes: restante.length };
}
