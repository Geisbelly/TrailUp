import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Seção do console que recebe `professorId` e não o ganha do `Console.tsx` fica no spinner para
 * sempre: `useTurmasDoProfessor(undefined)` nunca busca as turmas e `carregando` nunca vira false.
 * Foi o que aconteceu com Economia em produção (01/11) — a página inteira, inclusive o fundo da
 * turma (#144), nunca carregava, e nenhum teste via. Este teste lê as duas pontas.
 */
const raiz = resolve(__dirname, "..");
const consoleTsx = readFileSync(resolve(raiz, "pages/Console.tsx"), "utf8");

const secoes = [...consoleTsx.matchAll(/const (\w+) = lazyWithReload\(\(\) => import\("@\/(.+?)"\)\);/g)].map(
  ([, nome, caminho]) => ({ nome, arquivo: resolve(raiz, `${caminho}.tsx`) }),
);

describe("Console.tsx entrega professorId a quem pede", () => {
  it("encontra as seções carregadas sob demanda", () => {
    expect(secoes.map((s) => s.nome)).toContain("EconomiaSection");
  });

  for (const { nome, arquivo } of secoes) {
    const fonte = readFileSync(arquivo, "utf8");
    const pede = /export default function \w+\(\{[^}]*\bprofessorId\b/.test(fonte);
    if (!pede) continue;
    it(`${nome} recebe professorId`, () => {
      const usos = [...consoleTsx.matchAll(new RegExp(`<${nome}\\b([^>]*)/>`, "g"))].map((m) => m[1]);
      expect(usos.length).toBeGreaterThan(0);
      for (const props of usos) expect(props).toMatch(/professorId=\{/);
    });
  }
});
