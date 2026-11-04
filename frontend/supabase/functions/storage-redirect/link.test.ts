import { describe, expect, it } from "vitest";

import { assinarLink, caminhosDoPedido, conferirLink, expiracaoDoLink, montarLink } from "./link";

const SEGREDO = "segredo-de-teste-com-tamanho-suficiente";
const ALUNO = "0b6c3a7e-1f2d-4c5b-8a9e-0123456789ab";
const OUTRO = "11111111-2222-3333-4444-555555555555";
const JANELA = 3600;
const AGORA = 1_800_000_123;

async function busca(caminho: string, opcoes: { usuario?: string; expira?: number; segredo?: string } = {}) {
  const url = await montarLink({
    base: "https://x.supabase.co/",
    segredo: opcoes.segredo ?? SEGREDO,
    caminho,
    usuario: opcoes.usuario ?? ALUNO,
    expira: opcoes.expira ?? expiracaoDoLink(AGORA, JANELA),
  });
  return new URL(url).searchParams;
}

function conferir(caminho: string, b: URLSearchParams, agoraS = AGORA) {
  return conferirLink({ segredo: SEGREDO, caminho, busca: b, agoraS, janelaS: JANELA });
}

describe("expiracaoDoLink", () => {
  it("vale até o fim da janela seguinte: entre uma e duas janelas", () => {
    const exp = expiracaoDoLink(AGORA, JANELA);
    expect(exp % JANELA).toBe(0);
    expect(exp - AGORA).toBeGreaterThan(JANELA);
    expect(exp - AGORA).toBeLessThanOrEqual(2 * JANELA);
  });

  it("é a mesma dentro da janela, então o link sai igual e o cache serve", async () => {
    const inicio = Math.floor(AGORA / JANELA) * JANELA;
    expect(expiracaoDoLink(inicio, JANELA)).toBe(expiracaoDoLink(inicio + JANELA - 1, JANELA));
    const a = await assinarLink({ segredo: SEGREDO, caminho: "a/b.mp3", usuario: ALUNO, expira: 7200 });
    const b = await assinarLink({ segredo: SEGREDO, caminho: "a/b.mp3", usuario: ALUNO.toUpperCase(), expira: 7200 });
    expect(a).toBe(b);
  });
});

describe("montarLink", () => {
  it("mantém o `path` de sempre, que é o que o app usa como identidade da mídia", async () => {
    const b = await busca("brainhex/42/audio final.mp3");
    expect(b.get("path")).toBe("brainhex/42/audio final.mp3");
    expect(b.get("u")).toBe(ALUNO);
    expect(b.get("sig")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("conferirLink", () => {
  it("aceita o link que o gateway emitiu", async () => {
    expect(await conferir("a/b.mp3", await busca("a/b.mp3"))).toBe("valido");
  });

  it("link antigo, só com `path`, é `sem_assinatura` (o gateway decide se ainda aceita)", async () => {
    expect(await conferir("a/b.mp3", new URLSearchParams({ path: "a/b.mp3" }))).toBe("sem_assinatura");
  });

  it("recusa assinatura de outro caminho, de outro usuário ou de outro segredo", async () => {
    expect(await conferir("a/outro.mp3", await busca("a/b.mp3"))).toBe("invalido");

    const trocado = await busca("a/b.mp3");
    trocado.set("u", OUTRO);
    expect(await conferir("a/b.mp3", trocado)).toBe("invalido");

    expect(await conferir("a/b.mp3", await busca("a/b.mp3", { segredo: "outro-segredo" }))).toBe("invalido");
  });

  it("recusa prazo esticado à mão", async () => {
    const b = await busca("a/b.mp3");
    b.set("exp", String(Number(b.get("exp")) + JANELA));
    expect(await conferir("a/b.mp3", b)).toBe("invalido");
  });

  it("recusa prazo além do que o gateway emite, mesmo com assinatura certa", async () => {
    const longe = AGORA + 30 * 24 * 3600;
    expect(await conferir("a/b.mp3", await busca("a/b.mp3", { expira: longe }))).toBe("invalido");
  });

  it("link vencido é `vencido`, não `invalido`", async () => {
    const b = await busca("a/b.mp3");
    expect(await conferir("a/b.mp3", b, Number(b.get("exp")))).toBe("vencido");
  });

  it("parâmetro pela metade não cai no caminho antigo", async () => {
    const b = await busca("a/b.mp3");
    b.delete("sig");
    expect(await conferir("a/b.mp3", b)).toBe("invalido");
    b.delete("exp");
    expect(await conferir("a/b.mp3", b)).toBe("invalido");
  });
});

describe("caminhosDoPedido", () => {
  it("lista de texto, sem repetição, dentro do limite", () => {
    expect(caminhosDoPedido({ paths: ["a", "b", "a"] }, 10)).toEqual(["a", "b"]);
  });

  it("recusa o que não é lista de texto, vazio ou grande demais", () => {
    expect(caminhosDoPedido(null, 10)).toBeNull();
    expect(caminhosDoPedido({ paths: [] }, 10)).toBeNull();
    expect(caminhosDoPedido({ paths: ["a", 1] }, 10)).toBeNull();
    expect(caminhosDoPedido({ paths: Array(11).fill("a") }, 10)).toBeNull();
  });
});
