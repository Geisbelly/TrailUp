import assert from "node:assert/strict";
import test from "node:test";

import { filtrarGrupos, GRUPOS_CONFIGURACAO, subtelaDaUrl } from "./subtelasConfiguracao";

test("a URL escolhe a subtela; sem valor ou inválida, abre Informações pessoais", () => {
  assert.equal(subtelaDaUrl("lembrete").id, "lembrete");
  assert.equal(subtelaDaUrl(["coleta"]).id, "coleta");
  assert.equal(subtelaDaUrl(undefined).id, "info");
  assert.equal(subtelaDaUrl("nao-existe").id, "info");
});

test("linha de ação (link, outra página) nunca vira painel aberto", () => {
  assert.equal(subtelaDaUrl("privacidade").id, "info");
  assert.equal(subtelaDaUrl("tutorial").id, "info");
});

test("a busca ignora acento e caixa e some com grupo vazio", () => {
  const r = filtrarGrupos("METRICAS");
  assert.deepEqual(r.map((g) => g.itens.map((s) => s.id)), [["metricas"]]);
  assert.equal(filtrarGrupos("xyz").length, 0);
  assert.equal(filtrarGrupos("  ").length, GRUPOS_CONFIGURACAO.length);
});

test("ids únicos", () => {
  const ids = GRUPOS_CONFIGURACAO.flatMap((g) => g.itens.map((s) => s.id));
  assert.equal(new Set(ids).size, ids.length);
});
