import { describe, expect, it } from "vitest";
import { destinoParaLink, destinosParaLinks, historicoParaEnvio, mensagemDeErro, TODAS, turmaInicial, type Mensagem } from "./conversa";

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
  it("sem conexão com a API diz isso, sem falar em servidor dormindo", () => {
    expect(mensagemDeErro(new Error("Nao foi possivel conectar na API de personalizacao"))).toMatch(/servidor da Lumi/);
    expect(mensagemDeErro(new DOMException("The operation was aborted.", "AbortError"))).toMatch(/servidor da Lumi/);
  });

  it("turma alheia, modelo fora e erro genérico", () => {
    expect(mensagemDeErro(new Error("A Lumi só lê as turmas do professor autenticado."))).toMatch(/suas turmas/);
    expect(mensagemDeErro(new Error("A Lumi não conseguiu responder agora."))).toMatch(/modelo de IA não respondeu/);
    expect(mensagemDeErro(new Error("algo estranho"))).toMatch(/Algo deu errado/);
  });
});

describe("destinoParaLink", () => {
  it("aba do console vira botão com o nome do menu e a turma do painel", () => {
    expect(destinoParaLink("economia", "68")).toEqual({ rotulo: "Economia", caminho: "/console/economia?turma=68" });
    expect(destinoParaLink("dashboard", TODAS)).toEqual({ rotulo: "Visão geral", caminho: "/console" });
    expect(destinoParaLink("classes", TODAS)).toEqual({ rotulo: "Turmas", caminho: "/console/turmas" });
  });

  it("parte da Economia vai por ?aba=", () => {
    expect(destinoParaLink("economia.valores", "68")).toEqual({
      rotulo: "Economia › Valores",
      caminho: "/console/economia?turma=68&aba=valores",
    });
  });

  it("recusa o que não é aba de turma do console", () => {
    for (const d of ["aprovacoes", "tecnico", "admin", "economia.inexistente", "trilha.valores", "economia.valores.x", ""]) {
      expect(destinoParaLink(d, "68")).toBeNull();
    }
  });

  it("lista: sem repetidos, sem lixo, no máximo 3", () => {
    const links = destinosParaLinks(["trilha", "trilha", 7, "notas", "x", "eventos", "economia"], TODAS);
    expect(links.map((l) => l.rotulo)).toEqual(["Trilhas", "Notas", "Eventos"]);
    expect(destinosParaLinks(undefined, TODAS)).toEqual([]);
  });
});
