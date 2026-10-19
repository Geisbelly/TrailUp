import assert from "node:assert/strict";
import { FORMATOS, pedeParceiro, consequenciaValida, dificuldadeValida, resumoDosEixos, rotuloDaRegra } from "./eixosDoDesafio";

assert.equal(consequenciaValida(null), "ranqueada");
assert.equal(dificuldadeValida("dificil"), "dificil");
assert.equal(rotuloDaRegra("duelo"), "Duelo");
assert.equal(
  resumoDosEixos({ formato: "guilda", modo: "todos", dificuldade: "normal", consequencia: "ranqueada" }),
  "Guilda · Todos respondem · Normal · Ranqueada",
);
console.log("eixosDoDesafio.test.ts ok");

// Fase 10: o seletor só pode oferecer formato que a RPC aceita sem parâmetro extra.
// `guilda_desafio_criar` RECUSA `dupla` sem `p_aliado` (`guilda_desafio_aliado_obrigatorio`),
// então oferecê-la antes do seletor de parceiro daria erro na cara do aluno.
// Só `dupla` pede parceiro — e é `pedeParceiro` que decide quando o seletor mostra a lista
// e quando trava o botão, porque `guilda_desafio_criar` recusa dupla sem `p_aliado`.
assert.equal(pedeParceiro("dupla"), true);
for (const chave of ["solo", "guilda", "turma"] as const) {
  assert.equal(pedeParceiro(chave), false, `${chave} não deveria pedir parceiro`);
}
assert.equal(FORMATOS.length, 4);
// Todo formato tem rótulo e ajuda — o seletor mostra os dois.
for (const f of FORMATOS) {
  assert.ok(f.rotulo.trim().length > 0, `${f.chave} sem rótulo`);
  assert.ok(f.ajuda.trim().length > 0, `${f.chave} sem ajuda`);
}
console.log("eixosDoDesafio formatos ok");
