import { describe, expect, it } from "vitest";
import { BRAINHEX_QUESTIONS, isAllAnswered } from "./brainhex";
import { concordanciaEntreMetodos, PERFIS_EM_ORDEM, pontuarOrdenacao } from "./brainhexOrdenacao";
import { afinidadeEmPercentual, computarPerfil, perfilDominante } from "./priorDoPerfil";
import { atualizarPerfil } from "./atualizacaoDoPerfil";
import { montarMedidaDoPerfil } from "./medidaDoPerfil";

const perfis = PERFIS_EM_ORDEM;
const mapa = (valores: number[]) => Object.fromEntries(perfis.map((p, i) => [p, valores[i]]));
const completo = Object.fromEntries(BRAINHEX_QUESTIONS.map(q => [q.id, q.reverse ? 0 : 5]));

describe("regressões reproduzidas na auditoria #1", () => {
  it.each([NaN, Infinity, -Infinity, -1, 6, 99, 2.5])("rejeita um único item inválido (%s)", valor => {
    expect(isAllAnswered({ ...completo, c1: valor })).toBe(false);
  });

  it("Spearman com empate parcial usa o oráculo de postos médios", () => {
    const escala = mapa([4, 4, 3, 2, 1, 0, -1]);
    const ordem = pontuarOrdenacao(perfis);
    // Covariância não normalizada 27.5; somas de quadrados 27.5 e 28.
    expect(concordanciaEntreMetodos(escala, ordem)).toBeCloseTo(27.5 / Math.sqrt(27.5 * 28), 12);
    expect(concordanciaEntreMetodos(Object.fromEntries(Object.entries(escala).reverse()), ordem))
      .toBe(concordanciaEntreMetodos(escala, ordem));
  });

  it("escala constante, ordenação constante e entradas inválidas não produzem correlação", () => {
    const constante = mapa([0, 0, 0, 0, 0, 0, 0]);
    const ordem = pontuarOrdenacao(perfis);
    expect(concordanciaEntreMetodos(constante, ordem)).toBeNull();
    expect(concordanciaEntreMetodos(ordem, constante)).toBeNull();
    expect(concordanciaEntreMetodos({ ...ordem, seeker: NaN }, ordem)).toBeNull();
  });

  it.each([0, 1, 2, 3, 4, 5])("não transforma ruído de ponto flutuante em correlação (resposta %s)", valor => {
    const answers = Object.fromEntries(BRAINHEX_QUESTIONS.map(q => [q.id, valor]));
    expect(computarPerfil({ answers, ordenacao: perfis }).concordancia).toBeNull();
  });

  it("não inverte os líderes próximos do caso 843 ao distribuir o piso", () => {
    const escores = mapa([2.285300207039338, -2.1146997929606624, 1.751966873706004,
      -2.914699792960662, 1.1853002070393375, 2.2548654244306423, -2.4480331262939954]);
    const p = afinidadeEmPercentual(escores);
    expect(p.seeker).toBeGreaterThanOrEqual(p.socializer);
    expect(Object.values(p).reduce((a, b) => a + b)).toBe(100);
    expect(Math.min(...Object.values(p))).toBeGreaterThanOrEqual(1);
  });

  it("empates não dependem da ordem das propriedades e usam o mesmo desempate do dominante", () => {
    const escores = mapa([0, 0, 0, 0, 0, 0, 0]);
    const p = afinidadeEmPercentual(escores);
    expect(afinidadeEmPercentual(Object.fromEntries(Object.entries(escores).reverse()))).toEqual(p);
    expect(p[perfilDominante(escores)]).toBe(Math.max(...Object.values(p)));
  });

  it("não fabrica números para escores não finitos", () => {
    expect(() => afinidadeEmPercentual(mapa([NaN, 0, 0, 0, 0, 0, 0]))).toThrow();
  });

  it("sem observações preserva inclusive o extremo 1, sem modificar a entrada", () => {
    const prior = { afinidade: computarPerfil({ answers: completo, ordenacao: perfis }).afinidade, confianca: 1 };
    const result = atualizarPerfil({ prior, observacoes: [] });
    expect(result.confianca).toBe(1);
    expect(result.afinidade).toEqual(prior.afinidade);
    expect(result.afinidade).not.toBe(prior.afinidade);
    expect(result.movimento).toEqual({});
  });

  it("não persiste ordenação sorteada sem confirmação nem converte null em zero", () => {
    const r = computarPerfil({ answers: completo, ordenacao: perfis });
    const params = { alunoId: "sintetico", ordenacao: perfis, afinidade: r.percentual,
      confianca: r.confianca, concordancia: r.concordancia, qualidade: r.qualidade };
    expect(() => montarMedidaDoPerfil({ ...params, ordenacaoConfirmada: false })).toThrow(/não confirmada/);
    const saved = JSON.parse(JSON.stringify(montarMedidaDoPerfil({ ...params, ordenacaoConfirmada: true })));
    expect(saved.confianca).toBeNull();
    expect(saved.concordancia).toBeNull();
    expect(saved.qualidade.ordenacao_confirmada).toBe(true);
    expect(saved.qualidade.interpretacao).toBe("exploratoria_nao_probabilistica");
    expect(() => montarMedidaDoPerfil({ ...params, ordenacaoConfirmada: true, confianca: 0 })).toThrow();
  });

  it("ausência de confiança não entra no atualizador como precisão zero", () => {
    const prior = computarPerfil({ answers: completo, ordenacao: perfis });
    expect(atualizarPerfil({ prior, observacoes: [] }).confianca).toBeNull();
    expect(() => atualizarPerfil({ prior,
      observacoes: [{ perfil: "seeker", valor: 1, n: 1, indicador: "teste" }] })).toThrow(/precisão calibrada/);
  });
});
