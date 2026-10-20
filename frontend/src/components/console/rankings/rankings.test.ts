import { describe, expect, it } from "vitest";
import {
  CRITERIOS,
  NATUREZA_DO_CRITERIO,
  PERIODO_MAX,
  avisoDoPeriodo,
  dataDoFechamento,
  detalheDaExclusao,
  mensagemDaExclusao,
  estaAberto,
  mensagemDoNovoPeriodo,
  periodosDoMesmoRanking,
  proximoPeriodo,
  separarPorPeriodo,
  validarNovoPeriodo,
  criterioValido,
  formatarPontos,
  oQueOTipoMede,
  perfisDominantes,
  periodoSugerido,
  podio,
  rotuloDoCriterio,
  validarRanking,
  type FormularioDeRanking,
} from "./rankings";

const p = (n: number) => ({ aluno_id: `a${n}`, aluno_nome: `Aluno ${n}`, posicao: n, pontuacao: n * 10 });

describe("podio", () => {
  it("ordena visualmente 2º, 1º, 3º", () => {
    expect(podio([p(1), p(2), p(3), p(4)]).map((x) => x.aluno?.aluno_id)).toEqual(["a2", "a1", "a3"]);
  });
  it("mantém a coluna quando faltam alunos", () => {
    const r = podio([p(1)]);
    expect(r.map((x) => x.lugar)).toEqual([2, 1, 3]);
    expect(r[0].aluno).toBeNull();
  });
});

describe("critério", () => {
  it("desconhecido vira pontuação", () => expect(criterioValido("xyz")).toBe("pontuacao"));
  // `percentual` é o `rank_tipo` 1 do banco ("Percentual Concluído") e o mobile já o trata
  // como percentual. Faltando no vocabulário do console, caía no fallback e o mesmo ranking
  // aparecia como "pontuação" para o professor e como percentual para o aluno.
  it("percentual é reconhecido, não cai no fallback", () => {
    expect(criterioValido("percentual")).toBe("percentual");
    expect(rotuloDoCriterio("percentual")).toBe("percentual");
  });
  it("os critérios do banco todos se reconhecem", () => {
    for (const c of ["percentual", "pontuacao", "tempo"]) expect(criterioValido(c)).toBe(c);
  });
  it("rótulo em minúsculas", () => expect(rotuloDoCriterio("tempo")).toBe("tempo"));

  // Esta lista espelha o `CASE rt.criterio` de `vw_rank_posicoes_por_classe_todas`, que
  // termina em `ELSE 0`: critério fora do CASE ranqueia a turma inteira em zero, em silêncio.
  // Os cinco entraram na view em `20261021_06` — medido antes: ranking de `acertos` mostrava
  // zero para todos, e `percentual` era reescrito para `pontuacao` ao abrir a edição.
  it.each(["pontuacao", "tempo", "acertos", "percentual", "ranqueada", "missoes", "elo"])(
    "%s é expressável e não é reescrito",
    (chave) => {
      expect(CRITERIOS.map((c) => c.chave)).toContain(chave);
      expect(criterioValido(chave)).toBe(chave);
    },
  );

  it("todo critério da lista tem rótulo", () => {
    for (const { chave, rotulo } of CRITERIOS) {
      expect(rotulo.trim(), `${chave} sem rótulo`).not.toBe("");
    }
  });
});

describe("perfisDominantes", () => {
  it("escolhe a maior afinidade e ignora perfil desconhecido", () => {
    const m = perfisDominantes([
      { aluno_id: "a", afinidade: 30, perfil: { nome: "Seeker" } },
      { aluno_id: "a", afinidade: 70, perfil: { nome: "Achiever" } },
      { aluno_id: "b", afinidade: 90, perfil: { nome: "Outro" } },
    ]);
    expect(m.get("a")).toBe("achiever");
    expect(m.has("b")).toBe(false);
  });
});

describe("formatarPontos", () => {
  it("nulo vira traço", () => expect(formatarPontos(null)).toBe("—"));
  it("separa milhar", () => expect(formatarPontos(2940)).toBe("2.940"));
});

