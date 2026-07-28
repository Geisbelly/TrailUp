import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildValidatedEnrichmentResult,
  CONTENT_ENRICHMENT_PROVIDER,
  CONTENT_ENRICHMENT_SCHEMA_VERSION,
  DEFAULT_CONTENT_ENRICHMENT_EMERGENCY_MODEL,
  DEFAULT_CONTENT_ENRICHMENT_MODEL,
  DEFAULT_CONTENT_ENRICHMENT_FALLBACK_MODEL,
  enrichContentBlocksWithOpenAI,
  getContentEnrichmentReadiness,
  isOpenAIAvailabilityError,
  resetOpenAIContentEnrichmentCircuit,
  resolveContentEnrichmentEmergencyModel,
  resolveContentEnrichmentModel,
  resolveContentEnrichmentFallbackModel,
} from "./contentEnrichmentService";
import type { ContentEnrichmentRequest } from "../lib/validators";

const request = (): ContentEnrichmentRequest => ({
  schema_version: CONTENT_ENRICHMENT_SCHEMA_VERSION,
  source_hash: "hash-1",
  tema: {
    titulo: "Redes",
    descricao: "Comunicação entre máquinas.",
    objetivo: "Compreender DNS.",
  },
  blocos_base: [{
    id: "bloco-01",
    ordem: 1,
    tema: "Redes",
    topico: "DNS",
    objetivos: ["Compreender DNS."],
    conteudo_base: "DNS resolve nomes legíveis para endereços usados na rede.",
    source_ids: ["conteudo:1"],
    segment_ids: ["segmento-0001"],
  }],
});

const richRaw = () => ({
  blocos: [{
    id: "bloco-01",
    tema: "Redes",
    topico: "DNS",
    objetivos: ["Explicar como a resolução de nomes conecta clientes e servidores."],
    conteudo_aprofundado:
      "DNS resolve nomes legíveis para endereços usados na rede. "
      + "Esse sistema distribuído consulta servidores hierárquicos para descobrir "
      + "qual endereço corresponde ao domínio solicitado. Na prática, ao abrir um "
      + "site, o navegador usa essa resposta para localizar o servidor correto, "
      + "reduzindo erros e permitindo comunicação confiável entre aplicações.",
    conceitos_chave: ["resolução de nomes", "hierarquia distribuída"],
    exemplos_contextos: ["Abrir um endereço no navegador e localizar o servidor."],
    ponte_proximo_bloco: "Com o destino localizado, começa a requisição HTTP.",
  }],
});

test("enriquecimento validado preserva base, ordem e rastreabilidade", () => {
  const result = buildValidatedEnrichmentResult(
    request(),
    richRaw(),
    "gpt-5.6-sol",
  );

  assert.equal(result.schema_version, CONTENT_ENRICHMENT_SCHEMA_VERSION);
  assert.equal(result.metadata.provider, CONTENT_ENRICHMENT_PROVIDER);
  assert.equal(result.metadata.fallback, false);
  assert.equal(result.blocos.length, 1);
  assert.equal(
    result.blocos[0].conteudo_base,
    request().blocos_base[0].conteudo_base,
  );
  assert.deepEqual(result.blocos[0].source_ids, ["conteudo:1"]);
});

test("enriquecimento raso é rejeitado sem fallback", () => {
  const raw = richRaw();
  raw.blocos[0].conteudo_aprofundado = request().blocos_base[0].conteudo_base;

  assert.throws(
    () => buildValidatedEnrichmentResult(request(), raw, "gpt-5.6-sol"),
    /não aprofundou de verdade/,
  );
});

test("omissão de bloco é rejeitada", () => {
  assert.throws(
    () => buildValidatedEnrichmentResult(request(), { blocos: [] }, "gpt-5.6-sol"),
    /omitiu ou acrescentou blocos/,
  );
});

