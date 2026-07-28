import { test } from "node:test";
import assert from "node:assert/strict";
import {
  consolidateBlockBatchGenerations,
  partitionContentBlocks,
  resolveContentBlockBatchSize,
  validateBlockBatchGeneration,
} from "./geminiService";
import type { EnrichedContentBlock } from "../types";

function block(index: number, ordem = index): EnrichedContentBlock {
  return {
    id: `bloco-${String(index).padStart(2, "0")}`,
    ordem,
    tema: "Redes",
    topico: `Tópico ${index}`,
    objetivos: [`Compreender o tópico ${index}`],
    conteudo_base: `Base técnica ${index}.`,
    conteudo_aprofundado:
      `Conteúdo aprofundado do bloco ${index}. `
      + "Definições, relações causais, contexto histórico e aplicação prática "
      + "são explicados com detalhes suficientes para formar um capítulo completo. "
      + "O estudante acompanha um exemplo progressivo e conecta o conceito às "
      + "decisões reais de uma arquitetura distribuída.",
    conceitos_chave: ["conceito técnico", "aplicação prática"],
    exemplos_contextos: ["Cenário aplicado em uma rede."],
    ponte_proximo_bloco: "Isso prepara o próximo conceito.",
    source_ids: [`conteudo:${index}`],
  };
}

function chapter(blockId: string, marker: string) {
  return {
    blockId,
    markdown:
      `## ${marker}\n\n`
      + (`Explicação extensa do conteúdo ${marker}, com definição, relação, `
        + "causa, consequência e caso de estudo aplicado. ").repeat(5),
    audioScript:
      (`Narração do capítulo ${marker}, explicando o conceito, o motivo e um `
        + "exemplo aplicado antes da transição. ").repeat(5),
    slides: [{
      title: `Slide ${marker}`,
      topics: ["Definição", "Aplicação"],
      explanation: `Explicação visual completa de ${marker}.`,
      visualDescription: `Diagrama aplicado de ${marker}.`,
      characterQuote: `Vamos compreender ${marker}.`,
      characterAction: "explaining",
      imagePrompt: `Ilustração educacional de ${marker}.`,
      iconPrompts: [`Ícone técnico de ${marker}.`],
      sourceIds: [blockId],
    }],
  };
}

test("particiona todos os blocos em lotes pequenos e preserva a ordem pedagógica", () => {
  const unordered = [
    block(7, 7),
    block(2, 2),
    block(1, 1),
    block(5, 5),
    block(3, 3),
    block(6, 6),
    block(4, 4),
  ];

  const batches = partitionContentBlocks(unordered, 3);

  assert.deepEqual(
    batches.map((batch) => batch.map((item) => item.id)),
    [
      ["bloco-01"],
      ["bloco-02"],
      ["bloco-03"],
      ["bloco-04"],
      ["bloco-05"],
      ["bloco-06"],
      ["bloco-07"],
    ],
  );
  assert.equal(batches.flat().length, unordered.length);
});

test("limita cada lote a um bloco para preservar cobertura integral", () => {
  assert.equal(resolveContentBlockBatchSize(undefined), 1);
  assert.equal(resolveContentBlockBatchSize("4"), 1);
  assert.equal(resolveContentBlockBatchSize(24), 1);
  assert.equal(resolveContentBlockBatchSize(0), 1);
  assert.equal(resolveContentBlockBatchSize(25), 1);
});

test("valida cobertura exata do lote e reordena capítulos pelos ids esperados", () => {
  const batch = [block(1), block(2), block(3)];
  const result = validateBlockBatchGeneration(
    batch,
    {
      chapters: [
        chapter("bloco-03", "TERCEIRO"),
        chapter("bloco-01", "PRIMEIRO"),
        chapter("bloco-02", "SEGUNDO"),
      ],
      confidence: 0.86,
    },
    1,
  );

  assert.deepEqual(
    result.chapters.map((item) => item.blockId),
    ["bloco-01", "bloco-02", "bloco-03"],
  );
  assert.equal(result.confidence, 0.86);
});

test("recusa lote que omite bloco ou devolve texto resumido", () => {
  const batch = [block(1), block(2)];
  assert.throws(
    () => validateBlockBatchGeneration(
      batch,
      { chapters: [chapter("bloco-01", "UM")], confidence: 0.9 },
      1,
    ),
    /omitiu ou acrescentou capítulos/,
  );

  const summarized = chapter("bloco-01", "UM");
  summarized.markdown = "Resumo curto.";
  assert.throws(
    () => validateBlockBatchGeneration(
      [block(1)],
      { chapters: [summarized], confidence: 0.9 },
      1,
    ),
    /Markdown.*resumido/,
  );
});

test("consolida markdown, áudio e slides na ordem global com metadados dos lotes", () => {
  const blocks = [block(1), block(2), block(3), block(4)];
  const batches = partitionContentBlocks(blocks, 2);
  const markers = ["PRIMEIRO", "SEGUNDO", "TERCEIRO", "QUARTO"];
  const generated = batches.map((batch, index) =>
    validateBlockBatchGeneration(
      batch,
      {
        chapters: [chapter(batch[0].id, markers[index])],
        confidence: index === 0 ? 0.6 : 1,
      },
      index + 1,
    )
  );
  for (const result of generated) {
    result.generationProvider = "gemini";
    result.generationModel = "gemini-3-flash-preview";
  }
  generated[3].generationProvider = "openai";
  generated[3].generationModel = "gpt-5.4-mini";
  generated[3].fallbackFrom = "gemini";

  const result = consolidateBlockBatchGenerations(
    blocks,
    [generated[3], generated[1], generated[0], generated[2]],
    { batchSize: 1, family: "presentation", filesCount: 2 },
  );

  assert.ok(result.markdown.indexOf("PRIMEIRO") < result.markdown.indexOf("SEGUNDO"));
  assert.ok(result.markdown.indexOf("SEGUNDO") < result.markdown.indexOf("TERCEIRO"));
  assert.ok(result.audioScript.indexOf("TERCEIRO") < result.audioScript.indexOf("QUARTO"));
  assert.deepEqual(
    result.slides.map((slide) => slide.sourceIds[0]),
    ["bloco-01", "bloco-02", "bloco-03", "bloco-04"],
  );
  assert.equal(result.metadata.generation_mode, "block_batches");
  assert.equal(result.metadata.content_blocks_total, 4);
  assert.equal(result.metadata.content_block_batches, 4);
  assert.equal(result.metadata.content_block_batch_size, 1);
  assert.equal(result.metadata.content_generation_provider, "mixed");
  assert.deepEqual(result.metadata.content_generation_models, [
    "gemini-3-flash-preview",
    "gpt-5.4-mini",
  ]);
  assert.equal(result.metadata.content_generation_fallback_count, 1);
  assert.deepEqual(result.metadata.batch_block_ids, [
    ["bloco-01"],
    ["bloco-02"],
    ["bloco-03"],
    ["bloco-04"],
  ]);
  assert.equal(result.metadata.confidence, 0.9);
});

test("consolidação recusa conjunto de lotes sem cobertura global", () => {
  const blocks = [block(1), block(2)];
  const firstOnly = validateBlockBatchGeneration(
    [blocks[0]],
    { chapters: [chapter("bloco-01", "PRIMEIRO")], confidence: 0.9 },
    1,
  );

  assert.throws(
    () => consolidateBlockBatchGenerations(
      blocks,
      [firstOnly],
      { batchSize: 1, family: "text", filesCount: 0 },
    ),
    /quantidade de lotes/,
  );
});
