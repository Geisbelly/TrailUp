import { test } from "node:test";
import assert from "node:assert/strict";
import {
  consolidateBlockBatchGenerations,
  generateOpenAIFallbackChapters,
  mergeContentBlocksIntoOne,
  mergeSplitFallbackChapters,
  partitionContentBlocks,
  resolveAudioPartConcurrency,
  resolveContentBlockBatchSize,
  resolveContentBlockConcurrency,
  resolveContentGenerationMaxOutputTokens,
  splitProcessedContentIntoParts,
  validateBlockBatchGeneration,
} from "./geminiService";
import type { SlideContent } from "../types";
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
      ["bloco-01", "bloco-02", "bloco-03"],
      ["bloco-04", "bloco-05", "bloco-06"],
      ["bloco-07"],
    ],
  );
  assert.equal(batches.flat().length, unordered.length);
});

test("usa um teto moderado de blocos por lote - nem 1 (martela a cota por bloco) nem o topico inteiro (Gemini resume demais)", () => {
  assert.equal(resolveContentBlockBatchSize(undefined), 6);
  assert.equal(resolveContentBlockBatchSize("4"), 4);
  assert.equal(resolveContentBlockBatchSize(24), 8);
  assert.equal(resolveContentBlockBatchSize(0), 6);
  assert.equal(resolveContentBlockBatchSize(25), 8);
});

test("usa concorrência pequena e aplica um teto seguro", () => {
  assert.equal(resolveContentBlockConcurrency(undefined), 2);
  assert.equal(resolveContentBlockConcurrency("3"), 3);
  assert.equal(resolveContentBlockConcurrency(4), 4);
  assert.equal(resolveContentBlockConcurrency(12), 4);
  assert.equal(resolveContentBlockConcurrency(0), 2);
});

test("usa concorrencia pequena pra geracao de audio por parte e aplica um teto seguro", () => {
  // Regressao: gerar todas as partes de audio de um perfil ao mesmo tempo
  // (ate 8 partes) estourava RPM do free tier do Gemini (~10 req/min por
  // conta) mesmo com rotacao de chave correta - limitar a concorrencia real
  // do fan-out evita a rajada.
  assert.equal(resolveAudioPartConcurrency(undefined), 3);
  assert.equal(resolveAudioPartConcurrency("2"), 2);
  assert.equal(resolveAudioPartConcurrency(4), 4);
  assert.equal(resolveAudioPartConcurrency(10), 4);
  assert.equal(resolveAudioPartConcurrency(0), 3);
});

test("da ao documento mesclado um orcamento de saida maior que o lote normal", () => {
  // O documento mesclado sintetiza TODOS os blocos do topico numa unica
  // chamada (markdown + audioScript); 24576 tokens e curto demais pra essa
  // sintese e o Gemini devolve markdown abaixo do minimo de cobertura mesmo
  // tentando de novo. O lote normal (1 bloco pequeno) continua no teto de
  // sempre.
  assert.equal(resolveContentGenerationMaxOutputTokens(false, {}), 24_576);
  assert.equal(resolveContentGenerationMaxOutputTokens(true, {}), 65_536);
});

test("respeita override por env var, com o mesmo teto minimo de 8192 dos dois casos", () => {
  assert.equal(
    resolveContentGenerationMaxOutputTokens(false, {
      CONTENT_GENERATION_BATCH_MAX_OUTPUT_TOKENS: "24000",
    }),
    24_000,
  );
  assert.equal(
    resolveContentGenerationMaxOutputTokens(true, {
      CONTENT_GENERATION_MERGED_MAX_OUTPUT_TOKENS: "100000",
    }),
    100_000,
  );
  // Env invalida (nao numerica ou zero) cai pro default do caso certo, nunca
  // pro default do outro caso.
  assert.equal(
    resolveContentGenerationMaxOutputTokens(true, {
      CONTENT_GENERATION_MERGED_MAX_OUTPUT_TOKENS: "abc",
    }),
    65_536,
  );
  assert.equal(resolveContentGenerationMaxOutputTokens(true, { CONTENT_GENERATION_BATCH_MAX_OUTPUT_TOKENS: "24000" }), 65_536);
});

