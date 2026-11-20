import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { explicacaoDe } from "@/lib/metricas/explicacoes";

const fonte = (arquivo: string) => readFileSync(fileURLToPath(new URL(arquivo, import.meta.url)), "utf-8");

describe("detalhe do aluno explica seus números", () => {
  it("cada número do cabeçalho tem a sua explicação", () => {
    const src = fonte("./CabecalhoAluno.tsx");
    for (const chave of [
      "aluno.nota",
      "aluno.progresso",
      "aluno.acertos",
      "prof.risco_aluno",
      "aluno.ultimo_estudo",
      "aluno.tempo_total",
      "prof.presenca_aluno",
    ]) {
      expect(src).toContain(`explicacao: "${chave}"`);
    }
    expect(src).toContain("<ExplicacaoDaMetrica chave={n.explicacao}");
  });

  it.each([
    ["./AbaPerfil.tsx", "aluno.afinidades"],
    ["./AbaVisaoGeral.tsx", "prof.evolucao_aluno"],
    ["./AbaPersonalizacao.tsx", "prof.consumo_personalizado"],
    ["./AbaTentativas.tsx", "prof.tentativas"],
    ["./SinalDeAtencao.tsx", "prof.precisam_atencao"],
    ["../../RanksSection.tsx", "prof.ranking"],
  ])("%s traz %s", (arquivo, chave) => {
    expect(fonte(arquivo)).toContain(`<ExplicacaoDaMetrica chave="${chave}"`);
  });

  it("a afinidade vem do questionário e nunca do vetor observado, que é sombra", () => {
    const e = explicacaoDe("aluno.afinidades");
    const texto = [e.oQueMede, e.comoColeta, e.atualiza, ...(e.limites ?? []), e.naoSignifica].join(" ");
    expect(texto).toMatch(/questionário/);
    expect(texto).not.toMatch(/observad|comportamento|telemetria/i);
  });
});
