import { describe, expect, it } from "vitest";

import {
  acharMetrica,
  categoriaDaMetrica,
  derivarTipo,
  descreverConquista,
  METRICAS,
  montarConquista,
  PERFIS_BRAINHEX,
  type EntradaDeConquista,
} from "./conquistaDaTurma";

function entrada(patch: Partial<EntradaDeConquista> = {}): EntradaDeConquista {
  return {
    classeId: 32,
    nome: "Maratonista da turma",
    descricao: "Estude bastante",
    metrica: "minutos_totais",
    limiar: 300,
    pontos: 25,
    escopo: "comum",
    perfilAlvo: null,
    ...patch,
  };
}

describe("a lista de métricas é fechada", () => {
  it("só aceita métrica que o motor sabe avaliar", () => {
    // É a regra central da #158, e é de correção: métrica que o gatilho não
    // conhece vira conquista MORTA — cadastrada com sucesso, nunca destravada,
    // sem nada avisando. Foi assim que 21 das 27 ficaram paradas.
    const r = montarConquista(entrada({ metrica: "aluno_simpatico" }));
    expect(r.erro).toBe("Escolha uma métrica da lista.");
    expect(r.linha).toBeNull();
  });

  it("todas as métricas oferecidas estão na lista suportada pelo banco", () => {
    // Espelho de `fn_conquista_metrica_suportada`. Se divergir, o CHECK do
    // banco recusa o cadastro e o professor vê um erro que não explica nada.
    const suportadas = new Set([
      "eventos_totais",
      "eventos_do_tipo",
      "atividades_concluidas",
      "topicos_concluidos",
      "topicos_visitados",
      "dias_seguidos",
      "minutos_totais",
      "acertos_percentual",
      "trilha_percentual",
      "atividade_rapida",
      "atividades_rapidas",
    ]);

    for (const m of METRICAS) {
      expect(suportadas.has(m.metrica), m.metrica).toBe(true);
    }
  });

  it("cada métrica declara a chave do limiar como o gatilho a lê", () => {
    // O gatilho lê `criterio->>'minimo'`, `->>'dias_seguidos'` e afins. Chave
    // errada faz `COALESCE(..., 0)` valer zero — e a conquista destrava para
    // todo mundo no primeiro evento.
    const porMetrica = Object.fromEntries(
      METRICAS.map((m) => [m.metrica, m.chaveDoLimiar]),
    );

    expect(porMetrica.atividades_concluidas).toBe("minimo");
    expect(porMetrica.topicos_visitados).toBe("visitados");
    expect(porMetrica.dias_seguidos).toBe("dias_seguidos");
    expect(porMetrica.minutos_totais).toBe("minutos");
    expect(porMetrica.acertos_percentual).toBe("percentual");
    expect(porMetrica.atividade_rapida).toBe("max_tempo");
  });

  it("acharMetrica devolve null para o que não conhece", () => {
    expect(acharMetrica("nao_existe")).toBeNull();
    expect(acharMetrica(null)).toBeNull();
    expect(acharMetrica("dias_seguidos")?.rotulo).toBe("Dias seguidos de estudo");
  });
});

describe("montarConquista", () => {
  it("monta o critério com a métrica e a chave certa", () => {
    const r = montarConquista(entrada());
    expect(r.erro).toBeNull();
    expect(r.linha?.criterio).toEqual({ metrica: "minutos_totais", minutos: 300 });
  });

  it("a conquista nasce presa à turma", () => {
    const r = montarConquista(entrada());
    expect(r.linha?.classe_id).toBe(32);
  });

  it("sem turma não monta", () => {
    expect(montarConquista(entrada({ classeId: null })).erro).not.toBeNull();
  });

  it("exige nome, porque é o que o aluno vê na medalha", () => {
    expect(montarConquista(entrada({ nome: "  " })).erro).not.toBeNull();
    expect(montarConquista(entrada({ nome: "ab" })).erro).not.toBeNull();
  });

  it("recusa limiar fora da faixa da métrica", () => {
    // 100000 minutos é mais que dois meses de app aberto sem parar.
    expect(montarConquista(entrada({ limiar: 999999 })).erro).not.toBeNull();
    expect(montarConquista(entrada({ limiar: 0 })).erro).not.toBeNull();
  });

  it("exige limiar", () => {
    expect(montarConquista(entrada({ limiar: null })).erro).not.toBeNull();
  });

  it("recusa acima do teto antes de gastar a ida ao servidor", () => {
    // O valor entra no razão como evento creditado, sem passar por
    // `fn_pontos_do_evento`.
    const r = montarConquista(entrada({ pontos: 5000, tetoDePontos: 200 }));
    expect(r.erro).toBe("O máximo por conquista é 200 pontos.");
  });

  it("sem teto conhecido, deixa o banco decidir", () => {
    const r = montarConquista(entrada({ pontos: 5000, tetoDePontos: null }));
    expect(r.erro).toBeNull();
  });

  it("pontos zero passa: conquista pode ser só simbólica", () => {
    const r = montarConquista(entrada({ pontos: 0 }));
    expect(r.erro).toBeNull();
    expect(r.linha?.pontos_recompensa).toBe(0);
  });

  it("pontos negativos não passam", () => {
    expect(montarConquista(entrada({ pontos: -5 })).erro).not.toBeNull();
  });
});

