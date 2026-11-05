import { describe, expect, it } from "vitest";
import { destinoParaLink, destinosParaLinks, historicoParaEnvio, mensagemDaResposta, mensagemDeErro, TODAS, turmaInicial, type Mensagem } from "./conversa";

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
    for (const d of ["aprovacoes", "tecnico", "administracao", "admin", "economia.inexistente", "trilha.valores", "economia.valores.x", ""]) {
      expect(destinoParaLink(d, "68")).toBeNull();
    }
  });

  it("lista: sem repetidos, sem lixo, no máximo 6", () => {
    const links = destinosParaLinks(["trilha", "trilha", 7, "notas", "x", "eventos", "economia", "missoes", "conquistas", "guildas"], TODAS);
    expect(links.map((l) => l.rotulo)).toEqual(["Trilhas", "Notas", "Eventos", "Economia", "Missões", "Conquistas"]);
    expect(destinosParaLinks(undefined, TODAS)).toEqual([]);
  });
});

describe("mensagemDaResposta", () => {
  it("cada seção leva o próprio botão, e o botão não se repete embaixo", () => {
    const m = mensagemDaResposta(
      1,
      {
        resposta: "tudo em linha",
        introducao: "A economia tem duas partes.",
        secoes: [
          { titulo: "Valores", texto: "Ajuste os pontos.", destino: "economia.valores" },
          { titulo: "Próximo passo", texto: "Revise.", destino: null },
          { titulo: "", texto: "some" },
        ],
        destinos: ["economia.valores", "trilha"],
        tutorial: "configurar_economia",
      },
      "54",
    );
    expect(m.texto).toBe("tudo em linha");
    expect(m.introducao).toBe("A economia tem duas partes.");
    expect(m.secoes?.map((s) => [s.titulo, s.destino?.caminho ?? null])).toEqual([
      ["Valores", "/console/economia?turma=54&aba=valores"],
      ["Próximo passo", null],
    ]);
    expect(m.destinos?.map((d) => d.rotulo)).toEqual(["Trilhas"]);
    expect(m.tutorial?.id).toBe("configurar_economia");
  });

  it("API antiga, sem seções nem tutorial, continua mostrando o texto", () => {
    const m = mensagemDaResposta(1, { resposta: "oi", destinos: ["notas"] }, TODAS);
    expect(m).toMatchObject({ texto: "oi", secoes: undefined, tutorial: null });
    expect(m.destinos?.map((d) => d.rotulo)).toEqual(["Notas"]);
  });

  it("tutorial fora do catálogo não vira botão", () => {
    expect(mensagemDaResposta(1, { resposta: "oi", tutorial: "hackear" }, TODAS).tutorial).toBeNull();
  });
});

describe("assinatura da fala da Lumi", () => {
  it("guarda a assinatura da resposta e a devolve no histórico", () => {
    const m = mensagemDaResposta(1, { resposta: "Ana foi bem.", assinatura: "abc" }, TODAS);

    expect(historicoParaEnvio([m])).toEqual([{ papel: "escriba", texto: "Ana foi bem.", assinatura: "abc" }]);
  });

  it("fala sem assinatura segue sem o campo", () => {
    const m = mensagemDaResposta(1, { resposta: "Ana foi bem." }, TODAS);

    expect(historicoParaEnvio([m])).toEqual([{ papel: "escriba", texto: "Ana foi bem." }]);
  });
});
