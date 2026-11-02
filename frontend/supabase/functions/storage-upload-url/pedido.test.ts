import { describe, expect, it } from "vitest";
import { chamadorAutorizado, lerPedido, mesmaChave, urlDeLeitura } from "./pedido";

const CHAVE = "eyJ.servico.assinatura";
const DECK = "brainhex/seeker/classe-54/topico-131/conteudo-7/generation-abc/apresentacao/material-1-parte-1.html";

describe("chamadorAutorizado", () => {
  it("aceita so' o Bearer com a chave de servico", () => {
    expect(chamadorAutorizado(`Bearer ${CHAVE}`, CHAVE)).toBe(true);
  });

  it.each([
    ["sem header", null],
    ["sem Bearer", CHAVE],
    ["outra chave (JWT de aluno, anon)", "Bearer eyJ.anon.assinatura"],
    ["prefixo da chave", `Bearer ${CHAVE.slice(0, -1)}`],
    ["chave com sobra", `Bearer ${CHAVE}x`],
  ])("recusa %s", (_nome, header) => {
    expect(chamadorAutorizado(header, CHAVE)).toBe(false);
  });

  it("chave vazia no ambiente nunca autoriza, nem com Bearer vazio", () => {
    expect(chamadorAutorizado("Bearer ", "")).toBe(false);
    expect(chamadorAutorizado("Bearer ", undefined)).toBe(false);
  });

  it("mesmaChave compara o conteudo inteiro", () => {
    expect(mesmaChave("abc", "abc")).toBe(true);
    expect(mesmaChave("abc", "abd")).toBe(false);
    expect(mesmaChave("abc", "ab")).toBe(false);
  });
});

describe("lerPedido", () => {
  it("aceita material e fonte", () => {
    expect(lerPedido({ path: DECK })).toEqual({ caminho: DECK });
    expect(lerPedido({ path: "fontes/classe-1/topico-2/conteudo-3/u-a.pdf" })).toEqual({
      caminho: "fontes/classe-1/topico-2/conteudo-3/u-a.pdf",
    });
  });

  it.each([
    ["corpo vazio", undefined],
    ["sem path", {}],
    ["path nao texto", { path: 1 }],
    ["subida de diretorio", { path: "brainhex/../telemetria/x.json" }],
    ["barra inicial", { path: `/${DECK}` }],
    ["telemetria (ciclo de vida proprio)", { path: "telemetria/lotes/2026/11/02/x.json" }],
    ["pasta de aluno", { path: "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f/boss/x.png" }],
    ["prefixo parecido", { path: "brainhexx/a.html" }],
  ])("recusa %s", (_nome, corpo) => {
    expect(lerPedido(corpo)).toHaveProperty("erro");
  });
});

describe("urlDeLeitura", () => {
  it("e' a URL do gateway, igual a do microservice", () => {
    expect(urlDeLeitura("https://x.supabase.co/", DECK)).toBe(
      `https://x.supabase.co/functions/v1/storage-redirect?path=${DECK}`,
    );
  });
});
