import { describe, expect, it } from "vitest";
import type { Insight } from "../dashboard/insights";
import { aceitacaoDasDecididas, contarPendentes, decididas, filtrar, pendentesDeDecisao, rotuloDoSelo } from "./recomendacoes";

const base: Insight = {
  id: "1",
  classe_id: 10,
  aluno_id: null,
  escopo: "turma",
  natureza: "sugestao",
  texto: "Reforce o tópico 2",
  base: null,
  status: "pending",
  motivo_descarte: null,
  geracao_id: "g1",
  created_at: "2026-11-01T10:00:00Z",
  resolved_at: null,
};
const linha = (parcial: Partial<Insight>): Insight => ({ ...base, ...parcial });

describe("pendentesDeDecisao", () => {
  it("só sugestão pendente com texto, de qualquer lote — inclusive o que o Insights já escondeu", () => {
    const linhas = [
      linha({ id: "a", geracao_id: "lote-antigo", created_at: "2026-10-01T00:00:00Z" }),
      linha({ id: "b", geracao_id: "lote-novo", created_at: "2026-11-01T00:00:00Z" }),
      linha({ id: "c", natureza: "observacao" }),
      linha({ id: "d", status: "applied", resolved_at: "2026-11-01T11:00:00Z" }),
      linha({ id: "e", texto: "   " }),
      linha({ id: "f", texto: null }),
    ];
    expect(pendentesDeDecisao(linhas).map((l) => l.id)).toEqual(["b", "a"]);
  });

  it("alerta por aluno sem lote também entra", () => {
    const alerta = linha({ id: "x", escopo: "aluno", aluno_id: "aluno-1", geracao_id: null });
    expect(pendentesDeDecisao([alerta]).map((l) => l.id)).toEqual(["x"]);
  });

  it("desempata pelo id quando a data é igual", () => {
    const linhas = [linha({ id: "b" }), linha({ id: "a" })];
    expect(pendentesDeDecisao(linhas).map((l) => l.id)).toEqual(["a", "b"]);
  });
});

describe("decididas", () => {
  it("só as decididas com data, a mais recente primeiro", () => {
    const linhas = [
      linha({ id: "a", status: "applied", resolved_at: "2026-11-01T10:00:00Z" }),
      linha({ id: "b", status: "dismissed", resolved_at: "2026-11-02T10:00:00Z" }),
      linha({ id: "c", status: "applied", resolved_at: null }),
      linha({ id: "d", status: "pending" }),
    ];
    expect(decididas(linhas).map((l) => l.id)).toEqual(["b", "a"]);
  });
});

describe("filtrar", () => {
  const linhas = [
    linha({ id: "t10", escopo: "turma", classe_id: 10 }),
    linha({ id: "a10", escopo: "aluno", classe_id: 10, aluno_id: "x" }),
    linha({ id: "a20", escopo: "aluno", classe_id: 20, aluno_id: "y" }),
  ];
  it("por escopo", () => {
    expect(filtrar(linhas, "turma", null).map((l) => l.id)).toEqual(["t10"]);
    expect(filtrar(linhas, "alunos", null).map((l) => l.id)).toEqual(["a10", "a20"]);
    expect(filtrar(linhas, "tudo", null)).toHaveLength(3);
  });
  it("por turma", () => {
    expect(filtrar(linhas, "tudo", 20).map((l) => l.id)).toEqual(["a20"]);
  });
});

describe("contarPendentes", () => {
  it("separa turma e alunos e ignora o que não é pendente", () => {
    const linhas = [
      linha({ id: "1" }),
      linha({ id: "2", escopo: "aluno", aluno_id: "x" }),
      linha({ id: "3", escopo: "aluno", aluno_id: "y" }),
      linha({ id: "4", status: "dismissed", resolved_at: "2026-11-01T00:00:00Z" }),
    ];
    expect(contarPendentes(linhas)).toEqual({ total: 3, turma: 1, alunos: 2 });
  });
  it("nada pendente é zero, não erro", () => {
    expect(contarPendentes([])).toEqual({ total: 0, turma: 0, alunos: 0 });
  });
});

describe("aceitacaoDasDecididas", () => {
  it("usa a regra do Insights: aceitas ÷ respondidas na janela", () => {
    const agora = new Date("2026-11-02T12:00:00Z");
    const linhas = [
      linha({ id: "1", status: "applied", resolved_at: "2026-11-01T00:00:00Z" }),
      linha({ id: "2", status: "dismissed", resolved_at: "2026-11-01T00:00:00Z" }),
      linha({ id: "3", status: "applied", resolved_at: "2026-08-01T00:00:00Z" }),
    ];
    expect(aceitacaoDasDecididas(linhas, agora)).toEqual({ aceitas: 1, respondidas: 2, pct: 50 });
  });
});

describe("rotuloDoSelo", () => {
  it("some com zero e passa de 9 vira 9+", () => {
    expect(rotuloDoSelo(0)).toBeNull();
    expect(rotuloDoSelo(-1)).toBeNull();
    expect(rotuloDoSelo(4)).toBe("4");
    expect(rotuloDoSelo(9)).toBe("9");
    expect(rotuloDoSelo(10)).toBe("9+");
  });
});
