import { describe, expect, it } from "vitest";
import { chaveAlunoTurma, faltaColunaDoMotivo, juntarSinais, type LinhaEngajamento } from "./sinais";

const linha = (over: Partial<LinhaEngajamento>): LinhaEngajamento => ({
  aluno_id: "a",
  classe_id: 1,
  sem_dado: false,
  ultima_atividade_em: "2026-10-20T12:00:00Z",
  inativo_desde: null,
  evadido_desde: null,
  estagnado_desde: null,
  estagnado_topico_id: null,
  risco_abandono_faixa: "normal",
  risco_abandono_origem: "modelo",
  ...over,
});

describe("juntarSinais", () => {
  it("um registro por aluno e turma, sem misturar turmas, com o nome do tópico parado", () => {
    const sinais = juntarSinais(
      [
        linha({ inativo_desde: "2026-10-20T12:00:00Z" }),
        linha({ classe_id: 2, estagnado_desde: "2026-10-10T12:00:00Z", estagnado_topico_id: 7 }),
        linha({ aluno_id: "b", sem_dado: true, ultima_atividade_em: null }),
      ],
      new Map([[7, "Frações"]]),
    );
    expect(sinais.get(chaveAlunoTurma("a", 1))?.inativoDesde).toBe("2026-10-20T12:00:00Z");
    expect(sinais.get(chaveAlunoTurma("a", 2))).toMatchObject({ estagnadoTopico: "Frações", inativoDesde: null });
    expect(sinais.get(chaveAlunoTurma("b", 1))?.semDado).toBe(true);
    expect(sinais.get(chaveAlunoTurma("c", 1))).toBeUndefined();
  });

  it("sem a coluna sem_dado, o aluno conta como sem dado (nada vira sinal por engano)", () => {
    const sinais = juntarSinais([linha({ sem_dado: null })], new Map());
    expect(sinais.get(chaveAlunoTurma("a", 1))?.semDado).toBe(true);
  });

  it("a faixa do modelo chega como está; 'sem dados' vira null", () => {
    const sinais = juntarSinais([linha({ risco_abandono_faixa: "alto" }), linha({ aluno_id: "b", risco_abandono_faixa: "sem dados" })], new Map());
    expect(sinais.get(chaveAlunoTurma("a", 1))?.riscoFaixa).toBe("alto");
    expect(sinais.get(chaveAlunoTurma("b", 1))?.riscoFaixa).toBeNull();
  });

  it("a origem da faixa chega como está; valor desconhecido vira null", () => {
    const sinais = juntarSinais(
      [linha({ risco_abandono_origem: "inatividade" }), linha({ aluno_id: "b", risco_abandono_origem: "outra" })],
      new Map(),
    );
    expect(sinais.get(chaveAlunoTurma("a", 1))?.riscoOrigem).toBe("inatividade");
    expect(sinais.get(chaveAlunoTurma("b", 1))?.riscoOrigem).toBeNull();
  });

  it("tópico parado sem nome conhecido fica null, não um id cru", () => {
    const sinais = juntarSinais([linha({ estagnado_desde: "2026-10-10", estagnado_topico_id: 99 })], new Map());
    expect(sinais.get(chaveAlunoTurma("a", 1))?.estagnadoTopico).toBeNull();
  });

  it("o motivo do modelo chega como rótulo; ausente (banco sem a 20261110_01) ou desconhecido vira null", () => {
    const sinais = juntarSinais(
      [
        linha({ risco_abandono_motivo: "entregas_perdidas" }),
        linha({ aluno_id: "b", risco_abandono_motivo: "0.93" }),
        linha({ aluno_id: "c" }),
      ],
      new Map(),
    );
    expect(sinais.get(chaveAlunoTurma("a", 1))?.riscoMotivo).toBe("entregas_perdidas");
    expect(sinais.get(chaveAlunoTurma("b", 1))?.riscoMotivo).toBeNull();
    expect(sinais.get(chaveAlunoTurma("c", 1))?.riscoMotivo).toBeNull();
  });
});

describe("faltaColunaDoMotivo", () => {
  it("só a falta da coluna nova faz ler de novo sem ela", () => {
    expect(faltaColunaDoMotivo({ code: "42703", message: "column vw.risco_abandono_motivo does not exist" })).toBe(true);
    expect(faltaColunaDoMotivo({ code: "PGRST204", message: "Could not find the 'risco_abandono_motivo' column" })).toBe(true);
    expect(faltaColunaDoMotivo({ code: "42703", message: "column vw.outra does not exist" })).toBe(false);
    expect(faltaColunaDoMotivo({ code: "42501", message: "permission denied" })).toBe(false);
    expect(faltaColunaDoMotivo(null)).toBe(false);
  });
});
