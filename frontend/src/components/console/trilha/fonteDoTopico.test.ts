import { describe, expect, it } from "vitest";
import { fonteDoTopico } from "./fonteDoTopico";
import type { Conteudo } from "./types";

const c = (files?: { path: string; name: string; size: number }[]): Conteudo => ({
  id: 1, titulo: "x", tipo: "arquivo", ordem: 1, conteudo: null, metadata: files ? { files } : null,
});

describe("fonteDoTopico", () => {
  it("sem arquivo não há fonte", () => {
    expect(fonteDoTopico([c(), c([])])).toBeNull();
  });
  it("usa o primeiro arquivo e conta o total", () => {
    const f = fonteDoTopico([c(), c([{ path: "a", name: "Cinematica-Cap3.PDF", size: 2400 }]), c([{ path: "b", name: "b.docx", size: 1 }])]);
    expect(f).toEqual({ nome: "Cinematica-Cap3.PDF", tamanho: 2400, extensao: "pdf", total: 2 });
  });
  it("nome sem extensão cai em 'arq'", () => {
    expect(fonteDoTopico([c([{ path: "a", name: "leia-me", size: 1 }])])?.extensao).toBe("arq");
  });
});
