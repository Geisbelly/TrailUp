import { describe, expect, it } from "vitest";
import { caminhoNoBucketConteudos, pareceCaminhoDeArquivo } from "./conteudosStorage";

const BASE = "https://projeto.supabase.co";
const CAMINHO = "b49f2e21-a6f9-4c8d-9533-5a32bb219754/114/1_aula final.png";

describe("caminhoNoBucketConteudos", () => {
  it("devolve o caminho puro como veio", () => {
    expect(caminhoNoBucketConteudos(CAMINHO)).toBe(CAMINHO);
    expect(caminhoNoBucketConteudos(`conteudos/${CAMINHO}`)).toBe(CAMINHO);
  });

  it("extrai o caminho das URLs antigas do bucket (publica, assinada, autenticada)", () => {
    const codificado = encodeURI(CAMINHO);
    expect(caminhoNoBucketConteudos(`${BASE}/storage/v1/object/public/conteudos/${codificado}`)).toBe(CAMINHO);
    expect(caminhoNoBucketConteudos(`${BASE}/storage/v1/object/sign/conteudos/${codificado}?token=x`)).toBe(CAMINHO);
    expect(caminhoNoBucketConteudos(`${BASE}/storage/v1/object/authenticated/conteudos/${codificado}#p`)).toBe(CAMINHO);
  });

  it("nao mexe em link externo nem em outro bucket", () => {
    expect(caminhoNoBucketConteudos("https://exemplo.invalid/a.png")).toBeNull();
    expect(caminhoNoBucketConteudos(`${BASE}/storage/v1/object/public/conteudo_aluno/x.png`)).toBeNull();
    expect(caminhoNoBucketConteudos("")).toBeNull();
    expect(caminhoNoBucketConteudos(null)).toBeNull();
  });
});

describe("pareceCaminhoDeArquivo", () => {
  it("frase gravada no lugar do arquivo não é caminho (o 400 do Storage)", () => {
    const frase = "Discutir arquiteturas primário-secundário e estratégias de alta disponibilidade.";
    expect(pareceCaminhoDeArquivo(frase)).toBe(false);
    expect(caminhoNoBucketConteudos(frase)).toBeNull();
    expect(pareceCaminhoDeArquivo("Comparar TCP/IP com Node.js")).toBe(false);
    expect(pareceCaminhoDeArquivo("Roteiro:\nabrir com uma pergunta")).toBe(false);
    expect(pareceCaminhoDeArquivo('{"url":"x"}')).toBe(false);
    expect(pareceCaminhoDeArquivo("aula final.pdf")).toBe(false);
    expect(pareceCaminhoDeArquivo("https://exemplo.invalid/a.pdf")).toBe(false);
    expect(pareceCaminhoDeArquivo("")).toBe(false);
  });

  it("caminhos de upload de verdade continuam valendo", () => {
    expect(pareceCaminhoDeArquivo(CAMINHO)).toBe(true);
    expect(pareceCaminhoDeArquivo("uuid/classes/12/materials/1731_slides.pptx")).toBe(true);
    expect(pareceCaminhoDeArquivo("uuid/114/1731_sem_extensao")).toBe(true);
    expect(pareceCaminhoDeArquivo("aula.pdf")).toBe(true);
    expect(pareceCaminhoDeArquivo(`conteudos/${CAMINHO}`)).toBe(true);
  });
});
