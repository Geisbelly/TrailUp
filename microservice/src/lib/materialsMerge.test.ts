import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAggregatedApresentacaoEntry } from "./materialsMerge";

// Os testes de `computeMergedMaterials` sairam junto com a funcao: ela nao era
// chamada por nenhum codigo de producao e a regra dela contradizia a da RPC
// `merge_personalizacao_materiais_v2`, que e a autoridade e o unico caminho de
// escrita. Tres deles fixavam justamente o comportamento errado -- "todos
// terminais -> pronto" com a apresentacao `failed`, `failed_quality` contando
// como conclusao, e `pronto` sticky contra um artefato que voltou a `pending`.

test("computeAggregatedApresentacaoEntry: mantem status atual quando faltam partes", () => {
  const result = computeAggregatedApresentacaoEntry(
    [],
    { ordem: 1, titulo: "Introducao", arquivo_url: "https://storage/p1.html", storage_path: "p1.html", failed: false },
    2,
    "pending",
  );
  assert.equal(result.status, "pending");
  assert.equal(result.partes.length, 1);
});

test("computeAggregatedApresentacaoEntry: completed quando todas as partes chegaram sem falha", () => {
  const currentPartes = [
    { ordem: 1, titulo: "Introducao", arquivo_url: "https://storage/p1.html", storage_path: "p1.html", failed: false },
  ];
  const result = computeAggregatedApresentacaoEntry(
    currentPartes,
    { ordem: 2, titulo: "Conclusao", arquivo_url: "https://storage/p2.html", storage_path: "p2.html", failed: false },
    2,
    "pending",
  );
  assert.equal(result.status, "completed");
  assert.equal(result.headline.arquivo_url, "https://storage/p1.html");
});

test("computeAggregatedApresentacaoEntry: failed se qualquer parte falhou", () => {
  const currentPartes = [
    { ordem: 1, titulo: "Introducao", arquivo_url: "https://storage/p1.html", storage_path: "p1.html", failed: false },
  ];
  const result = computeAggregatedApresentacaoEntry(
    currentPartes,
    { ordem: 2, titulo: "Conclusao", arquivo_url: null, storage_path: null, failed: true },
    2,
    "pending",
  );
  assert.equal(result.status, "failed");
});

test("computeAggregatedApresentacaoEntry: substitui parte com mesma ordem, nao duplica", () => {
  const currentPartes = [
    { ordem: 1, titulo: "Introducao", arquivo_url: null, storage_path: null, failed: true },
    { ordem: 2, titulo: "Conclusao", arquivo_url: "https://storage/p2.html", storage_path: "p2.html", failed: false },
  ];
  const result = computeAggregatedApresentacaoEntry(
    currentPartes,
    { ordem: 1, titulo: "Introducao", arquivo_url: "https://storage/p1-retry.html", storage_path: "p1-retry.html", failed: false },
    2,
    "failed",
  );
  assert.equal(result.partes.length, 2);
  assert.equal(result.status, "completed");
});
