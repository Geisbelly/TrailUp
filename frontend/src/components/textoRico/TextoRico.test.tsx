import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { contraste } from "@/components/console/dashboard/contraste";
import casos from "@/lib/textoRico/casos.json";

import { CORES_DO_CODIGO, FUNDO_DO_CODIGO, NUMERO_DA_LINHA } from "./coresDoCodigo";
import { TextoRico } from "./TextoRico";

const html = (texto: string, formato = "rico") => renderToStaticMarkup(<TextoRico texto={texto} formato={formato} />);

describe("TextoRico", () => {
  it("texto comum não vira markdown", () => {
    const saida = html("**não** é ênfase\n$x$", "texto");
    expect(saida).toContain("**não** é ênfase");
    expect(saida).not.toContain("<strong>");
  });

  it("rico: código SQL Server com #tabela temporária colorida, e não como comentário", () => {
    const saida = html("Veja:\n\n```sqlserver\nSELECT TOP 5 * INTO #notas FROM aluno;\n```");
    expect(saida).toContain('aria-label="Código em SQL Server"');
    expect(saida).toMatch(/data-papel="palavra"[^>]*>SELECT/);
    expect(saida).not.toMatch(/data-papel="comentario"[^>]*>#notas/);
  });

  it("rico: fórmula e química saem pela leitura enquanto o MathJax carrega", () => {
    const saida = html("A combustão de \\(\\ce{CH4}\\) libera energia.");
    expect(saida).toContain("CH₄");
    expect(saida).not.toContain("\\ce");
  });

  it("rico: $$ no meio da linha vai em bloco, como no app", () => {
    expect(html("e $$E = mc^2$$ fim")).toContain("block text-center");
  });

  it("rico: HTML cru não passa", () => {
    expect(html("<script>alert(1)</script> oi")).not.toContain("<script>");
  });

  it("os casos de referência desenham sem quebrar", () => {
    for (const caso of casos) expect(() => html(caso.entrada), caso.nome).not.toThrow();
  });
});

describe("cores do código", () => {
  it("cada papel tem 7:1 (AAA) sobre o fundo; o número da linha, decoração, 4,5:1", () => {
    for (const [papel, cor] of Object.entries(CORES_DO_CODIGO)) expect(contraste(cor, FUNDO_DO_CODIGO), papel).toBeGreaterThanOrEqual(7);
    expect(contraste(NUMERO_DA_LINHA, FUNDO_DO_CODIGO)).toBeGreaterThanOrEqual(4.5);
  });
});
