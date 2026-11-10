import { all, create } from "mathjs";
import { describe, expect, it } from "vitest";
import {
  conferir,
  conferirExpressao,
  conferirNumerica,
  conferirQuimica,
  EsperadaInvalida,
  lerContextoDaConferencia,
  type MathJs,
} from "./conferir";
import { latexParaMathjs } from "./latexParaMathjs";
import { lerEquacao } from "./quimica";

// O mesmo pacote e a mesma versão que a edge importa (`npm:mathjs@15.2.0`).
const math = create(all) as unknown as MathJs;
const RELATIVA_5 = { tolerancia: 0.05, tipo_tolerancia: "relativa" };

describe("conferirNumerica", () => {
  it("converte a unidade antes de comparar", () => {
    expect(conferirNumerica(math, "36 km/h", "10 m/s", {})).toEqual({ correta: true });
    expect(conferirNumerica(math, "1000 g", "1 kg", {})).toEqual({ correta: true });
  });

  it("aceita vírgula decimal, separador de milhar e notação científica", () => {
    expect(conferirNumerica(math, "10,0 m/s", "10 m/s", {})).toEqual({ correta: true });
    expect(conferirNumerica(math, "1.500,5 m", "1500.5 m", {})).toEqual({ correta: true });
    expect(conferirNumerica(math, "1,5 × 10^3 m", "1500 m", {})).toEqual({ correta: true });
    expect(conferirNumerica(math, "1,5·10^{-3} kg", "1.5 g", {})).toEqual({ correta: true });
    expect(conferirNumerica(math, "\\(9{,}8\\ \\mathrm{m/s^2}\\)", "9.8 m/s^2", {})).toEqual({ correta: true });
  });

  it("unidade de outra grandeza é incompatível", () => {
    expect(conferirNumerica(math, "10 kg", "10 m/s", {})).toEqual({ correta: false, motivo: "unidade_incompativel" });
  });

  it("sem unidade quando a esperada tem, e o contrário, são erros", () => {
    expect(conferirNumerica(math, "10", "10 m/s", {})).toEqual({ correta: false, motivo: "unidade_incompativel" });
    expect(conferirNumerica(math, "42 m", "42", {})).toEqual({ correta: false, motivo: "unidade_incompativel" });
    expect(conferirNumerica(math, "42", "42", {})).toEqual({ correta: true });
  });

  it("compara pela tolerância do professor", () => {
    expect(conferirNumerica(math, "10.4 m/s", "10 m/s", RELATIVA_5).correta).toBe(true);
    expect(conferirNumerica(math, "10.6 m/s", "10 m/s", RELATIVA_5).correta).toBe(false);
    const absoluta = { tolerancia: 0.5, tipo_tolerancia: "absoluta" };
    expect(conferirNumerica(math, "10.4 m/s", "10 m/s", absoluta).correta).toBe(true);
    // A absoluta vale na unidade da esperada: 36,5 km/h é 10,14 m/s.
    expect(conferirNumerica(math, "36.5 km/h", "10 m/s", absoluta).correta).toBe(true);
    // Sem tolerância, só o arredondamento do ponto flutuante.
    expect(conferirNumerica(math, "10.01 m/s", "10 m/s", {}).correta).toBe(false);
  });

  it("errado fora da tolerância não diz quanto faltou", () => {
    expect(conferirNumerica(math, "12 m/s", "10 m/s", RELATIVA_5)).toEqual({ correta: false });
  });

  it("o que não é número vira expressao_invalida", () => {
    for (const resposta of ["", "dez metros", "10 m/s; drop", "x m"]) {
      expect(conferirNumerica(math, resposta, "10 m/s", {})).toEqual({ correta: false, motivo: "expressao_invalida" });
    }
  });

  it("esperada sem número é erro do gabarito, não do aluno", () => {
    expect(() => conferirNumerica(math, "10 m/s", "dez", {})).toThrow(EsperadaInvalida);
  });
});

