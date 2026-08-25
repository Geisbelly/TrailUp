import { describe, it, expect } from "vitest";
import {
  SENHA_MINIMA,
  emailValido,
  mensagemDeErroDeSenha,
  validarNovaSenha,
} from "./passwordPolicy";

describe("validarNovaSenha", () => {
  it("aceita senha valida com confirmacao igual", () => {
    const r = validarNovaSenha({ novaSenha: "senhaboa1", confirmacao: "senhaboa1" });
    expect(r.ok).toBe(true);
    expect(r.erro).toBeNull();
  });

  it("recusa senha menor que o minimo, apontando o campo", () => {
    const r = validarNovaSenha({ novaSenha: "abc", confirmacao: "abc" });
    expect(r.ok).toBe(false);
    expect(r.campo).toBe("novaSenha");
    expect(r.erro).toContain(String(SENHA_MINIMA));
  });

  it("recusa confirmacao diferente", () => {
    const r = validarNovaSenha({ novaSenha: "senhaboa1", confirmacao: "senhaboa2" });
    expect(r.ok).toBe(false);
    expect(r.campo).toBe("confirmacao");
  });

  it("recusa nova senha vazia", () => {
    const r = validarNovaSenha({ novaSenha: "", confirmacao: "" });
    expect(r.ok).toBe(false);
    expect(r.campo).toBe("novaSenha");
  });

  describe("na troca com usuario logado (senha atual informada)", () => {
    it("exige a senha atual", () => {
      const r = validarNovaSenha({ novaSenha: "senhaboa1", confirmacao: "senhaboa1", senhaAtual: "" });
      expect(r.ok).toBe(false);
      expect(r.campo).toBe("senhaAtual");
    });

    it("recusa nova senha igual a atual", () => {
      const r = validarNovaSenha({
        novaSenha: "mesmasenha",
        confirmacao: "mesmasenha",
        senhaAtual: "mesmasenha",
      });
      expect(r.ok).toBe(false);
      expect(r.campo).toBe("novaSenha");
      expect(r.erro).toMatch(/diferente da atual/i);
    });

    it("aceita quando tudo esta certo", () => {
      const r = validarNovaSenha({
        novaSenha: "novasenha1",
        confirmacao: "novasenha1",
        senhaAtual: "antiga123",
      });
      expect(r.ok).toBe(true);
    });
  });

  it("na recuperacao por e-mail nao pede senha atual (ninguem a sabe)", () => {
    const r = validarNovaSenha({ novaSenha: "novasenha1", confirmacao: "novasenha1" });
    expect(r.ok).toBe(true);
  });
});

describe("emailValido", () => {
  it("aceita e-mail comum e ignora espaco em volta", () => {
    expect(emailValido("professor@ulbra.br")).toBe(true);
    expect(emailValido("  professor@ulbra.br  ")).toBe(true);
  });

  it("recusa entrada sem @ ou sem dominio", () => {
    expect(emailValido("professor")).toBe(false);
    expect(emailValido("professor@")).toBe(false);
    expect(emailValido("professor@ulbra")).toBe(false);
    expect(emailValido("")).toBe(false);
  });
});

describe("mensagemDeErroDeSenha", () => {
  it("traduz senha igual a anterior", () => {
    const msg = mensagemDeErroDeSenha(new Error("New password should be different from the old password."));
    expect(msg).toMatch(/diferente da atual/i);
  });

  it("traduz credencial invalida como senha atual incorreta", () => {
    expect(mensagemDeErroDeSenha(new Error("Invalid login credentials"))).toMatch(/senha atual incorreta/i);
  });

  it("traduz link expirado", () => {
    expect(mensagemDeErroDeSenha(new Error("Email link is invalid or has expired"))).toMatch(/expirou/i);
  });

  it("traduz limite de tentativas", () => {
    expect(mensagemDeErroDeSenha(new Error("For security purposes, too many requests"))).toMatch(/tentativas/i);
  });

  it("cai numa mensagem generica quando nao reconhece", () => {
    expect(mensagemDeErroDeSenha(new Error("boom"))).toMatch(/tente novamente/i);
    expect(mensagemDeErroDeSenha(null)).toMatch(/tente novamente/i);
  });
});
