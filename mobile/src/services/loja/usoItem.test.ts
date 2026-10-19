import assert from "node:assert/strict";
import test from "node:test";

import {
  comprasUsaveisNaAtividade,
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

test("só item ativo de prazo, tempo ou nova tentativa entra na atividade", () => {
  const nomes = new Map([["prazo_extra", "Mais um dia"]]);
  const lista = comprasUsaveisNaAtividade(
    [
      { id: 1, item_codigo: "prazo_extra", status: "ativa" },
      { id: 2, item_codigo: "tempo_extra", status: "consumida" },
      { id: 3, item_codigo: "dica", status: "ativa" },
      { id: 4, item_codigo: "segunda_chance", status: "ativa" },
    ],
    nomes,
  );
  assert.deepEqual(lista.map((c) => c.id), [1, 4]);
  assert.equal(lista[0].nome, "Mais um dia");
  assert.equal(lista[1].nome, "Responder novamente");
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
