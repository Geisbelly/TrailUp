import { describe, expect, it } from "vitest";
import {
  deltaDeAcertos,
  deltaDeEntregas,
  idDaAtividade,
  mudancasRelevantes,
  segundaDaSemana,
  semanasAte,
  serieSemanal,
  type PontoSemanal,
} from "./evolucao";

describe("segundaDaSemana e semanasAte", () => {
  it("semana começa na segunda", () => {
    expect(segundaDaSemana("2026-09-28T02:00:00")).toBe("2026-09-28"); // segunda
    expect(segundaDaSemana("2026-09-27T23:59:00")).toBe("2026-09-21"); // domingo
    expect(segundaDaSemana("2026-09-30")).toBe("2026-09-28"); // quarta
  });

  it("últimas n semanas até a atual, em ordem", () => {
    expect(semanasAte(new Date("2026-09-30T12:00:00Z"), 3)).toEqual(["2026-09-14", "2026-09-21", "2026-09-28"]);
  });
});

describe("idDaAtividade", () => {
  it("lê atividade:<id> e ignora o resto", () => {
    expect(idDaAtividade("atividade:1090")).toBe(1090);
    expect(idDaAtividade("conteudo:3")).toBeNull();
    expect(idDaAtividade(null)).toBeNull();
  });
});

describe("serieSemanal", () => {
  const semanas = ["2026-09-14", "2026-09-21", "2026-09-28"];
  const eventos = [
    { aluno_id: "a", tipo: "atividade_acertada", referencia: "atividade:1", criado_em: "2026-09-21T10:00:00" },
    { aluno_id: "a", tipo: "atividade_errada", referencia: "atividade:1", criado_em: "2026-09-22T10:00:00" },
    { aluno_id: "b", tipo: "atividade_acertada", referencia: "atividade:2", criado_em: "2026-09-27T23:00:00" },
    { aluno_id: "fora", tipo: "atividade_acertada", referencia: "atividade:1", criado_em: "2026-09-21T10:00:00" },
    { aluno_id: "a", tipo: "atividade_acertada", referencia: "atividade:99", criado_em: "2026-09-21T10:00:00" },
    { aluno_id: "a", tipo: "atividade_revisada", referencia: "atividade:1", criado_em: "2026-09-21T10:00:00" },
    { aluno_id: "a", tipo: "atividade_acertada", referencia: "atividade:1", criado_em: "2026-08-01T10:00:00" },
  ];
  const serie = serieSemanal(eventos, semanas, new Set([1, 2]), new Set(["a", "b"]));

  it("conta respostas da turma por semana e calcula acertos", () => {
    expect(serie[1]).toEqual({ semana: "2026-09-21", rotulo: "21/09", entregas: 3, acertosPct: (2 / 3) * 100 });
  });

  it("semana sem resposta: zero entregas e acertos ausente (null), não zero", () => {
    expect(serie[0]).toMatchObject({ entregas: 0, acertosPct: null });
    expect(serie[2]).toMatchObject({ entregas: 0, acertosPct: null });
  });
});

describe("deltas", () => {
  const ponto = (entregas: number, acertosPct: number | null): PontoSemanal => ({ semana: "", rotulo: "", entregas, acertosPct });

  it("entregas: variação percentual da última semana sobre a anterior", () => {
    expect(deltaDeEntregas([ponto(10, 50), ponto(8, 60)])).toMatchObject({ texto: "−20%", tom: "ruim" });
    expect(deltaDeEntregas([ponto(4, 50), ponto(6, 60)])).toMatchObject({ texto: "+50%", tom: "bom" });
    expect(deltaDeEntregas([ponto(0, null), ponto(6, 60)])).toBeNull();
  });

  it("acertos: diferença em pontos; sem valor em uma das semanas, sem delta", () => {
    expect(deltaDeAcertos([ponto(4, 50), ponto(6, 60)])).toMatchObject({ texto: "+10 pts", tom: "bom" });
    expect(deltaDeAcertos([ponto(4, null), ponto(6, 60)])).toBeNull();
  });
});

describe("mudancasRelevantes", () => {
  const topicos = [
    { id: 131, nome: "Introdução", created_at: "2026-08-20T10:00:00" },
    { id: 132, nome: "Aula 2", created_at: "2026-09-25T10:00:00" },
  ];

  it("jobs concluídos e tópicos criados na janela, agrupando o mesmo job no mesmo dia", () => {
    const jobs = [
      { kind: "manual_profile_generate", topico_id: 131, finished_at: "2026-09-23T00:35:19+00:00" },
      { kind: "manual_profile_generate", topico_id: 131, finished_at: "2026-09-23T00:29:20+00:00" },
      { kind: "class_theme_sync", topico_id: null, finished_at: "2026-09-05T13:25:34+00:00" },
      { kind: "full_sync", topico_id: null, finished_at: "2026-07-01T10:00:00+00:00" },
      { kind: "kind_novo", topico_id: null, finished_at: null },
    ];
    expect(mudancasRelevantes(jobs, topicos, "2026-09-01")).toEqual([
      { data: "2026-09-25", etiqueta: "Estrutura", titulo: "Tópico criado na trilha", detalhe: "Aula 2" },
      { data: "2026-09-23", etiqueta: "Material", titulo: "Material regerado para um perfil", detalhe: "Introdução · 2 vezes" },
      { data: "2026-09-05", etiqueta: "Material", titulo: "Tema da turma aplicado ao material", detalhe: null },
    ]);
  });

  it("tópicos criados no mesmo dia viram uma linha só", () => {
    const mesmoDia = [
      { id: 1, nome: "Introdução", created_at: "2026-08-27T10:00:00" },
      { id: 2, nome: "Aula 2", created_at: "2026-08-27T10:05:00" },
    ];
    expect(mudancasRelevantes([], mesmoDia, "2026-08-01")).toEqual([
      { data: "2026-08-27", etiqueta: "Estrutura", titulo: "2 tópicos criados na trilha", detalhe: "Introdução, Aula 2" },
    ]);
  });

  it("kind desconhecido aparece com o nome cru, sem inventar título", () => {
    const r = mudancasRelevantes([{ kind: "kind_novo", topico_id: null, finished_at: "2026-09-10T00:00:00Z" }], [], "2026-09-01");
    expect(r[0].titulo).toBe("kind_novo");
  });
});