describe("criar e editar um ranking (fase 5)", () => {
  const form = (extra: Partial<FormularioDeRanking> = {}): FormularioDeRanking => ({ tipo_id: "14", classe_id: "65", periodo: " 2026.2 ", ...extra });
  const existente = { id: 14, tipo_id: 2, classe_id: 65, periodo: "2026.2" };

  it("monta o payload com o período sem espaços", () => {
    expect(validarRanking(form(), [existente])).toEqual({ ok: true, payload: { tipo_id: 14, classe_id: 65, periodo: "2026.2" } });
  });

  it("turma é obrigatória — 'Geral' dava 42501 no INSERT e a view não teria aluno nenhum", () => {
    const r = validarRanking(form({ classe_id: "" }), []);
    expect(r.ok).toBe(false);
    if ("erros" in r) expect(r.erros.classe_id).toBeTruthy();
  });

  it("tipo e período obrigatórios; período com teto", () => {
    const r = validarRanking(form({ tipo_id: "", periodo: "  " }), []);
    expect(r.ok).toBe(false);
    if ("erros" in r) {
      expect(r.erros.tipo_id).toBeTruthy();
      expect(r.erros.periodo).toBeTruthy();
    }
    const longo = validarRanking(form({ periodo: "x".repeat(PERIODO_MAX + 1) }), []);
    expect(longo.ok).toBe(false);
  });

  it("recusa um segundo ranking aberto do mesmo tipo na turma (o banco tem índice único)", () => {
    const r = validarRanking(form({ tipo_id: "2", periodo: "2027.1" }), [existente]);
    expect(r.ok).toBe(false);
    if ("erros" in r) expect(r.erros.tipo_id).toMatch(/Novo período/);
  });

  it("recusa duplicata de tipo, turma e período (sem diferenciar maiúsculas e espaços)", () => {
    const fechado = { ...existente, fim: "2026-10-20T03:00:00Z" };
    const r = validarRanking(form({ tipo_id: "2", periodo: " 2026.2" }), [fechado]);
    expect(r.ok).toBe(false);
    if ("erros" in r) expect(r.erros.periodo).toMatch(/Já existe/);
    // Período fechado com outro nome, outro tipo ou outra turma: pode.
    expect(validarRanking(form({ tipo_id: "2", periodo: "2027.1" }), [fechado]).ok).toBe(true);
    expect(validarRanking(form({ tipo_id: "15" }), [existente]).ok).toBe(true);
    expect(validarRanking(form({ tipo_id: "2", classe_id: "66" }), [existente]).ok).toBe(true);
  });

  it("editar o próprio ranking não conta como duplicata", () => {
    expect(validarRanking(form({ tipo_id: "2" }), [existente], 14).ok).toBe(true);
  });

  it("período sugerido: ano.semestre no fuso de Brasília", () => {
    expect(periodoSugerido(new Date("2026-10-20T12:00:00Z"))).toBe("2026.2");
    expect(periodoSugerido(new Date("2026-03-01T12:00:00Z"))).toBe("2026.1");
    // 01/07 01:00 UTC ainda é 30/06 22:00 em São Paulo: primeiro semestre.
    expect(periodoSugerido(new Date("2026-07-01T01:00:00Z"))).toBe("2026.1");
  });

  it("cada critério diz se soma eventos ou mostra o estado atual", () => {
    for (const { chave } of CRITERIOS) expect(NATUREZA_DO_CRITERIO[chave]).toBeDefined();
    expect(NATUREZA_DO_CRITERIO.ranqueada).toBe("soma");
    expect(NATUREZA_DO_CRITERIO.missoes).toBe("soma");
    expect(NATUREZA_DO_CRITERIO.percentual).toBe("estado");
    expect(avisoDoPeriodo("missoes")).toMatch(/Novo período/);
    expect(avisoDoPeriodo("percentual")).toMatch(/progresso atual/);
    // Elo é estado: o rating de agora não reinicia com o período.
    expect(NATUREZA_DO_CRITERIO.elo).toBe("estado");
    expect(avisoDoPeriodo("elo")).toMatch(/não reinicia o rating/);
    expect(oQueOTipoMede({ criterio: "elo", descricao: null })).toMatch(/Elo.*1000/);
  });

  it("o que o tipo mede: a descrição do catálogo vence, e sem ela há texto por critério", () => {
    expect(oQueOTipoMede({ criterio: "ranqueada", descricao: " Arena " })).toBe("Arena");
    expect(oQueOTipoMede({ criterio: "missoes", descricao: null })).toMatch(/missões/);
    expect(oQueOTipoMede({ criterio: "xyz", descricao: "" })).toMatch(/Pontos/);
  });
});

