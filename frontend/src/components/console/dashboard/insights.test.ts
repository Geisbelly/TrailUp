import { describe, expect, it } from "vitest";
import {
  eMigracaoPendente,
  filtrarPorEscopo,
  formatarGeradoHa,
  geradoEm,
  loteMaisRecentePorTurma,
  precisaGerar,
  taxaDeAceitacao,
  textoDaAceitacao,
  type Insight,
} from "./insights";

let seq = 0;
const insight = (campos: Partial<Insight>): Insight => ({
  id: `i${++seq}`,
  classe_id: 54,
  aluno_id: null,
  escopo: "turma",
  natureza: "sugestao",
  texto: "Revise Frações",
  base: "38% de acertos",
  status: "pending",
  motivo_descarte: null,
  geracao_id: "g1",
  created_at: "2026-09-29T10:00:00+00:00",
  resolved_at: null,
  ...campos,
});

const agora = new Date("2026-09-29T12:00:00Z");

describe("taxaDeAceitacao", () => {
  it("aceitas ÷ respondidas, só sugestões decididas nos últimos 30 dias", () => {
    const linhas = [
      insight({ status: "applied", resolved_at: "2026-09-28T10:00:00Z" }),
      insight({ status: "applied", resolved_at: "2026-09-10T10:00:00Z" }),
      insight({ status: "dismissed", resolved_at: "2026-09-20T10:00:00Z", motivo_descarte: "ja_resolvido" }),
      insight({ status: "applied", resolved_at: "2026-08-01T10:00:00Z" }), // fora da janela
      insight({ status: "pending" }), // ainda não é um "não"
      insight({ natureza: "observacao", status: "applied", resolved_at: "2026-09-28T10:00:00Z" }), // não se aceita observação
    ];
    const taxa = taxaDeAceitacao(linhas, agora);
    expect(taxa).toEqual({ aceitas: 2, respondidas: 3, pct: (2 / 3) * 100 });
    expect(textoDaAceitacao(taxa)).toBe("67% das sugestões aceitas nos últimos 30 dias (2 de 3)");
  });

  it("nada respondido: sem número, não 0%", () => {
    const taxa = taxaDeAceitacao([insight({}), insight({ status: "pending" })], agora);
    expect(taxa.pct).toBeNull();
    expect(textoDaAceitacao(taxa)).toBe("Nenhuma sugestão respondida nos últimos 30 dias");
  });

  it("tudo ignorado é 0% de verdade", () => {
    const taxa = taxaDeAceitacao([insight({ status: "dismissed", resolved_at: "2026-09-29T09:00:00Z" })], agora);
    expect(taxa).toEqual({ aceitas: 0, respondidas: 1, pct: 0 });
  });
});

describe("loteMaisRecentePorTurma", () => {
  it("fica com o último lote de cada turma e descarta linha sem lote ou sem texto", () => {
    const antigo = insight({ geracao_id: "g-velho", created_at: "2026-09-20T10:00:00Z" });
    const novo1 = insight({ geracao_id: "g-novo", created_at: "2026-09-29T10:00:00Z" });
    const novo2 = insight({ geracao_id: "g-novo", created_at: "2026-09-29T10:00:00Z", escopo: "aluno", aluno_id: "u-a" });
    const outraTurma = insight({ classe_id: 56, geracao_id: "g-56", created_at: "2026-09-01T10:00:00Z" });
    const semLote = insight({ geracao_id: null, created_at: "2026-09-29T11:00:00Z" });
    const semTexto = insight({ geracao_id: "g-novo", texto: "  " });

    const lote = loteMaisRecentePorTurma([antigo, novo1, novo2, outraTurma, semLote, semTexto]);

    expect(lote.map((l) => l.id)).toEqual([outraTurma.id, novo1.id, novo2.id]);
    expect(geradoEm(lote)).toBe("2026-09-29T10:00:00Z");
    expect(geradoEm([])).toBeNull();
  });
});

describe("filtrarPorEscopo", () => {
  const lote = [insight({ escopo: "turma" }), insight({ escopo: "aluno", aluno_id: "u-a" })];
  it("Tudo / Turma / Alunos", () => {
    expect(filtrarPorEscopo(lote, "tudo")).toHaveLength(2);
    expect(filtrarPorEscopo(lote, "turma").map((l) => l.escopo)).toEqual(["turma"]);
    expect(filtrarPorEscopo(lote, "alunos").map((l) => l.escopo)).toEqual(["aluno"]);
  });
});

describe("formatarGeradoHa e precisaGerar", () => {
  it("rótulos de tempo", () => {
    expect(formatarGeradoHa(null, agora)).toBe("Ainda não gerado");
    expect(formatarGeradoHa("2026-09-29T11:59:40Z", agora)).toBe("Gerado agora");
    expect(formatarGeradoHa("2026-09-29T11:48:00Z", agora)).toBe("Gerado há 12 min");
    expect(formatarGeradoHa("2026-09-29T10:00:00Z", agora)).toBe("Gerado há 2 h");
    expect(formatarGeradoHa("2026-09-28T10:00:00Z", agora)).toBe("Gerado há 1 dia");
    expect(formatarGeradoHa("2026-09-25T10:00:00Z", agora)).toBe("Gerado há 4 dias");
  });

  it("abrir a aba só gera de novo quando não há lote ou ele tem mais de 12 h", () => {
    expect(precisaGerar(null, agora)).toBe(true);
    expect(precisaGerar("2026-09-29T02:00:00Z", agora)).toBe(false);
    expect(precisaGerar("2026-09-28T23:00:00Z", agora)).toBe(true);
  });
});

describe("eMigracaoPendente", () => {
  it("reconhece coluna inexistente e o 503 da API", () => {
    expect(eMigracaoPendente({ code: "42703", message: "column intervencoes.classe_id does not exist" })).toBe(true);
    expect(eMigracaoPendente({ message: "Os insights ainda nao estao disponiveis neste banco (migracao pendente)." })).toBe(true);
    expect(eMigracaoPendente({ code: "42501", message: "permission denied" })).toBe(false);
    expect(eMigracaoPendente(null)).toBe(false);
  });
});
