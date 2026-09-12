import { describe, expect, it } from "vitest";

import {
  argumentosDaRpc,
  descreverResultado,
  montarPedidoDePresenca,
  type EntradaDePresenca,
} from "./presencaDaTurma";

function entrada(patch: Partial<EntradaDePresenca> = {}): EntradaDePresenca {
  return {
    classeId: 32,
    tipo: "presenca_aula",
    alunosSelecionados: null,
    valor: null,
    data: "2026-09-09",
    hoje: "2026-09-09",
    ...patch,
  };
}

describe("montarPedidoDePresenca", () => {
  it("turma inteira vai como null, para o banco resolver quem esta matriculado", () => {
    const r = montarPedidoDePresenca(entrada());
    expect(r.erro).toBeNull();
    expect(r.pedido?.alunos).toBeNull();
  });

  it("lista vazia e erro, nunca turma inteira", () => {
    // Tratar vazio como "todos" seria o oposto do que o professor pediu.
    const r = montarPedidoDePresenca(entrada({ alunosSelecionados: [] }));
    expect(r.erro).toBe("Selecione ao menos um aluno.");
    expect(r.pedido).toBeNull();
  });

  it("recusa aula que ainda nao aconteceu", () => {
    const r = montarPedidoDePresenca(entrada({ data: "2026-09-10" }));
    expect(r.erro).not.toBeNull();
  });

  it("aceita aula de dias atras", () => {
    // Registrar depois e o caso comum: o professor lembra no fim do dia.
    const r = montarPedidoDePresenca(entrada({ data: "2026-09-02" }));
    expect(r.erro).toBeNull();
  });

  it("presenca sem valor usa o padrao do servidor", () => {
    const r = montarPedidoDePresenca(entrada({ valor: null }));
    expect(r.erro).toBeNull();
    expect(r.pedido?.valor).toBeNull();
  });

  it("participacao exige valor, porque nao ha padrao razoavel para ela", () => {
    const r = montarPedidoDePresenca(entrada({ tipo: "participacao_aula", valor: null }));
    expect(r.erro).toBe("Informe quantos pontos vale a participação.");
  });

  it("participacao com valor passa", () => {
    const r = montarPedidoDePresenca(entrada({ tipo: "participacao_aula", valor: 5 }));
    expect(r.erro).toBeNull();
  });

  it("valor zero ou negativo nao passa", () => {
    expect(montarPedidoDePresenca(entrada({ valor: 0 })).erro).not.toBeNull();
    expect(montarPedidoDePresenca(entrada({ valor: -3 })).erro).not.toBeNull();
  });

  it("sem turma escolhida nao monta pedido", () => {
    expect(montarPedidoDePresenca(entrada({ classeId: null })).erro).not.toBeNull();
  });

  it("data fora do formato nao passa", () => {
    expect(montarPedidoDePresenca(entrada({ data: "09/09/2026" })).erro).not.toBeNull();
  });
});

describe("descreverResultado", () => {
  it("conta quantos entraram", () => {
    expect(descreverResultado(20, 20)).toBe("20 alunos registrados.");
    expect(descreverResultado(1, 1)).toBe("1 aluno registrado.");
  });

  it("avisa quando parte ja tinha registro, para o professor nao clicar de novo", () => {
    expect(descreverResultado(3, 20)).toBe(
      "3 alunos registrados. 17 já tinham registro nesse dia.",
    );
    expect(descreverResultado(19, 20)).toBe(
      "19 alunos registrados. 1 já tinha registro nesse dia.",
    );
  });

  it("zero nao e falha: e o dia ja registrado", () => {
    expect(descreverResultado(0, 20)).toBe("Todos já tinham registro nesse dia.");
    expect(descreverResultado(0, 1)).toBe("Esse aluno já tinha registro nesse dia.");
  });
});

describe("argumentosDaRpc", () => {
  it("usa os nomes que o banco espera", () => {
    const r = montarPedidoDePresenca(entrada({ alunosSelecionados: ["a", "b"], valor: 10 }));
    expect(r.erro).toBeNull();
    if (!r.pedido) return;

    expect(argumentosDaRpc(r.pedido)).toEqual({
      p_classe_id: 32,
      p_alunos: ["a", "b"],
      p_tipo: "presenca_aula",
      p_valor: 10,
      p_data: "2026-09-09",
    });
  });
});