test("cobertura minima usa 70% (markdown) / 45% (audio) do texto-fonte, nao 55%/35%", () => {
  // O piso de 55%/35% ja era deliberadamente mais frouxo que o ideal: com
  // markdown/audioScript/slides dividindo o mesmo orcamento de output,
  // 75%/50% (calibracao original) fazia os 6 modelos Gemini disponiveis
  // convergirem consistentemente pra 90-98% do minimo, nunca cruzando -
  // assinatura de teto apertado demais. Com "slides" removido da chamada
  // (nunca chegava ao aluno - ver docs/superpowers/specs/
  // 2026-08-20-blocos-conteudo-profundidade-design.md), markdown/audioScript
  // tem mais orcamento livre e o piso volta a subir, agora pra 70%/45%.
  // Fonte grande o bastante pra o piso absoluto (200/160 chars) nunca ser o
  // fator limitante - só assim o teste exercita de fato o ratio 70%/45%.
  const bigSourceBlock: EnrichedContentBlock = {
    ...block(1),
    conteudo_aprofundado: "x".repeat(2000),
  };
  const fonte = bigSourceBlock.conteudo_aprofundado.length;

  // "x".repeat(fonte) pro campo que NAO esta sob teste em cada sub-caso -
  // sempre acima de qualquer minimo possivel (ratio antigo ou novo), pra
  // isolar exatamente o campo sendo verificado.
  const abaixoDoNovoMinimoMarkdown = chapter("bloco-01", "UM");
  abaixoDoNovoMinimoMarkdown.markdown = "x".repeat(Math.floor(fonte * 0.70) - 1);
  abaixoDoNovoMinimoMarkdown.audioScript = "x".repeat(fonte);
  assert.throws(
    () => validateBlockBatchGeneration(
      [bigSourceBlock],
      { chapters: [abaixoDoNovoMinimoMarkdown], confidence: 0.9 },
      1,
    ),
    /Markdown.*resumido abaixo do mínimo de cobertura/,
  );

  const acimaDoNovoMinimoMarkdown = chapter("bloco-01", "UM");
  acimaDoNovoMinimoMarkdown.markdown = "x".repeat(Math.ceil(fonte * 0.70) + 1);
  acimaDoNovoMinimoMarkdown.audioScript = "x".repeat(fonte);
  // Não deve lançar - markdown já cruza o novo mínimo (70%), mesmo estando
  // bem abaixo do antigo (75%), que teria reprovado esta mesma resposta.
  validateBlockBatchGeneration(
    [bigSourceBlock],
    { chapters: [acimaDoNovoMinimoMarkdown], confidence: 0.9 },
    1,
  );

  const abaixoDoNovoMinimoAudio = chapter("bloco-01", "UM");
  abaixoDoNovoMinimoAudio.markdown = "x".repeat(fonte);
  abaixoDoNovoMinimoAudio.audioScript = "x".repeat(Math.floor(fonte * 0.45) - 1);
  assert.throws(
    () => validateBlockBatchGeneration(
      [bigSourceBlock],
      { chapters: [abaixoDoNovoMinimoAudio], confidence: 0.9 },
      1,
    ),
    /Áudio.*resumido abaixo do mínimo de cobertura/,
  );

  const acimaDoNovoMinimoAudio = chapter("bloco-01", "UM");
  acimaDoNovoMinimoAudio.markdown = "x".repeat(fonte);
  acimaDoNovoMinimoAudio.audioScript = "x".repeat(Math.ceil(fonte * 0.45) + 1);
  // Não deve lançar - áudio já cruza o novo mínimo (45%), mesmo bem abaixo
  // do antigo (50%).
  validateBlockBatchGeneration(
    [bigSourceBlock],
    { chapters: [acimaDoNovoMinimoAudio], confidence: 0.9 },
    1,
  );
});

