import { describe, expect, it } from "vitest";
import { chaveAlunoTurma, juntarSinais, type LinhaEngajamento } from "./sinais";

const linha = (over: Partial<LinhaEngajamento>): LinhaEngajamento => ({
  aluno_id: "a",
  classe_id: 1,
  sem_dado: false,
  ultima_atividade_em: "2026-10-20T12:00:00Z",
  inativo_desde: null,
  evadido_desde: null,
  estagnado_desde: null,
  estagnado_topico_id: null,
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

  it("tópico parado sem nome conhecido fica null, não um id cru", () => {
    const sinais = juntarSinais([linha({ estagnado_desde: "2026-10-10", estagnado_topico_id: 99 })], new Map());
    expect(sinais.get(chaveAlunoTurma("a", 1))?.estagnadoTopico).toBeNull();
  });
});
