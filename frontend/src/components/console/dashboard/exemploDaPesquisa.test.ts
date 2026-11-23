import { describe, expect, it } from "vitest";
import { abandonoPorPerfil, distribuicaoDeNotas, inatividadePorPerfil, N_MINIMO_PADRAO } from "./graficos";
import {
  distribuicaoDeExemplo,
  mostraExemplo,
  perfisDeExemplo,
  RESUMO_DE_EXEMPLO,
  TOTAL_DE_ALUNOS,
} from "./exemploDaPesquisa";

describe("exemplo da pesquisa com professores", () => {
  it("só entra com a turma de demonstração sozinha em tela", () => {
    expect(mostraExemplo(42, [42])).toBe(true);
    expect(mostraExemplo(42, [42, 7])).toBe(false);
    expect(mostraExemplo(42, [7])).toBe(false);
    expect(mostraExemplo(null, [42])).toBe(false);
    expect(mostraExemplo(undefined, [])).toBe(false);
  });

  it("os números não se contradizem entre os painéis", () => {
    const majoritario = perfisDeExemplo().filter((l) => l.segmento === "majoritario");
    expect(majoritario.reduce((s, l) => s + l.total_alunos_segmento, 0)).toBe(TOTAL_DE_ALUNOS);
    expect(majoritario.reduce((s, l) => s + l.alunos_risco_alto, 0)).toBe(RESUMO_DE_EXEMPLO.alunos_risco_alto);
    expect(majoritario.reduce((s, l) => s + l.alunos_inativos, 0)).toBe(RESUMO_DE_EXEMPLO.alunos_inativos);
    expect(distribuicaoDeExemplo().reduce((s, l) => s + l.total_alunos, 0)).toBe(TOTAL_DE_ALUNOS);
    expect(RESUMO_DE_EXEMPLO.total_alunos).toBe(TOTAL_DE_ALUNOS);
  });

  it("os gráficos por perfil têm valor nos três recortes", () => {
    for (const segmento of ["majoritario", "segundo", "afinidade_20_plus"] as const) {
      const abandono = abandonoPorPerfil(perfisDeExemplo(), segmento);
      expect(abandono).toHaveLength(7);
      expect(abandono.every((p) => p.valor !== null)).toBe(true);
    }
  });

  it("a inatividade mostra também o estado de poucos alunos", () => {
    const inatividade = inatividadePorPerfil(perfisDeExemplo(), "majoritario", N_MINIMO_PADRAO);
    expect(inatividade.some((p) => p.valor === null)).toBe(true);
    expect(inatividade.filter((p) => p.valor !== null).length).toBeGreaterThanOrEqual(4);
  });

  it("a rosca de notas tem as três faixas, da mais alta para a mais baixa", () => {
    expect(distribuicaoDeNotas(distribuicaoDeExemplo()).map((f) => f.tom)).toEqual(["success", "warning", "destructive"]);
  });
});
