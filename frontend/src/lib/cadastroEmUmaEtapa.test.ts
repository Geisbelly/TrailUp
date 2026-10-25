import { describe, expect, it } from "vitest";
import {
  MENSAGEM_CREDENCIAL,
  ehContaJaExistente,
  ehCredencialInvalida,
  ehEmailNaoConfirmado,
  mensagemDeAcesso,
  normalizarEmail,
  validarAcesso,
} from "./cadastroEmUmaEtapa";

describe("cadastro em uma etapa (#329)", () => {
  it("senha errada e conta existente dão a MESMA mensagem", () => {
    // Esta função não deve revelar existência. O fluxo de signup também precisa
    // uniformizar sucesso novo, sucesso ofuscado e duplicidade (teste de navegador).
    const senhaErrada = { message: "Invalid login credentials" };
    const jaExiste = { message: "User already registered" };
    expect(mensagemDeAcesso(senhaErrada)).toBe(MENSAGEM_CREDENCIAL);
    expect(mensagemDeAcesso(jaExiste)).toBe(MENSAGEM_CREDENCIAL);
    expect(mensagemDeAcesso(senhaErrada)).toBe(mensagemDeAcesso(jaExiste));
  });

  it("reconhece as variações que o Supabase devolve", () => {
    expect(ehCredencialInvalida({ code: "invalid_credentials" })).toBe(true);
    expect(ehCredencialInvalida({ message: "Invalid login credentials" })).toBe(true);
    expect(ehContaJaExistente({ message: "User already exists" })).toBe(true);
    expect(ehContaJaExistente({ code: "user_already_exists" })).toBe(true);
    expect(ehContaJaExistente({ code: "email_exists" })).toBe(true);
    expect(ehContaJaExistente({ message: "Email address already been registered" })).toBe(true);
    // E não confunde com outra coisa
    expect(ehCredencialInvalida({ message: "Email not confirmed" })).toBe(false);
    expect(ehContaJaExistente(null)).toBe(false);
  });

  it("e-mail não confirmado tem mensagem própria, de propósito", () => {
    // Resíduo consciente: é o único jeito de orientar quem se cadastrou e não clicou no link. O
    // Supabase só responde isso para credencial correta, e o endpoint tem limite de taxa.
    expect(ehEmailNaoConfirmado({ code: "email_not_confirmed" })).toBe(true);
    expect(mensagemDeAcesso({ code: "email_not_confirmed" })).toContain("confirmar seu e-mail");
    expect(mensagemDeAcesso({ code: "email_not_confirmed" })).not.toBe(MENSAGEM_CREDENCIAL);
  });

  it("excesso de tentativas vira pedido de espera", () => {
    expect(mensagemDeAcesso({ message: "Request rate limit reached" })).toContain("Muitas tentativas");
  });

  it("erro desconhecido não engole a mensagem original", () => {
    expect(mensagemDeAcesso({ message: "Serviço indisponível" })).toBe("Serviço indisponível");
    expect(mensagemDeAcesso({})).toContain("Tente novamente");
    expect(mensagemDeAcesso(undefined)).toContain("Tente novamente");
  });

  it("entrar exige só e-mail e senha; criar exige confirmação e termos", () => {
    const base = { email: "a@b.com", senha: "segredo1", confirmSenha: "", termos: false };
    // Caminho de entrada: confirmação e termos são irrelevantes.
    expect(validarAcesso(base, false)).toBeNull();
    // Caminho de criação: os dois passam a ser exigidos.
    expect(validarAcesso(base, true)).toContain("não coincidem");
    expect(validarAcesso({ ...base, confirmSenha: "segredo1" }, true)).toContain("termos");
    expect(validarAcesso({ ...base, confirmSenha: "segredo1", termos: true }, true)).toBeNull();
  });

  it("recusa e-mail vazio ou sem arroba, e senha curta só na criação", () => {
    const d = (extra: Record<string, unknown> = {}) =>
      ({ email: "a@b.com", senha: "segredo1", confirmSenha: "segredo1", termos: true, ...extra }) as never;
    expect(validarAcesso(d({ email: "   " }), false)).toContain("e-mail");
    expect(validarAcesso(d({ email: "sem-arroba" }), false)).toContain("e-mail");
    expect(validarAcesso(d({ senha: "" }), false)).toContain("senha");
    expect(validarAcesso(d({ senha: "123", confirmSenha: "123" }), true)).toContain("6 caracteres");
    // Entrando, senha curta NÃO é barrada aqui: quem decide é o servidor, e barrar daria
    // informação sobre a política de senha de uma conta que pode não existir.
    expect(validarAcesso(d({ senha: "123" }), false)).toBeNull();
  });

  it("normaliza o e-mail como o banco o vê", () => {
    expect(normalizarEmail("  Aluno@Escola.COM ")).toBe("aluno@escola.com");
  });
});
