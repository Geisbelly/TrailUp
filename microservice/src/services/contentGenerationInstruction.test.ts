import { test } from "node:test";
import assert from "node:assert/strict";
import { buildContentGenerationInstruction, buildEditorialSignatureSection } from "./geminiService";
import { editorialSignatureFor } from "../constants/editorialSignatures";
import type { BrainHexProfile } from "../constants/brainHex";

// Spec 2026-11-11-assinatura-meio-termo-e-barreira: guia com voz e cena curta no lugar da
// ambientação mística do prompt base, e a assinatura editorial do perfil como camada de tom.

const PERFIS: BrainHexProfile[] = ["seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever"];

// A regra 2 (descrição visual dos slides) fica fora desta mudança: confere do texto de estudo em diante.
function regrasDeTextoEAudio(instrucao: string): string {
  const inicio = instrucao.indexOf("4. ");
  assert.ok(inicio > 0, "regra 4 sumiu");
  return instrucao.slice(inicio);
}

test("o texto e o áudio não pedem mais ambientação mística", () => {
  for (const perfil of PERFIS) {
    const regras = regrasDeTextoEAudio(buildContentGenerationInstruction(perfil, []));
    for (const termo of ["mística", "místico", "medieval", "Alquímica", "Grimório"]) {
      assert.ok(!regras.includes(termo), `${perfil}: ainda pede "${termo}"`);
    }
  }
});

test("cada perfil recebe a própria assinatura, com os marcadores como vocabulário opcional", () => {
  for (const perfil of PERFIS) {
    const instrucao = buildContentGenerationInstruction(perfil, []);
    const a = editorialSignatureFor(perfil);
    assert.ok(instrucao.includes("ASSINATURA EDITORIAL DO PERFIL"), perfil);
    for (const valor of [a.tom_voz, a.abertura_estilo, a.fechamento_estilo, ...a.proibicoes_estilo]) {
      assert.ok(instrucao.includes(valor), `${perfil}: falta "${valor}"`);
    }
    const secao = buildEditorialSignatureSection(perfil);
    const linhaDosMarcadores = secao.split("\n").find((l) => l.includes(a.marcadores_linguisticos.join(", ")));
    assert.ok(linhaDosMarcadores && /opcional/i.test(linhaDosMarcadores), `${perfil}: marcadores sem "opcional"`);
  }
});

test("todo capítulo termina com desafio e resposta", () => {
  for (const perfil of PERFIS) {
    const instrucao = buildContentGenerationInstruction(perfil, []);
    assert.ok(instrucao.includes("**Desafio:**"), perfil);
    assert.ok(instrucao.includes("**Resposta:**"), perfil);
  }
});

test("a cena de abertura do áudio vem depois do marcador de seção", () => {
  for (const perfil of PERFIS) {
    assert.match(buildContentGenerationInstruction(perfil, []), /cena de abertura[^.]*depois do marcador/i, perfil);
  }
});

test("cada narrador solo recebe só o próprio tom", () => {
  const tom = (perfil: BrainHexProfile) => buildContentGenerationInstruction(perfil, []);
  for (const perfil of PERFIS) {
    const instrucao = tom(perfil);
    assert.equal(instrucao.includes("firme, grave e protetor"), perfil === "survivor", perfil);
    assert.equal(instrucao.includes("calmo, calculista e pausado"), perfil === "mastermind", perfil);
    assert.ok(!instrucao.includes("for 'seeker'"), `${perfil}: condição de perfil deixada para o modelo`);
    assert.ok(!instrucao.includes("Se 'mastermind'"), perfil);
  }
});

test("o socializer, em diálogo, não usa marcação de tom", () => {
  const instrucao = buildContentGenerationInstruction("socializer", []);
  assert.ok(!instrucao.includes("Inclua marcações de [Tom"));
  assert.ok(instrucao.includes("NÃO use marcações [Tom: ...]"));
});

test("regras próprias do Survivor, do Mastermind e do Seeker", () => {
  const survivor = buildContentGenerationInstruction("survivor", []);
  assert.ok(survivor.includes("**Checklist:**"));
  assert.ok(!survivor.includes("Dialeto pragmático"), "dica antiga de uma linha continua");
  const mastermind = buildContentGenerationInstruction("mastermind", []);
  assert.ok(!mastermind.includes("Lexicografia técnica"), "dica antiga de uma linha continua");
  assert.match(mastermind, /20 palavras/);
  assert.match(buildContentGenerationInstruction("seeker", []), /pergunta de abertura[^.]*respondida/i);
  // As regras de um perfil não vazam para os outros.
  assert.ok(!buildContentGenerationInstruction("seeker", []).includes("**Checklist:**"));
});
