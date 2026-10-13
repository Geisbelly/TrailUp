import { describe, expect, it } from "vitest";
import { formatSupabaseFunctionError } from "./supabaseFunctionError";

const resposta = (corpo: string) => new Response(corpo, { status: 500 });

describe("formatSupabaseFunctionError", () => {
  it("usa a mensagem do corpo JSON da função, com o código quando houver", async () => {
    const erro = { message: "Edge Function returned a non-2xx status code", context: resposta(JSON.stringify({ message: "Cota excedida", code: "quota" })) };
    expect(await formatSupabaseFunctionError(erro)).toBe("Cota excedida (quota)");
  });

  it("aceita o campo `error` quando não há `message`", async () => {
    const erro = { message: "genérico", context: resposta(JSON.stringify({ error: "source_extraction_failed" })) };
    expect(await formatSupabaseFunctionError(erro)).toBe("source_extraction_failed");
  });

  it("corpo que não é JSON ou está vazio cai na mensagem do SDK", async () => {
    expect(await formatSupabaseFunctionError({ message: "falhou no SDK", context: resposta("<html>502</html>") })).toBe("falhou no SDK");
    expect(await formatSupabaseFunctionError({ message: "falhou no SDK", context: resposta("") })).toBe("falhou no SDK");
  });

  it("JSON sem mensagem útil cai na mensagem do SDK", async () => {
    expect(await formatSupabaseFunctionError({ message: "do SDK", context: resposta(JSON.stringify({ code: "x" })) })).toBe("do SDK");
  });

  it("não consome o corpo da resposta original (usa clone)", async () => {
    const ctx = resposta(JSON.stringify({ message: "ok" }));
    await formatSupabaseFunctionError({ message: "x", context: ctx });
    expect(ctx.bodyUsed).toBe(false);
  });

  it("sem contexto: mensagem do erro, depois o texto padrão", async () => {
    expect(await formatSupabaseFunctionError({ message: "  rede caiu  " })).toBe("rede caiu");
    expect(await formatSupabaseFunctionError({})).toBe("Falha ao executar a funcao de IA.");
    expect(await formatSupabaseFunctionError(null, "padrão meu")).toBe("padrão meu");
  });

  it("aceita Error comum", async () => {
    expect(await formatSupabaseFunctionError(new Error("boom"))).toBe("boom");
  });
});
