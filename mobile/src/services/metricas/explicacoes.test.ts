import assert from "node:assert/strict";
import test from "node:test";
import catalogo from "@/constants/metricasExplicadas.json";
import {
  CHAVE_DO_CAMPO,
  FRASE_DO_SELO,
  ROTULO_DO_SELO,
  explicacaoDe,
  problemasDoCatalogo,
  rotuloAcessivel,
} from "./explicacoes";

// O catálogo do app tem textos mais curtos que os do console (220 contra 360) e fala com o aluno.
// O selo de cada chave que existe nos dois lados é conferido em frontend/src/lib/metricas/paridade.test.ts.

const BASE = {
  nome: "Exemplo",
  selo: "medido",
  oQueMede: "Algo.",
  comoColeta: "De algum lugar.",
  atualiza: "Sempre.",
  naoSignifica: "Outra coisa.",
  referencia: "arquivo.ts",
};

const comCampo = (campo: string, valor: unknown) => ({ "x.exemplo": { ...BASE, [campo]: valor } });

test("o catálogo do app não tem nenhum problema", () => {
  assert.deepEqual(problemasDoCatalogo(catalogo, 220), []);
});

test("recusa selo fora dos três e 'o que não significa' vazio", () => {
  assert.match(problemasDoCatalogo(comCampo("selo", "certeza"), 220).join("\n"), /selo/);
  assert.match(problemasDoCatalogo(comCampo("naoSignifica", ""), 220).join("\n"), /naoSignifica/);
});

test("recusa campo acima de 220 caracteres e diz o tamanho", () => {
  assert.match(problemasDoCatalogo(comCampo("oQueMede", "a".repeat(221)), 220).join("\n"), /221/);
  assert.deepEqual(problemasDoCatalogo(comCampo("oQueMede", "a".repeat(220)), 220), []);
});

test("recusa mais de três limites e exige a referência", () => {
  assert.match(problemasDoCatalogo(comCampo("limites", ["a", "b", "c", "d"]), 220).join("\n"), /limites/);
  assert.match(problemasDoCatalogo(comCampo("referencia", undefined), 220).join("\n"), /referencia/);
});

test("o rótulo acessível do ícone diz o nome da métrica", () => {
  assert.equal(rotuloAcessivel("aluno.sequencia"), "Como funciona: Sequência de dias");
});

test("os selos do app têm rótulo curto e frase para o aluno", () => {
  assert.deepEqual(ROTULO_DO_SELO, { medido: "Medido", regra: "Calculado", estimativa: "Estimativa" });
  assert.equal(FRASE_DO_SELO.medido, "Medido: o app contou direto o que aconteceu.");
  assert.equal(FRASE_DO_SELO.regra, "Calculado: uma conta feita em cima do que o app registrou.");
  assert.equal(FRASE_DO_SELO.estimativa, "Estimativa: um palpite do sistema, ainda não conferido com alunos.");
});

test("todo campo do Perfil aponta para uma explicação que existe", () => {
  const chaves = Object.values(CHAVE_DO_CAMPO);
  assert.ok(chaves.length >= 15, `só ${chaves.length} campos mapeados`);
  for (const chave of chaves) assert.ok(chave && chave in catalogo, `${chave} não está no catálogo`);
});

test("a sequência avisa que só olha a última semana", () => {
  const e = explicacaoDe("aluno.sequencia");
  assert.match([e.comoColeta, ...(e.limites ?? [])].join(" "), /7 dias/);
});

test("o que a IA lê da sessão é estimativa", () => {
  assert.equal(explicacaoDe("aluno.emocao").selo, "estimativa");
  assert.equal(explicacaoDe("aluno.leitura_adaptativa").selo, "estimativa");
});