test("usa modelo OpenAI próprio e ignora configuração legada do Gemini", () => {
  assert.equal(
    resolveContentEnrichmentModel({
      CONTENT_ENRICHMENT_MODEL: "gemini-3-flash-preview",
    }),
    DEFAULT_CONTENT_ENRICHMENT_MODEL,
  );
  assert.equal(
    resolveContentEnrichmentModel({
      OPENAI_CONTENT_ENRICHMENT_MODEL: "gpt-5.6-terra",
    }),
    "gpt-5.6-terra",
  );
  assert.equal(
    resolveContentEnrichmentFallbackModel({}),
    DEFAULT_CONTENT_ENRICHMENT_FALLBACK_MODEL,
  );
  assert.equal(
    resolveContentEnrichmentFallbackModel({
      GEMINI_CONTENT_ENRICHMENT_FALLBACK_MODEL: "gemini-2.5-flash-lite",
    }),
    DEFAULT_CONTENT_ENRICHMENT_FALLBACK_MODEL,
  );
  assert.equal(
    resolveContentEnrichmentEmergencyModel({}),
    DEFAULT_CONTENT_ENRICHMENT_EMERGENCY_MODEL,
  );
});

test("readiness aceita OpenAI principal ou Gemini de contingência sem expor chaves", () => {
  assert.deepEqual(getContentEnrichmentReadiness({}), {
    ready: false,
    provider: "openai",
    model: DEFAULT_CONTENT_ENRICHMENT_MODEL,
    fallback_provider: "gemini",
    fallback_model: DEFAULT_CONTENT_ENRICHMENT_FALLBACK_MODEL,
    error:
      "OPENAI_API_KEY e GEMINI_API_KEY ausentes para o enriquecimento curricular.",
  });
  assert.deepEqual(
    getContentEnrichmentReadiness({
      OPENAI_API_KEY: "secret",
      OPENAI_CONTENT_ENRICHMENT_MODEL: "gpt-5.6-terra",
    }),
    {
      ready: true,
      provider: "openai",
      model: "gpt-5.6-terra",
      fallback_provider: "gemini",
      fallback_model: DEFAULT_CONTENT_ENRICHMENT_FALLBACK_MODEL,
    },
  );
  assert.deepEqual(
    getContentEnrichmentReadiness({
      GEMINI_API_KEY: "secret",
      GEMINI_CONTENT_ENRICHMENT_FALLBACK_MODEL: "gemini-custom",
    }),
    {
      ready: true,
      provider: "openai",
      model: DEFAULT_CONTENT_ENRICHMENT_MODEL,
      fallback_provider: "gemini",
      fallback_model: "gemini-custom",
      degraded: true,
    },
  );
});

test("reprocessa somente o bloco raso e preserva os blocos já validados", async () => {
  const first = request().blocos_base[0];
  const second = {
    ...first,
    id: "bloco-02",
    ordem: 2,
    topico: "HTTP",
    conteudo_base:
      "HTTP organiza a troca de requisições e respostas entre clientes e servidores.",
    source_ids: ["conteudo:2"],
    segment_ids: ["segmento-0002"],
  };
  const multiRequest: ContentEnrichmentRequest = {
    ...request(),
    blocos_base: [first, second],
  };
  const baseById = new Map(
    multiRequest.blocos_base.map((block) => [block.id, block]),
  );
  const callIds: string[][] = [];
  const callModels: string[] = [];

  const result = await enrichContentBlocksWithOpenAI(multiRequest, {
    model: "gpt-5.6-sol",
    emergencyModel: "gemini-3.6-flash",
    batchSize: 2,
    maxAttempts: 2,
    generateStructured: async (call) => {
      callIds.push(call.blockIds);
      callModels.push(call.model);
      return {
        blocos: call.blockIds.map((id) => {
          const base = baseById.get(id)!;
          const shallow = id === "bloco-02" && call.attempt === 1;
          return {
            id,
            tema: base.tema,
            topico: base.topico,
            objetivos: ["Explicar o conceito e aplicá-lo em uma situação real."],
            conteudo_aprofundado: shallow
              ? base.conteudo_base
              : `${base.conteudo_base} Esse mecanismo participa de um fluxo `
                + "distribuído, com regras explícitas, consequências práticas e "
                + "pontos de verificação. Em uma aplicação real, o estudante pode "
                + "acompanhar cada etapa, comparar resultados e relacionar o conceito "
                + "à comunicação confiável entre sistemas.",
            conceitos_chave: ["comunicação distribuída", "fluxo de aplicação"],
            exemplos_contextos: ["Abertura de uma página em um navegador."],
            ponte_proximo_bloco: "O resultado prepara o próximo conceito.",
          };
        }),
      };
    },
    generateStructuredFallback: async (call) => {
      callIds.push(call.blockIds);
      callModels.push(call.model);
      const base = baseById.get(call.blockIds[0])!;
      assert.match(call.input, /no mínimo \d+ caracteres/);
      return {
        blocos: [{
          id: base.id,
          tema: base.tema,
          topico: base.topico,
          objetivos: ["Explicar o conceito e aplicá-lo em situação real."],
          conteudo_aprofundado:
            `${base.conteudo_base} Esse mecanismo participa de um fluxo `
            + "distribuído, com regras explícitas, consequências práticas e "
            + "pontos de verificação. Em uma aplicação real, o estudante pode "
            + "acompanhar cada etapa, comparar resultados e relacionar o conceito "
            + "à comunicação confiável entre sistemas.",
          conceitos_chave: ["comunicação distribuída", "fluxo de aplicação"],
          exemplos_contextos: ["Abertura de uma página em um navegador."],
          ponte_proximo_bloco: "O resultado prepara o próximo conceito.",
        }],
      };
    },
  });

  assert.deepEqual(callIds, [
    ["bloco-01", "bloco-02"],
    ["bloco-02"],
  ]);
  assert.deepEqual(callModels, ["gpt-5.6-sol", "gemini-3.6-flash"]);
  assert.deepEqual(result.blocos.map((block) => block.id), [
    "bloco-01",
    "bloco-02",
  ]);
  assert.equal(result.metadata.provider, "mixed");
  assert.equal(result.metadata.lotes_gerados, 1);
  assert.equal(result.metadata.chamadas_realizadas, 2);
});

