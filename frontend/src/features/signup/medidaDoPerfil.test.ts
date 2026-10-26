import { describe, expect, it } from "vitest";

import { PERFIS_EM_ORDEM } from "./brainhexOrdenacao";
import {
  MedidaInvalida,
  VERSAO_DO_INSTRUMENTO,
  montarMedidaDoPerfil,
} from "./medidaDoPerfil";

const qualidade = { indice: null, desvio: 1.4567, aquiescencia: 0.1234, motivos: ["x"] };
const base = {
  alunoId: "11111111-2222-3333-4444-555555555555",
  ordenacao: [...PERFIS_EM_ORDEM],
  afinidade: Object.fromEntries(PERFIS_EM_ORDEM.map((p, i) => [p, i === 0 ? 16 : 14])),
  ordenacaoConfirmada: true,
  confianca: null,
  concordancia: 0.5,
  qualidade,
};

describe("montarMedidaDoPerfil", () => {
  it("monta a linha com a versao do instrumento", () => {
    const m = montarMedidaDoPerfil(base);
    expect(m.versao_instrumento).toBe(VERSAO_DO_INSTRUMENTO);
    expect(m.ordenacao).toHaveLength(7);
    expect(m.aluno_id).toBe(base.alunoId);
  });

  it("arredonda para o que o banco guarda (numeric 4,3)", () => {
    // Sem isto, o valor gravado difere do que o cliente achou que gravou.
    const m = montarMedidaDoPerfil(base);
    expect(m.confianca).toBeNull();
    expect(m.qualidade.indice).toBeNull();
    expect(m.qualidade.desvio).toBe(1.457);
  });

  it("recusa ordenacao incompleta em vez de gravar linha que mente", () => {
    expect(() => montarMedidaDoPerfil({ ...base, ordenacao: ["seeker"] })).toThrow();
  });

  it("recusa aluno vazio", () => {
    expect(() => montarMedidaDoPerfil({ ...base, alunoId: "  " })).toThrow(MedidaInvalida);
  });

  it("recusa qualquer confiança numérica na versão exploratória", () => {
    expect(() => montarMedidaDoPerfil({ ...base, confianca: 1.5 })).toThrow(/não estima confiança/);
    expect(() => montarMedidaDoPerfil({ ...base, confianca: Number.NaN })).toThrow(MedidaInvalida);
  });

  it("concordancia ausente vira null, nao zero", () => {
    // Zero significaria "os metodos nao se falam"; ausente significa "nao medi".
    const m = montarMedidaDoPerfil({ ...base, concordancia: undefined });
    expect(m.concordancia).toBeNull();
    const n = montarMedidaDoPerfil({ ...base, concordancia: 0 });
    expect(n.concordancia).toBe(0);
  });

  it("não transforma erro numérico em correlação perfeita", () => {
    for (const concordancia of [9, -9, NaN, Infinity]) {
      expect(() => montarMedidaDoPerfil({ ...base, concordancia })).toThrow(/concordância/);
    }
  });

  it("não persiste vetor inválido com versão científica aparente", () => {
    for (const afinidade of [{}, { ...base.afinidade, seeker: NaN }, { ...base.afinidade, seeker: 99 }]) {
      expect(() => montarMedidaDoPerfil({ ...base, afinidade })).toThrow(/sete perfis/);
    }
  });

  it("copia os motivos: mutar a entrada depois nao altera a medida", () => {
    const motivos = ["original"];
    const m = montarMedidaDoPerfil({ ...base, qualidade: { ...qualidade, motivos } });
    motivos.push("acrescentado depois");
    expect(m.qualidade.motivos).toEqual(["original"]);
  });
});
