import { describe, expect, it } from "vitest";
import { appPodeEstarDesatualizado, MENSAGEM_DO_AVISO } from "./avisoDeAppDesatualizado";

describe("appPodeEstarDesatualizado", () => {
  it("sem a versão do app com respostas ricas confirmada, avisa sempre", () => {
    expect(appPodeEstarDesatualizado("9.9.9", null)).toBe(true);
  });

  it("versão mínima vazia ou malformada: algum app antigo ainda abre", () => {
    expect(appPodeEstarDesatualizado(null, "1.0.7")).toBe(true);
    expect(appPodeEstarDesatualizado("", "1.0.7")).toBe(true);
    expect(appPodeEstarDesatualizado("um ponto zero", "1.0.7")).toBe(true);
  });

  it("mínima abaixo da versão com respostas ricas avisa; igual ou acima, não", () => {
    expect(appPodeEstarDesatualizado("1.0.5", "1.0.7")).toBe(true);
    expect(appPodeEstarDesatualizado("1.0.7", "1.0.7")).toBe(false);
    expect(appPodeEstarDesatualizado("v1.1", "1.0.7")).toBe(false);
  });

  it("as mensagens dizem o efeito para o aluno", () => {
    expect(MENSAGEM_DO_AVISO.tipo).toBe("Alunos com o app desatualizado não conseguem responder esta questão.");
    expect(MENSAGEM_DO_AVISO.rico).toBe("Alunos com o app desatualizado verão este texto sem formatação.");
  });
});