describe("latexParaMathjs", () => {
  it("traduz o LaTeX do teclado", () => {
    expect(latexParaMathjs("\\frac{1}{2}x")).toBe("((1)/(2))x");
    expect(latexParaMathjs("\\sqrt{x^{2}}")).toBe("sqrt((x^(2)))");
    expect(latexParaMathjs("\\sqrt[3]{x}")).toBe("nthRoot((x), (3))");
    expect(latexParaMathjs("2\\cdot x \\times 3")).toBe("2* x * 3");
    expect(latexParaMathjs("\\left(x+1\\right)")).toBe("(x+1)");
    expect(latexParaMathjs("x_{1}+x_2")).toBe("x_1+x_2");
    expect(latexParaMathjs("2,5x − 1")).toBe("2.5x - 1");
    expect(latexParaMathjs("\\(\\pi r^2\\)")).toBe("pi r^2");
  });

  it("comando desconhecido é inválido, nunca um palpite", () => {
    expect(() => latexParaMathjs("\\int x dx")).toThrow();
    expect(() => latexParaMathjs("\\frac{1}")).toThrow();
  });
});

describe("conferirExpressao", () => {
  const conferirX = (resposta: string, esperada: string, criterios: object = {}) =>
    conferirExpressao(math, resposta, esperada, criterios, { variaveis: ["x"] }, 951);

  it("equivalências do spec", () => {
    expect(conferirX("2(x+1)", "2x+2")).toEqual({ correta: true });
    expect(conferirX("\\frac{1}{2}x", "x/2")).toEqual({ correta: true });
    expect(conferirX("x·2 + 2", "2x+2")).toEqual({ correta: true });
    expect(conferirX("x^2", "x^3")).toEqual({ correta: false });
  });

  it("raiz do quadrado não é x num domínio com negativos", () => {
    expect(conferirX("sqrt(x^2)", "x", { dominio: [-10, 10] }).correta).toBe(false);
    expect(conferirX("sqrt(x^2)", "abs(x)", { dominio: [-10, 10] }).correta).toBe(true);
    expect(conferirX("sqrt(x^2)", "x", { dominio: [0.5, 10] }).correta).toBe(true);
  });

  it("várias variáveis, e as variáveis vêm da esperada quando a config não diz", () => {
    expect(conferirExpressao(math, "(x+y)^2", "x^2 + 2x y + y^2", {}, {}, 1)).toEqual({ correta: true });
    expect(conferirExpressao(math, "(x+y)^2", "x^2 + y^2", {}, {}, 1)).toEqual({ correta: false });
  });

  it("variável que a questão não tem dá errado, sem motivo", () => {
    expect(conferirX("2t+2", "2x+2")).toEqual({ correta: false });
  });

  it("o mesmo resultado em toda tentativa (semente por questão)", () => {
    const vezes = Array.from({ length: 5 }, () => conferirX("1/(x-3)", "1/(x-3)", { pontos: 7 }));
    expect(new Set(vezes.map((v) => JSON.stringify(v))).size).toBe(1);
  });

  it("definida em menos da metade dos pontos não conta como igual", () => {
    // log de negativo é complexo: em [-10, -1] nenhum ponto é real.
    expect(conferirX("log(x)", "log(x)", { dominio: [-10, -1] }).correta).toBe(false);
  });

  it("o que o parser não deve aceitar vira expressao_invalida", () => {
    for (const resposta of [
      "",
      "2x+",
      "x = 2",
      "f(x) = x",
      "import({})",
      "evaluate(\"1\")",
      "x!",
      "[1, 2]",
      "\"texto\"",
      "a.b",
      "x".repeat(600),
    ]) {
      expect(conferirX(resposta, "2x+2"), resposta).toEqual({ correta: false, motivo: "expressao_invalida" });
    }
  });

  it("esperada que não parseia é erro do gabarito", () => {
    expect(() => conferirX("2x", "2x+")).toThrow(EsperadaInvalida);
  });
});

