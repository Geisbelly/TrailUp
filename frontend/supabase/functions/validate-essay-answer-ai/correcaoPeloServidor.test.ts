import { describe, expect, it } from "vitest";
import { lerContexto, lerQuestaoId, lerTempo, respostaDoErroDaRpc } from "./correcaoPeloServidor";

describe("lerQuestaoId", () => {
  it("aceita inteiro positivo, em número ou texto", () => {
    expect(lerQuestaoId(902)).toBe(902);
    expect(lerQuestaoId("902")).toBe(902);
  });

  it("sem id válido, volta ao contrato antigo", () => {
    for (const valor of [undefined, null, "", "abc", 0, -3, 1.5, "1e400", {}]) {
      expect(lerQuestaoId(valor)).toBeNull();
    }
  });
});

describe("lerContexto", () => {
  it("lê o que a RPC devolve", () => {
    expect(
      lerContexto({ enunciado: " Compare ", resposta_esperada: "2/4 < 3/4", nota_estabelecida: "10" }),
    ).toEqual({ enunciado: "Compare", respostaEsperada: "2/4 < 3/4", notaEstabelecida: "10" });
  });

  it("resposta esperada ausente vira texto vazio, não 'null'", () => {
    expect(lerContexto({ enunciado: "x", resposta_esperada: null }).respostaEsperada).toBe("");
    expect(lerContexto(null)).toEqual({ enunciado: "", respostaEsperada: "", notaEstabelecida: null });
  });
});

describe("respostaDoErroDaRpc", () => {
  it("traduz as exceções das RPCs", () => {
    expect(respostaDoErroDaRpc("prazo_expirado")).toEqual({ status: 409, error: "prazo_expirado" });
    expect(respostaDoErroDaRpc("questao_sem_permissao")).toEqual({ status: 403, error: "questao_sem_permissao" });
    expect(respostaDoErroDaRpc("questao_nao_dissertativa")).toEqual({
      status: 400,
      error: "questao_nao_dissertativa",
    });
  });

  it("o resto não vaza o texto do banco", () => {
    expect(respostaDoErroDaRpc('relation "x" does not exist')).toEqual({ status: 500, error: "falha_no_banco" });
    expect(respostaDoErroDaRpc(undefined)).toEqual({ status: 500, error: "falha_no_banco" });
  });
});

describe("lerTempo", () => {
  it("limita a 0..3600", () => {
    expect(lerTempo(12.4)).toBe(12);
    expect(lerTempo(-5)).toBe(0);
    expect(lerTempo(99999)).toBe(3600);
    expect(lerTempo(undefined)).toBeNull();
    expect(lerTempo("abc")).toBeNull();
  });
});
