import { describe, expect, it } from "vitest";
import { percentual, quemPrecisaDeEmpurrao, resumoEmFrase, rotuloDasGuildas, type AlunoNoEvento, type PainelDurante } from "./durante";

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
