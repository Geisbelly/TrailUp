import { describe, expect, it } from "vitest";
import { emailDoAlunoDeTeste, emailValido, gerarSenha, lerPedido, linkDeRetorno } from "./regras";

function sequencia(valores: number[]) {
  let i = 0;
  return (v: Uint32Array) => {
    v[0] = valores[i++ % valores.length];
  };
}

describe("lerPedido", () => {
  it("aceita criar com e-mail normalizado e instituição opcional", () => {
    expect(lerPedido({ acao: "criar", email: "  Prof@Escola.EDU.br ", nome: " Ana   Lima " })).toEqual({
      acao: "criar", email: "prof@escola.edu.br", nome: "Ana Lima", instituicao: null,
    });
  });

  it.each([
    [{ acao: "criar", email: "prof@escola.br" }],
    [{ acao: "criar", email: "não é e-mail", nome: "Ana" }],
    [{ acao: "acesso" }],
    [{ acao: "apagar", email: "prof@escola.br" }],
    [{ acao: "situacao", emails: [] }],
    [{ acao: "situacao", emails: ["a@b.br", "x"] }],
    [null],
    ["criar"],
  ])("recusa pedido fora do contrato: %j", corpo => {
    expect(lerPedido(corpo)).toBeNull();
  });

  it("tira e-mails repetidos da consulta de situação", () => {
    expect(lerPedido({ acao: "situacao", emails: ["A@b.br", "a@b.br", "c@d.br"] })).toEqual({
      acao: "situacao", emails: ["a@b.br", "c@d.br"],
    });
  });

  it("recusa consulta grande demais", () => {
    const emails = Array.from({ length: 201 }, (_, i) => `p${i}@escola.br`);
    expect(lerPedido({ acao: "situacao", emails })).toBeNull();
  });
});

describe("emailValido", () => {
  it.each(["a@b", "a b@c.br", "<a@b.br>", "a@b.br,c@d.br", ""])("recusa %s", e => {
    expect(emailValido(e)).toBeNull();
  });
});

describe("gerarSenha", () => {
  it("tem as quatro classes de caractere e o tamanho pedido", () => {
    for (let i = 0; i < 200; i++) {
      const s = gerarSenha(14);
      expect(s).toHaveLength(14);
      expect(s).toMatch(/[a-z]/);
      expect(s).toMatch(/[A-Z]/);
      expect(s).toMatch(/[2-9]/);
      expect(s).toMatch(/[!#%+=?@]/);
      expect(s).not.toMatch(/[01lIOo]/);
    }
  });

  it("nunca fica abaixo de 12 caracteres", () => {
    expect(gerarSenha(4)).toHaveLength(12);
  });

  it("descarta o sorteio que daria viés de módulo", () => {
    // 0xFFFFFFFF fica acima do limite para qualquer alfabeto que não divide 2^32 e é sorteado de novo.
    const s = gerarSenha(12, sequencia([0xffffffff, 5, 7, 11, 13]));
    expect(s).toHaveLength(12);
  });
});

describe("emailDoAlunoDeTeste", () => {
  it("usa o domínio configurado e um sufixo de 8 dígitos", () => {
    expect(emailDoAlunoDeTeste("@TrailUp.app")).toMatch(/^aluno\.teste\.[2-9]{8}@trailup\.app$/);
  });

  it("recusa domínio inválido", () => {
    expect(() => emailDoAlunoDeTeste("sem-ponto")).toThrow();
  });
});

describe("linkDeRetorno", () => {
  it("volta para a aba de inscrição da cartilha avisando a confirmação", () => {
    expect(linkDeRetorno("https://trailup.vercel.app/")).toBe(
      "https://trailup.vercel.app/pesquisa/professores?aba=inscricao&confirmado=1",
    );
  });

  it("recusa http fora do localhost", () => {
    expect(() => linkDeRetorno("http://exemplo.com")).toThrow();
    expect(linkDeRetorno("http://localhost:8080")).toContain("localhost:8080/pesquisa/professores");
  });
});
