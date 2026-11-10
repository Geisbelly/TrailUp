import { describe, expect, it } from "vitest";
import {
  chamarGeminiComRotacao,
  ESGOTADO_COOLDOWN_MS,
  GeminiInalcancavel,
  LIMITE_POR_CHAMADA_MS,
  novoEstadoDaRotacao,
  PrazoDoGeminiEsgotado,
  SOBRECARGA_COOLDOWN_MS,
} from "./rotacaoGemini";

const FLASH = "gemini-3.6-flash";
const LITE = "gemini-3.1-flash-lite";
const LITE2 = "gemini-3.5-flash-lite";
const CHAVES = ["k0", "k1", "k2", "k3"];

type Roteiro = (chave: string, modelo: string) => { status: number; ms?: number } | "timeout" | "rede";

/**
 * Gemini falso com relógio próprio: cada chamada "leva" `ms` no relógio e
 * fica registrada em `chamadas` como "chave/modelo". "timeout" simula o
 * AbortSignal estourando: o relógio anda até o limite que o sinal teria.
 */
function geminiFalso(roteiro: Roteiro, inicio = 1_000_000) {
  let relogio = inicio;
  const chamadas: string[] = [];
  const limites: Array<number | undefined> = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    const modelo = /models\/([^:]+):/.exec(String(url))?.[1] ?? "?";
    const chave = String((init?.headers as Record<string, string>)["x-goog-api-key"]);
    chamadas.push(`${chave}/${modelo}`);
    const sinal = init?.signal as (AbortSignal & { __limite?: number }) | undefined;
    limites.push(sinal?.__limite);
    const passo = roteiro(chave, modelo);
    if (passo === "rede") throw new TypeError("fetch failed");
    if (passo === "timeout") {
      relogio += sinal?.__limite ?? 0;
      throw new DOMException("Signal timed out.", "TimeoutError");
    }
    relogio += passo.ms ?? 1000;
    const corpo = passo.status === 200 ? { candidates: [{ content: { parts: [{ text: "{}" }] } }] } : { error: { status: "X" } };
    return new Response(JSON.stringify(corpo), { status: passo.status });
  }) as unknown as typeof fetch;

  // AbortSignal.timeout de verdade dispararia sozinho; aqui só guardamos o limite pedido.
  const timeoutOriginal = AbortSignal.timeout;
  AbortSignal.timeout = ((ms: number) => Object.assign(new AbortController().signal, { __limite: ms })) as typeof AbortSignal.timeout;
  const restaurar = () => {
    AbortSignal.timeout = timeoutOriginal;
  };
  return { fakeFetch, chamadas, limites, agora: () => relogio, inicio, restaurar };
}

async function rodar(roteiro: Roteiro, extra: { prazoMs?: number; estado?: ReturnType<typeof novoEstadoDaRotacao> } = {}) {
  const g = geminiFalso(roteiro);
  const estado = extra.estado ?? novoEstadoDaRotacao();
  try {
    const resultado = await chamarGeminiComRotacao({
      chaves: CHAVES,
      modelos: [FLASH, LITE, LITE2],
      modeloPrincipal: FLASH,
      corpo: "{}",
      estado,
      prazo: extra.prazoMs === undefined ? undefined : g.inicio + extra.prazoMs,
      fetch: g.fakeFetch,
      agora: g.agora,
    }).then(
      (r) => ({ ok: true as const, status: r.res.status }),
      (erro: unknown) => ({ ok: false as const, erro }),
    );
    return { ...resultado, chamadas: g.chamadas, limites: g.limites, gasto: g.agora() - g.inicio, estado };
  } finally {
    g.restaurar();
  }
}

