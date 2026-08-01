import { test } from "node:test";
import assert from "node:assert/strict";
import {
  consolidateBlockBatchGenerations,
  generateOpenAIFallbackChapters,
  mergeContentBlocksIntoOne,
  mergeSplitFallbackChapters,
  partitionContentBlocks,
  resolveContentBlockBatchSize,
  resolveContentBlockConcurrency,
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

test("mergeContentBlocksIntoOne junta todos os blocos num unico bloco sintetico, na ordem certa", () => {
  const unordered = [block(3, 3), block(1, 1), block(2, 2)];

  const merged = mergeContentBlocksIntoOne(unordered);

  assert.equal(merged.id, "documento-completo");
  assert.equal(merged.ordem, 1);
  // conteudo_base concatena na ordem pedagogica (1, 2, 3), nao na ordem de entrada.
  const base1Index = merged.conteudo_base.indexOf("Base técnica 1.");
  const base2Index = merged.conteudo_base.indexOf("Base técnica 2.");
  const base3Index = merged.conteudo_base.indexOf("Base técnica 3.");
  assert.ok(base1Index >= 0 && base2Index > base1Index && base3Index > base2Index);
  // conteudo_aprofundado de cada bloco original continua presente por inteiro.
  for (const original of unordered) {
    assert.ok(merged.conteudo_aprofundado.includes(original.conteudo_aprofundado));
  }
  // listas agregadas sem duplicatas.
  assert.deepEqual(
    merged.conceitos_chave,
    ["conceito técnico", "aplicação prática"],
  );
  assert.deepEqual(merged.source_ids, ["conteudo:1", "conteudo:2", "conteudo:3"]);
});

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

test("usa concorrência pequena e aplica um teto seguro", () => {
  assert.equal(resolveContentBlockConcurrency(undefined), 2);
  assert.equal(resolveContentBlockConcurrency("3"), 3);
  assert.equal(resolveContentBlockConcurrency(4), 4);
  assert.equal(resolveContentBlockConcurrency(12), 4);
  assert.equal(resolveContentBlockConcurrency(0), 2);
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

test("recusa audioScript curto quando requireAudio nao e passado (default preserva o comportamento atual)", () => {
  const shortAudio = chapter("bloco-01", "UM");
  shortAudio.audioScript = "curto";
  assert.throws(
    () => validateBlockBatchGeneration([block(1)], { chapters: [shortAudio], confidence: 0.9 }, 1),
    /Áudio.*resumido/,
  );
});

test("aceita audioScript vazio quando requireAudio=false - fallback OpenAI nao tem audio do Gemini", () => {
  const noAudio = chapter("bloco-01", "UM");
  noAudio.audioScript = "";
  const result = validateBlockBatchGeneration(
    [block(1)],
    { chapters: [noAudio], confidence: 0.9 },
    1,
    { requireAudio: false },
  );

  assert.equal(result.chapters[0].audioScript, "");
  assert.ok(result.chapters[0].markdown.length > 0);
});

test("corrige sourceIds do slide quando o lote tem um unico bloco valido, em vez de recusar a tentativa", () => {
  // Lote sempre tem 1 bloco hoje (batch size = 1) - com um unico id valido,
  // sourceIds ausente/errado nao e ambiguo: so pode ser [blockId]. Reprovar
  // a tentativa inteira por isso descarta markdown/audio bons que vieram
  // corretos no mesmo capitulo, so por um campo de rastreabilidade que o
  // fallback OpenAI as vezes esquece de preencher.
  const missingSourceIds = chapter("bloco-01", "UM");
  missingSourceIds.slides[0].sourceIds = [];
  const result = validateBlockBatchGeneration(
    [block(1)],
    { chapters: [missingSourceIds], confidence: 0.9 },
    1,
  );
  assert.deepEqual(result.chapters[0].slides[0].sourceIds, ["bloco-01"]);

  const wrongSourceIds = chapter("bloco-01", "UM");
  wrongSourceIds.slides[0].sourceIds = ["bloco-99"];
  const corrected = validateBlockBatchGeneration(
    [block(1)],
    { chapters: [wrongSourceIds], confidence: 0.9 },
    1,
  );
  assert.deepEqual(corrected.chapters[0].slides[0].sourceIds, ["bloco-01"]);
});

test("recusa slide fora do lote quando ha mais de um bloco valido (preserva a checagem multi-bloco)", () => {
  const outOfBatch = chapter("bloco-01", "UM");
  outOfBatch.slides[0].sourceIds = ["bloco-99"];
  assert.throws(
    () => validateBlockBatchGeneration(
      [block(1), block(2)],
      {
        chapters: [outOfBatch, chapter("bloco-02", "DOIS")],
        confidence: 0.9,
      },
      1,
    ),
    /não referencia seu bloco/,
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
    { batchSize: 1, concurrency: 2, family: "presentation", filesCount: 2 },
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
  assert.equal(result.metadata.content_block_concurrency, 2);
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

test("mergeSplitFallbackChapters combina áudio (Gemini), texto e slides (OpenAI) por blockId", () => {
  const merged = mergeSplitFallbackChapters(
    ["bloco-01", "bloco-02"],
    {
      chapters: [
        { blockId: "bloco-01", audioScript: "Narração do bloco 1." },
        { blockId: "bloco-02", audioScript: "Narração do bloco 2." },
      ],
      confidence: 0.9,
    },
    {
      chapters: [
        { blockId: "bloco-02", markdown: "## Bloco 2" },
        { blockId: "bloco-01", markdown: "## Bloco 1" },
      ],
      confidence: 0.8,
    },
    {
      chapters: [
        { blockId: "bloco-01", slides: [{ title: "Slide 1" }] },
        { blockId: "bloco-02", slides: [{ title: "Slide 2" }] },
      ],
      confidence: 0.7,
    },
  );

  assert.deepEqual(merged.chapters, [
    {
      blockId: "bloco-01",
      markdown: "## Bloco 1",
      audioScript: "Narração do bloco 1.",
      slides: [{ title: "Slide 1" }],
    },
    {
      blockId: "bloco-02",
      markdown: "## Bloco 2",
      audioScript: "Narração do bloco 2.",
      slides: [{ title: "Slide 2" }],
    },
  ]);
  // Confiança final é a mais conservadora das três chamadas independentes.
  assert.equal(merged.confidence, 0.7);
});

test("mergeSplitFallbackChapters preenche campos ausentes em vez de omitir o blockId", () => {
  const merged = mergeSplitFallbackChapters(
    ["bloco-01"],
    { chapters: [], confidence: 0.9 },
    { chapters: [{ blockId: "bloco-01", markdown: "## Bloco 1" }], confidence: 0.8 },
    null,
  );

  assert.deepEqual(merged.chapters, [
    { blockId: "bloco-01", markdown: "## Bloco 1", audioScript: "", slides: [] },
  ]);
  assert.equal(merged.confidence, 0);
});

test("generateOpenAIFallbackChapters mantém markdown/slides mesmo quando o audioScript (Gemini) falha", async () => {
  const result = await generateOpenAIFallbackChapters(["bloco-01"], {
    generateAudioScript: async () => {
      throw new Error("Gemini indisponível (circuito de cooldown aberto)");
    },
    generateMarkdown: async () => ({
      chapters: [{ blockId: "bloco-01", markdown: "## Bloco 1" }],
      confidence: 0.8,
    }),
    generateSlides: async () => ({
      chapters: [{ blockId: "bloco-01", slides: [{ title: "Slide 1" }] }],
      confidence: 0.7,
    }),
  });

  assert.deepEqual(result.chapters, [
    { blockId: "bloco-01", markdown: "## Bloco 1", audioScript: "", slides: [{ title: "Slide 1" }] },
  ]);
});

test("generateOpenAIFallbackChapters propaga a falha quando markdown (OpenAI) falha - sem outro fallback", async () => {
  await assert.rejects(
    () => generateOpenAIFallbackChapters(["bloco-01"], {
      generateAudioScript: async () => ({ chapters: [], confidence: 0.9 }),
      generateMarkdown: async () => {
        throw new Error("OpenAI indisponível");
      },
      generateSlides: async () => ({ chapters: [], confidence: 0.7 }),
    }),
    /OpenAI indisponível/,
  );
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
      { batchSize: 1, concurrency: 2, family: "text", filesCount: 0 },
    ),
    /quantidade de lotes/,
  );
});
