import { describe, expect, it } from "vitest";
import {
  MOTIVO_MAX,
  aguardaDecisao,
  aprovacaoDe,
  escopoDe,
  origemDe,
  podeEditar,
  rotuloDaOrigem,
  rotuloDoEscopo,
  separarPorDecisao,
  validarMotivoDeRecusa,
} from "./aprovacao";

describe("escopo, origem e aprovação vindos do banco", () => {
  it("os três escopos do CHECK passam; o resto vira turma", () => {
    expect(["aluno", "turma", "guilda"].map(escopoDe)).toEqual(["aluno", "turma", "guilda"]);
    for (const v of [null, undefined, "", "Guilda", 3]) expect(escopoDe(v)).toBe("turma");
  });

  it("origem desconhecida NÃO vira professor — senão liberaria a edição que o gatilho congela", () => {
    expect(["professor", "ia", "sistema"].map(origemDe)).toEqual(["professor", "ia", "sistema"]);
    for (const v of [null, "", "Professor", "outro"]) expect(origemDe(v)).toBe("ia");
  });

  it("aprovação desconhecida vira nao_requer", () => {
    expect(["nao_requer", "pendente", "aprovada", "recusada"].map(aprovacaoDe)).toEqual(["nao_requer", "pendente", "aprovada", "recusada"]);
    expect(aprovacaoDe("x")).toBe("nao_requer");
  });

  it("rótulos", () => {
    expect(rotuloDoEscopo("guilda")).toBe("Guilda");
    expect(rotuloDoEscopo("aluno")).toBe("Cada aluno");
    expect(rotuloDoEscopo("turma")).toBe("Turma");
    expect(rotuloDaOrigem("ia")).toBe("Proposta pela IA");
    expect(rotuloDaOrigem("sistema")).toBe("Do sistema");
    expect(rotuloDaOrigem("professor")).toBe("Sua");
  });
});

describe("o que o professor pode fazer", () => {
  it("só edita a missão que é dele", () => {
    expect(podeEditar({ origem: "professor" })).toBe(true);
    expect(podeEditar({ origem: "ia" })).toBe(false);
    expect(podeEditar({ origem: "sistema" })).toBe(false);
  });

  it("só decide a que está pendente", () => {
    expect(aguardaDecisao({ aprovacao: "pendente" })).toBe(true);
    for (const a of ["nao_requer", "aprovada", "recusada"]) expect(aguardaDecisao({ aprovacao: a })).toBe(false);
  });

  it("separa as pendentes e preserva a ordem de cada grupo", () => {
    const lista = [
      { id: 1, aprovacao: "nao_requer" },
      { id: 2, aprovacao: "pendente" },
      { id: 3, aprovacao: "recusada" },
      { id: 4, aprovacao: "pendente" },
    ];
    const r = separarPorDecisao(lista);
    expect(r.pendentes.map((m) => m.id)).toEqual([2, 4]);
    expect(r.demais.map((m) => m.id)).toEqual([1, 3]);
    expect(separarPorDecisao([])).toEqual({ pendentes: [], demais: [] });
  });
});

describe("validarMotivoDeRecusa", () => {
  it("exige motivo e devolve sem espaços nas pontas", () => {
    expect(validarMotivoDeRecusa("  fora do conteúdo ")).toEqual({ ok: true, motivo: "fora do conteúdo" });
    expect(validarMotivoDeRecusa("   ").ok).toBe(false);
    expect(validarMotivoDeRecusa("ok").ok).toBe(false);
  });

  it("respeita o teto do CHECK do banco", () => {
    expect(validarMotivoDeRecusa("a".repeat(MOTIVO_MAX)).ok).toBe(true);
    expect(validarMotivoDeRecusa("a".repeat(MOTIVO_MAX + 1)).ok).toBe(false);
  });
});
