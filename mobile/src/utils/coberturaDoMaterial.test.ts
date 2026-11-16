import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEmptyBatch,
  EMPTY_STUDY_CONTEXT,
  registrarCobertura,
  restoreUnsentBatch,
  serializeTimeMetricEntries,
  type CurrentStudyContext,
} from "../context/metricas/acumuladorLote";
import {
  COBERTURA_VAZIA,
  COLUNAS_DE_COBERTURA,
  coberturaDoAudio,
  coberturaDosSlides,
  colunasDeCobertura,
  fundirCobertura,
  informarCobertura,
  ouvirCobertura,
  semColunasDeCobertura,
} from "./coberturaDoMaterial";

const T0 = 1_800_000_000_000;
const MATERIAL = "material:content:5:audio:7";

function aberto(over: Partial<CurrentStudyContext> = {}): CurrentStudyContext {
  return {
    ...EMPTY_STUDY_CONTEXT,
    topicoId: 10,
    conteudoId: 5,
    materialKey: MATERIAL,
    materialType: "audio",
    studyState: "active",
    ...over,
  };
}

test("fundir guarda o maior de cada campo e não deixa o que não foi medido apagar o medido", () => {
  const a = fundirCobertura(COBERTURA_VAZIA, { midiaDuracaoSeg: 120, midiaPosicaoMaxSeg: 40 });
  const b = fundirCobertura(a, { midiaPosicaoMaxSeg: 30 });
  const c = fundirCobertura(b, { midiaPosicaoMaxSeg: Number.NaN, slidesVistos: -1 });
  assert.deepEqual(c, { ...COBERTURA_VAZIA, midiaDuracaoSeg: 120, midiaPosicaoMaxSeg: 40 });
});

test("áudio: posição só conta tocando; ao terminar, a faixa inteira", () => {
  // Arrastar a barra até o fim com o áudio parado não é ter ouvido.
  assert.deepEqual(coberturaDoAudio({ isPlaying: false, durationMillis: 120_000, positionMillis: 119_000 }), {
    midiaDuracaoSeg: 120,
  });
  assert.deepEqual(coberturaDoAudio({ isPlaying: true, durationMillis: 120_000, positionMillis: 30_500 }), {
    midiaDuracaoSeg: 120,
    midiaPosicaoMaxSeg: 30.5,
  });
  assert.deepEqual(
    coberturaDoAudio({ isPlaying: false, durationMillis: 120_000, positionMillis: 0, terminou: true }),
    { midiaDuracaoSeg: 120, midiaPosicaoMaxSeg: 120 }
  );
  // Carregando: o player ainda não sabe a duração.
  assert.deepEqual(coberturaDoAudio({ isPlaying: false, durationMillis: 0, positionMillis: 0 }), {});
});

test("slides: conta os distintos dentro do deck", () => {
  assert.deepEqual(coberturaDosSlides(new Set([0, 1, 1, 3, 9]), 5), { slidesVistos: 3, slidesTotal: 5 });
  assert.deepEqual(coberturaDosSlides(new Set([0]), 0), {});
});

test("registrar grava no material aberto e o envio leva só o que foi medido", () => {
  const batch = buildEmptyBatch(T0);
  registrarCobertura(batch, aberto(), { midiaDuracaoSeg: 120.04, midiaPosicaoMaxSeg: 30 });
  registrarCobertura(batch, aberto(), { midiaPosicaoMaxSeg: 45.26 });

  const [entrada] = serializeTimeMetricEntries(batch.timeMetrics.materials);
  assert.equal(entrada.key, MATERIAL);
  assert.equal(entrada.material_tipo, "audio");
  assert.equal(entrada.midia_duracao_seg, 120);
  assert.equal(entrada.midia_posicao_max_seg, 45.3);
  assert.equal("slides_vistos" in entrada, false);
  assert.equal("conteudo_altura_px" in entrada, false);
});

test("sem material aberto, ou com o estudo parado, nada é registrado", () => {
  const batch = buildEmptyBatch(T0);
  registrarCobertura(batch, aberto({ materialKey: null }), { slidesVistos: 2, slidesTotal: 4 });
  registrarCobertura(batch, aberto({ studyState: "idle" }), { slidesVistos: 2, slidesTotal: 4 });
  assert.deepEqual(batch.timeMetrics.materials, {});
});

test("lote devolvido funde a cobertura pelo máximo, não pela soma", () => {
  const velho = buildEmptyBatch(T0);
  registrarCobertura(velho, aberto(), { midiaDuracaoSeg: 120, midiaPosicaoMaxSeg: 60 });
  const atual = buildEmptyBatch(T0 + 60_000);
  registrarCobertura(atual, aberto(), { midiaDuracaoSeg: 120, midiaPosicaoMaxSeg: 50 });

  const [entrada] = serializeTimeMetricEntries(restoreUnsentBatch(velho, atual).timeMetrics.materials);
  assert.equal(entrada.midia_posicao_max_seg, 60);
  assert.equal(entrada.midia_duracao_seg, 120);
});

test("entrada sem cobertura sai com o mesmo formato de antes", () => {
  const batch = buildEmptyBatch(T0);
  registrarCobertura(batch, aberto(), {});
  const [entrada] = serializeTimeMetricEntries(batch.timeMetrics.materials);
  for (const coluna of COLUNAS_DE_COBERTURA) assert.equal(coluna in entrada, false, coluna);
});

test("colunas do caminho direto: só número >= 0, e a regravação tira as seis", () => {
  const linha = colunasDeCobertura({
    conteudo_altura_px: 2400,
    janela_altura_px: 800,
    midia_duracao_seg: null,
    midia_posicao_max_seg: Number.POSITIVE_INFINITY,
    slides_vistos: -2,
    slides_total: 6,
  });
  assert.deepEqual(linha, { conteudo_altura_px: 2400, janela_altura_px: 800, slides_total: 6 });

  const semCobertura = semColunasDeCobertura({ lote_id: "x", active_sec: 5, ...linha });
  assert.deepEqual(semCobertura, { lote_id: "x", active_sec: 5 });
});

test("as seis colunas batem com a API", async () => {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  // O runner roda em `mobile/` (como `designAssets.test.ts`).
  const repo = await readFile(resolve(process.cwd(), "../api/app/repositories/telemetria.py"), "utf8");
  const bloco = repo.slice(repo.indexOf("COLUNAS_DE_COBERTURA:"), repo.indexOf(")\n\n", repo.indexOf("COLUNAS_DE_COBERTURA:")));
  const daApi = [...bloco.matchAll(/\("([a-z_]+)",/g)].map((m) => m[1]);
  assert.deepEqual(daApi, [...COLUNAS_DE_COBERTURA]);
});

test("informar sem ouvinte não faz nada, e ouvinte que lança não derruba quem informa", () => {
  informarCobertura({ slidesVistos: 1 });
  const recebidos: unknown[] = [];
  const cancelar = ouvirCobertura((informe) => {
    recebidos.push(informe);
    throw new Error("ouvinte quebrado");
  });
  assert.doesNotThrow(() => informarCobertura({ slidesVistos: 2, slidesTotal: 3 }));
  cancelar();
  informarCobertura({ slidesVistos: 3 });
  assert.deepEqual(recebidos, [{ slidesVistos: 2, slidesTotal: 3 }]);
});
