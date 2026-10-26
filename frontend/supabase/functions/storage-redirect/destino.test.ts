import { describe, expect, it } from "vitest";
import {
  bucketDoCaminho,
  codificarCaminho,
  urlAssinadaDoSupabase,
  urlPublicaDoSupabase,
  validadeDaAssinatura,
} from "./destino";

const APP = "https://xrebtkmdewolzmpsdwgh.supabase.co";
const CAMINHO = "brainhex/seeker/classe-54/apresentacao/material-1.html";

describe("urlPublicaDoSupabase", () => {
  it("monta a rota publica do Storage", () => {
    expect(urlPublicaDoSupabase(APP, "conteudo_aluno", CAMINHO)).toBe(
      `${APP}/storage/v1/object/public/conteudo_aluno/${CAMINHO}`,
    );
  });

  it("tolera barra sobrando na base, sem duplicar", () => {
    expect(urlPublicaDoSupabase(`${APP}///`, "conteudo_aluno", CAMINHO)).toBe(
      `${APP}/storage/v1/object/public/conteudo_aluno/${CAMINHO}`,
    );
  });
});

describe("codificarCaminho", () => {
  it("nao mexe em caminho que ja e seguro", () => {
    expect(codificarCaminho(CAMINHO)).toBe(CAMINHO);
  });

  it("codifica cada segmento e preserva as barras", () => {
    expect(codificarCaminho("pasta com espaco/arq ancora.html")).toBe(
      "pasta%20com%20espaco/arq%20ancora.html",
    );
  });

  it("descarta segmento vazio em vez de gerar barra dupla", () => {
    expect(codificarCaminho("a//b.html")).toBe("a/b.html");
  });
});

describe("bucketDoCaminho", () => {
  it("material e fonte do aluno ficam no bucket padrao", () => {
    expect(bucketDoCaminho(CAMINHO, "conteudo_aluno")).toBe("conteudo_aluno");
    expect(bucketDoCaminho("fontes/classe-1/topico-2/conteudo-3/x.pdf", "conteudo_aluno")).toBe("conteudo_aluno");
  });

  it("fonte do professor (prefixo uuid) mora em conteudos", () => {
    expect(bucketDoCaminho("0b6f1c9e-1d2a-4b3c-8d4e-5f6a7b8c9d0e/12/1700_aula.pdf", "conteudo_aluno")).toBe("conteudos");
  });
});

describe("validadeDaAssinatura", () => {
  it("cobre o resto da janela em cache, com folga", () => {
    expect(validadeDaAssinatura(120, 3600)).toBe(180);
  });

  it("nunca passa de uma janela e um minuto", () => {
    expect(validadeDaAssinatura(99999, 3600)).toBe(3660);
  });

  it("tem piso de 1 s mais a folga", () => {
    expect(validadeDaAssinatura(0, 3600)).toBe(61);
  });
});

describe("urlAssinadaDoSupabase", () => {
  it("devolve a URL absoluta que o Storage assinou", async () => {
    const pedidos: unknown[] = [];
    const url = await urlAssinadaDoSupabase(
      APP,
      async (bucket, caminho, segundos) => {
        pedidos.push([bucket, caminho, segundos]);
        return { signedUrl: `${APP}/storage/v1/object/sign/${bucket}/${caminho}?token=t`, erro: null };
      },
      "conteudo_aluno",
      CAMINHO,
      300,
    );
    expect(url).toBe(`${APP}/storage/v1/object/sign/conteudo_aluno/${CAMINHO}?token=t`);
    expect(pedidos).toEqual([["conteudo_aluno", CAMINHO, 300]]);
  });

  it("completa a URL relativa das versoes antigas do supabase-js", async () => {
    const url = await urlAssinadaDoSupabase(
      `${APP}/`,
      async () => ({ signedUrl: "/object/sign/conteudo_aluno/a.html?token=t", erro: null }),
      "conteudo_aluno",
      "a.html",
      60,
    );
    expect(url).toBe(`${APP}/storage/v1/object/sign/conteudo_aluno/a.html?token=t`);
  });

  it("nunca cai na URL publica: sem assinatura, devolve null", async () => {
    const url = await urlAssinadaDoSupabase(
      APP,
      async () => ({ signedUrl: null, erro: "Object not found" }),
      "conteudo_aluno",
      CAMINHO,
      60,
    );
    expect(url).toBeNull();
  });
});
