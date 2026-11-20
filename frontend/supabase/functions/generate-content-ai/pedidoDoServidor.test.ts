import { describe, expect, it } from "vitest";
import { autorizar, pareceChaveDeServico } from "./pedidoDoServidor";

function base64url(texto: string): string {
  return Buffer.from(texto, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function jwt(payload: Record<string, unknown>): string {
  return `${base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${base64url(JSON.stringify(payload))}.assinatura`;
}

describe("pareceChaveDeServico", () => {
  it("JWT com role service_role é candidato, com e sem Bearer", () => {
    const token = jwt({ iss: "supabase", role: "service_role", ref: "projeto" });
    expect(pareceChaveDeServico(`Bearer ${token}`)).toBe(true);
    expect(pareceChaveDeServico(token)).toBe(true);
  });

  it("JWT de usuário ou anon não é candidato", () => {
    expect(pareceChaveDeServico(`Bearer ${jwt({ sub: "uuid", role: "authenticated" })}`)).toBe(false);
    expect(pareceChaveDeServico(`Bearer ${jwt({ role: "anon" })}`)).toBe(false);
    expect(pareceChaveDeServico(`Bearer ${jwt({ sub: "uuid" })}`)).toBe(false);
  });

  it("chave sb_secret_ é candidata", () => {
    expect(pareceChaveDeServico("Bearer sb_secret_abc123")).toBe(true);
  });

  it("lixo, vazio e publishable não são candidatos", () => {
    expect(pareceChaveDeServico("Bearer não-é-jwt")).toBe(false);
    expect(pareceChaveDeServico("Bearer a.%%%.c")).toBe(false);
    expect(pareceChaveDeServico(`Bearer a.${base64url("[1,2]")}.c`)).toBe(false);
    expect(pareceChaveDeServico("Bearer sb_publishable_abc")).toBe(false);
    expect(pareceChaveDeServico("")).toBe(false);
    expect(pareceChaveDeServico(null)).toBe(false);
  });
});

describe("autorizar", () => {
  it("servidor no modo desafios passa", () => {
    expect(autorizar({ servidor: true, usuario: false, mode: "desafios" })).toBe("ok");
  });

  it.each(["content", "trail", "all", "description", "trail-skeleton", "trail-topic", ""])(
    "servidor no modo %j é recusado",
    (mode) => {
      expect(autorizar({ servidor: true, usuario: false, mode })).toBe("recusado");
    },
  );

  it.each(["desafios", "content", "trail", "all"])("usuário no modo %j passa", (mode) => {
    expect(autorizar({ servidor: false, usuario: true, mode })).toBe("ok");
  });

  it("sem servidor nem usuário é recusado", () => {
    expect(autorizar({ servidor: false, usuario: false, mode: "desafios" })).toBe("recusado");
    expect(autorizar({ servidor: false, usuario: false, mode: "content" })).toBe("recusado");
  });
});
