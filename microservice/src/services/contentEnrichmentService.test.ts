import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildValidatedEnrichmentResult,
  CONTENT_ENRICHMENT_SCHEMA_VERSION,
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
    "gemini-test",
  );

  assert.equal(result.schema_version, CONTENT_ENRICHMENT_SCHEMA_VERSION);
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
    () => buildValidatedEnrichmentResult(request(), raw, "gemini-test"),
    /não aprofundou de verdade/,
  );
});

test("omissão de bloco é rejeitada", () => {
  assert.throws(
    () => buildValidatedEnrichmentResult(request(), { blocos: [] }, "gemini-test"),
    /omitiu ou acrescentou blocos/,
  );
});
