import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { explicacaoDe } from "@/lib/metricas/explicacoes";

const fonte = (arquivo: string) => readFileSync(fileURLToPath(new URL(arquivo, import.meta.url)), "utf-8");

const ABAS: [string, string[]][] = [
  ["AbaEvolucao.tsx", ["prof.evolucao", "prof.mudancas_relevantes"]],
  ["AbaConteudo.tsx", ["prof.conteudo_por_topico"]],
  ["AbaInsights.tsx", ["prof.insights", "prof.alertas_por_aluno"]],
  ["AbaGuia.tsx", ["prof.guia_conceitos", "prof.guia_topicos", "prof.guia_por_aluno"]],
];

describe("abas da turma explicam suas métricas", () => {
  for (const [arquivo, chaves] of ABAS) {
    for (const chave of chaves) {
      it(`${arquivo} traz ${chave}`, () => {
        expect(fonte(`./${arquivo}`)).toMatch(new RegExp(`chave(=|: )"${chave.replace(".", "\\.")}"|explicacao="${chave.replace(".", "\\.")}"`));
      });
    }
  }

  it("o Guia nunca diz que ajudou: a explicação por aluno nega o efeito", () => {
    expect(explicacaoDe("prof.guia_por_aluno").naoSignifica).toMatch(/não prova/i);
  });

  it("o que a IA classifica ou escreve é estimativa", () => {
    for (const chave of ["prof.insights", "prof.alertas_por_aluno", "prof.guia_conceitos"] as const) {
      expect(explicacaoDe(chave).selo).toBe("estimativa");
    }
  });
});
