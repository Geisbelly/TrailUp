import { describe, expect, it } from "vitest";
import { abandonoPorPerfil, distribuicaoDeNotas, inatividadePorPerfil, N_MINIMO_PADRAO } from "./graficos";
import {
  alunosDeExemplo,
  distribuicaoDosAlunos,
  ehAlunoDeExemplo,
  mostraExemplo,
  perfisDosAlunos,
  resumoDosAlunos,
  TOTAL_DE_ALUNOS,
} from "./exemploDaPesquisa";
import { kpisDosAlunos } from "./kpisDosAlunos";
import type { AlunoAnalisado } from "./aluno/tipos";

const HOJE = new Date("2026-11-24T12:00:00Z");
const exemplo = alunosDeExemplo(42, "Turma de demonstração", HOJE);

/** O aluno de teste do avaliador: entrou na turma e ainda não estudou. */
const alunoReal: AlunoAnalisado = {
  ...exemplo[0],
  id: "0b6f7a2e-real",
  nome: "Aluno de teste",
  temNota: false,
  notaMedia: 0,
  porcentagemConcluida: 0,
  acertosPercentual: 0,
  temAcertos: false,
  tempoGastoMin: 0,
  tempoPresencaMin: null,
  ultimaAtividade: null,
  ultimaAtividadeEm: null,
  riscoFaixa: null,
  risco: null,
};

describe("exemplo da pesquisa com professores", () => {
  it("só entra com a turma de demonstração sozinha em tela", () => {
    expect(mostraExemplo(42, [42])).toBe(true);
    expect(mostraExemplo(42, [42, 7])).toBe(false);
    expect(mostraExemplo(42, [7])).toBe(false);
    expect(mostraExemplo(null, [42])).toBe(false);
    expect(mostraExemplo(undefined, [])).toBe(false);
  });

  it("os alunos de exemplo são marcados no id e no nome", () => {
    expect(exemplo).toHaveLength(TOTAL_DE_ALUNOS);
    expect(exemplo.every((a) => ehAlunoDeExemplo(a.id) && a.nome.endsWith("(exemplo)"))).toBe(true);
    expect(ehAlunoDeExemplo(alunoReal.id)).toBe(false);
    expect(new Set(exemplo.map((a) => a.id)).size).toBe(TOTAL_DE_ALUNOS);
  });

  it.each([
    ["só os de exemplo", exemplo],
    ["com o aluno real junto", [alunoReal, ...exemplo]],
  ])("todo painel conta a mesma lista (%s)", (_, alunos) => {
    const kpis = kpisDosAlunos(alunos);
    const resumo = resumoDosAlunos(alunos, HOJE);
    const majoritario = perfisDosAlunos(alunos, 42, HOJE).filter((l) => l.segmento === "majoritario");

    expect(kpis.totalAlunos).toBe(alunos.length);
    expect(resumo.total_alunos).toBe(alunos.length);
    expect(majoritario.reduce((s, l) => s + l.total_alunos_segmento, 0)).toBe(alunos.length);
    expect(distribuicaoDosAlunos(alunos, 42).reduce((s, l) => s + l.total_alunos, 0)).toBe(alunos.length);
    expect(majoritario.reduce((s, l) => s + l.alunos_risco_alto, 0)).toBe(resumo.alunos_risco_alto);
    expect(majoritario.reduce((s, l) => s + l.alunos_inativos, 0)).toBe(resumo.alunos_inativos + resumo.alunos_evadidos);
    expect(resumo.alunos_risco_alto).toBe(alunos.filter((a) => a.riscoFaixa === "alto").length);
    expect(resumo.media_nota_turma).toBe(kpis.mediaNotas);
  });

  it("o aluno sem nota não puxa a média para baixo", () => {
    expect(kpisDosAlunos([alunoReal, ...exemplo]).mediaNotas).toBe(kpisDosAlunos(exemplo).mediaNotas);
  });

  it("o risco sai da mesma conta do painel de verdade", () => {
    const altos = exemplo.filter((a) => a.riscoFaixa === "alto");
    expect(altos.length).toBeGreaterThan(0);
    expect(altos.every((a) => a.risco?.nivel === "critico")).toBe(true);
    const parados = exemplo.filter((a) => a.risco?.fatores.some((f) => f.criterio === "estagnacao"));
    expect(parados.length).toBe(resumoDosAlunos(exemplo, HOJE).alunos_estagnados);
    expect(exemplo.filter((a) => a.riscoFaixa === "normal" && a.notaMedia >= 5).every((a) => a.risco === null)).toBe(true);
  });

  it("os gráficos por perfil têm valor nos três recortes", () => {
    const perfis = perfisDosAlunos(exemplo, 42, HOJE);
    for (const segmento of ["majoritario", "segundo", "afinidade_20_plus"] as const) {
      const abandono = abandonoPorPerfil(perfis, segmento);
      expect(abandono).toHaveLength(7);
      expect(abandono.every((p) => p.valor !== null)).toBe(true);
    }
  });

  it("a inatividade mostra também o estado de poucos alunos", () => {
    const inatividade = inatividadePorPerfil(perfisDosAlunos(exemplo, 42, HOJE), "majoritario", N_MINIMO_PADRAO);
    expect(inatividade.some((p) => p.valor === null)).toBe(true);
    expect(inatividade.filter((p) => p.valor !== null).length).toBeGreaterThanOrEqual(4);
  });

  it("a rosca de notas tem as três faixas e o aluno sem nota vira sem dado", () => {
    expect(distribuicaoDeNotas(distribuicaoDosAlunos(exemplo, 42)).map((f) => f.tom)).toEqual(["success", "warning", "destructive"]);
    const comReal = distribuicaoDosAlunos([alunoReal, ...exemplo], 42);
    expect(comReal.find((l) => l.faixa === "sem_dado")?.total_alunos).toBe(1);
  });
});
