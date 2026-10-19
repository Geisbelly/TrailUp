import { describe, expect, it } from "vitest";
import {
  NIVEIS_DA_QUESTAO,
  SEM_NIVEL,
  nivelParaOBanco,
  nivelParaOFormulario,
  rotuloDoNivel,
} from "./dificuldadeDaQuestao";

describe("nivelParaOBanco", () => {
  it.each(["facil", "media", "dificil"] as const)("%s passa", (nivel) => {
    expect(nivelParaOBanco(nivel)).toBe(nivel);
  });

  it("vazio vira null, não string vazia", () => {
    // Esta é a correção que o teste existe para travar: `questoes_dificuldade_check` aceita
    // NULL ou um dos três níveis, e `''` viola o CHECK — o professor veria o erro ao salvar.
    expect(nivelParaOBanco("")).toBeNull();
    expect(nivelParaOBanco("   ")).toBeNull();
    expect(nivelParaOBanco(null)).toBeNull();
    expect(nivelParaOBanco(undefined)).toBeNull();
  });

  it("nível desconhecido vira null em vez de ir para o banco", () => {
    // Mandar "impossivel" só adiaria o mesmo CHECK para o INSERT.
    expect(nivelParaOBanco("impossivel")).toBeNull();
    expect(nivelParaOBanco("hard")).toBeNull();
  });

  it("ignora caixa e espaço", () => {
    expect(nivelParaOBanco("  Difícil".replace("í", "i"))).toBe("dificil");
    expect(nivelParaOBanco("MEDIA")).toBe("media");
  });
});

describe("nivelParaOFormulario", () => {
  it("null volta como vazio, para o select mostrar 'não marcada'", () => {
    expect(nivelParaOFormulario(null)).toBe(SEM_NIVEL);
    expect(nivelParaOFormulario("lixo")).toBe(SEM_NIVEL);
  });

  it("ida e volta não perde nem inventa nível", () => {
    for (const { chave } of NIVEIS_DA_QUESTAO) {
      expect(nivelParaOBanco(nivelParaOFormulario(chave))).toBe(chave);
    }
    expect(nivelParaOBanco(nivelParaOFormulario(null))).toBeNull();
  });
});

describe("rotuloDoNivel", () => {
  it("não marcada é informação, não ausência dela", () => {
    expect(rotuloDoNivel(null)).toBe("Não marcada");
    expect(rotuloDoNivel("")).toBe("Não marcada");
  });

  it("todo nível tem rótulo", () => {
    for (const { chave, rotulo } of NIVEIS_DA_QUESTAO) {
      expect(rotuloDoNivel(chave)).toBe(rotulo);
      expect(rotulo.trim()).not.toBe("");
    }
  });
});
