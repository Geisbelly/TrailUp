import { describe, expect, it } from "vitest";
import {
  FEEDBACK_PROTEGIDO,
  PONTO_PROTEGIDO,
  protegerAvaliacao,
  revelaRespostaEsperada,
} from "./protecaoDaResposta";

const ESPERADA =
  "A fração representa partes iguais de um inteiro: o denominador indica em quantas partes o inteiro foi dividido e o numerador quantas foram tomadas.";
const ALUNO = "Fração é quando a gente divide uma pizza.";

const avaliacao = (extra: Partial<Record<string, unknown>> = {}) => ({
  nota_obtida: 4,
  nota_maxima: 10,
  percentual: 40,
  correta: false,
  feedback: "Boa ideia inicial, mas faltou explicar o papel de cada número.",
  pontos_fortes: ["Você usou um exemplo do dia a dia."],
  pontos_melhoria: ["Explique o que cada número da fração significa."],
  ...extra,
});

describe("revelaRespostaEsperada", () => {
  it("pega a cópia de um trecho da resposta esperada, sem acento e com outra caixa", () => {
    const fala = "Faltou dizer que o DENOMINADOR indica em quantas partes o inteiro foi dividido.";
    expect(revelaRespostaEsperada(fala, ESPERADA, ALUNO)).toBe(true);
  });

  it("não conta o que o próprio aluno escreveu", () => {
    const aluno = "O denominador indica em quantas partes o inteiro foi dividido, tipo pizza.";
    const fala = "Você acertou: o denominador indica em quantas partes o inteiro foi dividido.";
    expect(revelaRespostaEsperada(fala, ESPERADA, aluno)).toBe(false);
  });

  it("deixa passar dica que não copia a resposta", () => {
    const fala = "Pense no que o número de baixo da fração está contando e releia o exemplo da pizza.";
    expect(revelaRespostaEsperada(fala, ESPERADA, ALUNO)).toBe(false);
  });

  it("resposta esperada curta não casa sozinha", () => {
    expect(revelaRespostaEsperada("Pense em 1/4 de uma pizza.", "1/4", "1/2")).toBe(false);
  });
});

describe("protegerAvaliacao", () => {
  it("troca o feedback que revela e mantém a nota", () => {
    const { avaliacao: protegida, trocados } = protegerAvaliacao(
      avaliacao({ feedback: "O certo era: o numerador quantas foram tomadas e o denominador indica em quantas partes o inteiro foi dividido." }),
      ESPERADA,
      ALUNO,
    );
    expect(protegida.feedback).toBe(FEEDBACK_PROTEGIDO);
    expect(protegida.nota_obtida).toBe(4);
    expect(trocados).toBe(1);
  });

  it("tira só o ponto que revela e repõe um neutro se a lista esvaziar", () => {
    const { avaliacao: protegida, trocados } = protegerAvaliacao(
      avaliacao({ pontos_melhoria: ["Diga que o denominador indica em quantas partes o inteiro foi dividido."] }),
      ESPERADA,
      ALUNO,
    );
    expect(protegida.pontos_melhoria).toEqual([PONTO_PROTEGIDO]);
    expect(protegida.pontos_fortes).toEqual(["Você usou um exemplo do dia a dia."]);
    expect(trocados).toBe(1);
  });

  it("remove a observação que revela", () => {
    const { avaliacao: protegida } = protegerAvaliacao(
      avaliacao({ observacao: "Gabarito: a fração representa partes iguais de um inteiro." }),
      ESPERADA,
      ALUNO,
    );
    expect(protegida).not.toHaveProperty("observacao");
  });

  it("sem resposta esperada, nada muda", () => {
    const original = avaliacao();
    expect(protegerAvaliacao(original, "", ALUNO)).toEqual({ avaliacao: original, trocados: 0 });
  });

  it("avaliação que só orienta passa inteira", () => {
    const original = avaliacao();
    expect(protegerAvaliacao(original, ESPERADA, ALUNO).trocados).toBe(0);
  });
});
