import { describe, expect, it } from "vitest";
import { historicoParaEnvio, mensagemDeErro, TODAS, turmaInicial, type Mensagem } from "./conversa";

describe("turmaInicial", () => {
  const turmas = [
    { id: 54, descricao: "SPD" },
    { id: 56, descricao: "Redes" },
  ];

  it("usa a turma da URL só se for do professor", () => {
    expect(turmaInicial(turmas, "56")).toBe("56");
    expect(turmaInicial(turmas, "999")).toBe(TODAS);
  });

  it("uma turma só já vem escolhida; várias começam em todas", () => {
    expect(turmaInicial([turmas[0]], null)).toBe("54");
    expect(turmaInicial(turmas, null)).toBe(TODAS);
    expect(turmaInicial([], null)).toBe(TODAS);
  });
});

describe("historicoParaEnvio", () => {
  it("tira boas-vindas e erros e fica com as últimas 8", () => {
    const mensagens: Mensagem[] = [
      { id: 0, papel: "escriba", texto: "Olá!" },
      ...Array.from({ length: 10 }, (_, i): Mensagem => ({ id: i + 1, papel: i % 2 ? "escriba" : "professor", texto: `m${i + 1}` })),
      { id: 11, papel: "escriba", texto: "falhou", erro: true },
    ];
    const enviado = historicoParaEnvio(mensagens);
    expect(enviado).toHaveLength(8);
    expect(enviado[0]).toEqual({ papel: "professor", texto: "m3" });
    expect(enviado.some((m) => m.texto === "falhou" || m.texto === "Olá!")).toBe(false);
  });
});

describe("mensagemDeErro", () => {
  it("API fria vira aviso de que a Lumi está acordando", () => {
    expect(mensagemDeErro(new Error("Nao foi possivel conectar na API de personalizacao"))).toMatch(/acordando/);
    expect(mensagemDeErro(new DOMException("The operation was aborted.", "AbortError"))).toMatch(/acordando/);
  });

  it("turma alheia, modelo fora e erro genérico", () => {
    expect(mensagemDeErro(new Error("A Lumi só lê as turmas do professor autenticado."))).toMatch(/suas turmas/);
    expect(mensagemDeErro(new Error("A Lumi não conseguiu responder agora."))).toMatch(/Não consegui/);
    expect(mensagemDeErro(new Error("algo estranho"))).toMatch(/Algo deu errado/);
  });
});
