import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { chaveDoPerfil, COR_DO_PERFIL, iniciaisDe, OPACIDADE_FUNDO_PERFIL, PERFIS_EM_ORDEM } from "./perfilCores";
import { contraste, misturar } from "./contraste";

const SUPERFICIES = { pagina: "#0d0b16", card: "#1b1728", interna: "#231d33" };

describe("COR_DO_PERFIL", () => {
  it("espelha as cores oficiais de microservice/src/constants/brainHex.ts", () => {
    const oficial = readFileSync(
      fileURLToPath(new URL("../../../../../microservice/src/constants/brainHex.ts", import.meta.url)),
      "utf8",
    );
    for (const perfil of PERFIS_EM_ORDEM) {
      const bloco = oficial.match(new RegExp(`${perfil}:\\s*\\{[^}]*?color:\\s*"(#[0-9a-fA-F]{6})"`));
      expect(bloco?.[1]?.toLowerCase(), perfil).toBe(COR_DO_PERFIL[perfil].marca);
    }
  });

  it.each(PERFIS_EM_ORDEM)("texto de %s passa de 7:1 nas superfícies e no fundo do próprio chip", (perfil) => {
    const { marca, texto } = COR_DO_PERFIL[perfil];
    const fundoDoChip = misturar(marca, SUPERFICIES.card, OPACIDADE_FUNDO_PERFIL);
    for (const fundo of [...Object.values(SUPERFICIES), fundoDoChip]) {
      expect(contraste(texto, fundo)).toBeGreaterThanOrEqual(7);
    }
  });
});

describe("chaveDoPerfil", () => {
  it("aceita inglês, português, acento, maiúscula e o rótulo com parênteses", () => {
    expect(chaveDoPerfil("Mastermind")).toBe("mastermind");
    expect(chaveDoPerfil("  SEEKER ")).toBe("seeker");
    expect(chaveDoPerfil("Socializer (Colaborador)")).toBe("socializer");
    expect(chaveDoPerfil("socialiser")).toBe("socializer");
    expect(chaveDoPerfil("Estrategista")).toBe("mastermind");
  });

  it("devolve null para o que não reconhece", () => {
    expect(chaveDoPerfil("Sem perfil")).toBeNull();
    expect(chaveDoPerfil(null)).toBeNull();
  });
});

describe("iniciaisDe", () => {
  it("pega as duas primeiras iniciais", () => {
    expect(iniciaisDe("Marina Corrêa Lima")).toBe("MC");
    expect(iniciaisDe("ana")).toBe("A");
    expect(iniciaisDe("")).toBe("?");
  });
});
