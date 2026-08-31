import assert from "node:assert/strict";
import test from "node:test";

import {
  descartarCameraParaFila,
  sanitizarCameraParaBanco,
} from "./telemetriaPayload";

function payload(frames: number, over: Record<string, unknown> = {}) {
  return {
    sessao_id: "11111111-1111-4111-8111-111111111111",
    classe_id: 1,
    topico_id: 10,
    screen_name: "trilha_topico",
    route_name: "/(tabs)/trilha/[id]",
    flush_reason: "interval",
    captured_at: "2026-08-30T21:32:00.000Z",
    session_started_at: "2026-08-30T21:31:00.000Z",
    study_elapsed_sec: 60,
    screen_dwell_sec: 60,
    active_sec: 55,
    idle_sec: 5,
    touch_count: 3,
    scroll_distance_px: 100,
    max_depth_px: 200,
    time_metrics: {
      general: {},
      topics: [],
      contents: [],
      activities: [],
      materials: [],
    },
    signals: [],
    eventos_app: [],
    touch_samples: [],
    camera: {
      enabled: frames > 0,
      frame_mime: "image/jpeg",
      frame_b64: "TOPO-BASE64",
      frames: Array.from({ length: frames }, (_, i) => ({
        captured_at: `2026-08-30T21:3${i}:00.000Z`,
        frame_mime: "image/jpeg" as const,
        frame_b64: `BYTES-DA-FOTO-${i}`,
      })),
    },
    ...over,
  } as any;
}

/** Nenhum `frame_b64` em qualquer profundidade. */
function semBytes(valor: unknown): boolean {
  if (Array.isArray(valor)) return valor.every(semBytes);
  if (valor && typeof valor === "object") {
    if ("frame_b64" in (valor as Record<string, unknown>)) return false;
    return Object.values(valor as Record<string, unknown>).every(semBytes);
  }
  return true;
}

test("os bytes das fotos nao vao para o banco", () => {
  // O bug: `payload: safePayload` gravava o payload inteiro em
  // `telemetria_lotes.payload`, com ate 30 JPEGs do rosto do aluno em base64 —
  // enquanto o caminho da API removia exatamente isso.
  const limpo = sanitizarCameraParaBanco(payload(3));

  assert.ok(semBytes(limpo), "nenhum frame_b64 pode sobreviver");
  assert.ok(!("frame_b64" in limpo.camera));
});

test("a forma da captura e preservada", () => {
  // Quantos frames houve, de quando e em que formato seguem uteis; sao os bytes
  // que nao servem a nada sem o pipeline.
  const limpo = sanitizarCameraParaBanco(payload(3));

  assert.equal(limpo.camera.frames_count, 3);
  assert.equal(limpo.camera.frames.length, 3);
  assert.equal(limpo.camera.enabled, true);
  assert.equal(limpo.camera.frame_mime, "image/jpeg");
  assert.equal(limpo.camera.frames[0].captured_at, "2026-08-30T21:30:00.000Z");
});

test("o resto do payload passa intacto", () => {
  const original = payload(2);
  const limpo = sanitizarCameraParaBanco(original);

  assert.equal(limpo.study_elapsed_sec, 60);
  assert.equal(limpo.sessao_id, original.sessao_id);
  assert.equal(limpo.flush_reason, "interval");
  assert.deepEqual(limpo.time_metrics, original.time_metrics);
});

test("nao muta o payload recebido", () => {
  // O MESMO objeto segue para a fila em disco: se a sanitizacao o mutasse, um
  // reenvio futuro chegaria a API sem os frames e a analise de emocao ficaria
  // cega justamente no lote que falhou.
  const original = payload(2);
  sanitizarCameraParaBanco(original);

  assert.equal(original.camera.frames.length, 2);
  assert.equal(original.camera.frames[0].frame_b64, "BYTES-DA-FOTO-0");
  assert.equal(original.camera.frame_b64, "TOPO-BASE64");
});

test("lote sem camera nao quebra", () => {
  const limpo = sanitizarCameraParaBanco(
    payload(0, { camera: { enabled: false } })
  );

  assert.ok(semBytes(limpo));
  assert.equal(limpo.camera.frames_count, 0);
  assert.deepEqual(limpo.camera.frames, []);
});

test("camera ausente no payload nao quebra", () => {
  const limpo = sanitizarCameraParaBanco(payload(0, { camera: undefined }));

  assert.equal(limpo.camera.frames_count, 0);
  assert.deepEqual(limpo.camera.frames, []);
});

// ---------------------------------------------------------------------------
// A fila em disco nao pode carregar os frames
// ---------------------------------------------------------------------------

test("a camera e descartada antes de o lote ir para a fila", () => {
  // Medido no banco: ~2,5 MB por frame. Com MAX_CAMERA_FRAMES_PER_BATCH = 30 um
  // lote chega a ~75 MB, e MAX_LOTES_OUTBOX = 50 daria alguns GB — no
  // AsyncStorage, que guarda a fila inteira num unico valor.
  const limpo = descartarCameraParaFila(payload(3));

  assert.equal(limpo.camera.enabled, false);
  assert.deepEqual(limpo.camera.frames, []);
  assert.ok(semBytes(limpo));
});

test("frames vazios, e nao frames sem os bytes", () => {
  // O schema da API exige `frame_b64` em cada frame: uma lista de frames
  // incompletos seria 422 e o lote inteiro recusado — o oposto do que a fila
  // quer. Por isso a lista fica vazia, nao "sanitizada".
  const limpo = descartarCameraParaFila(payload(2));

  assert.deepEqual(limpo.camera.frames ?? [], []);
  assert.ok(!("frames_count" in limpo.camera), "nada de campo extra no contrato de envio");
});

test("o resto do lote sobrevive ao descarte da camera", () => {
  const original = payload(2);
  const limpo = descartarCameraParaFila(original);

  assert.equal(limpo.study_elapsed_sec, 60);
  assert.equal(limpo.sessao_id, original.sessao_id);
  assert.deepEqual(limpo.time_metrics, original.time_metrics);
});

test("nao muta o payload recebido", () => {
  // O mesmo objeto segue para a gravacao direta, que PRECISA dos frames quando
  // a API esta alcancavel.
  const original = payload(2);
  descartarCameraParaFila(original);

  assert.equal(original.camera.frames.length, 2);
  assert.equal(original.camera.frames[0].frame_b64, "BYTES-DA-FOTO-0");
});

test("lote sem camera passa intacto, sem copia desnecessaria", () => {
  const original = payload(0, { camera: { enabled: false, frames: [] } });
  assert.equal(descartarCameraParaFila(original), original);
});
