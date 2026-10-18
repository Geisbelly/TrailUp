import { describe, expect, it } from "vitest";
import { desdeQuando, forcaDaSenha, iniciais, plural } from "./conta";

describe("forcaDaSenha", () => {
  it("vazia não pontua", () => expect(forcaDaSenha("").nivel).toBe(0));
  it("abaixo do mínimo é curta", () => expect(forcaDaSenha("abc").rotulo).toBe("curta"));
  it("mínimo simples é fraca", () => expect(forcaDaSenha("abcdef").rotulo).toBe("fraca"));
  it("longa e variada é forte", () => expect(forcaDaSenha("Abc123!xyz9876").nivel).toBe(4));
});

describe("iniciais", () => {
  it("usa primeiro e último nome", () => expect(iniciais("Geisbelly Admin Prof")).toBe("GP"));
  it("nome único", () => expect(iniciais("ana")).toBe("A"));
  it("vazio", () => expect(iniciais("  ")).toBe("?"));
});

describe("desdeQuando / plural", () => {
  it("data inválida vira null", () => expect(desdeQuando("x")).toBeNull());
  it("formata mês e ano", () => expect(desdeQuando("2026-03-15T12:00:00Z")).toBe("março de 2026"));
  it("concorda no singular", () => expect(plural(1, "turma", "turmas")).toBe("1 turma"));
  it("concorda no plural", () => expect(plural(0, "turma", "turmas")).toBe("0 turmas"));
});
