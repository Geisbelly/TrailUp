import { describe, expect, it } from "vitest";
import {
  eEstruturaAusente,
  estadoDaAnalise,
  MAX_TENTATIVAS_DA_IA,
  oQueMudou,
  podePedirRevisao,
  rotuloDaDecisao,
} from "./alteracoes";

describe("estadoDaAnalise", () => {
  it("analisada: cosmética não avisou ninguém, relevante avisou", () => {
    expect(estadoDaAnalise({ status: "analisada", classificacao: "cosmetica", tentativas: 1, ultimo_erro: null }).rotulo).toBe(
      "Cosmética: ninguém foi avisado",
    );
    expect(estadoDaAnalise({ status: "analisada", classificacao: "relevante", tentativas: 1, ultimo_erro: null }).tom).toBe("ia");
  });

  it("sem modelo: espera, e depois do teto passa a decisão ao professor", () => {
    expect(estadoDaAnalise({ status: "pendente_analise", classificacao: null, tentativas: 0, ultimo_erro: null }).rotulo).toBe(
      "Aguardando a IA",
    );
    expect(estadoDaAnalise({ status: "pendente_analise", classificacao: null, tentativas: 2, ultimo_erro: "sem modelo" }).rotulo).toBe(
      "Aguardando a IA (nova tentativa em breve)",
    );
    expect(
      estadoDaAnalise({ status: "pendente_analise", classificacao: null, tentativas: MAX_TENTATIVAS_DA_IA, ultimo_erro: "x" }).tom,
    ).toBe("atencao");
  });
});

describe("oQueMudou", () => {
  it("traduz os campos, sem repetir, e nomeia questão e card novos ou removidos", () => {
    const mudancas = [
      { tabela: "questoes", id: 1, op: "UPDATE", campos: ["enunciado", "alternativas"] },
      { tabela: "questoes", id: 1, op: "UPDATE", campos: ["resposta_correta"] },
      { tabela: "questoes", id: 2, op: "UPDATE", campos: ["enunciado"] },
      { tabela: "questoes", id: 3, op: "INSERT", campos: ["enunciado"] },
      { tabela: "cards", id: 9, op: "DELETE", campos: ["titulo"] },
    ];
    expect(oQueMudou(mudancas)).toEqual(["enunciado", "alternativas", "gabarito", "questão nova", "card removido"]);
    expect(oQueMudou(null)).toEqual([]);
  });
});

describe("decisões", () => {
  it("revisão só para quem fez uma atividade", () => {
    expect(podePedirRevisao({ alvo_tipo: "atividade" }, { situacao: "fez" })).toBe(true);
    expect(podePedirRevisao({ alvo_tipo: "atividade" }, { situacao: "viu" })).toBe(false);
    expect(podePedirRevisao({ alvo_tipo: "conteudo" }, { situacao: "fez" })).toBe(false);
  });

  it("rótulos", () => {
    expect(rotuloDaDecisao("revisar", null)).toBe("Revisão pedida");
    expect(rotuloDaDecisao("revisar", "2026-11-01T12:00:00Z")).toBe("Revisão feita");
    expect(rotuloDaDecisao("pendente_analise", null)).toBe("Aguardando análise");
  });

  it("tabela ausente esconde a seção; outro erro não", () => {
    expect(eEstruturaAusente({ code: "42P01", message: 'relation "alteracao_professor" does not exist' })).toBe(true);
    expect(eEstruturaAusente({ code: "PGRST205", message: "Could not find the table" })).toBe(true);
    expect(eEstruturaAusente({ code: "42501", message: "permission denied" })).toBe(false);
  });
});
