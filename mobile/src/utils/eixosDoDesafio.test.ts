import assert from "node:assert/strict";
import { consequenciaValida, dificuldadeValida, resumoDosEixos, rotuloDaRegra } from "./eixosDoDesafio";

assert.equal(consequenciaValida(null), "ranqueada");
assert.equal(dificuldadeValida("dificil"), "dificil");
assert.equal(rotuloDaRegra("duelo"), "Duelo");
assert.equal(
  resumoDosEixos({ formato: "guilda", modo: "todos", dificuldade: "normal", consequencia: "ranqueada" }),
  "Guilda · Todos respondem · Normal · Ranqueada",
);
console.log("eixosDoDesafio.test.ts ok");