test("quota da OpenAI aciona Gemini e circuito evita novas tentativas inúteis", async () => {
  resetOpenAIContentEnrichmentCircuit();
  let openaiCalls = 0;
  let geminiCalls = 0;
  let now = 20_000;
  const options = {
    model: "gpt-5.6-sol",
    fallbackModel: "gemini-3-flash-preview",
    maxAttempts: 1,
    environment: {
      CONTENT_ENRICHMENT_OPENAI_COOLDOWN_MS: "60000",
    },
    now: () => now,
    generateStructured: async () => {
      openaiCalls += 1;
      const error = new Error(
        "429 You exceeded your current quota, please check your plan and billing details.",
      );
      Object.assign(error, { status: 429 });
      throw error;
    },
    generateStructuredFallback: async () => {
      geminiCalls += 1;
      return richRaw();
    },
  };

  const first = await enrichContentBlocksWithOpenAI(request(), options);
  now += 1_000;
  const second = await enrichContentBlocksWithOpenAI(request(), options);

  assert.equal(first.metadata.provider, "gemini");
  assert.equal(first.metadata.model, "gemini-3-flash-preview");
  assert.equal(first.metadata.fallback, true);
  assert.equal(first.metadata.fallback_from, "openai");
  assert.equal(first.metadata.fallback_calls, 1);
  assert.equal(first.metadata.chamadas_realizadas, 2);
  assert.equal(second.metadata.chamadas_realizadas, 1);
  assert.equal(openaiCalls, 1);
  assert.equal(geminiCalls, 2);
  resetOpenAIContentEnrichmentCircuit();
});

test("modelo Gemini aposentado avança para a contingência estável", async () => {
  resetOpenAIContentEnrichmentCircuit();
  const geminiModels: string[] = [];
  const result = await enrichContentBlocksWithOpenAI(request(), {
    model: "gpt-primary",
    fallbackModel: "gemini-retired",
    emergencyModel: "gemini-stable",
    maxAttempts: 1,
    environment: {
      CONTENT_ENRICHMENT_OPENAI_COOLDOWN_MS: "60000",
      CONTENT_ENRICHMENT_GEMINI_COOLDOWN_MS: "60000",
    },
    generateStructured: async () => {
      const error = new Error("429 insufficient_quota");
      Object.assign(error, { status: 429 });
      throw error;
    },
    generateStructuredFallback: async (call) => {
      geminiModels.push(call.model);
      if (call.model === "gemini-retired") {
        const error = new Error(
          "This model is no longer available to new users.",
        );
        Object.assign(error, { status: 404 });
        throw error;
      }
      return richRaw();
    },
  });

  assert.deepEqual(geminiModels, ["gemini-retired", "gemini-stable"]);
  assert.equal(result.metadata.provider, "gemini");
  assert.equal(result.metadata.model, "gemini-stable");
  assert.equal(result.metadata.chamadas_realizadas, 3);
  resetOpenAIContentEnrichmentCircuit();
});

