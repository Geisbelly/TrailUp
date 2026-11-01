import { describe, expect, it } from "vitest";
import { contarGargalosPorFormato, SELECT_DA_BASE, type LinhaBaseDaPersonalizacao } from "./gargalos";

const pronto = { status: "completed", generation_key: "c:h" };

function porFormato(linhas: LinhaBaseDaPersonalizacao[]) {
  return Object.fromEntries(contarGargalosPorFormato(linhas).formatos.map((f) => [f.formato, f]));
}

describe("contarGargalosPorFormato", () => {
  it("conta pronto, pendente e falha por formato a partir do metadata", () => {
    const r = porFormato([
      { status: "pronto", markdown_metadata: pronto, audio_metadata: pronto, apresentacao_metadata: pronto },
      {
        status: "failed",
        markdown_metadata: pronto,
        audio_metadata: { status: "failed", error: "tts" },
        apresentacao_metadata: { status: "processing" },
      },
    ]);
    expect(r.markdown).toMatchObject({ prontos: 2, pendentes: 0, falhas: 0 });
    expect(r.audio).toMatchObject({ prontos: 1, pendentes: 0, falhas: 1 });
    expect(r.apresentacao).toMatchObject({ prontos: 1, pendentes: 1, falhas: 0 });
  });

  it("reprovação na validação é falha, como na API", () => {
    const r = porFormato([
      { status: "pronto", markdown_metadata: { status: "completed", scores_validacao: { aprovado: false } } },
    ]);
    expect(r.markdown).toMatchObject({ prontos: 0, falhas: 1 });
  });

  it("formato ausente herda o status do registro: falha, em curso ou nada", () => {
    // "midias obrigatorias nao geradas: audio, apresentacao": o texto existe, o resto nem chegou.
    const r = porFormato([
      { status: "failed", markdown_metadata: pronto },
      { status: "processando_midias" },
      { status: "pronto" },
    ]);
    expect(r.markdown).toMatchObject({ prontos: 1, pendentes: 1, falhas: 0 });
    expect(r.audio).toMatchObject({ prontos: 0, pendentes: 1, falhas: 1 });
    expect(r.apresentacao).toMatchObject({ prontos: 0, pendentes: 1, falhas: 1 });
  });

  it("forma real da turma 66 em 31/10: o áudio é o gargalo, mesmo com URL de tentativa velha", () => {
    const falhaDeAudio = (url: string | null): LinhaBaseDaPersonalizacao => ({
      status: "failed",
      markdown_metadata: { status: "completed" },
      markdown_url: "https://cdn/t.md",
      audio_metadata: { status: "failed" },
      audio_url: url,
      apresentacao_metadata: { status: "completed" },
      apresentacao_url: "https://cdn/a.html",
    });
    const r = porFormato([
      ...[null, "https://cdn/velho.mp3", null, "https://cdn/velho.mp3", "https://cdn/velho.mp3", "https://cdn/velho.mp3"].map(falhaDeAudio),
      { ...falhaDeAudio("https://cdn/ok.mp3"), status: "pronto", audio_metadata: { status: "completed" } },
    ]);
    expect(r.markdown).toMatchObject({ prontos: 7, falhas: 0 });
    expect(r.audio).toMatchObject({ prontos: 1, falhas: 6 });
    expect(r.apresentacao).toMatchObject({ prontos: 7, falhas: 0 });
  });

  it("só URL, sem metadata, conta como pronto (material antigo)", () => {
    expect(porFormato([{ status: "pronto", audio_url: "https://cdn/x.mp3" }]).audio).toMatchObject({ prontos: 1 });
  });

  it("totais somam os formatos; turma sem base: zero registros", () => {
    const r = contarGargalosPorFormato([{ status: "failed" }]);
    expect(r).toMatchObject({ registros: 1, falhas: 3, pendentes: 0 });
    expect(contarGargalosPorFormato([])).toMatchObject({ registros: 0, falhas: 0, pendentes: 0 });
  });
});

describe("SELECT_DA_BASE", () => {
  it("pede só metadata e URL de cada formato, nunca o material inteiro", () => {
    expect(SELECT_DA_BASE).toContain("audio_metadata:materiais->audio->metadata");
    expect(SELECT_DA_BASE).toContain("apresentacao_url:materiais->apresentacao->>arquivo_url");
    expect(SELECT_DA_BASE).not.toMatch(/(^|, )materiais(,|$)/);
  });
});
