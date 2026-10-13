import { describe, expect, it } from "vitest";
import { diasAguardando, dominioBase, dominioDoEmail, emailDeOutraInstituicao, resumoProfessor, rotuloEspera } from "./aprovacoes";

describe("diasAguardando", () => {
  const agora = new Date(2026, 8, 5, 10, 0);
  it("conta dias de calendário", () => expect(diasAguardando(new Date(2026, 8, 2, 23, 0).toISOString(), agora)).toBe(3));
  it("mesmo dia é zero", () => expect(diasAguardando(new Date(2026, 8, 5, 1, 0).toISOString(), agora)).toBe(0));
  it("data futura ou inválida não fica negativa", () => {
    expect(diasAguardando(new Date(2026, 9, 1).toISOString(), agora)).toBe(0);
    expect(diasAguardando("x", agora)).toBe(0);
  });
});

describe("rotuloEspera", () => {
  it("singular, plural e hoje", () => {
    expect(rotuloEspera(0)).toBe("aguardando desde hoje");
    expect(rotuloEspera(1)).toBe("aguardando 1 dia");
    expect(rotuloEspera(8)).toBe("aguardando 8 dias");
  });
});

describe("resumoProfessor", () => {
  it("junta e omite vazios", () => {
    expect(resumoProfessor("ULBRA", "Física")).toBe("ULBRA · Física");
    expect(resumoProfessor(" ", "Física")).toBe("Física");
    expect(resumoProfessor(null, null)).toBe("Instituição não informada");
  });
});

describe("dominioDoEmail", () => {
  it("extrai e normaliza o domínio", () => {
    expect(dominioDoEmail(" Ana@Rede.ULBRA.br ")).toBe("rede.ulbra.br");
  });
  it("e-mail inválido ou ausente é null", () => {
    expect(dominioDoEmail(null)).toBeNull();
    expect(dominioDoEmail("sem-arroba")).toBeNull();
    expect(dominioDoEmail("a@b")).toBeNull();
    expect(dominioDoEmail("a@@b.com")).toBeNull();
  });
});

describe("dominioBase", () => {
  it("tira subdomínios", () => {
    expect(dominioBase("rede.ulbra.br")).toBe("ulbra.br");
    expect(dominioBase("ulbra.br")).toBe("ulbra.br");
  });
  it("respeita o segundo nível com código de país", () => {
    expect(dominioBase("mail.ifto.edu.br")).toBe("ifto.edu.br");
    expect(dominioBase("loja.empresa.com.br")).toBe("empresa.com.br");
  });
});

describe("emailDeOutraInstituicao", () => {
  it("mesma instituição, subdomínios diferentes: não avisa", () => {
    expect(emailDeOutraInstituicao("a@rede.ulbra.br", "b@ulbra.br")).toBe(false);
  });
  it("instituições diferentes: avisa", () => {
    expect(emailDeOutraInstituicao("a@ifto.edu.br", "b@rede.ulbra.br")).toBe(true);
  });
  it("provedor gratuito de qualquer lado: não há instituição para comparar", () => {
    expect(emailDeOutraInstituicao("a@gmail.com", "b@ulbra.br")).toBe(false);
    expect(emailDeOutraInstituicao("a@ulbra.br", "b@gmail.com")).toBe(false);
  });
  it("sem e-mail: não avisa", () => {
    expect(emailDeOutraInstituicao(null, "b@ulbra.br")).toBe(false);
    expect(emailDeOutraInstituicao("a@ulbra.br", undefined)).toBe(false);
  });
});