test("24 blocos usam somente 3 lotes de contingência por padrão", async () => {
  resetOpenAIContentEnrichmentCircuit();
  const template = request().blocos_base[0];
  const blocks = Array.from({ length: 24 }, (_, index) => ({
    ...template,
    id: `bloco-${String(index + 1).padStart(2, "0")}`,
    ordem: index + 1,
    topico: `Tópico ${index + 1}`,
    conteudo_base:
      `O conceito ${index + 1} participa do funcionamento de redes distribuídas.`,
    source_ids: [`conteudo:${index + 1}`],
    segment_ids: [`segmento-${String(index + 1).padStart(4, "0")}`],
  }));
  const baseById = new Map(blocks.map((block) => [block.id, block]));
  let openaiCalls = 0;
  let geminiCalls = 0;

  const result = await enrichContentBlocksWithOpenAI(
    { ...request(), blocos_base: blocks },
    {
      maxAttempts: 1,
      now: () => 30_000,
      environment: {
        CONTENT_ENRICHMENT_OPENAI_COOLDOWN_MS: "60000",
      },
      generateStructured: async () => {
        openaiCalls += 1;
        const error = new Error("429 insufficient_quota");
        Object.assign(error, { status: 429 });
        throw error;
      },
      generateStructuredFallback: async (call) => {
        geminiCalls += 1;
        return {
          blocos: call.blockIds.map((id) => {
            const base = baseById.get(id)!;
            return {
              id,
              tema: base.tema,
              topico: base.topico,
              objetivos: ["Compreender o conceito e aplicá-lo em redes."],
              conteudo_aprofundado:
                `${base.conteudo_base} Esse mecanismo se conecta a componentes `
                + "que trocam mensagens segundo regras verificáveis. A relação "
                + "entre causa, processamento e resultado ajuda o estudante a "
                + "identificar falhas, comparar alternativas e compreender o impacto "
                + "prático de cada decisão. Em uma aplicação real, é possível "
                + "acompanhar a requisição entre cliente e servidor, observar a "
                + "resposta e validar o comportamento esperado.",
              conceitos_chave: ["comunicação distribuída", "validação do fluxo"],
              exemplos_contextos: ["Análise de uma requisição entre sistemas."],
              ponte_proximo_bloco: "O resultado prepara o conceito seguinte.",
            };
          }),
        };
      },
    },
  );

  assert.equal(result.metadata.lotes_gerados, 3);
  assert.equal(result.metadata.chamadas_realizadas, 4);
  assert.equal(openaiCalls, 1);
  assert.equal(geminiCalls, 3);
  assert.equal(result.blocos.length, 24);
  resetOpenAIContentEnrichmentCircuit();
});

test("não usa contingência para resposta rasa ou inválida", async () => {
  resetOpenAIContentEnrichmentCircuit();
  let fallbackCalls = 0;
  const shallow = richRaw();
  shallow.blocos[0].conteudo_aprofundado =
    request().blocos_base[0].conteudo_base;

  await assert.rejects(
    enrichContentBlocksWithOpenAI(request(), {
      maxAttempts: 1,
      generateStructured: async () => shallow,
      generateStructuredFallback: async () => {
        fallbackCalls += 1;
        return richRaw();
      },
    }),
    /não aprofundou/,
  );
  assert.equal(fallbackCalls, 0);
});

test("classifica quota e indisponibilidade sem mascarar erro de qualidade", () => {
  assert.equal(isOpenAIAvailabilityError({ status: 503 }), true);
  assert.equal(
    isOpenAIAvailabilityError(new Error("insufficient_quota")),
    true,
  );
  assert.equal(
    isOpenAIAvailabilityError(new Error("conteúdo não aprofundado")),
    false,
  );
});
