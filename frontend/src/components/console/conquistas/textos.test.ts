import { describe, expect, it } from "vitest";
import { noTeto, rotuloDoTeto, textoDeAlternar } from "./textos";

describe("teto", () => {
  it("rótulo e limite", () => {
    expect(rotuloDoTeto(12, 20)).toBe("12 de 20 conquistas desta turma");
    expect(noTeto(19, 20)).toBe(false);
    expect(noTeto(20, 20)).toBe(true);
    expect(noTeto(25, 20)).toBe(true);
  });
});

describe("textoDeAlternar", () => {
  const c = { nome: "Maratonista", ativa: true, concedidas: 3 };

  it("desativar: preserva quem ganhou e diz que não há exclusão", () => {
    const t = textoDeAlternar(c, true);
    expect(t.confirmar).toBe("Desativar");
    expect(t.corpo).toContain("Quem já ganhou (3) continua");
    expect(t.corpo).toContain("Não dá para excluir");
  });

  it("com o gatilho respeitando `ativa`, promete que deixa de ser avaliada", () => {
    expect(textoDeAlternar(c, true).corpo).toContain("deixa de ser avaliada");
  });

  it("com o gatilho AINDA não respeitando, não promete o que não acontece", () => {
    const corpo = textoDeAlternar(c, false).corpo;
    expect(corpo).not.toContain("deixa de ser avaliada");
    expect(corpo).toContain("ainda não respeita");
  });

  it("o texto padrão reflete a flag do módulo (hoje desligada)", () => {
    expect(textoDeAlternar(c).corpo).toContain("ainda não respeita");
  });

  it("sem ninguém que tenha ganhado, diz isso", () => {
    expect(textoDeAlternar({ ...c, concedidas: 0 }, true).corpo).toContain("Ninguém ganhou");
  });

  it("reativar é simples", () => {
    const t = textoDeAlternar({ ...c, ativa: false });
    expect(t.titulo).toBe("Reativar conquista");
    expect(t.confirmar).toBe("Reativar");
  });
});
