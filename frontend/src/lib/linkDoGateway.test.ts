import { describe, expect, it, vi } from "vitest";

import { aplicarAssinatura, caminhoParaAssinar, criarAssinador, type RespostaDeLinks } from "./linkDoGateway";

const BASE = "https://x.supabase.co/functions/v1/storage-redirect";
const AGORA = 1_800_000_000;

function emitido(caminho: string, sig = "assinatura") {
  return `${BASE}?path=${encodeURIComponent(caminho)}&u=aluno&exp=${AGORA + 7200}&sig=${sig}`;
}

function gatewayFalso() {
  const pedir = vi.fn(async (caminhos: string[]): Promise<RespostaDeLinks> => ({
    expira_em: AGORA + 7200,
    links: Object.fromEntries(caminhos.filter((c) => !c.startsWith("proibido/")).map((c) => [c, emitido(c)])),
  }));
  return pedir;
}

describe("caminhoParaAssinar", () => {
  it("reconhece a URL do gateway sem assinatura", () => {
    expect(caminhoParaAssinar(`${BASE}?path=brainhex%2F1%2Faudio.mp3&v=3`)).toBe("brainhex/1/audio.mp3");
  });

  it("ignora URL já assinada, de fora, relativa ou sem path", () => {
    expect(caminhoParaAssinar(emitido("a/b.mp3"))).toBeNull();
    expect(caminhoParaAssinar("https://outro.site/a.mp3")).toBeNull();
    expect(caminhoParaAssinar("a/b.mp3")).toBeNull();
    expect(caminhoParaAssinar(BASE)).toBeNull();
  });
});

describe("aplicarAssinatura", () => {
  it("põe u, exp e sig sem perder a revisão nem o proxy", () => {
    const url = new URL(aplicarAssinatura(`${BASE}?path=a%2Fb.html&v=7&proxy=1`, emitido("a/b.html", "xyz")));
    expect(url.searchParams.get("path")).toBe("a/b.html");
    expect(url.searchParams.get("v")).toBe("7");
    expect(url.searchParams.get("proxy")).toBe("1");
    expect(url.searchParams.get("sig")).toBe("xyz");
    expect(url.searchParams.get("exp")).toBe(String(AGORA + 7200));
  });
});

describe("criarAssinador", () => {
  it("junta os pedidos do mesmo instante num POST só", async () => {
    const pedir = gatewayFalso();
    const { assinar } = criarAssinador(pedir, () => AGORA);
    const [a, b, c] = await Promise.all([
      assinar(`${BASE}?path=a%2F1.mp3`),
      assinar(`${BASE}?path=a%2F2.mp3`),
      assinar(`${BASE}?path=a%2F1.mp3&v=2`),
    ]);
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(pedir.mock.calls[0][0]).toEqual(["a/1.mp3", "a/2.mp3"]);
    for (const url of [a, b, c]) expect(new URL(url).searchParams.get("sig")).toBe("assinatura");
  });

  it("reaproveita o link até faltar pouco para vencer", async () => {
    const pedir = gatewayFalso();
    let agora = AGORA;
    const { assinar } = criarAssinador(pedir, () => agora);
    await assinar(`${BASE}?path=a%2F1.mp3`);
    agora += 3600;
    await assinar(`${BASE}?path=a%2F1.mp3`);
    expect(pedir).toHaveBeenCalledTimes(1);
    agora = AGORA + 7200 - 60;
    await assinar(`${BASE}?path=a%2F1.mp3`);
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it("sem link (caminho negado ou gateway fora) devolve a URL original", async () => {
    const { assinar } = criarAssinador(gatewayFalso(), () => AGORA);
    expect(await assinar(`${BASE}?path=proibido%2Fx.mp3`)).toBe(`${BASE}?path=proibido%2Fx.mp3`);

    const quebrado = criarAssinador(async () => {
      throw new Error("rede");
    }, () => AGORA);
    expect(await quebrado.assinar(`${BASE}?path=a%2F1.mp3`)).toBe(`${BASE}?path=a%2F1.mp3`);
  });

  it("URL que não é do gateway não gera pedido", async () => {
    const pedir = gatewayFalso();
    const { assinar } = criarAssinador(pedir, () => AGORA);
    expect(await assinar("https://outro.site/a.png")).toBe("https://outro.site/a.png");
    expect(pedir).not.toHaveBeenCalled();
  });
});
