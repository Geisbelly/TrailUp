import { beforeEach, describe, expect, it, vi } from "vitest";

const sb = vi.hoisted(() => ({
  inserts: [] as { tabela: string; linhas: Record<string, unknown>[] }[],
  idsDasAtividades: [] as number[],
  erroPorTabela: {} as Record<string, unknown>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) => {
      const q: Record<string, unknown> = {};
      q.insert = (linhas: Record<string, unknown>[]) => {
        sb.inserts.push({ tabela, linhas });
        return q;
      };
      q.select = () => q;
      q.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: tabela === "atividades" ? sb.idsDasAtividades.map((id) => ({ id })) : null,
          error: sb.erroPorTabela[tabela] ?? null,
        }).then(resolve);
      return q;
    },
  },
}));

import { saveAiSuggestionsBatch } from "./topicsApi";

const base = { topico_id: 4, conteudo_id: 9 };
const quiz = { titulo: "Quiz", enunciado: "2+2?", tipo: "quiz", alternativas: ["3", "4", "5"], resposta_correta: "4" };

const tabelas = () => sb.inserts.map((i) => i.tabela);
const linhasDe = (tabela: string) => sb.inserts.find((i) => i.tabela === tabela)?.linhas ?? [];

beforeEach(() => {
  sb.inserts = [];
  sb.idsDasAtividades = [101, 102, 103];
  sb.erroPorTabela = {};
});

describe("saveAiSuggestionsBatch — cards", () => {
  it("normaliza espaços, descarta card incompleto e colapsa duplicado (sem diferenciar caixa; o último vence)", async () => {
    const r = await saveAiSuggestionsBatch({
      ...base,
      cards: [
        { titulo: "  Velocidade   média ", descricao: "Distância / tempo" },
        { titulo: "velocidade média", descricao: "distância / TEMPO" },
        { titulo: "Sem descrição", descricao: "   " },
        { titulo: "", descricao: "sem título" },
      ],
      atividades: [],
    });
    expect(r).toEqual({ cardsCreated: 1, activitiesCreated: 0, questionsCreated: 0, linksCreated: 0 });
    // Entre duplicados, vale o ÚLTIMO (é o que o Map faz ao repetir a chave).
    expect(linhasDe("cards")).toEqual([
      { conteudo_id: 9, conteudo_origem_id: null, titulo: "velocidade média", descricao: "distância / TEMPO", imagem_url: null },
    ]);
  });

  it("sem cards nem atividades, não escreve nada", async () => {
    const r = await saveAiSuggestionsBatch({ ...base, cards: [], atividades: [] });
    expect(r.cardsCreated).toBe(0);
    expect(sb.inserts).toHaveLength(0);
  });
});

