import { describe, expect, it } from "vitest";
import { contarPendentes, diasDeEspera, estadoDaEntrega, filtrarFila, ordenarFila, rotuloDeEspera, vizinhas, type LinhaDaFila } from "./fila";

const AGORA = new Date(2026, 9, 16, 10, 0);
const dia = (n: number) => new Date(2026, 9, 16 - n, 12, 0).toISOString();

const linha = (extra: Partial<LinhaDaFila> = {}): LinhaDaFila => ({
  alunoId: "a1",
  alunoNome: "Ana",
  atividadeId: 1,
  topicoId: 10,
  titulo: "Explique a aceleração",
  enunciado: "Explique.",
  gabarito: null,
  resposta: "Minha resposta",
  entregueEm: dia(3),
  prazo: null,
  pontuacaoMaxima: 10,
  pontuacaoObtida: null,
  avaliadoEm: null,
  feedback: null,
  ...extra,
});

describe("estadoDaEntrega", () => {
  it("com resposta e sem avaliação é pendente", () => {
    expect(estadoDaEntrega(linha())).toBe("pendente");
  });
  it("já avaliada pelo professor é corrigida, mesmo que a IA tenha dado nota", () => {
    expect(estadoDaEntrega(linha({ avaliadoEm: dia(1), pontuacaoObtida: 8 }))).toBe("corrigida");
    expect(estadoDaEntrega(linha({ pontuacaoObtida: 8 }))).toBe("pendente");
  });
  it("sem resposta (ou só espaços) é sem_entrega", () => {
    expect(estadoDaEntrega(linha({ resposta: null }))).toBe("sem_entrega");
    expect(estadoDaEntrega(linha({ resposta: "   " }))).toBe("sem_entrega");
  });
});

describe("espera", () => {
  it("conta dias de calendário a partir da entrega", () => {
    expect(diasDeEspera(linha({ entregueEm: dia(3) }), AGORA)).toBe(3);
    expect(diasDeEspera(linha({ entregueEm: dia(0) }), AGORA)).toBe(0);
  });
  it("sem entrega usa o prazo; sem nenhum dos dois é zero; futuro não fica negativo", () => {
    expect(diasDeEspera(linha({ resposta: null, entregueEm: null, prazo: dia(5) }), AGORA)).toBe(5);
    expect(diasDeEspera(linha({ entregueEm: null, prazo: null }), AGORA)).toBe(0);
    expect(diasDeEspera(linha({ entregueEm: dia(-4) }), AGORA)).toBe(0);
  });
  it("rótulos distinguem entrega de prazo vencido", () => {
    expect(rotuloDeEspera(linha({ entregueEm: dia(1) }), AGORA)).toBe("entregue há 1 dia");
    expect(rotuloDeEspera(linha({ entregueEm: dia(0) }), AGORA)).toBe("entregue hoje");
    expect(rotuloDeEspera(linha({ resposta: null, entregueEm: null, prazo: dia(5) }), AGORA)).toBe("prazo venceu há 5 dias");
  });
});

describe("filtrarFila e ordenarFila", () => {
  const fila = [
    linha({ alunoId: "b", alunoNome: "Bia", entregueEm: dia(1) }),
    linha({ alunoId: "c", alunoNome: "Caio", entregueEm: dia(5) }),
    linha({ alunoId: "d", alunoNome: "Davi", avaliadoEm: dia(0) }),
    linha({ alunoId: "e", alunoNome: "Eva", resposta: null, entregueEm: null, prazo: dia(2) }),
    linha({ alunoId: "f", alunoNome: "Fábio", topicoId: 99, entregueEm: dia(9) }),
  ];

  it("pendentes inclui quem não entregou e exclui as corrigidas; a mais antiga primeiro", () => {
    const r = filtrarFila(fila, { topicoId: null, status: "pendentes" }, AGORA);
    expect(r.map((l) => l.alunoNome)).toEqual(["Fábio", "Caio", "Eva", "Bia"]);
  });

  it("corrigidas e todas", () => {
    expect(filtrarFila(fila, { topicoId: null, status: "corrigidas" }, AGORA).map((l) => l.alunoNome)).toEqual(["Davi"]);
    const todas = filtrarFila(fila, { topicoId: null, status: "todas" }, AGORA);
    expect(todas).toHaveLength(5);
    expect(todas[todas.length - 1].alunoNome).toBe("Davi"); // corrigida vai para o fim
  });

  it("filtra por tópico", () => {
    expect(filtrarFila(fila, { topicoId: 99, status: "todas" }, AGORA).map((l) => l.alunoNome)).toEqual(["Fábio"]);
  });

  it("empate de espera desempata pelo nome e não muta a entrada", () => {
    const copia = [...fila];
    const r = ordenarFila([linha({ alunoNome: "Zeca", alunoId: "z" }), linha({ alunoNome: "Ana" })], AGORA);
    expect(r.map((l) => l.alunoNome)).toEqual(["Ana", "Zeca"]);
    expect(fila).toEqual(copia);
  });
});

describe("contarPendentes e vizinhas", () => {
  it("conta pendentes e sem entrega", () => {
    expect(contarPendentes([linha(), linha({ resposta: null }), linha({ avaliadoEm: dia(1) })])).toBe(2);
  });

  it("anterior e próxima dentro da lista; pontas viram null; fora da lista também", () => {
    const l = [linha({ alunoId: "1" }), linha({ alunoId: "2" }), linha({ alunoId: "3" })];
    expect(vizinhas(l, l[1])).toEqual({ anterior: l[0], proxima: l[2] });
    expect(vizinhas(l, l[0]).anterior).toBeNull();
    expect(vizinhas(l, l[2]).proxima).toBeNull();
    expect(vizinhas(l, linha({ alunoId: "x" }))).toEqual({ anterior: null, proxima: null });
    expect(vizinhas(l, null)).toEqual({ anterior: null, proxima: null });
  });
});
