import { describe, expect, it } from "vitest";
import {
  duelosDoEvento,
  inscritosComNome,
  percentual,
  quemPrecisaDeEmpurrao,
  resumoDosDuelos,
  resumoDosInscritos,
  resumoEmFrase,
  rotuloDasGuildas,
  textoSemNinguemParaEmpurrar,
  type AlunoNoEvento,
  type PainelDurante,
} from "./durante";

const painel = (extra: Partial<PainelDurante> = {}): PainelDurante => ({
  total: 10,
  comecaram: 6,
  pararam: 1,
  naoComecaram: 4,
  guildasAtivas: 2,
  guildasTotal: 3,
  porModalidade: { individual: 6, guilda: 4 },
  alunos: [],
  ...extra,
});

const a = (nome: string, situacao: AlunoNoEvento["situacao"]): AlunoNoEvento => ({ alunoId: nome, nome, situacao });

describe("percentual", () => {
  it("arredonda, limita a 100 e não divide por zero", () => {
    expect(percentual(1, 3)).toBe(33);
    expect(percentual(5, 4)).toBe(100);
    expect(percentual(0, 0)).toBe(0);
  });
});

describe("quemPrecisaDeEmpurrao", () => {
  it("só quem parou ou não começou; quem parou primeiro, depois por nome", () => {
    const r = quemPrecisaDeEmpurrao([a("Zé", "nao_comecou"), a("Ana", "comecou"), a("Caio", "parou"), a("Bia", "nao_comecou")]);
    expect(r.map((x) => x.nome)).toEqual(["Caio", "Bia", "Zé"]);
  });

  it("lista vazia ou todos ativos dá vazio", () => {
    expect(quemPrecisaDeEmpurrao([])).toEqual([]);
    expect(quemPrecisaDeEmpurrao([a("Ana", "comecou")])).toEqual([]);
  });
});

describe("resumoEmFrase", () => {
  it("conta quem começou e cita quem falta, no singular e no plural", () => {
    expect(resumoEmFrase(painel())).toBe("6 de 10 alunos já participaram (60%). 4 ainda não começaram e 1 parou.");
    expect(resumoEmFrase(painel({ naoComecaram: 1, pararam: 2 }))).toBe("6 de 10 alunos já participaram (60%). 1 ainda não começou e 2 pararam.");
    expect(resumoEmFrase(painel({ naoComecaram: 0, pararam: 0, comecaram: 10 }))).toBe("10 de 10 alunos já participaram (100%). Todos estão ativos.");
  });

  it("turma vazia", () => {
    expect(resumoEmFrase(painel({ total: 0, comecaram: 0, naoComecaram: 0, pararam: 0 }))).toBe("Nenhum aluno matriculado nesta turma.");
  });
});

describe("rotuloDasGuildas", () => {
  it("sem guilda e com guilda", () => {
    expect(rotuloDasGuildas({ guildasAtivas: 0, guildasTotal: 0 })).toBe("Sem guildas neste evento");
    expect(rotuloDasGuildas({ guildasAtivas: 2, guildasTotal: 3 })).toBe("2 de 3 ativas");
  });
});

describe("inscritos no rank do evento", () => {
  it("põe o nome, ordena e deixa de fora quem já não está na turma", () => {
    const alunos = [a("Zé", "comecou"), a("Ana", "nao_comecou")];
    const r = inscritosComNome(
      [
        { alunoId: "Zé", inscritoEm: "t1" },
        { alunoId: "Ana", inscritoEm: "t2" },
        { alunoId: "saiu", inscritoEm: "t3" },
      ],
      alunos,
    );
    expect(r.map((x) => x.nome)).toEqual(["Ana", "Zé"]);
  });

  it("o resumo diz quantos entraram e que é opcional", () => {
    expect(resumoDosInscritos(0, 10)).toMatch(/Ninguém entrou/);
    expect(resumoDosInscritos(1, 10)).toMatch(/^1 aluno entrou no rank \(10% da turma\)/);
    expect(resumoDosInscritos(3, 10)).toMatch(/^3 alunos entraram/);
    expect(resumoDosInscritos(3, 10)).toMatch(/não muda nota nem XP/);
    expect(resumoDosInscritos(0, 0)).toMatch(/Nenhum aluno matriculado/);
  });
});

describe("duelos do evento (#154)", () => {
  const d = (eventoId: string | null, status: "aberto" | "encerrado", resultado: string | null = null) => ({ eventoId, status, resultado });

  it("conta só os do evento, separando jogados, aguardando e sem adversário", () => {
    const r = duelosDoEvento(
      [
        d("ev", "encerrado", "vitoria"),
        d("ev", "encerrado", "empate"),
        d("ev", "aberto"),
        d("ev", "encerrado", "sem_adversario"),
        d("outro", "encerrado", "vitoria"),
        d(null, "aberto"),
      ],
      "ev",
    );
    expect(r).toEqual({ total: 4, jogados: 2, aguardando: 1, semAdversario: 1 });
    expect(resumoDosDuelos(r, false)).toBe("4 duelos no evento: 2 jogados, 1 esperando o adversário aceitar, 1 sem adversário.");
  });

  it("sem duelo, e com a lista no limite", () => {
    expect(resumoDosDuelos(duelosDoEvento([], "ev"), false)).toBe("Nenhum duelo no evento ainda. Duelar é opcional: quem perde não perde ponto.");
    expect(resumoDosDuelos({ total: 1, jogados: 1, aguardando: 0, semAdversario: 0 }, true)).toBe(
      "1 duelo no evento: 1 jogado. A contagem olha os 40 duelos mais recentes da turma.",
    );
  });
});

describe("textoSemNinguemParaEmpurrar", () => {
  it("turma sem aluno não diz que todos participam", () => {
    expect(textoSemNinguemParaEmpurrar({ total: 0 })).toBe("Sem alunos matriculados para acompanhar.");
  });

  it("com alunos e ninguém para empurrar, diz que todos participam", () => {
    expect(textoSemNinguemParaEmpurrar({ total: 4 })).toBe("Ninguém por enquanto: todos estão participando.");
  });
});
