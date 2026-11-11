import { describe, expect, it } from "vitest";
import { alteracaoDaPublicacao, ocultosDoAluno, paraCampoLocal, situacaoDoTopico } from "./publicacaoDoTopico";

const agora = new Date("2026-11-10T12:00:00");

describe("situacaoDoTopico", () => {
  it("rascunho é oculto; publicado é visível", () => {
    expect(situacaoDoTopico({ publicacao: "rascunho" }, agora)).toEqual({ liberado: false, estado: "rascunho", rotulo: "Rascunho" });
    expect(situacaoDoTopico({ publicacao: "publicado" }, agora).liberado).toBe(true);
  });

  it("sem a coluna (banco antes da migration) continua visível, como sempre foi", () => {
    expect(situacaoDoTopico({}, agora)).toEqual({ liberado: true, estado: "publicado", rotulo: "Publicado" });
  });

  it("agendado no futuro mostra quando abre; depois da hora já está liberado, sem cron", () => {
    const futuro = situacaoDoTopico({ publicacao: "agendado", publicar_em: new Date("2026-11-12T08:00:00").toISOString() }, agora);
    expect(futuro.liberado).toBe(false);
    expect(futuro.rotulo).toMatch(/^Abre em 12\/11 às 08:00$/);
    const passado = situacaoDoTopico({ publicacao: "agendado", publicar_em: new Date("2026-11-10T11:59:00").toISOString() }, agora);
    expect(passado).toMatchObject({ liberado: true, estado: "agendado", rotulo: "Publicado" });
  });

  it("agendado sem data não abre (o banco nem deixa gravar assim)", () => {
    expect(situacaoDoTopico({ publicacao: "agendado", publicar_em: null }, agora).liberado).toBe(false);
  });
});

describe("alteracaoDaPublicacao", () => {
  it("rascunho e publicar agora limpam a data", () => {
    expect(alteracaoDaPublicacao("rascunho", "2026-11-12T08:00", agora)).toEqual({ publicacao: "rascunho", publicar_em: null });
    expect(alteracaoDaPublicacao("publicado", "", agora)).toEqual({ publicacao: "publicado", publicar_em: null });
  });

  it("agendar exige data futura", () => {
    expect(alteracaoDaPublicacao("agendado", "", agora)).toHaveProperty("erro");
    expect(alteracaoDaPublicacao("agendado", "2026-11-10T11:00", agora)).toHaveProperty("erro");
    expect(alteracaoDaPublicacao("agendado", "2026-11-12T08:00", agora)).toEqual({
      publicacao: "agendado",
      publicar_em: new Date("2026-11-12T08:00").toISOString(),
    });
  });
});

describe("paraCampoLocal e ocultosDoAluno", () => {
  it("volta a data gravada para o campo, no fuso do navegador", () => {
    const iso = new Date("2026-11-12T08:05:00").toISOString();
    expect(paraCampoLocal(iso)).toBe("2026-11-12T08:05");
    expect(paraCampoLocal(null)).toBe("");
  });

  it("lista só o que o aluno ainda não vê", () => {
    const topicos = [
      { id: 1, publicacao: "publicado" },
      { id: 2, publicacao: "rascunho" },
      { id: 3, publicacao: "agendado", publicar_em: new Date("2026-11-12T08:00:00").toISOString() },
    ];
    expect(ocultosDoAluno(topicos, agora).map((t) => t.id)).toEqual([2, 3]);
  });
});
