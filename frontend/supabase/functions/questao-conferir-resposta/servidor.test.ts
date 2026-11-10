import { describe, expect, it } from "vitest";
import { lerQuestaoId, lerResposta, lerTempo, respostaAoAluno, respostaDoErroDaRpc } from "./servidor";

describe("pedido", () => {
  it("questaoId é inteiro positivo, em número ou texto", () => {
    expect(lerQuestaoId(950)).toBe(950);
    expect(lerQuestaoId("950")).toBe(950);
    for (const valor of [undefined, null, "", "abc", 0, -3, 1.5, "1e400", {}]) expect(lerQuestaoId(valor)).toBeNull();
  });

  it("tempo vai de 0 a 3600", () => {
    expect(lerTempo(12.4)).toBe(12);
    expect(lerTempo(-5)).toBe(0);
    expect(lerTempo(99999)).toBe(3600);
    expect(lerTempo(undefined)).toBeNull();
    expect(lerTempo("x")).toBeNull();
  });

  it("resposta vazia, que não é texto ou longa demais é recusada", () => {
    expect(lerResposta(" 10 m/s ")).toBe("10 m/s");
    for (const valor of ["", "   ", 10, null, "x".repeat(501)]) expect(lerResposta(valor)).toBeNull();
  });
});

describe("respostaDoErroDaRpc", () => {
  it("traduz as exceções das RPCs", () => {
    expect(respostaDoErroDaRpc("prazo_expirado")).toEqual({ status: 409, error: "prazo_expirado" });
    expect(respostaDoErroDaRpc("questao_sem_permissao")).toEqual({ status: 403, error: "questao_sem_permissao" });
    expect(respostaDoErroDaRpc("questao_nao_conferida_no_servidor")).toEqual({
      status: 400,
      error: "questao_nao_conferida_no_servidor",
    });
    expect(respostaDoErroDaRpc("connection reset")).toEqual({ status: 500, error: "falha_no_banco" });
  });
});

describe("respostaAoAluno", () => {
  const registro = {
    correta: false,
    acertos_percentual: 0,
    regra: "primeira",
    tentativa: 1,
    erros: 1,
    gabarito_liberado: false,
    resposta_correta: "10 m/s",
  };

  it("a esperada só sai quando o banco liberou", () => {
    const fechado = respostaAoAluno({ correta: false }, registro);
    expect(JSON.stringify(fechado)).not.toContain("10 m/s");
    expect(fechado.gabarito_liberado).toBe(false);
    const aberto = respostaAoAluno({ correta: false }, { ...registro, gabarito_liberado: true });
    expect(aberto.resposta_correta).toBe("10 m/s");
  });

  it("vale a correção gravada, com o motivo da conferência", () => {
    expect(respostaAoAluno({ correta: false, motivo: "unidade_incompativel" }, registro)).toEqual({
      correta: false,
      acertos_percentual: 0,
      regra: "primeira",
      tentativa: 1,
      erros: 1,
      motivo: "unidade_incompativel",
      gabarito_liberado: false,
    });
    expect(respostaAoAluno({ correta: true }, { correta: true, acertos_percentual: 50, regra: "resposta_repetida" }))
      .toMatchObject({ correta: true, acertos_percentual: 50, regra: "resposta_repetida" });
  });
});
