import assert from "node:assert/strict";
import test from "node:test";

import {
  botaoDeUso,
  itensUsaveisNaAtividade,
  lerInventario,
  lerPermissao,
  concedido,
  mensagemDeUso,
  podeResponderComCompra,
  prazoVisivel,
  rotuloDeTempoExtra,
  lerRespostaDeUso,
} from "./usoItem";

test("o uso aperta o pedido e recusa o que estoura o teto", () => {
  assert.deepEqual(concedido(1, 2, 3, 0, 4, 0, 4), { ok: true, valor: 2 });
  assert.equal(concedido(1, 1, 1, 2, 2, 2, 4).ok, false);
  assert.equal(concedido(1, 0, 0, 0, 2, 0, 4).ok, false);
});

test("o prazo visto é o efetivo; sem ele, a data da turma", () => {
  assert.equal(prazoVisivel("2026-10-01", "2026-10-04"), "2026-10-04");
  assert.equal(prazoVisivel("2026-10-01", null), "2026-10-01");
  assert.equal(prazoVisivel("  ", "  "), null);
});

test("um botão por tipo de item com unidade ativa de prazo, tempo ou nova tentativa", () => {
  const nomes = new Map([["prazo_extra", "Mais um dia"]]);
  const inventario = lerInventario([
    { item_codigo: "prazo_extra", ativos: 3, usados: 1, estornados: 0 },
    { item_codigo: "tempo_extra", ativos: 0, usados: 2, estornados: 1 },
    { item_codigo: "dica", ativos: 4, usados: 0, estornados: 0 },
    { item_codigo: "segunda_chance", ativos: 1, usados: 0, estornados: 0 },
  ]);
  const lista = itensUsaveisNaAtividade(inventario, nomes);
  assert.deepEqual(lista, [
    { codigo: "prazo_extra", nome: "Mais um dia", ativos: 3 },
    { codigo: "segunda_chance", nome: "Responder novamente", ativos: 1 },
  ]);
  assert.deepEqual(lerInventario(null), []);
});

test("o botão de usar mostra quanto ainda cabe aqui ou o limite que segurou", () => {
  const item = { nome: "Mais prazo", ativos: 3 };
  const livre = botaoDeUso(item, lerPermissao({ ativos: 3, restantes: 1, bloqueio: null, limite: 1, usados: 0 }));
  assert.equal(livre.habilitado, true);
  assert.equal(livre.detalhe, "3 na Bag · pode usar 1 aqui");
  const preso = botaoDeUso(item, lerPermissao({ ativos: 3, restantes: 0, bloqueio: "limite_por_atividade", limite: 1, usados: 1 }));
  assert.equal(preso.habilitado, false);
  assert.match(preso.motivo ?? "", /atividade/);
  assert.match(botaoDeUso(item, lerPermissao({ ativos: 2, restantes: 0, bloqueio: "limite_por_dia" })).motivo ?? "", /hoje/);
  assert.match(botaoDeUso(item, lerPermissao({ erro: "fora_da_turma" })).motivo ?? "", /turma/);
  assert.equal(botaoDeUso(item, null).habilitado, false);
  assert.match(mensagemDeUso("sem_unidade"), /Bag/);
});

test("a segunda chance comprada só aparece quando a tentativa livre acabou e a resposta segue oculta", () => {
  const base = { jaTentou: true, viuResposta: false, respostasVisiveis: false, semTentativaLivre: true, reabrindo: false };
  assert.equal(podeResponderComCompra(base), true);
  assert.equal(podeResponderComCompra({ ...base, semTentativaLivre: false }), false);
  assert.equal(podeResponderComCompra({ ...base, viuResposta: true }), false);
  assert.equal(podeResponderComCompra({ ...base, respostasVisiveis: true }), false);
  assert.match(mensagemDeUso("sem_token"), /loja/);
});

test("a resposta do banco vira prazo ou mensagem", () => {
  assert.equal(lerRespostaDeUso({ ok: true, efeito: "prazo_extra", prazo_efetivo: "2026-10-08" }).prazoEfetivo, "2026-10-08");
  assert.match(mensagemDeUso("teto_da_turma"), /turma/);
  assert.equal(rotuloDeTempoExtra(10), "10 minutos extras nesta atividade");
  assert.equal(rotuloDeTempoExtra(0), null);
});