describe("química", () => {
  it("lê \\ce{} ou texto, com índice em _ ou direto", () => {
    expect(lerEquacao("\\ce{2H2 + O2 -> 2H2O}")).toEqual(lerEquacao("2 H_2 + O_2 → 2 H_{2}O"));
    expect(conferirQuimica("H_2O", "H2O")).toEqual({ correta: true });
    expect(conferirQuimica("O2 + 2H2 -> 2H2O", "\\ce{2H2 + O2 -> 2H2O}")).toEqual({ correta: true });
  });

  it("coeficiente, espécie, lado ou seta trocados dão diferente", () => {
    const esperada = "\\ce{2H2 + O2 -> 2H2O}";
    expect(conferirQuimica("H2 + O2 -> H2O", esperada).correta).toBe(false);
    expect(conferirQuimica("4H2 + 2O2 -> 4H2O", esperada).correta).toBe(false);
    expect(conferirQuimica("2H2O -> 2H2 + O2", esperada).correta).toBe(false);
    expect(conferirQuimica("2H2 + O2 <=> 2H2O", esperada).correta).toBe(false);
    expect(conferirQuimica("2H2 + O2 -> 2H2O2", esperada).correta).toBe(false);
  });

  it("maiúscula conta: CO não é Co", () => {
    expect(conferirQuimica("Co", "\\ce{CO}").correta).toBe(false);
  });

  it("íons e estados", () => {
    const esperada = "\\ce{Na+ + Cl- -> NaCl}";
    expect(conferirQuimica("Na^+ + Cl^- -> NaCl", esperada).correta).toBe(true);
    expect(conferirQuimica("Na+ + Cl- -> NaCl(s)", esperada).correta).toBe(true);
    expect(conferirQuimica("\\ce{SO4^2-}", "SO4^{2-}").correta).toBe(true);
    expect(conferirQuimica("SO4^-", "SO4^{2-}").correta).toBe(false);
  });

  it("o que não é fórmula vira expressao_invalida", () => {
    for (const resposta of ["", "água", "2x + 1", "-> H2O"]) {
      expect(conferirQuimica(resposta, "H2O"), resposta).toEqual({ correta: false, motivo: "expressao_invalida" });
    }
  });
});

describe("conferir", () => {
  const base = { criterios: null, configResposta: null };

  it("escolhe pelo tipo, e a expressão química pela esperada ou pela config", () => {
    expect(conferir(math, { ...base, tipo: "numerica", respostaEsperada: "10 m/s" }, "36 km/h", 950).correta).toBe(true);
    expect(conferir(math, { ...base, tipo: "expressao", respostaEsperada: "2x+2" }, "2(x+1)", 952).correta).toBe(true);
    expect(conferir(math, { ...base, tipo: "expressao", respostaEsperada: "\\ce{H2O}" }, "H_2O", 952).correta).toBe(true);
    expect(
      conferir(math, { ...base, tipo: "expressao", respostaEsperada: "NaCl", configResposta: { quimica: true } }, "NaCl", 952)
        .correta,
    ).toBe(true);
  });

  it("tipo que não é conferido aqui, ou sem esperada, é erro do gabarito", () => {
    expect(() => conferir(math, { ...base, tipo: "codigo", respostaEsperada: "x" }, "x", 1)).toThrow(EsperadaInvalida);
    expect(() => conferir(math, { ...base, tipo: "numerica", respostaEsperada: "" }, "1", 1)).toThrow(EsperadaInvalida);
  });

  it("nenhum retorno contém a esperada", () => {
    const casos: Array<[string, string, string]> = [
      ["numerica", "37.25 m/s", "37 m/s"],
      ["numerica", "37.25 m/s", "37 kg"],
      ["numerica", "37.25 m/s", "trinta"],
      ["expressao", "17x + 23", "17x"],
      ["expressao", "17x + 23", "17x +"],
      ["expressao", "\\ce{2Fe2O3 -> 4Fe + 3O2}", "Fe2O3 -> Fe + O2"],
      ["expressao", "\\ce{2Fe2O3 -> 4Fe + 3O2}", "ferro"],
    ];
    for (const [tipo, esperada, resposta] of casos) {
      const saida = JSON.stringify(conferir(math, { ...base, tipo, respostaEsperada: esperada }, resposta, 7));
      for (const pedaco of ["37.25", "37,25", "23", "Fe2O3", "4Fe", "3O2"]) {
        if (esperada.includes(pedaco)) expect(saida, `${tipo} ${resposta}`).not.toContain(pedaco);
      }
      expect(Object.keys(JSON.parse(saida)).every((chave) => ["correta", "motivo"].includes(chave))).toBe(true);
    }
  });
});

describe("lerContextoDaConferencia", () => {
  it("lê o que a RPC devolve, sem confiar na forma", () => {
    expect(
      lerContextoDaConferencia({
        tipo: "numerica",
        resposta_esperada: " 10 m/s ",
        criterios: { tolerancia: 0.05 },
        config_resposta: { dimensao: "velocidade" },
      }),
    ).toEqual({
      tipo: "numerica",
      respostaEsperada: "10 m/s",
      criterios: { tolerancia: 0.05 },
      configResposta: { dimensao: "velocidade" },
    });
    expect(lerContextoDaConferencia(null)).toEqual({
      tipo: "",
      respostaEsperada: "",
      criterios: null,
      configResposta: null,
    });
  });
});
