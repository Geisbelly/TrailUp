import { describe, expect, it } from "vitest";
import { FEEDBACK_SEM_CODIGO, PONTO_SEM_CODIGO, semCodigo, tirarCodigo } from "./semCodigo";
import { protegerAvaliacao } from "./protecaoDaResposta";

const REFERENCIA = "def soma(n):\n    return n * (n + 1) // 2";
const ALUNO = "def soma_lista(n):\n    total = 0\n    for i in range(n + 1):\n        total += i\n    return total";

const avaliacao = (extra: Record<string, unknown> = {}) => ({
  nota_obtida: 7,
  nota_maxima: 10,
  percentual: 70,
  correta: true,
  feedback: "Funciona, mas o laço faz n passos.",
  pontos_fortes: ["A soma está certa para n positivo."],
  pontos_melhoria: ["Pense se existe uma fórmula fechada."],
  ...extra,
});

describe("tirarCodigo", () => {
  it("tira bloco cercado, com ou sem linguagem, e o que ficar sem fechar", () => {
    expect(tirarCodigo("Troque por:\n```python\nreturn n * (n + 1) // 2\n```\nE teste.")).toBe("Troque por: E teste.");
    expect(tirarCodigo("Veja ~~~\nx = 1\n~~~ fim")).toBe("Veja fim");
    expect(tirarCodigo("Comece assim: ```\nfor i in")).toBe("Comece assim:");
  });

  it("tira trecho entre crases", () => {
    expect(tirarCodigo("Use `range(n + 1)` no laço.")).toBe("Use no laço.");
    expect(tirarCodigo("Sem código aqui.")).toBe("Sem código aqui.");
  });
});

describe("semCodigo", () => {
  it("feedback com bloco sai sem o bloco", () => {
    const { avaliacao: limpa, trocados } = semCodigo(
      avaliacao({ feedback: "Quase. Faça assim:\n```python\nreturn n * (n + 1) // 2\n```" }),
    );
    expect(limpa.feedback).toBe("Quase. Faça assim:");
    expect(trocados).toBe(1);
  });

  it("campo que fica vazio vira o texto padrão; observação vazia some", () => {
    const { avaliacao: limpa, trocados } = semCodigo(
      avaliacao({
        feedback: "```\nreturn total\n```",
        pontos_fortes: ["`for i in range(n)`"],
        pontos_melhoria: ["`sum(range(n + 1))`", "Teste com n = 0."],
        observacao: "`n * (n + 1) // 2`",
      }),
    );
    expect(limpa.feedback).toBe(FEEDBACK_SEM_CODIGO);
    expect(limpa.pontos_fortes).toEqual([PONTO_SEM_CODIGO]);
    expect(limpa.pontos_melhoria).toEqual(["Teste com n = 0."]);
    expect("observacao" in limpa).toBe(false);
    expect(trocados).toBe(4);
  });

  it("sem código, nada muda", () => {
    const original = avaliacao({ observacao: "Bom nome de função." });
    expect(semCodigo(original)).toEqual({ avaliacao: original, trocados: 0 });
  });
});

describe("protegerAvaliacao contra o código de referência", () => {
  it("linha do código de referência no feedback é trocada, mesmo sem crase", () => {
    const { avaliacao: protegida, trocados } = protegerAvaliacao(
      avaliacao({ feedback: "Troque o laço por return n * (n + 1) // 2 e fica constante." }),
      REFERENCIA,
      ALUNO,
    );
    expect(protegida.feedback).not.toContain("// 2");
    expect(trocados).toBe(1);
  });

  it("o código do próprio aluno pode ser citado, por nome", () => {
    const { trocados } = protegerAvaliacao(
      avaliacao({ feedback: "Sua função soma_lista percorre todos os números de 0 a n e acumula em total." }),
      REFERENCIA,
      ALUNO,
    );
    expect(trocados).toBe(0);
  });
});
