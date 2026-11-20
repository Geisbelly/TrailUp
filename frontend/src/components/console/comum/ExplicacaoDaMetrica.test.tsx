import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { explicacaoDe, FRASE_DO_SELO, type ExplicacaoMetrica } from "@/lib/metricas/explicacoes";
import ExplicacaoDaMetrica, { ConteudoDaExplicacao, pararPropagacao } from "./ExplicacaoDaMetrica";

const COM_LIMITES: ExplicacaoMetrica = {
  nome: "Exemplo",
  selo: "estimativa",
  oQueMede: "MEDE",
  comoColeta: "COLETA",
  atualiza: "ATUALIZA",
  limites: ["LIMITE-1"],
  naoSignifica: "NAO-SIGNIFICA",
  referencia: "REFERENCIA-INTERNA",
};

describe("ExplicacaoDaMetrica (gatilho)", () => {
  const html = renderToStaticMarkup(createElement(ExplicacaoDaMetrica, { chave: "prof.tempo_ativo" }));

  it("é um botão de verdade, com o nome da métrica no rótulo acessível", () => {
    expect(html).toMatch(/<button[^>]*type="button"/);
    expect(html).toContain(`aria-label="Como funciona: ${explicacaoDe("prof.tempo_ativo").nome}"`);
  });

  it("usa o ícone de informação e não o de interrogação, que já tem dono", () => {
    expect(html).toContain("lucide-info");
    expect(html).not.toContain("lucide-circle-help");
  });
});

describe("ConteudoDaExplicacao", () => {
  const html = renderToStaticMarkup(createElement(ConteudoDaExplicacao, { explicacao: COM_LIMITES }));

  it("mostra as seções na ordem combinada", () => {
    const ordem = [
      "Exemplo",
      "Estimativa",
      FRASE_DO_SELO.estimativa,
      "O que mede",
      "MEDE",
      "Como é coletado",
      "COLETA",
      "Atualiza",
      "ATUALIZA",
      "Limites",
      "LIMITE-1",
      "O que não significa",
      "NAO-SIGNIFICA",
    ];
    let pos = -1;
    for (const trecho of ordem) {
      const achou = html.indexOf(trecho, pos + 1);
      expect(achou, `"${trecho}" fora de ordem`).toBeGreaterThan(pos);
      pos = achou;
    }
  });

  it("nunca mostra a referência interna", () => {
    expect(html).not.toContain("REFERENCIA-INTERNA");
  });

  it("sem limites, a seção não aparece", () => {
    const sem = renderToStaticMarkup(createElement(ConteudoDaExplicacao, { explicacao: { ...COM_LIMITES, limites: undefined } }));
    expect(sem).not.toContain("Limites");
  });
});

describe("pararPropagacao", () => {
  it("impede o clique no ícone de abrir a linha ou o card por baixo", () => {
    const stopPropagation = vi.fn();
    pararPropagacao({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(1);
  });
});

describe("popover numa tela pequena", () => {
  // Medido a 375×812: sem altura máxima o popover terminava em y=1021 e o fim do texto ficava fora
  // de alcance (ele é fixo, rolar a página não o alcança), e encostava na borda direita.
  const fonte = readFileSync(fileURLToPath(new URL("./ExplicacaoDaMetrica.tsx", import.meta.url)), "utf-8");

  it("cabe na altura disponível e rola por dentro", () => {
    expect(fonte).toContain("max-h-[var(--radix-popover-content-available-height)]");
    expect(fonte).toContain("overflow-y-auto");
  });

  it("guarda 16 px das bordas da tela", () => {
    expect(fonte).toContain("collisionPadding={16}");
  });
});
