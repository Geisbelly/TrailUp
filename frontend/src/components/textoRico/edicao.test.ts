import { describe, expect, it } from "vitest";

import { linguagemDoCodigo } from "@/lib/textoRico/tokensDoCodigo";

import { inserirCerca, inserirFormula, LINGUAGENS_DO_EDITOR } from "./edicao";

describe("inserirFormula", () => {
  it("em linha, no cursor, e o cursor vai para depois", () => {
    const r = inserirFormula("Quanto vale ?", 12, 12, "\\frac{1}{2}", false);
    expect(r.texto).toBe("Quanto vale \\(\\frac{1}{2}\\)?");
    expect(r.inicio).toBe(r.texto.length - 1);
  });

  it("troca a seleção", () => {
    expect(inserirFormula("x = MEIO", 4, 8, "\\frac12", false).texto).toBe("x = \\(\\frac12\\)");
  });

  it("em bloco, sozinha na linha", () => {
    expect(inserirFormula("Veja:depois", 5, 5, "E=mc^2", true).texto).toBe("Veja:\n\\[E=mc^2\\]\ndepois");
    expect(inserirFormula("", 0, 0, "E=mc^2", true).texto).toBe("\\[E=mc^2\\]");
  });
});

describe("inserirCerca", () => {
  it("sem seleção, abre a cerca em linha própria com o cursor dentro", () => {
    const r = inserirCerca("Qual a saída?", 13, 13, "python");
    expect(r.texto).toBe("Qual a saída?\n```python\n\n```");
    expect(r.texto.slice(0, r.inicio)).toBe("Qual a saída?\n```python\n");
    expect(r.fim).toBe(r.inicio);
  });

  it("com seleção, envolve e mantém selecionado", () => {
    const texto = "antes\nSELECT 1;\ndepois";
    const r = inserirCerca(texto, 6, 16, "sqlserver");
    expect(r.texto).toBe("antes\n```sqlserver\nSELECT 1;\n```\ndepois");
    expect(r.texto.slice(r.inicio, r.fim)).toBe("SELECT 1;");
  });
});

it("toda linguagem do seletor tem realce (fora a sem linguagem)", () => {
  for (const { rotulo } of LINGUAGENS_DO_EDITOR) {
    if (rotulo) expect(linguagemDoCodigo(rotulo), rotulo).not.toBeNull();
  }
});
