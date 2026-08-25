import { describe, it, expect } from "vitest";
import {
  MATERIAL_ROUTE_PATH,
  buildMaterialPath,
  isMaterialRoute,
  parseMaterialQuery,
} from "./materialRoute";

describe("buildMaterialPath", () => {
  it("leva na URL tudo que a pagina precisa pra se reconstruir sozinha", () => {
    const path = buildMaterialPath({
      classeId: "32",
      topicoId: "129",
      conteudoId: "178",
      perfil: "conqueror",
      aba: "markdown",
    });

    expect(path.startsWith(`${MATERIAL_ROUTE_PATH}?`)).toBe(true);
    const query = new URLSearchParams(path.split("?")[1]);
    expect(query.get("classe")).toBe("32");
    expect(query.get("topico")).toBe("129");
    expect(query.get("conteudo")).toBe("178");
    expect(query.get("perfil")).toBe("conqueror");
    expect(query.get("aba")).toBe("markdown");
  });

  it("omite o que nao foi informado, em vez de mandar vazio", () => {
    const path = buildMaterialPath({ perfil: "seeker" });
    const query = new URLSearchParams(path.split("?")[1]);

    expect(query.get("perfil")).toBe("seeker");
    expect(query.has("classe")).toBe(false);
    expect(query.has("aba")).toBe(false);
  });

  it("fica sob a rota da aba de personalizacoes (subrota mantem a aba ativa)", () => {
    expect(MATERIAL_ROUTE_PATH).toBe("/console/personalizacoes/material");
  });
});

describe("parseMaterialQuery", () => {
  it("le de volta o que buildMaterialPath escreveu (round-trip)", () => {
    const params = {
      classeId: "32",
      topicoId: "129",
      conteudoId: "178",
      perfil: "conqueror",
      aba: "audio",
    };

    const lido = parseMaterialQuery(buildMaterialPath(params).split("?")[1]);

    expect(lido).toEqual(params);
  });

  it("sem perfil nao ha pagina de material (devolve null)", () => {
    expect(parseMaterialQuery("classe=32&topico=129")).toBeNull();
    expect(parseMaterialQuery("")).toBeNull();
    expect(parseMaterialQuery("perfil=%20%20")).toBeNull();
  });

  it("campo vazio vira ausente, nao string vazia", () => {
    const lido = parseMaterialQuery("perfil=seeker&classe=&aba=");

    expect(lido?.classeId).toBeUndefined();
    expect(lido?.aba).toBeUndefined();
  });

  it("aceita URLSearchParams direto (e o que o useSearchParams entrega)", () => {
    const lido = parseMaterialQuery(new URLSearchParams("perfil=achiever&topico=7"));

    expect(lido?.perfil).toBe("achiever");
    expect(lido?.topicoId).toBe("7");
  });
});

describe("isMaterialRoute", () => {
  it("reconhece a pagina de material, com ou sem barra final", () => {
    expect(isMaterialRoute("/console/personalizacoes/material")).toBe(true);
    expect(isMaterialRoute("/console/personalizacoes/material/")).toBe(true);
  });

  it("nao confunde com a lista da secao nem com outra aba", () => {
    expect(isMaterialRoute("/console/personalizacoes")).toBe(false);
    expect(isMaterialRoute("/console/trilha")).toBe(false);
    expect(isMaterialRoute("/console")).toBe(false);
  });
});