test("tolerant:true aceita markdown/audio a partir de 95% do minimo calculado, nao 100%", () => {
  // Ultimo recurso da cascata inteira (ver generateAfterPrimaryGeminiFailure
  // em contentGenerationService.ts): sem isso, um resultado a 96% do minimo
  // reprova e falha o bloco/job inteiro por um punhado de caracteres, mesma
  // tolerancia ja usada do lado Python (_MIN_EXPANSION_TOLERANCE_RATIO em
  // content_enrichment.py). So se aplica quando tolerant:true e passado
  // explicitamente - nas tentativas intermediarias o gate continua exigindo
  // 100% do minimo, senao perderia forca em toda geracao.
  const bigSourceBlock: EnrichedContentBlock = {
    ...block(1),
    conteudo_aprofundado: "x".repeat(2000),
  };
  const fonte = bigSourceBlock.conteudo_aprofundado.length;
  const minimoBruto = Math.floor(fonte * 0.70);

  const perto96 = chapter("bloco-01", "UM");
  perto96.markdown = "x".repeat(Math.floor(minimoBruto * 0.96));
  perto96.audioScript = "x".repeat(fonte);

  assert.throws(
    () => validateBlockBatchGeneration(
      [bigSourceBlock],
      { chapters: [perto96], confidence: 0.9 },
      1,
      { tolerant: false },
    ),
    /Markdown.*resumido abaixo do mínimo de cobertura/,
  );

  // Mesma resposta, so com tolerant:true — deve passar (96% > 95%).
  validateBlockBatchGeneration(
    [bigSourceBlock],
    { chapters: [perto96], confidence: 0.9 },
    1,
    { tolerant: true },
  );

  // Mas tolerant:true nao aceita QUALQUER coisa - abaixo de 95% do minimo
  // bruto continua reprovando.
  const abaixoDaTolerancia = chapter("bloco-01", "UM");
  abaixoDaTolerancia.markdown = "x".repeat(Math.floor(minimoBruto * 0.9));
  abaixoDaTolerancia.audioScript = "x".repeat(fonte);
  assert.throws(
    () => validateBlockBatchGeneration(
      [bigSourceBlock],
      { chapters: [abaixoDaTolerancia], confidence: 0.9 },
      1,
      { tolerant: true },
    ),
    /Markdown.*resumido abaixo do mínimo de cobertura/,
  );
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

test("teto de cobertura por orcamento de output evita exigir mais markdown do que uma unica chamada consegue conter", () => {
  // Reproduz o bug real: mergeContentBlocksIntoOne junta N blocos originais
  // num so ("documento-completo"), cujo conteudo_aprofundado bruto cresce
  // com N — mas markdown/audioScript saem de UMA UNICA chamada com orcamento
  // de output fixo (maxOutputTokens). Sem teto, a exigencia de 70% do
  // texto-fonte supera o que a resposta consegue fisicamente conter, e o
  // lote reprova sempre, nao importa quantas vezes o Gemini tente de novo.
  // repeat(300), nao 120: com o ratio (70%/45%, ver minimumMarkdownLength/
  // minimumAudioLength em geminiService.ts), um N menor nao gera fonte
  // grande o bastante pra sequer sem-teto ultrapassar o que a resposta de
  // teste consegue conter — o cenario so se reproduz com fonte
  // proporcionalmente maior.
  const bigBlock = (index: number): EnrichedContentBlock => ({
    ...block(index),
    conteudo_aprofundado: `Conteudo aprofundado do bloco ${index}. `.repeat(300),
  });
  const merged = mergeContentBlocksIntoOne(
    Array.from({ length: 10 }, (_, i) => bigBlock(i + 1)),
  );
  const maxOutputTokens = 16_384;
  const markdownUnit =
    "Síntese coesa cobrindo os conceitos dos blocos mesclados, sem repetir "
    + "o mesmo assunto em seções diferentes. ";
  const achievableMarkdown = `## Documento completo\n\n${markdownUnit.repeat(400)}`;
  const rawResponse = {
    chapters: [{
      blockId: "documento-completo",
      markdown: achievableMarkdown,
      audioScript: "Narração completa do documento. ".repeat(450),
    }],
    confidence: 0.9,
  };

  // Sem o teto (maxOutputTokens omitido), a exigencia bruta de 70%/45% do
  // texto-fonte mesclado ultrapassa uma resposta ja "razoavelmente boa"
  // (aqui, o áudio é o primeiro a esbarrar nisso).
  assert.throws(
    () => validateBlockBatchGeneration([merged], rawResponse, 1),
    /resumido abaixo do mínimo de cobertura/,
  );

  // Com o teto (orcamento real da chamada), a MESMA resposta passa.
  const result = validateBlockBatchGeneration([merged], rawResponse, 1, { maxOutputTokens });
  assert.equal(result.chapters[0].blockId, "documento-completo");
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

test("consolida markdown e áudio na ordem global com metadados dos lotes", () => {
  // batchSize=2: cada lote agora cobre MAIS de um bloco (ver comentario em
  // DEFAULT_CONTENT_BLOCK_BATCH_SIZE) - cada bloco do lote ainda precisa do
  // seu proprio capitulo (validateBlockBatchGeneration exige 1 por blockId).
  const blocks = [block(1), block(2), block(3), block(4)];
  const batches = partitionContentBlocks(blocks, 2);
  const markers = ["PRIMEIRO", "SEGUNDO", "TERCEIRO", "QUARTO"];
  const generated = batches.map((batch, index) =>
    validateBlockBatchGeneration(
      batch,
      {
        chapters: batch.map((b, blockIndex) =>
          chapter(b.id, markers[index * 2 + blockIndex])
        ),
        confidence: index === 0 ? 0.8 : 1,
      },
      index + 1,
    )
  );
  for (const result of generated) {
    result.generationProvider = "gemini";
    result.generationModel = "gemini-3-flash-preview";
  }
  generated[1].generationProvider = "openai";
  generated[1].generationModel = "gpt-5.4-mini";
  generated[1].fallbackFrom = "gemini";

  const result = consolidateBlockBatchGenerations(
    blocks,
    [generated[1], generated[0]],
    { batchSize: 2, concurrency: 2, family: "presentation", filesCount: 2 },
  );

  assert.ok(result.markdown.indexOf("PRIMEIRO") < result.markdown.indexOf("SEGUNDO"));
  assert.ok(result.markdown.indexOf("SEGUNDO") < result.markdown.indexOf("TERCEIRO"));
  assert.ok(result.audioScript.indexOf("TERCEIRO") < result.audioScript.indexOf("QUARTO"));
  assert.equal(result.metadata.generation_mode, "block_batches");
  assert.equal(result.metadata.content_blocks_total, 4);
  assert.equal(result.metadata.content_block_batches, 2);
  assert.equal(result.metadata.content_block_batch_size, 2);
  assert.equal(result.metadata.content_block_concurrency, 2);
  assert.equal(result.metadata.content_generation_provider, "mixed");
  assert.deepEqual(result.metadata.content_generation_models, [
    "gemini-3-flash-preview",
    "gpt-5.4-mini",
  ]);
  assert.equal(result.metadata.content_generation_fallback_count, 1);
  assert.deepEqual(result.metadata.batch_block_ids, [
    ["bloco-01", "bloco-02"],
    ["bloco-03", "bloco-04"],
  ]);
  assert.equal(result.metadata.confidence, 0.9);
  assert.deepEqual(
    result.chapters?.map((c) => c.blockId),
    ["bloco-01", "bloco-02", "bloco-03", "bloco-04"],
  );
  assert.equal(result.chapters?.[0]?.markdown.includes("PRIMEIRO"), true);
  assert.equal(result.chapters?.[2]?.markdown.includes("TERCEIRO"), true);
});

test("mergeSplitFallbackChapters combina áudio (Gemini) e texto (OpenAI) por blockId", () => {
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
  );

  assert.deepEqual(merged.chapters, [
    {
      blockId: "bloco-01",
      markdown: "## Bloco 1",
      audioScript: "Narração do bloco 1.",
      slides: [],
    },
    {
      blockId: "bloco-02",
      markdown: "## Bloco 2",
      audioScript: "Narração do bloco 2.",
      slides: [],
    },
  ]);
  // Confiança final é a mais conservadora das duas chamadas independentes.
  assert.equal(merged.confidence, 0.8);
});

test("mergeSplitFallbackChapters preenche campos ausentes em vez de omitir o blockId", () => {
  const merged = mergeSplitFallbackChapters(
    ["bloco-01"],
    { chapters: [], confidence: 0.9 },
    { chapters: [{ blockId: "bloco-01", markdown: "## Bloco 1" }], confidence: 0.8 },
  );

  assert.deepEqual(merged.chapters, [
    { blockId: "bloco-01", markdown: "## Bloco 1", audioScript: "", slides: [] },
  ]);
  assert.equal(merged.confidence, 0.8);
});

test("generateOpenAIFallbackChapters mantém markdown mesmo quando o audioScript (Gemini) falha", async () => {
  const result = await generateOpenAIFallbackChapters(["bloco-01"], {
    generateAudioScript: async () => {
      throw new Error("Gemini indisponível (circuito de cooldown aberto)");
    },
    generateMarkdown: async () => ({
      chapters: [{ blockId: "bloco-01", markdown: "## Bloco 1" }],
      confidence: 0.8,
    }),
  });

  assert.deepEqual(result.chapters, [
    { blockId: "bloco-01", markdown: "## Bloco 1", audioScript: "", slides: [] },
  ]);
});

test("generateOpenAIFallbackChapters propaga a falha quando markdown (OpenAI) falha - sem outro fallback", async () => {
  await assert.rejects(
    () => generateOpenAIFallbackChapters(["bloco-01"], {
      generateAudioScript: async () => ({ chapters: [], confidence: 0.9 }),
      generateMarkdown: async () => {
        throw new Error("OpenAI indisponível");
      },
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

function slide(title: string): SlideContent {
  return {
    title,
    topics: ["Definição"],
    explanation: `Explicação de ${title}.`,
    visualDescription: `Diagrama de ${title}.`,
    characterQuote: `Vamos ver ${title}.`,
    characterAction: "explaining",
    sourceIds: ["documento-completo"],
  };
}

test("splitProcessedContentIntoParts agrupa secoes consecutivas ate o teto de tamanho por parte", () => {
  const markdown =
    "## Introdução\n\nTexto da introdução, denso o bastante para contar.\n\n"
    + "## Conceito de Sistema\n\nTexto do conceito, também denso.\n\n"
    + "## Camada de Abstração\n\nTexto da camada de abstração.";
  const audioScript =
    "## Introdução\nNarração da introdução.\n\n"
    + "## Conceito de Sistema\nNarração do conceito.\n\n"
    + "## Camada de Abstração\nNarração da camada.";
  const slides = [slide("Introdução"), slide("Conceito"), slide("Camada")];

  // teto minusculo forca cada secao a virar sua propria parte.
  const parts = splitProcessedContentIntoParts(
    { markdown, audioScript, slides },
    { targetPartChars: 1 },
  );

  assert.equal(parts.length, 3);
  assert.deepEqual(parts.map((p) => p.ordem), [1, 2, 3]);
  assert.deepEqual(parts.map((p) => p.titulo), [
    "Introdução",
    "Conceito de Sistema",
    "Camada de Abstração",
  ]);
  assert.ok(parts[0].markdown.includes("Texto da introdução"));
  assert.ok(!parts[0].markdown.includes("Texto do conceito"));
  assert.ok(parts[0].audioScript.includes("Narração da introdução"));
  assert.ok(!parts[0].audioScript.includes("## "), "marcador de secao nao deve sobrar no audio final");
  assert.deepEqual(parts.map((p) => p.slides.length), [1, 1, 1]);
});

test("splitProcessedContentIntoParts junta secoes pequenas numa parte so quando cabem no teto", () => {
  const markdown =
    "## Um\n\nBreve.\n\n## Dois\n\nBreve também.\n\n## Três\n\nBreve de novo.";
  const audioScript = "## Um\nFala 1.\n\n## Dois\nFala 2.\n\n## Três\nFala 3.";

  const parts = splitProcessedContentIntoParts(
    { markdown, audioScript, slides: [] },
    { targetPartChars: 10_000 },
  );

  assert.equal(parts.length, 1);
  assert.ok(parts[0].markdown.includes("Um") && parts[0].markdown.includes("Três"));
});

test("splitProcessedContentIntoParts cai no fallback proporcional quando o audio nao tem os marcadores", () => {
  const markdown = "## Um\n\nConteúdo um.\n\n## Dois\n\nConteúdo dois bem maior que o primeiro.";
  const audioScriptSemMarcadores = "Narração corrida sem nenhum marcador de secao.";

  const parts = splitProcessedContentIntoParts(
    { markdown, audioScript: audioScriptSemMarcadores, slides: [] },
    { targetPartChars: 1 },
  );

  assert.equal(parts.length, 2);
  const totalAudio = parts.map((p) => p.audioScript).join("");
  assert.ok(totalAudio.length > 0);
  // nenhum audio se perde no fallback - a soma das partes cobre o texto original.
  assert.ok(parts.every((p) => p.audioScript.length > 0));
});

test("splitProcessedContentIntoParts devolve uma unica parte quando o markdown nao tem headings", () => {
  const markdown = "Texto corrido sem headings.";
  const audioScript = "Narração corrida.";

  const parts = splitProcessedContentIntoParts({ markdown, audioScript, slides: [slide("Único")] });

  assert.equal(parts.length, 1);
  assert.equal(parts[0].markdown, markdown);
  assert.equal(parts[0].audioScript, audioScript);
  assert.equal(parts[0].slides.length, 1);
});
