import { beforeEach, describe, expect, it, vi } from "vitest";

// Spec B, PR 4: salvar questão de código, numérica ou expressão grava `resposta_correta: null` em
// `questoes` (o CHECK exige) e o gabarito em `questao_gabarito`, nessa ordem; gabarito inválido
// não escreve nada; e o aviso de app desatualizado aparece sem bloquear.

const api = vi.hoisted(() => ({
  saveQuestion: vi.fn(async (_questao: Record<string, unknown>) => 41),
  saveGabaritoDoServidor: vi.fn(async (_id: number, _gabarito: unknown) => undefined),
  saveActivity: vi.fn(async () => 9),
}));
const avisos = vi.hoisted(() => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

vi.mock("sonner", () => avisos);
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/avisoDeAppDesatualizado", async (original) => ({
  ...(await original<typeof import("@/lib/avisoDeAppDesatualizado")>()),
  precisaAvisarAppDesatualizado: async () => true,
}));
vi.mock("./topicsApi", () => ({
  saveContent: vi.fn(),
  deleteContent: vi.fn(),
  saveActivity: api.saveActivity,
  deleteActivity: vi.fn(),
  saveQuestion: api.saveQuestion,
  saveGabaritoDoServidor: api.saveGabaritoDoServidor,
  deleteQuestion: vi.fn(),
  toggleActivityLinkApi: vi.fn(),
  saveCard: vi.fn(),
  deleteCard: vi.fn(),
  createClassWithMateria: vi.fn(),
}));
vi.mock("./classDeletion", () => ({ deleteTopicCascade: vi.fn() }));

import { FORMULARIO_PADRAO } from "./gabaritoDoServidor";
import { useTopicCrud } from "./useTopicCrud";

const useCrudDeTeste = () =>
  useTopicCrud({
    editingTopic: { id: 1 },
    contents: [],
    setContents: vi.fn(),
    setCards: vi.fn(),
    setActivities: vi.fn(),
    setQuestions: vi.fn(),
    setActivityLinks: vi.fn(),
  });

const questao = (tipo: string, gabarito = FORMULARIO_PADRAO) => ({
  id: 0,
  atividade_id: "7",
  enunciado: "Quanto vale?",
  tipo,
  resposta_correta: "não pode ir para questoes",
  gabarito_servidor: gabarito,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleSaveQuestion com os tipos do spec B", () => {
  it("numérica: questoes sem esperada e com a dimensão; esperada e tolerância em questao_gabarito", async () => {
    const id = await useCrudDeTeste().handleSaveQuestion(
      questao("numeric", { ...FORMULARIO_PADRAO, referencia: "10 m/s", dimensao: "velocidade" }),
      ["sobra do formulário"],
    );
    expect(id).toBe(41);
    expect(api.saveQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: "numerica", alternativas: null, resposta_correta: null, config_resposta: { dimensao: "velocidade" } }),
    );
    expect(api.saveGabaritoDoServidor).toHaveBeenCalledWith(41, {
      configResposta: { dimensao: "velocidade" },
      respostaCorreta: "10 m/s",
      criterios: { tolerancia: 0.01, tipo_tolerancia: "relativa" },
    });
    await vi.waitFor(() =>
      expect(avisos.toast.warning).toHaveBeenCalledWith("Alunos com o app desatualizado não conseguem responder esta questão.", expect.anything()),
    );
  });

  it("código e expressão viram codigo e expressao, nunca dissertativa", async () => {
    await useCrudDeTeste().handleSaveQuestion(questao("code", { ...FORMULARIO_PADRAO, referencia: "print(1)", linguagem: "python" }), []);
    await useCrudDeTeste().handleSaveQuestion(questao("expression", { ...FORMULARIO_PADRAO, referencia: "2x" }), []);
    expect(api.saveQuestion.mock.calls.map(([p]) => [(p as { tipo: string }).tipo, (p as { resposta_correta: unknown }).resposta_correta])).toEqual([
      ["codigo", null],
      ["expressao", null],
    ]);
  });

  it("gabarito inválido não escreve nada", async () => {
    expect(await useCrudDeTeste().handleSaveQuestion(questao("numeric"), [])).toBeUndefined();
    expect(api.saveQuestion).not.toHaveBeenCalled();
    expect(avisos.toast.error).toHaveBeenCalledWith("Escreva o valor esperado.");
  });

  it("falha no gabarito depois da questão salva avisa que falta o gabarito", async () => {
    api.saveGabaritoDoServidor.mockRejectedValueOnce(new Error("permission denied"));
    await useCrudDeTeste().handleSaveQuestion(questao("expression", { ...FORMULARIO_PADRAO, referencia: "x" }), []);
    expect(avisos.toast.error).toHaveBeenCalledWith(expect.stringContaining("gabarito não"));
    expect(avisos.toast.success).not.toHaveBeenCalled();
  });

  it("os tipos de antes não mudam: múltipla grava a correta em questoes e não toca questao_gabarito", async () => {
    await useCrudDeTeste().handleSaveQuestion({ ...questao("quiz"), resposta_correta: "B" }, ["A", "B"]);
    expect(api.saveQuestion).toHaveBeenCalledWith(expect.objectContaining({ tipo: "multipla", resposta_correta: "B" }));
    expect(api.saveQuestion.mock.calls[0][0]).not.toHaveProperty("config_resposta");
    expect(api.saveGabaritoDoServidor).not.toHaveBeenCalled();
    expect(avisos.toast.warning).not.toHaveBeenCalled();
  });
});