describe("saveAiSuggestionsBatch — atividades", () => {
  it("cria atividade, questão e vínculo ao conteúdo, na ordem certa", async () => {
    sb.idsDasAtividades = [101];
    const r = await saveAiSuggestionsBatch({ ...base, cards: [], atividades: [quiz] });
    expect(r).toEqual({ cardsCreated: 0, activitiesCreated: 1, questionsCreated: 1, linksCreated: 1 });
    expect(tabelas()[0]).toBe("atividades");
    expect(linhasDe("atividades")).toEqual([{ topico_id: 4, titulo: "Quiz", descricao: "2+2?", tipo: "quiz" }]);
    expect(linhasDe("questoes")[0]).toMatchObject({ atividade_id: 101, tipo: "multipla", resposta_correta: "4", alternativas: ["3", "4", "5"] });
    expect(linhasDe("atividade_conteudos")).toEqual([{ atividade_id: 101, conteudo_id: 9 }]);
  });

  it("verdadeiro/falso sempre fica com as duas alternativas; resposta inválida vira Verdadeiro", async () => {
    sb.idsDasAtividades = [101];
    await saveAiSuggestionsBatch({ ...base, cards: [], atividades: [{ titulo: "VF", enunciado: "A terra é plana?", tipo: "vf", alternativas: null, resposta_correta: "talvez" }] });
    expect(linhasDe("atividades")[0]).toMatchObject({ tipo: "true_false" });
    expect(linhasDe("questoes")[0]).toMatchObject({ tipo: "verdadeiro_falso", alternativas: ["Verdadeiro", "Falso"], resposta_correta: "Verdadeiro" });
  });

  it("múltipla escolha: coloca a resposta entre as alternativas, completa até 2 e corta em 4", async () => {
    sb.idsDasAtividades = [101, 102];
    await saveAiSuggestionsBatch({
      ...base,
      cards: [],
      atividades: [
        { titulo: "A", enunciado: "e1", tipo: "quiz", alternativas: ["x"], resposta_correta: "y" },
        { titulo: "B", enunciado: "e2", tipo: "quiz", alternativas: ["a", "b", "c", "d", "e"], resposta_correta: "c" },
      ],
    });
    const [primeira, segunda] = linhasDe("questoes");
    expect(primeira.alternativas).toEqual(["y", "x"]);
    expect(segunda.alternativas).toEqual(["a", "b", "c", "d"]);
  });

  it("dissertativa não tem alternativas; sem resposta ganha 'Resposta aberta'", async () => {
    sb.idsDasAtividades = [101];
    await saveAiSuggestionsBatch({ ...base, cards: [], atividades: [{ titulo: "D", enunciado: "Explique.", tipo: "dissertativa", alternativas: ["lixo"], resposta_correta: "  " }] });
    expect(linhasDe("questoes")[0]).toMatchObject({ tipo: "dissertativa", alternativas: null, resposta_correta: "Resposta aberta" });
  });

  it("tipo desconhecido (inclusive 'missao') vira dissertação", async () => {
    sb.idsDasAtividades = [101];
    await saveAiSuggestionsBatch({ ...base, cards: [], atividades: [{ titulo: "M", enunciado: "Missão", tipo: "missao", alternativas: null, resposta_correta: "ok" }] });
    expect(linhasDe("atividades")[0]).toMatchObject({ tipo: "essay" });
  });

  it("descarta atividade sem título ou sem enunciado, e duplicada", async () => {
    sb.idsDasAtividades = [101];
    const r = await saveAiSuggestionsBatch({
      ...base,
      cards: [],
      atividades: [quiz, { ...quiz, titulo: " QUIZ " }, { ...quiz, titulo: "" }, { ...quiz, enunciado: " " }],
    });
    expect(r.activitiesCreated).toBe(1);
    expect(linhasDe("atividades")).toHaveLength(1);
  });

  it("a nota estabelecida passa pela validação (inválida vira null)", async () => {
    sb.idsDasAtividades = [101, 102];
    await saveAiSuggestionsBatch({
      ...base,
      cards: [],
      atividades: [{ ...quiz, nota_estabelecida: 2 }, { ...quiz, titulo: "Outro", nota_estabelecida: -5 }],
    });
    expect(linhasDe("questoes").map((q) => q.nota_estabelecida)).toEqual([2, null]);
  });

  it("se o banco devolver nenhuma atividade, não cria questões nem vínculos", async () => {
    sb.idsDasAtividades = [];
    const r = await saveAiSuggestionsBatch({ ...base, cards: [], atividades: [quiz] });
    expect(r.activitiesCreated).toBe(0);
    expect(tabelas()).toEqual(["atividades"]);
  });
});

describe("saveAiSuggestionsBatch — erros", () => {
  it("erro nos cards interrompe antes de criar atividades", async () => {
    sb.erroPorTabela = { cards: new Error("rls") };
    await expect(saveAiSuggestionsBatch({ ...base, cards: [{ titulo: "a", descricao: "b" }], atividades: [quiz] })).rejects.toThrow("rls");
    expect(tabelas()).toEqual(["cards"]);
  });

  it("erro nas atividades interrompe antes das questões", async () => {
    sb.erroPorTabela = { atividades: new Error("check") };
    await expect(saveAiSuggestionsBatch({ ...base, cards: [], atividades: [quiz] })).rejects.toThrow("check");
    expect(tabelas()).toEqual(["atividades"]);
  });

  it("erro em questões ou vínculos é propagado", async () => {
    sb.idsDasAtividades = [101];
    sb.erroPorTabela = { questoes: new Error("q") };
    await expect(saveAiSuggestionsBatch({ ...base, cards: [], atividades: [quiz] })).rejects.toThrow("q");
    sb.erroPorTabela = { atividade_conteudos: new Error("l") };
    await expect(saveAiSuggestionsBatch({ ...base, cards: [], atividades: [quiz] })).rejects.toThrow("l");
  });
});
