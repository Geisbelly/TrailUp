import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assinaturaDe,
  CHAVE_DO_ESTADO,
  criarColetor,
  descreverErro,
  eRuido,
  gerarUuid,
  limparTexto,
  medirFetch,
  normalizarDestino,
  normalizarRota,
  SESSAO_OCIOSA_MS,
  type DepsDoColetor,
} from "./coletor";

function montar(extra: Partial<DepsDoColetor> = {}) {
  const guardado = new Map<string, string>();
  let relogio = Date.parse("2026-11-05T12:00:00Z");
  let id = 0;
  const enviar = vi.fn<DepsDoColetor["enviar"]>(async () => true);
  const deps: DepsDoColetor = {
    superficie: "console",
    versao: "abc",
    plataforma: "web",
    formato: "desktop",
    armazenamento: { ler: (c) => guardado.get(c) ?? null, gravar: (c, v) => void guardado.set(c, v) },
    enviar,
    podeEnviar: () => true,
    novoId: () => `s${++id}`,
    agora: () => relogio,
    destinoCritico: (d) => d === "rpc/duplicar_classe",
    ...extra,
  };
  return { coletor: criarColetor(deps), deps, enviar, guardado, avancar: (ms: number) => (relogio += ms) };
}

describe("limpeza", () => {
  it("tira e-mail, url, id, número longo e texto entre aspas", () => {
    const texto = limparTexto('falhou maria@escola.br https://x.test/a 3f2b8c1e-1111-2222-3333-444455556666 51999998888 "Maria Silva"');
    expect(texto).toBe('falhou <email> <url> <id> <n> "…"');
  });

  it("normaliza a rota e o destino", () => {
    expect(normalizarRota("/turma/123/aluno/3f2b8c1e-1111-2222-3333-444455556666?x=1#y")).toBe("/turma/:id/aluno/:id");
    expect(normalizarDestino("https://a.supabase.co/rest/v1/rpc/loja_saldo?x=1")).toBe("rpc/loja_saldo");
    expect(normalizarDestino("https://a.supabase.co/rest/v1/topicos?id=eq.1")).toBe("topicos");
    expect(normalizarDestino("https://a.supabase.co/auth/v1/token?grant_type=password")).toBe("auth/token");
    expect(normalizarDestino("https://outro.test/x")).toBeNull();
  });

  it("assinatura é estável e separa erros diferentes", () => {
    expect(assinaturaDe(["a", "b"])).toBe(assinaturaDe(["a", "b"]));
    expect(assinaturaDe(["a", "b"])).not.toBe(assinaturaDe(["a", "c"]));
    expect(assinaturaDe(["TypeError", null, "tela"])).toMatch(/^[a-z0-9]{1,32}$/);
  });

  it("o id da sessão é um UUID mesmo sem `crypto.randomUUID`", () => {
    vi.stubGlobal("crypto", {});
    expect(gerarUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    vi.unstubAllGlobals();
  });

  it("ruído sem informação não conta", () => {
    expect(eRuido({ nome: "Error", mensagem: "Script error." })).toBe(true);
    expect(eRuido({ nome: "TypeError", mensagem: "x is not a function" })).toBe(false);
  });

  it("erro do Supabase é objeto comum e chega com mensagem, não como Desconhecido", () => {
    expect(descreverErro({ message: "tentativa_ja_respondida", code: "P0001", details: null, hint: null })).toEqual({
      nome: "Supabase",
      mensagem: "tentativa_ja_respondida",
    });
    expect(descreverErro({ name: "AuthApiError", message: "Invalid Refresh Token" })).toEqual({
      nome: "AuthApiError",
      mensagem: "Invalid Refresh Token",
    });
    expect(descreverErro({ sem: "mensagem" })).toEqual({ nome: "Desconhecido", mensagem: null });
  });

  it("falha tratada separa por lugar; os outros tipos não mudam de assinatura", () => {
    const coletor = criarColetor({
      superficie: "console", versao: "x", plataforma: "web", formato: "desktop",
      armazenamento: { ler: () => null, gravar: () => undefined },
      enviar: async () => true, podeEnviar: () => true, novoId: () => "s", destinoCritico: () => false,
    });
    const recusa = { message: "sem_permissao" };
    coletor.registrarErro(recusa, "tratado", "a/um");
    coletor.registrarErro(recusa, "tratado", "b/dois");
    coletor.registrarErro(recusa, "erro", "/x");
    coletor.registrarErro(recusa, "erro", "/y");
    const erros = coletor.fotografia().erros;
    expect(erros.map((e) => [e.tipo, e.rota, e.vezes])).toEqual([["tratado", "a/um", 1], ["tratado", "b/dois", 1], ["erro", "/x", 2]]);
    expect(erros[2].assinatura).toBe(assinaturaDe(["Supabase", "sem_permissao", "erro"]));
  });
});

describe("coletor", () => {
  it("guarda o erro no aparelho antes de qualquer envio", () => {
    const { coletor, guardado } = montar();
    coletor.registrarErro(new TypeError("quebrou"), "tela", "/turma/1");
    const salvo = JSON.parse(guardado.get(CHAVE_DO_ESTADO) ?? "{}");
    expect(salvo.erros[0]).toMatchObject({ nome: "TypeError", tipo: "tela", rota: "/turma/:id", vezes: 1 });
  });

  it("junta o mesmo erro e só tira da fila o que o banco confirmou", async () => {
    const { coletor, enviar } = montar();
    coletor.registrarErro(new Error("x"), "erro");
    coletor.registrarErro(new Error("x"), "erro");
    expect(coletor.fotografia().sessao.erros).toBe(2);
    enviar.mockResolvedValueOnce(false);
    await coletor.descarregar();
    expect(coletor.fotografia().erros).toHaveLength(1);
    await coletor.descarregar();
    expect(coletor.fotografia().erros).toHaveLength(0);
    expect(enviar.mock.calls[1][1]).toHaveLength(1);
    expect(enviar.mock.calls[1][1][0].vezes).toBe(2);
  });

  it("sem sessão ou sem coleta aceita não envia e não perde", async () => {
    const { coletor, enviar } = montar({ podeEnviar: () => false });
    coletor.registrarErro(new Error("x"), "erro");
    expect(await coletor.descarregar()).toBe(false);
    expect(enviar).not.toHaveBeenCalled();
    expect(coletor.fotografia().erros).toHaveLength(1);
  });

  it("sem novidade não gasta rede", async () => {
    const { coletor, enviar } = montar();
    await coletor.descarregar();
    expect(enviar).not.toHaveBeenCalled();
  });

  it("separa falha de servidor, recusa e falta de resposta", () => {
    const { coletor } = montar();
    coletor.registrarChamada("topicos", "GET", 200);
    coletor.registrarChamada("topicos", "GET", 503);
    coletor.registrarChamada("rpc/duplicar_classe", "POST", 403);
    coletor.registrarChamada("rpc/duplicar_classe", "POST", null);
    expect(coletor.fotografia().sessao).toMatchObject({
      chamadas: 4,
      falhas_servidor: 1,
      sem_resposta: 1,
      criticas: 2,
      criticas_falha: 1,
      falhas_por_destino: { topicos: 1 },
    });
  });

  it("a sessão interrompida entra no envio seguinte, antes da atual", async () => {
    const primeira = montar();
    primeira.coletor.registrarErro(new Error("x"), "fatal");
    const { coletor, enviar } = montar({ armazenamento: { ler: (c) => primeira.guardado.get(c) ?? null, gravar: () => undefined } });
    await coletor.carregar();
    await coletor.descarregar();
    expect(enviar).toHaveBeenCalledTimes(2);
    expect(enviar.mock.calls[0][1][0].tipo).toBe("fatal");
  });

  it("estado corrompido não atrapalha", async () => {
    const { coletor } = montar({ armazenamento: { ler: () => "{{{", gravar: () => undefined } });
    await expect(coletor.carregar()).resolves.toBeUndefined();
  });

  it("volta depois do corte abre outra sessão", () => {
    const { coletor, avancar } = montar();
    const id = coletor.fotografia().sessao.id;
    avancar(SESSAO_OCIOSA_MS - 1);
    coletor.retomar();
    expect(coletor.fotografia().sessao.id).toBe(id);
    avancar(SESSAO_OCIOSA_MS);
    coletor.retomar();
    expect(coletor.fotografia().sessao.id).not.toBe(id);
    expect(coletor.fotografia().anteriores).toHaveLength(1);
  });
});

describe("medirFetch", () => {
  it("conta sem mudar a resposta e deixa a própria gravação de fora", async () => {
    const conta = vi.fn();
    const resposta = new Response("{}", { status: 503 });
    const medido = medirFetch(vi.fn(async () => resposta) as typeof fetch, conta);
    expect(await medido("https://a.co/rest/v1/topicos", { method: "post" })).toBe(resposta);
    expect(conta).toHaveBeenCalledWith("topicos", "POST", 503);
    await medido("https://a.co/rest/v1/rpc/cliente_saude_registrar", { method: "POST" });
    expect(conta).toHaveBeenCalledTimes(1);
  });

  it("falta de resposta conta, cancelamento não, e o erro continua subindo", async () => {
    const conta = vi.fn();
    const semRede = medirFetch(vi.fn(async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch, conta);
    await expect(semRede("https://a.co/rest/v1/topicos")).rejects.toThrow();
    expect(conta).toHaveBeenCalledWith("topicos", "GET", null);
    conta.mockClear();
    const abortada = medirFetch(vi.fn(async () => { throw new DOMException("x", "AbortError"); }) as typeof fetch, conta);
    await expect(abortada("https://a.co/rest/v1/topicos")).rejects.toThrow();
    expect(conta).not.toHaveBeenCalled();
  });
});

it("o coletor do app é o mesmo arquivo", () => {
  const raiz = resolve(__dirname, "../../../..");
  expect(readFileSync(resolve(raiz, "mobile/src/services/saude/coletor.ts"), "utf8")).toBe(
    readFileSync(resolve(raiz, "frontend/src/lib/saude/coletor.ts"), "utf8"),
  );
});
