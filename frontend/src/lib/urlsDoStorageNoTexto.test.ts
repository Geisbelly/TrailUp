import { describe, expect, it } from "vitest";
import { assinarUrlsDoStorageNoTexto, objetoPrivadoDaUrl, objetosPrivadosNoTexto } from "./urlsDoStorageNoTexto";

const BASE = "https://abc.supabase.co/storage/v1/object";

describe("urlsDoStorageNoTexto", () => {
  it("acha URLs publicas e autenticadas de bucket privado, sem repetir", () => {
    const md = [
      `![fig](${BASE}/authenticated/conteudos/prof/1/fig%20a.png)`,
      `Veja ${BASE}/public/conteudo_aluno/classe-1/x.png.`,
      `![de novo](${BASE}/authenticated/conteudos/prof/1/fig%20a.png)`,
    ].join("\n");
    expect(objetosPrivadosNoTexto(md)).toEqual([
      { url: `${BASE}/authenticated/conteudos/prof/1/fig%20a.png`, bucket: "conteudos", caminho: "prof/1/fig a.png" },
      { url: `${BASE}/public/conteudo_aluno/classe-1/x.png`, bucket: "conteudo_aluno", caminho: "classe-1/x.png" },
    ]);
  });

  it("ignora bucket publico de verdade, URL ja assinada e texto vazio", () => {
    expect(objetoPrivadoDaUrl(`${BASE}/public/trailup-slides/a.png`)).toBeNull();
    expect(objetoPrivadoDaUrl(`${BASE}/sign/conteudos/a.png?token=t`)).toBeNull();
    expect(objetosPrivadosNoTexto(null)).toEqual([]);
    expect(objetosPrivadosNoTexto("sem link")).toEqual([]);
  });

  it("troca pela assinada em todas as ocorrencias e deixa a que falhou", async () => {
    const boa = `${BASE}/public/conteudos/p/boa.png`;
    const ruim = `${BASE}/public/perfil_fotos/p/ruim.png`;
    const md = `![1](${boa}) ![2](${ruim}) ![3](${boa})`;
    const out = await assinarUrlsDoStorageNoTexto(md, async (o) => {
      if (o.bucket === "perfil_fotos") throw new Error("negado");
      return `https://abc.supabase.co/storage/v1/object/sign/${o.bucket}/${o.caminho}?token=T`;
    });
    const assinada = `${BASE}/sign/conteudos/p/boa.png?token=T`;
    expect(out).toBe(`![1](${assinada}) ![2](${ruim}) ![3](${assinada})`);
  });

  it("sem URL privada nao chama quem assina", async () => {
    let chamadas = 0;
    const md = "# titulo";
    expect(await assinarUrlsDoStorageNoTexto(md, async () => { chamadas += 1; return "x"; })).toBe(md);
    expect(chamadas).toBe(0);
  });
});

describe("urlsDoStorageNoTexto: prefixo", () => {
  it("URL que e' prefixo de outra nao estraga a maior", async () => {
    const curta = `${BASE}/public/conteudos/p/a.png`;
    const longa = `${BASE}/public/conteudos/p/a.png.bak`;
    const out = await assinarUrlsDoStorageNoTexto(`${curta} e ${longa}`, async (o) => `${o.url}#S`);
    expect(out).toBe(`${curta}#S e ${longa}#S`);
  });
});
