import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildValidatedEnrichmentResult,
  CONTENT_ENRICHMENT_PROVIDER,
  CONTENT_ENRICHMENT_SCHEMA_VERSION,
  DEFAULT_CONTENT_ENRICHMENT_MODEL,
  enrichContentBlocksWithOpenAI,
  getContentEnrichmentReadiness,
  resolveContentEnrichmentModel,
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
});

test("readiness exige OPENAI_API_KEY sem expor a chave", () => {
  assert.deepEqual(getContentEnrichmentReadiness({}), {
    ready: false,
    provider: "openai",
    model: DEFAULT_CONTENT_ENRICHMENT_MODEL,
    error: "OPENAI_API_KEY ausente para o enriquecimento curricular.",
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

  const result = await enrichContentBlocksWithOpenAI(multiRequest, {
    model: "gpt-5.6-sol",
    batchSize: 2,
    maxAttempts: 2,
    generateStructured: async (call) => {
      callIds.push(call.blockIds);
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
  });

  assert.deepEqual(callIds, [
    ["bloco-01", "bloco-02"],
    ["bloco-02"],
  ]);
  assert.deepEqual(result.blocos.map((block) => block.id), [
    "bloco-01",
    "bloco-02",
  ]);
  assert.equal(result.metadata.provider, "openai");
  assert.equal(result.metadata.lotes_gerados, 1);
  assert.equal(result.metadata.chamadas_realizadas, 2);
});
