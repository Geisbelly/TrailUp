import { describe, expect, it } from "vitest";

import { nomeCompletoLimpo, problemaDoNomeCompleto } from "./nomeCompleto";

describe("problemaDoNomeCompleto", () => {
  it.each(["Ana Souza", "João da Silva", "maria clara", "Ana  Clara   Souza", "José M. Pereira", "Zoë D'Ávila"])(
    "aceita %s",
    (nome) => {
      expect(problemaDoNomeCompleto(nome)).toBeNull();
    },
  );

  it("recusa vazio", () => {
    expect(problemaDoNomeCompleto("   ")).toBe("Digite seu nome completo.");
  });

  it("recusa nome de usuário colado, que foi o caso real", () => {
    expect(problemaDoNomeCompleto("rafanuntavares")).toBe("Digite nome e sobrenome.");
  });

  it.each(["@ana souza", "ana souza 2008", "ana_souza silva", "ana@escola.com"])("recusa %s, que não é nome", (nome) => {
    expect(problemaDoNomeCompleto(nome)).toMatch(/sem @, números ou _/);
  });

  it("não conta pontuação solta como palavra", () => {
    expect(problemaDoNomeCompleto("Ana .")).toBe("Digite nome e sobrenome.");
  });

  it("recusa nome longo demais", () => {
    expect(problemaDoNomeCompleto(`Ana ${"a".repeat(130)}`)).toMatch(/até 120/);
  });
});

describe("nomeCompletoLimpo", () => {
  it("tira espaço sobrando", () => {
    expect(nomeCompletoLimpo("  Ana   Clara  Souza ")).toBe("Ana Clara Souza");
  });
});
