import { all, create } from "mathjs";
import { describe, expect, it } from "vitest";
import type { MathJs } from "../../supabase/functions/questao-conferir-resposta/conferir.ts";
import { conferirExemploCom, previaDoValorCom } from "./conferenciaNoConsole";

// O mesmo pacote e a mesma versão que a edge importa (`npm:mathjs@15.2.0`).
const math = create(all) as unknown as MathJs;

describe("previaDoValorCom", () => {
  it("mostra o número e a unidade como a edge entendeu", () => {
    expect(previaDoValorCom(math, "10 km/h")).toBe("10 km / h");
    expect(previaDoValorCom(math, "1,5 × 10^3")).toBe("1500");
    expect(previaDoValorCom(math, "9,8 m/s²")).toBe("9.8 m / s^2");
  });

  it("o que a edge não lê não tem prévia", () => {
    expect(previaDoValorCom(math, "abc")).toBeNull();
    expect(previaDoValorCom(math, "")).toBeNull();
  });
});

describe("conferirExemploCom", () => {
  const numerica = { configResposta: null, respostaCorreta: "10 m/s", criterios: { tolerancia: 0.01, tipo_tolerancia: "relativa" } };

  it("numérica: outra unidade equivalente confere", () => {
    expect(conferirExemploCom(math, "numeric", numerica, "36 km/h")).toEqual({ correta: true });
    expect(conferirExemploCom(math, "numeric", numerica, "12 m/s")).toEqual({ correta: false });
    expect(conferirExemploCom(math, "numeric", numerica, "10 kg")).toEqual({ correta: false, motivo: "unidade_incompativel" });
  });

  it("expressão: forma diferente e equivalente confere", () => {
    const g = { configResposta: { variaveis: ["x"] }, respostaCorreta: "2x + 2", criterios: { dominio: [-10, 10], pontos: 20 } };
    expect(conferirExemploCom(math, "expression", g, "2(x + 1)")).toEqual({ correta: true });
    expect(conferirExemploCom(math, "expression", g, "2x")).toEqual({ correta: false });
  });

  it("química pelo \\ce{", () => {
    const g = { configResposta: null, respostaCorreta: "\\ce{2H2 + O2 -> 2H2O}", criterios: null };
    expect(conferirExemploCom(math, "expression", g, "\\ce{O2 + 2H2 -> 2H2O}")).toEqual({ correta: true });
  });

  it("esperada que a edge não entende é erro do gabarito, não do aluno", () => {
    expect(conferirExemploCom(math, "numeric", { ...numerica, respostaCorreta: "dez" }, "10")).toEqual({ esperadaInvalida: true });
  });
});