describe("escopo por perfil", () => {
  it("exige um perfil BrainHex válido", () => {
    const r = montarConquista(entrada({ escopo: "perfil", perfilAlvo: "guerreiro" }));
    expect(r.erro).toBe("Escolha o perfil BrainHex desta conquista.");
  });

  it("aceita os sete perfis", () => {
    for (const perfil of PERFIS_BRAINHEX) {
      const r = montarConquista(entrada({ escopo: "perfil", perfilAlvo: perfil }));
      expect(r.erro, perfil).toBeNull();
      expect(r.linha?.perfil_alvo).toBe(perfil);
    }
  });

  it("escopo comum zera o perfil alvo", () => {
    // O CHECK do banco exige `escopo='comum' AND perfil_alvo IS NULL`: mandar
    // os dois preenchidos falha na gravação, longe do formulário.
    const r = montarConquista(entrada({ escopo: "comum", perfilAlvo: "seeker" }));
    expect(r.linha?.perfil_alvo).toBeNull();
  });

  it("perfil vem normalizado em minúsculas", () => {
    const r = montarConquista(entrada({ escopo: "perfil", perfilAlvo: "SEEKER" }));
    expect(r.linha?.perfil_alvo).toBe("seeker");
  });
});

describe("derivarTipo", () => {
  it("tira acento e vira chave", () => {
    expect(derivarTipo("Maratonista da Ação")).toBe("maratonista_da_acao");
  });

  it("resolve nome repetido dentro da turma com sufixo", () => {
    // `tipo` é único POR TURMA desde a 20260911_06. Sem o sufixo, cadastrar
    // duas conquistas com o mesmo nome falharia com erro de chave duplicada,
    // que não diz nada ao professor.
    expect(derivarTipo("Leitor", ["leitor"])).toBe("leitor_2");
    expect(derivarTipo("Leitor", ["leitor", "leitor_2"])).toBe("leitor_3");
  });

  it("nome só de símbolos ainda gera chave", () => {
    expect(derivarTipo("!!! ???")).toBe("conquista");
  });

  it("não passa de 40 caracteres", () => {
    expect(derivarTipo("a".repeat(120)).length).toBeLessThanOrEqual(40);
  });

  it("não deixa underscore sobrando nas pontas", () => {
    expect(derivarTipo("  Leitor Voraz  ")).toBe("leitor_voraz");
  });
});

describe("categoriaDaMetrica", () => {
  it("escopo por perfil manda na categoria", () => {
    expect(categoriaDaMetrica("minutos_totais", "perfil")).toBe("perfil_brainhex");
  });

  it("hábito, desempenho e progresso saem da métrica", () => {
    // A categoria agrupa a biblioteca do aluno e é conjunto fechado: pedir ao
    // professor seria mais um campo para errar, e categoria errada some do
    // agrupamento sem erro nenhum.
    expect(categoriaDaMetrica("dias_seguidos", "comum")).toBe("habito");
    expect(categoriaDaMetrica("acertos_percentual", "comum")).toBe("desempenho");
    expect(categoriaDaMetrica("atividades_concluidas", "comum")).toBe("progresso");
  });

  it("toda métrica oferecida cai numa categoria conhecida", () => {
    const validas = new Set(["desempenho", "habito", "perfil_brainhex", "progresso"]);
    for (const m of METRICAS) {
      expect(validas.has(categoriaDaMetrica(m.metrica, "comum")), m.metrica).toBe(true);
    }
  });
});

describe("descreverConquista", () => {
  it("descreve o que foi montado, para conferir antes de salvar", () => {
    const r = montarConquista(entrada());
    expect(r.linha && descreverConquista(r.linha)).toBe(
      "Minutos acumulados: 300. Vale 25 pontos.",
    );
  });

  it("diz o perfil quando há um", () => {
    const r = montarConquista(
      entrada({ escopo: "perfil", perfilAlvo: "mastermind", pontos: 30 }),
    );
    expect(r.linha && descreverConquista(r.linha)).toContain("perfil mastermind");
  });
});
