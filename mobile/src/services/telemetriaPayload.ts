/**
 * Preparacao do payload de telemetria para a GRAVACAO DIRETA no Supabase.
 *
 * Separado de `telemetriaApi.ts` para poder ser testado: aquele arquivo importa
 * o cliente Supabase, que puxa `react-native` e nao carrega em Node.
 */

import type {
  TelemetryBatchPayload,
  TelemetryCameraFrame,
} from "@/interfaces/telemetria/TelemetryContracts";

/**
 * Tipo proprio de proposito: sem `frame_b64` isto NAO e um payload de envio
 * valido, e o tipo diz isso. Assim ninguem devolve o valor sanitizado para o
 * caminho da API por engano — a analise de emocao depende dos bytes.
 */
export type PayloadParaBanco = Omit<TelemetryBatchPayload, "camera"> & {
  camera: Omit<TelemetryBatchPayload["camera"], "frames" | "frame_b64"> & {
    frames: Omit<TelemetryCameraFrame, "frame_b64">[];
    frames_count: number;
  };
};

/**
 * Espelha `_sanitize_lote_payload` da API: tira os bytes das imagens do payload
 * que vai para `telemetria_lotes`, mantendo a forma (quantos frames houve, de
 * quando, em que formato).
 *
 * Vale SO na gravacao direta. O envio para a API continua levando os frames — e
 * o pipeline de emocao que os consome, e sanitizar antes disso mataria a
 * analise. Sem API alcancavel nao ha pipeline, entao guardar os bytes nao serve
 * a nada: ate 30 JPEGs em base64 por lote (`MAX_CAMERA_FRAMES_PER_BATCH`)
 * ficariam num JSONB para sempre, e num caminho sem supervisao.
 */
/**
 * Descarta a camera INTEIRA antes de o lote ir para a fila em disco.
 *
 * A fila guardava o payload como veio, com os frames em base64. Medido no banco,
 * um frame pesa ~2,5 MB; com `MAX_CAMERA_FRAMES_PER_BATCH` = 30 um lote chega a
 * ~75 MB, e `MAX_LOTES_OUTBOX` = 50 daria alguns GB — no AsyncStorage, que e
 * SQLite e guarda a fila inteira como UM valor numa unica chave. Um lote grande
 * nao falha sozinho: impede a gravacao de todos os outros. A fila que existe
 * para nao perder telemetria parava de funcionar exatamente quando a camera
 * estava ligada.
 *
 * Descartar e certo tambem por semantica: o frame serve a analise de emocao no
 * instante em que foi capturado. Um lote reenviado minutos ou horas depois
 * levaria uma foto que nao corresponde mais ao estado do aluno.
 *
 * `frames: []` com `enabled: false`, e nao frames sem os bytes: o schema da API
 * exige `frame_b64` em cada frame, e uma lista de frames incompletos seria 422 —
 * o lote inteiro recusado, que e o oposto do que a fila quer.
 */
export function descartarCameraParaFila(
  payload: TelemetryBatchPayload
): TelemetryBatchPayload {
  if (!payload.camera?.enabled && !(payload.camera?.frames?.length)) {
    return payload;
  }

  return {
    ...payload,
    camera: { enabled: false, frames: [] },
  };
}

export function sanitizarCameraParaBanco(
  payload: TelemetryBatchPayload
): PayloadParaBanco {
  const { frame_b64: _cameraSemBytes, frames, ...camera } = payload.camera ?? {};
  const listaDeFrames = Array.isArray(frames) ? frames : [];

  return {
    ...payload,
    camera: {
      ...camera,
      frames: listaDeFrames.map(({ frame_b64: _descartado, ...resto }) => resto),
      frames_count: listaDeFrames.length,
    },
  };
}
