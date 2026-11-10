import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// A marcação do editor do gabarito por tipo. O mathjs (prévia e "Conferir") carrega num efeito,
// que o render no servidor não roda; a conferência tem o teste dela (`conferenciaNoConsole.test.ts`).
vi.mock("@/lib/conferenciaNoConsole", () => ({
  carregarMathjs: () => new Promise(() => undefined),
  conferirExemploCom: vi.fn(),
  previaDoValorCom: vi.fn(),
}));

import { EditorDoGabaritoDoServidor } from "./EditorDoGabaritoDoServidor";
import { FORMULARIO_PADRAO, type FormularioDoGabarito } from "./gabaritoDoServidor";

const desenhar = (formato: "code" | "numeric" | "expression", valor: Partial<FormularioDoGabarito> = {}, carregando = false) =>
  renderToStaticMarkup(
    createElement(EditorDoGabaritoDoServidor, {
      formato,
      valor: { ...FORMULARIO_PADRAO, ...valor },
      onChange: () => undefined,
      carregando,
      classeDoCampo: "campo",
      classeDoRotulo: "rotulo",
    }),
  );

describe("EditorDoGabaritoDoServidor", () => {
  it("código: linguagem, referência com prévia em bloco e critérios; sem conferir", () => {
    const html = desenhar("code", { linguagem: "python", referencia: "print(1)", criterios: ["usa laço"] });
    expect(html).toContain('<option value="python" selected="">Python</option>');
    expect(html).toContain("Código de referência");
    expect(html).toContain('aria-label="Critério 1"');
    expect(html).toContain("Adicionar critério");
    expect(html).not.toContain("Conferir com respostas de exemplo");
  });

  it("numérica: tolerância, tipo e grandeza, e o conferir", () => {
    const html = desenhar("numeric", { referencia: "10 m/s", tipoTolerancia: "absoluta" });
    expect(html).toContain("Tolerância (na unidade do valor)");
    expect(html).toContain('<option value="velocidade">Velocidade</option>');
    expect(html).toContain("Conferir com respostas de exemplo");
  });

  it("expressão: variáveis e domínio; química esconde os dois", () => {
    expect(desenhar("expression", { referencia: "2x" })).toContain("Domínio: de");
    const quimica = desenhar("expression", { referencia: "\\ce{H2 + Cl2 -> 2HCl}" });
    expect(quimica).not.toContain("Domínio: de");
    expect(quimica).toContain("compara espécies e coeficientes");
  });

  it("gabarito inválido mostra o motivo; carregando trava o formulário", () => {
    expect(desenhar("expression", { referencia: "x", dominioDe: "5", dominioAte: "1" })).toContain(
      "O domínio precisa de um início menor que o fim.",
    );
    expect(desenhar("numeric", {}, true)).toMatch(/<fieldset disabled=""/);
    // Formulário vazio não acusa erro antes de o professor escrever.
    expect(desenhar("numeric")).not.toContain("Escreva o valor esperado.");
  });
});
