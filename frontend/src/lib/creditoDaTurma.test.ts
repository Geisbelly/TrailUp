import { describe, expect, it } from "vitest";

import {
  agruparHistorico,
  argumentosDaRpc,
  descreverResultado,
  montarPedidoDeCredito,
  rotularTipo,
  type EntradaDeCredito,
  type LinhaDoHistorico,
} from "./creditoDaTurma";

function entrada(patch: Partial<EntradaDeCredito> = {}): EntradaDeCredito {
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

describe("montarPedidoDeCredito", () => {
  it("turma inteira vai como null, para o banco resolver quem esta matriculado", () => {
    const r = montarPedidoDeCredito(entrada());
    expect(r.erro).toBeNull();
    expect(r.pedido?.alunos).toBeNull();
  });

  it("lista vazia e erro, nunca turma inteira", () => {
    // Tratar vazio como "todos" seria o oposto do que o professor pediu.
    const r = montarPedidoDeCredito(entrada({ alunosSelecionados: [] }));
    expect(r.erro).toBe("Selecione ao menos um aluno.");
    expect(r.pedido).toBeNull();
  });

  it("recusa aula que ainda nao aconteceu", () => {
    const r = montarPedidoDeCredito(entrada({ data: "2026-09-10" }));
    expect(r.erro).not.toBeNull();
  });

  it("aceita aula de dias atras", () => {
    // Registrar depois e o caso comum: o professor lembra no fim do dia.
    const r = montarPedidoDeCredito(entrada({ data: "2026-09-02" }));
    expect(r.erro).toBeNull();
  });

  it("presenca sem valor usa o padrao do servidor", () => {
    const r = montarPedidoDeCredito(entrada({ valor: null }));
    expect(r.erro).toBeNull();
    expect(r.pedido?.valor).toBeNull();
  });

  it("participacao exige valor, porque nao ha padrao razoavel para ela", () => {
    const r = montarPedidoDeCredito(entrada({ tipo: "participacao_aula", valor: null }));
    expect(r.erro).toBe("Informe quantos pontos vale a participação.");
  });

  it("participacao com valor passa", () => {
    const r = montarPedidoDeCredito(entrada({ tipo: "participacao_aula", valor: 5 }));
    expect(r.erro).toBeNull();
  });

  it("valor zero ou negativo nao passa", () => {
    expect(montarPedidoDeCredito(entrada({ valor: 0 })).erro).not.toBeNull();
    expect(montarPedidoDeCredito(entrada({ valor: -3 })).erro).not.toBeNull();
  });

  it("sem turma escolhida nao monta pedido", () => {
    expect(montarPedidoDeCredito(entrada({ classeId: null })).erro).not.toBeNull();
  });

  it("data fora do formato nao passa", () => {
    expect(montarPedidoDeCredito(entrada({ data: "09/09/2026" })).erro).not.toBeNull();
  });
});

describe("ponto extra de atividade em sala", () => {
  function extra(patch: Partial<EntradaDeCredito> = {}) {
    return entrada({
      tipo: "participacao_extra",
      valor: 8,
      motivo: "Exercício de fixação",
      ...patch,
    });
  }

  it("exige motivo", () => {
    // Nao e enfeite: o motivo entra na referencia do evento, e e por ele que
    // duas atividades do mesmo dia nao colidem na deduplicacao do banco. Sem
    // ele a segunda seria descartada em silencio.
    const r = montarPedidoDeCredito(extra({ motivo: null }));
    expect(r.erro).toBe("Diga o que está sendo creditado — o aluno vê esse rótulo.");
  });

  it("motivo so de espacos conta como ausente", () => {
    expect(montarPedidoDeCredito(extra({ motivo: "   " })).erro).not.toBeNull();
  });

  it("exige valor, porque atividade de sala nao tem padrao", () => {
    const r = montarPedidoDeCredito(extra({ valor: null }));
    expect(r.erro).toBe("Informe quantos pontos vale a atividade.");
  });

  it("passa com motivo e valor, e o motivo vai aparado", () => {
    const r = montarPedidoDeCredito(extra({ motivo: "  Seminário  " }));
    expect(r.erro).toBeNull();
    expect(r.pedido?.motivo).toBe("Seminário");
  });

  it("recusa acima do teto antes de gastar a ida ao servidor", () => {
    // `valor` e a coluna que o rank soma: um zero a mais viraria lider de turma.
    const r = montarPedidoDeCredito(extra({ valor: 500, tetoDeValor: 100 }));
    expect(r.erro).toBe("O máximo por crédito é 100 pontos.");
  });

  it("sem teto conhecido, deixa o banco decidir", () => {
    // O console pode nao ter conseguido ler `app_config`; recusar por um teto
    // que nao se conhece esconderia um credito legitimo.
    const r = montarPedidoDeCredito(extra({ valor: 500, tetoDeValor: null }));
    expect(r.erro).toBeNull();
  });

  it("presenca nao ganha exigencia de motivo", () => {
    const r = montarPedidoDeCredito(entrada({ tipo: "presenca_aula", motivo: null }));
    expect(r.erro).toBeNull();
    expect(r.pedido?.motivo).toBeNull();
  });
});

describe("descreverResultado", () => {
  it("conta quantos entraram", () => {
    expect(descreverResultado(20, 20)).toBe("20 alunos creditados.");
    expect(descreverResultado(1, 1)).toBe("1 aluno creditado.");
  });

  it("avisa quando parte ja tinha registro, para o professor nao clicar de novo", () => {
    expect(descreverResultado(3, 20)).toBe(
      "3 alunos creditados. 17 já tinham esse registro.",
    );
    expect(descreverResultado(19, 20)).toBe(
      "19 alunos creditados. 1 já tinha esse registro.",
    );
  });

  it("zero nao e falha: e o registro que ja existia", () => {
    expect(descreverResultado(0, 20)).toBe("Todos já tinham esse registro.");
    expect(descreverResultado(0, 1)).toBe("Esse aluno já tinha esse registro.");
  });
});

describe("argumentosDaRpc", () => {
  it("usa os nomes que o banco espera", () => {
    const r = montarPedidoDeCredito(entrada({ alunosSelecionados: ["a", "b"], valor: 10 }));
    expect(r.erro).toBeNull();
    if (!r.pedido) return;

    expect(argumentosDaRpc(r.pedido)).toEqual({
      p_classe_id: 32,
      p_alunos: ["a", "b"],
      p_tipo: "presenca_aula",
      p_valor: 10,
      p_data: "2026-09-09",
      p_motivo: null,
    });
  });

  it("leva o motivo do ponto extra", () => {
    const r = montarPedidoDeCredito(
      entrada({ tipo: "participacao_extra", valor: 8, motivo: "Seminário" }),
    );
    expect(r.pedido && argumentosDaRpc(r.pedido).p_motivo).toBe("Seminário");
  });
});

describe("agruparHistorico", () => {
  function linha(patch: Partial<LinhaDoHistorico> = {}): LinhaDoHistorico {
    return {
      id: 1,
      aluno_id: "a1",
      nome_aluno: "Ana",
      tipo: "presenca_aula",
      valor: 10,
      motivo: null,
      data_credito: "2026-09-09",
      ...patch,
    };
  }

  it("junta a turma inteira num lote so", () => {
    // Uma concessao vira uma linha POR ALUNO. Listar linha a linha faria o
    // professor rolar trinta itens para ver uma unica chamada de presenca.
    const grupos = agruparHistorico([
      linha({ id: 1, aluno_id: "a1", nome_aluno: "Ana" }),
      linha({ id: 2, aluno_id: "a2", nome_aluno: "Bruno" }),
      linha({ id: 3, aluno_id: "a3", nome_aluno: "Caio" }),
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].alunos).toBe(3);
    expect(grupos[0].pontos).toBe(30);
    expect(grupos[0].nomes).toEqual(["Ana", "Bruno", "Caio"]);
  });

  it("separa dois creditos do mesmo dia por motivo", () => {
    // E o caso que o slug na referencia existe para permitir: duas atividades
    // em sala no mesmo dia sao dois lotes.
    const grupos = agruparHistorico([
      linha({ tipo: "participacao_extra", motivo: "Exercício", valor: 5 }),
      linha({ tipo: "participacao_extra", motivo: "Seminário", valor: 8 }),
    ]);

    expect(grupos).toHaveLength(2);
    expect(grupos.map((g) => g.motivo).sort()).toEqual(["Exercício", "Seminário"]);
  });

  it("separa por tipo mesmo no mesmo dia", () => {
    const grupos = agruparHistorico([
      linha({ tipo: "presenca_aula" }),
      linha({ tipo: "participacao_aula" }),
    ]);
    expect(grupos).toHaveLength(2);
  });

  it("mais recente primeiro", () => {
    const grupos = agruparHistorico([
      linha({ data_credito: "2026-09-02" }),
      linha({ data_credito: "2026-09-09", tipo: "participacao_aula" }),
    ]);
    expect(grupos[0].data).toBe("2026-09-09");
  });

  it("linha sem data nao derruba o agrupamento", () => {
    const grupos = agruparHistorico([linha({ data_credito: null })]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].data).toBe("");
  });

  it("valor nao numerico nao contamina a soma", () => {
    const grupos = agruparHistorico([
      linha({ valor: 10 }),
      linha({ id: 2, aluno_id: "a2", valor: null }),
    ]);
    expect(grupos[0].pontos).toBe(10);
  });

  it("lista vazia devolve lista vazia", () => {
    expect(agruparHistorico([])).toEqual([]);
  });
});

describe("rotularTipo", () => {
  it("traduz os tres tipos concedidos", () => {
    expect(rotularTipo("presenca_aula")).toBe("Presença");
    expect(rotularTipo("participacao_aula")).toBe("Participação");
    expect(rotularTipo("participacao_extra")).toBe("Atividade em sala");
  });

  it("tipo desconhecido aparece cru em vez de sumir", () => {
    expect(rotularTipo("outro_qualquer")).toBe("outro_qualquer");
  });
});
