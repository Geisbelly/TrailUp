import { describe, expect, it } from "vitest";
import { codificarCaminho, urlPublicaDoSupabase } from "./destino";

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