describe("chamarGeminiComRotacao", () => {
  it("503 é do modelo: não tenta as outras chaves nele e vai para o reserva", async () => {
    // O que os logs de 10/11 mostraram: flash 503 nas chaves, lite respondendo.
    const r = await rodar((_c, m) => (m === FLASH ? { status: 503, ms: 58_000 } : { status: 200, ms: 13_000 }), { prazoMs: 120_000 });
    expect(r.ok && r.status).toBe(200);
    expect(r.chamadas).toEqual(["k0/gemini-3.6-flash", "k0/gemini-3.1-flash-lite"]);
    expect(r.gasto).toBe(71_000);
  });

  it("modelo sobrecarregado fica de fora dos próximos pedidos por um tempo curto", async () => {
    const estado = novoEstadoDaRotacao();
    await rodar((_c, m) => (m === FLASH ? { status: 503 } : { status: 200 }), { estado });
    expect(estado.sobrecarregadoAte.get(FLASH)).toBeGreaterThan(0);

    const segundo = await rodar(() => ({ status: 200 }), { estado });
    expect(segundo.chamadas).toEqual(["k0/gemini-3.1-flash-lite"]);
    expect(SOBRECARGA_COOLDOWN_MS).toBeLessThan(ESGOTADO_COOLDOWN_MS);
  });

  it("429/402 são da chave: a próxima chave do mesmo modelo ainda vale", async () => {
    const r = await rodar((c) => (c === "k0" ? { status: 429 } : c === "k1" ? { status: 402 } : { status: 200 }));
    expect(r.ok && r.status).toBe(200);
    expect(r.chamadas).toEqual(["k0/gemini-3.6-flash", "k1/gemini-3.6-flash", "k2/gemini-3.6-flash"]);
    expect(r.estado.esgotadoAte.has("k0|gemini-3.6-flash")).toBe(true);
    expect(r.estado.esgotadoAte.has("k1|gemini-3.6-flash")).toBe(true);
    expect(r.estado.sobrecarregadoAte.size).toBe(0);
  });

  it("par esgotado é pulado no pedido seguinte", async () => {
    const estado = novoEstadoDaRotacao();
    await rodar((c) => (c === "k0" ? { status: 429 } : { status: 200 }), { estado });
    const segundo = await rodar(() => ({ status: 200 }), { estado });
    expect(segundo.chamadas).toEqual(["k1/gemini-3.6-flash"]);
  });

  it("chamada que passa do limite conta como sobrecarga do modelo, não como fim do pedido", async () => {
    const r = await rodar((_c, m) => (m === FLASH ? "timeout" : { status: 200, ms: 13_000 }), { prazoMs: 120_000 });
    expect(r.ok && r.status).toBe(200);
    expect(r.chamadas).toEqual(["k0/gemini-3.6-flash", "k0/gemini-3.1-flash-lite"]);
    expect(r.limites[0]).toBe(LIMITE_POR_CHAMADA_MS);
    expect(r.gasto).toBe(LIMITE_POR_CHAMADA_MS + 13_000);
  });

  it("quando quem corta é o prazo do pedido, para de girar e avisa", async () => {
    // Sobram 20 s: o sinal leva o prazo, não o limite por chamada.
    const r = await rodar(() => "timeout", { prazoMs: 20_000 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toBeInstanceOf(PrazoDoGeminiEsgotado);
    expect(r.chamadas).toHaveLength(1);
    expect(r.limites[0]).toBe(20_000);
  });

  it("prazo já vencido não faz chamada nenhuma", async () => {
    const r = await rodar(() => ({ status: 200 }), { prazoMs: 0 });
    expect(!r.ok && r.erro).toBeInstanceOf(PrazoDoGeminiEsgotado);
    expect(r.chamadas).toEqual([]);
  });

  it("sem prazo não há limite por chamada (modos description/content seguem como antes)", async () => {
    const r = await rodar(() => ({ status: 200, ms: 90_000 }));
    expect(r.ok && r.status).toBe(200);
    expect(r.limites).toEqual([undefined]);
  });

  it("erro que não é de cota nem de sobrecarga volta na hora, sem girar", async () => {
    const r = await rodar(() => ({ status: 400 }));
    expect(r.ok && r.status).toBe(400);
    expect(r.chamadas).toHaveLength(1);
  });

  it("todos sobrecarregados: devolve a última resposta, um pedido por modelo", async () => {
    const r = await rodar(() => ({ status: 503 }));
    expect(r.ok && r.status).toBe(503);
    expect(r.chamadas).toEqual(["k0/gemini-3.6-flash", "k0/gemini-3.1-flash-lite", "k0/gemini-3.5-flash-lite"]);
  });

  it("só falha de rede: GeminiInalcancavel com a causa", async () => {
    const r = await rodar(() => "rede");
    expect(!r.ok && r.erro).toBeInstanceOf(GeminiInalcancavel);
    expect(r.chamadas).toHaveLength(12);
  });

  it("tudo em cooldown: tenta mesmo assim", async () => {
    const estado = novoEstadoDaRotacao();
    const futuro = 10_000_000_000;
    for (const m of [FLASH, LITE, LITE2]) estado.sobrecarregadoAte.set(m, futuro);
    const r = await rodar(() => ({ status: 200 }), { estado });
    expect(r.ok && r.status).toBe(200);
    expect(r.chamadas).toEqual(["k0/gemini-3.6-flash"]);
  });
});
