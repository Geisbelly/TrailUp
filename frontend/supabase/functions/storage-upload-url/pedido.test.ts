import { describe, expect, it, vi } from "vitest";
import {
  bearerDe,
  chamadorAutorizado,
  chaveDeServicoDoProjeto,
  criarConferenciaDeServico,
  lerPedido,
  mesmaChave,
  urlDeLeitura,
} from "./pedido";

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

describe("chaveDeServicoDoProjeto", () => {
  const URL = "https://projeto.supabase.co/";

  it("pergunta ao Auth admin do projeto com o proprio token", async () => {
    const fetchImpl = vi.fn(async () => new Response("[]", { status: 200 }));
    expect(await chaveDeServicoDoProjeto("outra-chave-de-servico", URL, fetchImpl as unknown as typeof fetch)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://projeto.supabase.co/auth/v1/admin/users?per_page=1");
    expect(init.headers).toEqual({ apikey: "outra-chave-de-servico", Authorization: "Bearer outra-chave-de-servico" });
  });

  it.each([401, 403, 500])("recusa quando o Auth responde %s (anon, JWT de aluno, falha)", async (status) => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status }));
    expect(await chaveDeServicoDoProjeto("eyJ.aluno.x", URL, fetchImpl as unknown as typeof fetch)).toBe(false);
  });

  it("recusa sem URL, sem token ou com a rede fora", async () => {
    const quebra = vi.fn(async () => {
      throw new Error("rede");
    });
    expect(await chaveDeServicoDoProjeto("k", "", quebra as unknown as typeof fetch)).toBe(false);
    expect(await chaveDeServicoDoProjeto("", URL, quebra as unknown as typeof fetch)).toBe(false);
    expect(await chaveDeServicoDoProjeto("k", URL, quebra as unknown as typeof fetch)).toBe(false);
  });

  it("bearerDe tira o token do header", () => {
    expect(bearerDe("Bearer  abc ")).toBe("abc");
    expect(bearerDe("abc")).toBeNull();
    expect(bearerDe("Bearer ")).toBeNull();
    expect(bearerDe(null)).toBeNull();
  });
});

describe("lerPedido", () => {
  it("aceita material e fonte", () => {
    expect(lerPedido({ path: DECK })).toEqual({ caminho: DECK, metodo: "PUT" });
    expect(lerPedido({ path: "fontes/classe-1/topico-2/conteudo-3/u-a.pdf" })).toEqual({
      caminho: "fontes/classe-1/topico-2/conteudo-3/u-a.pdf",
      metodo: "PUT",
    });
  });

  it("aceita o payload de telemetria da API (#76)", () => {
    expect(lerPedido({ path: "telemetria/lotes/2026/11/02/x.json" })).toEqual({
      caminho: "telemetria/lotes/2026/11/02/x.json",
      metodo: "PUT",
    });
  });

  it("aceita DELETE para a retencao, e so' PUT e DELETE", () => {
    expect(lerPedido({ path: DECK, metodo: "DELETE" })).toEqual({ caminho: DECK, metodo: "DELETE" });
    for (const metodo of ["GET", "HEAD", "delete", 1]) {
      expect(lerPedido({ path: DECK, metodo })).toHaveProperty("erro");
    }
  });

  it("DELETE alcanca a fonte do professor copiada para o R2; PUT nao", () => {
    const fonte = "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f/aula.pdf";
    expect(lerPedido({ path: fonte, metodo: "DELETE" })).toEqual({ caminho: fonte, metodo: "DELETE" });
    expect(lerPedido({ path: fonte })).toHaveProperty("erro");
    expect(lerPedido({ path: "outra/coisa.pdf", metodo: "DELETE" })).toHaveProperty("erro");
  });

  it.each([
    ["corpo vazio", undefined],
    ["sem path", {}],
    ["path nao texto", { path: 1 }],
    ["subida de diretorio", { path: "brainhex/../telemetria/x.json" }],
    ["barra inicial", { path: `/${DECK}` }],
    ["prefixo parecido com telemetria", { path: "telemetriax/lotes/x.json" }],
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

describe("lerPedido: arquivo da pesquisa (#17)", () => {
  const ARQUIVO = "pesquisa/lotes/0b6c1d7e-2f3a-4b5c-8d9e-0f1a2b3c4d5e/2026/10/14/9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d.json";

  it("aceita DELETE: a exclusao a pedido do aluno apaga a copia identificavel", () => {
    expect(lerPedido({ path: ARQUIVO, metodo: "DELETE" })).toEqual({ caminho: ARQUIVO, metodo: "DELETE" });
  });

  it("recusa PUT: so' a Edge Function do arquivo grava ali", () => {
    expect(lerPedido({ path: ARQUIVO })).toHaveProperty("erro");
    expect(lerPedido({ path: ARQUIVO, metodo: "PUT" })).toHaveProperty("erro");
  });

  it("o gateway nao serve o arquivo da pesquisa", () => {
    expect(urlDeLeitura("https://x.supabase.co", ARQUIVO)).toBeNull();
  });
});

describe("criarConferenciaDeServico", () => {
  const ambiente = () => ({ chaveDeServico: CHAVE, supabaseUrl: "https://x.supabase.co" });
  const responde = (status: number) => vi.fn(async () => new Response("", { status }));

  it("a chave do ambiente passa sem perguntar ao projeto", async () => {
    const fetchImpl = responde(401);
    const confere = criarConferenciaDeServico(ambiente, fetchImpl as unknown as typeof fetch);
    expect(await confere(`Bearer ${CHAVE}`)).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("outra chave de serviço do projeto passa e fica guardada por minutos, não para sempre", async () => {
    const fetchImpl = responde(200);
    let agora = 1_000;
    const confere = criarConferenciaDeServico(ambiente, fetchImpl as unknown as typeof fetch, () => agora);
    expect(await confere("Bearer outra")).toBe(true);
    expect(await confere("Bearer outra")).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    agora += 5 * 60 * 1000 + 1;
    expect(await confere("Bearer outra")).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("token que o projeto recusa não passa, e sem Bearer nem pergunta", async () => {
    const fetchImpl = responde(403);
    const confere = criarConferenciaDeServico(ambiente, fetchImpl as unknown as typeof fetch);
    expect(await confere("Bearer eyJ.aluno.x")).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await confere(null)).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