describe("novo período e histórico (rotação manual)", () => {
  const r = (id: number, periodo: string | null, fim: string | null = null, tipo_id = 2, classe_id = 65) => ({ id, tipo_id, classe_id, periodo, fim });

  it("aberto é fim nulo; sem a coluna (antes da migration) tudo está aberto", () => {
    expect(estaAberto({ fim: null })).toBe(true);
    expect(estaAberto({})).toBe(true);
    expect(estaAberto({ fim: "2026-10-20T03:00:00Z" })).toBe(false);
  });

  it("sugere o semestre seguinte, mantendo o separador", () => {
    expect(proximoPeriodo("2026.2")).toBe("2027.1");
    expect(proximoPeriodo("2026.1")).toBe("2026.2");
    expect(proximoPeriodo("2026/2")).toBe("2027/1");
  });

  it("formato livre cai no semestre corrente; nome já usado avança", () => {
    const agora = new Date("2026-10-20T12:00:00Z");
    expect(proximoPeriodo("Bimestre 3", [], agora)).toBe("2026.2");
    expect(proximoPeriodo("2026.2", ["2027.1"])).toBe("2027.2");
    expect(proximoPeriodo("Turma A", ["2026.2"], agora)).toBe("2027.1");
  });

  it("valida o nome do período novo", () => {
    expect(validarNovoPeriodo("  ", [])).toMatch(/nome/);
    expect(validarNovoPeriodo("x".repeat(PERIODO_MAX + 1), [])).toMatch(/caracteres/);
    expect(validarNovoPeriodo(" 2026.2 ", ["2026.2"])).toMatch(/já teve/);
    expect(validarNovoPeriodo("2027.1", ["2026.2"])).toBeNull();
  });

  it("os períodos usados são os do mesmo tipo e turma", () => {
    const todos = [r(14, "2026.2", "2026-10-20T03:00:00Z"), r(31, "2027.1"), r(40, "x", null, 1), r(41, "y", null, 2, 66)];
    expect(periodosDoMesmoRanking(r(31, "2027.1"), todos)).toEqual(["2026.2", "2027.1"]);
  });

  it("separa abertos e histórico, o fechado mais recente primeiro", () => {
    const { abertos, historico } = separarPorPeriodo([
      r(1, "2025.2", "2026-01-01T00:00:00Z"),
      r(2, "2026.2"),
      r(3, "2026.1", "2026-07-01T00:00:00Z"),
    ]);
    expect(abertos.map((x) => x.id)).toEqual([2]);
    expect(historico.map((x) => x.id)).toEqual([3, 1]);
  });

  it("data do fechamento no fuso de Brasília", () => {
    // 03:00 UTC de 20/10 ainda é meia-noite em São Paulo; 02:59 UTC é 19/10.
    expect(dataDoFechamento("2026-10-20T03:00:00Z")).toBe("20/10/2026");
    expect(dataDoFechamento("2026-10-20T02:59:00Z")).toBe("19/10/2026");
    expect(dataDoFechamento(null)).toBe("");
  });

  it("traduz os erros da RPC", () => {
    expect(mensagemDoNovoPeriodo({ code: "23505" })).toMatch(/já teve/);
    expect(mensagemDoNovoPeriodo({ code: "55000" })).toMatch(/encerrado/);
    expect(mensagemDoNovoPeriodo({ code: "42501" })).toMatch(/permissão/);
    expect(mensagemDoNovoPeriodo({ code: "PGRST202" })).toMatch(/banco/);
    expect(mensagemDoNovoPeriodo(null)).toMatch(/Não foi possível/);
  });
});

describe("excluir ranking com histórico", () => {
  const aberto = { id: 31, tipo_id: 2, classe_id: 65, periodo: "2027.1", fim: null };
  const fechado = { id: 14, tipo_id: 2, classe_id: 65, periodo: "2026.2", fim: "2026-10-20T03:00:00Z" };

  it("o banco recusa excluir período encerrado (42501) e a tela diz por quê", () => {
    expect(mensagemDaExclusao({ code: "42501" })).toMatch(/histórico/);
    expect(mensagemDaExclusao({ code: "XX000" })).toMatch(/Não foi possível/);
    expect(mensagemDaExclusao(null)).toMatch(/Não foi possível/);
  });

  it("excluir o aberto avisa que o histórico fica, quando há histórico", () => {
    expect(detalheDaExclusao(aberto, [aberto, fechado])).toMatch(/continuam no histórico/);
    expect(detalheDaExclusao(aberto, [aberto, { ...fechado, classe_id: 66 }])).not.toMatch(/histórico/);
    expect(detalheDaExclusao(aberto, [aberto])).not.toMatch(/histórico/);
  });
});
