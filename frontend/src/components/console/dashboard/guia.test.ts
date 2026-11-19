import { describe, expect, it } from "vitest";
import {
  alunosParaOlhar,
  conceitosDificeis,
  FORA_DE_TOPICO,
  nomeDoTopico,
  normalizarAlunoTopico,
  normalizarConceito,
  normalizarTurmaTopico,
  resumir,
  textoAntesDepois,
  topicosNaOrdem,
  viewAusente,
  type GuiaAlunoTopico,
  type GuiaConceito,
  type GuiaTurmaTopico,
} from "./guia";

const topico = (p: Partial<GuiaTurmaTopico>): GuiaTurmaTopico => ({
  classe_id: 1,
  topico_id: 10,
  perguntas: 0,
  alunos: 0,
  duvidas_materia: 0,
  pedidos_resposta: 0,
  navegacao_app: 0,
  alunos_com_dificuldade: 0,
  alunos_travados: 0,
  ultima_em: null,
  ...p,
});

const aluno = (p: Partial<GuiaAlunoTopico>): GuiaAlunoTopico => ({
  classe_id: 1,
  aluno_id: "a",
  topico_id: 10,
  perguntas: 1,
  duvidas_materia: 0,
  pedidos_resposta: 0,
  com_dificuldade: 0,
  travado: 0,
  primeira_em: null,
  ultima_em: null,
  tentativas_antes: 0,
  acerto_antes_pct: null,
  tentativas_depois: 0,
  acerto_depois_pct: null,
  ...p,
});

const conceito = (p: Partial<GuiaConceito>): GuiaConceito => ({
  classe_id: 1,
  topico_id: 10,
  conceito: "mmc",
  mencoes: 1,
  alunos: 1,
  alunos_com_dificuldade: 1,
  ultima_em: null,
  ...p,
});

describe("resumir", () => {
  it("conta o aluno uma vez só, mesmo perguntando em vários tópicos", () => {
    const r = resumir(
      [topico({ perguntas: 3, pedidos_resposta: 1 }), topico({ topico_id: 11, perguntas: 2 }), topico({ topico_id: null, perguntas: 4 })],
      [aluno({ aluno_id: "a", travado: 1 }), aluno({ aluno_id: "a", topico_id: 11, travado: 2 }), aluno({ aluno_id: "b" })],
    );
    expect(r).toEqual({ perguntas: 9, alunosEmTopico: 2, pedidosResposta: 1, alunosTravados: 1 });
  });

  it("o mesmo aluno em duas turmas conta duas vezes: são matrículas diferentes", () => {
    expect(resumir([], [aluno({ classe_id: 1 }), aluno({ classe_id: 2 })]).alunosEmTopico).toBe(2);
  });
});

describe("conceitosDificeis", () => {
  it("ordena por alunos com dificuldade, depois menções, e tira quem ninguém achou difícil", () => {
    const saida = conceitosDificeis([
      conceito({ conceito: "razão", alunos_com_dificuldade: 1, mencoes: 5 }),
      conceito({ conceito: "mmc", alunos_com_dificuldade: 3, mencoes: 3 }),
      conceito({ conceito: "fração", alunos_com_dificuldade: 1, mencoes: 7 }),
      conceito({ conceito: "soma", alunos_com_dificuldade: 0, mencoes: 9 }),
    ]);
    expect(saida.map((c) => c.conceito)).toEqual(["mmc", "fração", "razão"]);
  });

  it("respeita o limite", () => {
    const muitos = Array.from({ length: 20 }, (_, i) => conceito({ conceito: `c${i}` }));
    expect(conceitosDificeis(muitos, 5)).toHaveLength(5);
  });
});

describe("topicosNaOrdem", () => {
  it("segue a trilha e deixa as perguntas fora de tópico por último", () => {
    const ordem = new Map([
      [11, 0],
      [10, 1],
    ]);
    const saida = topicosNaOrdem([topico({ topico_id: null }), topico({ topico_id: 10 }), topico({ topico_id: 99 }), topico({ topico_id: 11 })], ordem);
    expect(saida.map((t) => t.topico_id)).toEqual([11, 10, 99, null]);
  });
});

describe("alunosParaOlhar", () => {
  it("põe quem travou na frente, depois quem pediu a resposta", () => {
    const saida = alunosParaOlhar([
      aluno({ aluno_id: "muito", perguntas: 9 }),
      aluno({ aluno_id: "pediu", pedidos_resposta: 2 }),
      aluno({ aluno_id: "travou", travado: 1 }),
    ]);
    expect(saida.map((a) => a.aluno_id)).toEqual(["travou", "pediu", "muito"]);
  });
});

describe("textoAntesDepois", () => {
  it("mostra traço onde não houve tentativa", () => {
    expect(textoAntesDepois({ acerto_antes_pct: 40, tentativas_antes: 1, acerto_depois_pct: 80.4, tentativas_depois: 2 })).toBe("40% → 80%");
    expect(textoAntesDepois({ acerto_antes_pct: null, tentativas_antes: 0, acerto_depois_pct: 55, tentativas_depois: 1 })).toBe("— → 55%");
  });
});

describe("nomeDoTopico", () => {
  it("nomeia o tópico, o fora de tópico e o tópico que a turma não tem mais", () => {
    const nomes = new Map([[10, "Frações"]]);
    expect(nomeDoTopico(nomes, 10)).toBe("Frações");
    expect(nomeDoTopico(nomes, null)).toBe(FORA_DE_TOPICO);
    expect(nomeDoTopico(nomes, 7)).toBe("Tópico 7");
  });
});

describe("viewAusente", () => {
  it("reconhece a view que ainda não existe, e só ela", () => {
    expect(viewAusente({ code: "PGRST205", message: "Could not find the table 'public.vw_chat_guia_turma_topico'" })).toBe(true);
    expect(viewAusente({ code: "42P01", message: 'relation "public.vw_chat_guia_turma_topico" does not exist' })).toBe(true);
    expect(viewAusente({ code: "42501", message: "permission denied for view vw_chat_guia_turma_topico" })).toBe(false);
    expect(viewAusente(null)).toBe(false);
  });
});

describe("normalizar", () => {
  it("converte bigint e numeric que chegam como texto", () => {
    expect(normalizarTurmaTopico({ classe_id: "1", topico_id: null, perguntas: "3", alunos: "2" })).toMatchObject({
      classe_id: 1,
      topico_id: null,
      perguntas: 3,
      alunos: 2,
      pedidos_resposta: 0,
    });
    expect(normalizarConceito({ classe_id: 1, topico_id: "10", conceito: "mmc", mencoes: "2" })).toMatchObject({ topico_id: 10, mencoes: 2 });
    expect(normalizarAlunoTopico({ aluno_id: "x", topico_id: 10, acerto_antes_pct: "40.0", acerto_depois_pct: null })).toMatchObject({
      acerto_antes_pct: 40,
      acerto_depois_pct: null,
    });
  });
});
