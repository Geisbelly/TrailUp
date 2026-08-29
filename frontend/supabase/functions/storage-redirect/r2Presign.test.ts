import { describe, expect, it } from "vitest";
import {
  bufferParaHex,
  derivarChaveDeAssinatura,
  inicioDaJanela,
  presignR2GetUrl,
} from "./r2Presign";

const BASE = {
  accountId: "a641a8f84cfc447572688bf59f608368",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "segredo-de-teste",
  bucket: "trailup",
  key: "brainhex/seeker/classe-54/apresentacao/material-1.html",
};

describe("derivarChaveDeAssinatura", () => {
  it("bate com o vetor de teste publicado pela AWS para SigV4", async () => {
    // Vetor oficial da documentacao AWS (Signature Version 4 / signing key).
    // Se a cadeia HMAC estiver errada, o unico sintoma em producao seria um
    // 403 do R2 - por isso a conferencia e' contra valor conhecido, nao contra
    // a propria implementacao.
    const chave = await derivarChaveDeAssinatura(
      "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      "20150830",
      "us-east-1",
      "iam",
    );

    expect(bufferParaHex(chave)).toBe(
      "c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9",
    );
  });
});

describe("inicioDaJanela", () => {
  it("alinha para baixo no multiplo da janela", () => {
    // 2026-08-29T05:47:31Z -> inicio da hora
    const t = Date.UTC(2026, 7, 29, 5, 47, 31);
    expect(inicioDaJanela(t, 3600)).toBe(Math.floor(Date.UTC(2026, 7, 29, 5, 0, 0) / 1000));
  });

  it("ja alinhado permanece igual", () => {
    const t = Date.UTC(2026, 7, 29, 5, 0, 0);
    expect(inicioDaJanela(t, 3600)).toBe(Math.floor(t / 1000));
  });
});

describe("presignR2GetUrl", () => {
  it("produz a MESMA url para instantes diferentes da mesma janela", async () => {
    // E' a propriedade que faz o cache do cliente continuar acertando: sem ela
    // cada acesso vira download novo, que e' o custo que a migracao elimina.
    const a = await presignR2GetUrl({ ...BASE, agoraMs: Date.UTC(2026, 7, 29, 5, 0, 1) });
    const b = await presignR2GetUrl({ ...BASE, agoraMs: Date.UTC(2026, 7, 29, 5, 59, 59) });

    expect(a).toBe(b);
  });

  it("produz url diferente na janela seguinte", async () => {
    const a = await presignR2GetUrl({ ...BASE, agoraMs: Date.UTC(2026, 7, 29, 5, 30, 0) });
    const b = await presignR2GetUrl({ ...BASE, agoraMs: Date.UTC(2026, 7, 29, 6, 30, 0) });

    expect(a).not.toBe(b);
  });

  it("aponta para o host do R2 e inclui o bucket no caminho", async () => {
    const url = new URL(await presignR2GetUrl({ ...BASE, agoraMs: Date.UTC(2026, 7, 29, 5, 0, 0) }));

    expect(url.host).toBe("a641a8f84cfc447572688bf59f608368.r2.cloudflarestorage.com");
    expect(url.pathname).toBe(`/trailup/${BASE.key}`);
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
    expect(url.searchParams.get("X-Amz-Credential")).toContain("/auto/s3/aws4_request");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a assinatura muda quando o objeto muda", async () => {
    const agoraMs = Date.UTC(2026, 7, 29, 5, 0, 0);
    const a = new URL(await presignR2GetUrl({ ...BASE, agoraMs }));
    const b = new URL(await presignR2GetUrl({ ...BASE, agoraMs, key: "outro/arquivo.mp3" }));

    expect(a.searchParams.get("X-Amz-Signature")).not.toBe(b.searchParams.get("X-Amz-Signature"));
  });

  it("a assinatura muda quando o segredo muda", async () => {
    const agoraMs = Date.UTC(2026, 7, 29, 5, 0, 0);
    const a = new URL(await presignR2GetUrl({ ...BASE, agoraMs }));
    const b = new URL(await presignR2GetUrl({ ...BASE, agoraMs, secretAccessKey: "outro" }));

    expect(a.searchParams.get("X-Amz-Signature")).not.toBe(b.searchParams.get("X-Amz-Signature"));
  });

  it("percent-encoda cada segmento do caminho, preservando as barras", async () => {
    const url = await presignR2GetUrl({
      ...BASE,
      key: "brainhex/apresentacao com espaco/material ancora.html",
      agoraMs: Date.UTC(2026, 7, 29, 5, 0, 0),
    });

    expect(url).toContain("/trailup/brainhex/apresentacao%20com%20espaco/material%20ancora.html");
  });

  it("recusa validade menor ou igual a janela (url nasceria vencida no fim dela)", async () => {
    await expect(
      presignR2GetUrl({
        ...BASE,
        agoraMs: Date.UTC(2026, 7, 29, 5, 0, 0),
        janelaSegundos: 3600,
        validadeSegundos: 3600,
      }),
    ).rejects.toThrow(/maior que janelaSegundos/);
  });

  it("assina GET por padrao, e o verbo muda a assinatura", async () => {
    // O metodo entra na requisicao canonica: uma URL de leitura nao serve para
    // escrever. E' o que impede a chave do gateway de virar upload.
    const agoraMs = Date.UTC(2026, 7, 29, 5, 0, 0);
    const get = new URL(await presignR2GetUrl({ ...BASE, agoraMs }));
    const getExplicito = new URL(await presignR2GetUrl({ ...BASE, agoraMs, metodo: "GET" }));
    const put = new URL(await presignR2GetUrl({ ...BASE, agoraMs, metodo: "PUT" }));
    const head = new URL(await presignR2GetUrl({ ...BASE, agoraMs, metodo: "HEAD" }));

    expect(getExplicito.searchParams.get("X-Amz-Signature")).toBe(
      get.searchParams.get("X-Amz-Signature"),
    );
    expect(put.searchParams.get("X-Amz-Signature")).not.toBe(
      get.searchParams.get("X-Amz-Signature"),
    );
    expect(head.searchParams.get("X-Amz-Signature")).not.toBe(
      put.searchParams.get("X-Amz-Signature"),
    );
  });

  it("por padrao a validade cobre o dobro da janela", async () => {
    const url = new URL(await presignR2GetUrl({ ...BASE, agoraMs: Date.UTC(2026, 7, 29, 5, 0, 0) }));
    expect(url.searchParams.get("X-Amz-Expires")).toBe("7200");
  });
});
