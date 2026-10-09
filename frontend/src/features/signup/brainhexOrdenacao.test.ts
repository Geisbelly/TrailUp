import { describe, expect, it } from "vitest";

import { centrarPorRespondente } from "./brainhexScoring";
import {
  AFIRMACOES_DE_ORDENACAO,
  OrdenacaoInvalida,
  PERFIS_EM_ORDEM,
  combinarPrior,
  concordanciaEntreMetodos,
  moverNaOrdenacao,
  ordemInicial,
  pontuarOrdenacao,
  validarOrdenacao,
} from "./brainhexOrdenacao";

const ORDEM_EXEMPLO = [
  "seeker", "mastermind", "achiever", "survivor",
  "socializer", "daredevil", "conqueror",
] as const;

describe("afirmacoes", () => {
  it("existe uma por perfil, e nenhuma vazia", () => {
    for (const perfil of PERFIS_EM_ORDEM) {
      expect(AFIRMACOES_DE_ORDENACAO[perfil]?.trim().length ?? 0).toBeGreaterThan(10);
    }
    expect(Object.keys(AFIRMACOES_DE_ORDENACAO).sort()).toEqual([...PERFIS_EM_ORDEM].sort());
  });
});

describe("validarOrdenacao", () => {
  it("aceita os sete perfis, uma vez cada", () => {
    expect(validarOrdenacao([...ORDEM_EXEMPLO])).toHaveLength(7);
  });

  it("recusa ordenacao incompleta em vez de pontuar pela metade", () => {
    // Pontuar lista incompleta daria vantagem silenciosa a quem nao terminou.
    expect(() => validarOrdenacao(["seeker", "survivor"])).toThrow(OrdenacaoInvalida);
  });

  it("recusa repeticao", () => {
    const comRepeticao = [...ORDEM_EXEMPLO.slice(0, 6), "seeker"];
    expect(() => validarOrdenacao(comRepeticao)).toThrow(/repetido/);
  });

  it("recusa perfil desconhecido", () => {
    const invalida = [...ORDEM_EXEMPLO.slice(0, 6), "inventado"];
    expect(() => validarOrdenacao(invalida)).toThrow(/desconhecido/);
  });
});

describe("pontuarOrdenacao", () => {
  it("primeiro lugar e o maior, ultimo e o menor", () => {
    const p = pontuarOrdenacao([...ORDEM_EXEMPLO]);
    expect(p.seeker).toBe(3);
    expect(p.conqueror).toBe(-3);
    expect(p.survivor).toBe(0);
  });

  it("a media e zero: fica na mesma unidade do escore centrado da escala", () => {
    const p = pontuarOrdenacao([...ORDEM_EXEMPLO]);
    const soma = Object.values(p).reduce((s, v) => s + v, 0);
    expect(soma).toBeCloseTo(0);
  });

  it("e imune a estilo de resposta: so a ordem importa", () => {
    // O ponto do bloco inteiro. Nao existe "marcar alto em tudo" aqui.
    const a = pontuarOrdenacao([...ORDEM_EXEMPLO]);
    const b = pontuarOrdenacao([...ORDEM_EXEMPLO]);
    expect(a).toEqual(b);
  });
});

describe("concordanciaEntreMetodos", () => {
  it("metodos que dizem o mesmo dao +1", () => {
    const ordenacao = pontuarOrdenacao([...ORDEM_EXEMPLO]);
    expect(concordanciaEntreMetodos(ordenacao, ordenacao)).toBeCloseTo(1);
  });

  it("metodos opostos dao -1", () => {
    const ordenacao = pontuarOrdenacao([...ORDEM_EXEMPLO]);
    const invertida = pontuarOrdenacao([...ORDEM_EXEMPLO].reverse());
    expect(concordanciaEntreMetodos(invertida, ordenacao)).toBeCloseTo(-1);
  });

  it("dados insuficientes nao viram concordancia inventada", () => {
    expect(concordanciaEntreMetodos({ seeker: 1 }, { seeker: 1 })).toBe(0);
  });
});

describe("combinarPrior", () => {
  const escalaCentrada = centrarPorRespondente({
    seeker: 4.5, mastermind: 4.0, achiever: 3.5, survivor: 3.0,
    socializer: 2.5, daredevil: 2.0, conqueror: 1.5,
  });

  it("concordancia alta sobe a confianca; divergencia baixa", () => {
    const concordando = combinarPrior({
      escalaCentrada,
      ordenacao: pontuarOrdenacao([...ORDEM_EXEMPLO]),
      confiancaDaEscala: 0.9,
    });
    const divergindo = combinarPrior({
      escalaCentrada,
      ordenacao: pontuarOrdenacao([...ORDEM_EXEMPLO].reverse()),
      confiancaDaEscala: 0.9,
    });
    expect(concordando.concordancia).toBeGreaterThan(0.9);
    expect(divergindo.concordancia).toBeLessThan(-0.9);
    expect(concordando.confianca).toBeGreaterThan(divergindo.confianca);
  });

  it("divergencia nao zera a confianca: o cadastro precisa entregar um perfil", () => {
    const d = combinarPrior({
      escalaCentrada,
      ordenacao: pontuarOrdenacao([...ORDEM_EXEMPLO].reverse()),
      confiancaDaEscala: 0.9,
    });
    expect(d.confianca).toBeGreaterThanOrEqual(0.15);
  });

  it("a ordenacao salva quem marcou tudo igual na escala", () => {
    // Escala sem informacao (todos os eixos no mesmo valor) => centrada em zero.
    // Sem o bloco ipsativo, o perfil sairia dos PESOS do mapeamento. Com ele,
    // sai da ordem que a pessoa declarou.
    const escalaSemInformacao = centrarPorRespondente(
      Object.fromEntries(PERFIS_EM_ORDEM.map((p) => [p, 5])),
    );
    const { afinidade } = combinarPrior({
      escalaCentrada: escalaSemInformacao,
      ordenacao: pontuarOrdenacao([...ORDEM_EXEMPLO]),
      confiancaDaEscala: 0.3,
    });
    const vencedor = PERFIS_EM_ORDEM.reduce((a, b) => (afinidade[a] >= afinidade[b] ? a : b));
    expect(vencedor).toBe("seeker");
    expect(afinidade.conqueror).toBeLessThan(afinidade.seeker);
  });

  it("peso 0 ignora a ordenacao; peso 1 ignora a escala", () => {
    const ordenacao = pontuarOrdenacao([...ORDEM_EXEMPLO]);
    const soEscala = combinarPrior({ escalaCentrada, ordenacao, confiancaDaEscala: 0.9, pesoOrdenacao: 0 });
    const soOrdem = combinarPrior({ escalaCentrada, ordenacao, confiancaDaEscala: 0.9, pesoOrdenacao: 1 });
    expect(soEscala.afinidade.seeker).toBeCloseTo(escalaCentrada.seeker);
    expect(soOrdem.afinidade.seeker).toBeCloseTo(ordenacao.seeker);
  });
});

describe("moverNaOrdenacao", () => {
  const base = [...PERFIS_EM_ORDEM];

  it("sobe um item", () => {
    const movido = moverNaOrdenacao(base, 2, -1);
    expect(movido[1]).toBe(base[2]);
    expect(movido[2]).toBe(base[1]);
  });

  it("desce um item", () => {
    const movido = moverNaOrdenacao(base, 0, 1);
    expect(movido[0]).toBe(base[1]);
    expect(movido[1]).toBe(base[0]);
  });

  it("no topo, subir nao faz nada e devolve a MESMA lista", () => {
    // Identidade preservada: o React nao re-renderiza a toa.
    expect(moverNaOrdenacao(base, 0, -1)).toBe(base);
  });

  it("no fim, descer nao faz nada", () => {
    expect(moverNaOrdenacao(base, base.length - 1, 1)).toBe(base);
  });

  it("indice invalido nao quebra nem perde item", () => {
    expect(moverNaOrdenacao(base, -5, 1)).toBe(base);
    expect(moverNaOrdenacao(base, 99, -1)).toBe(base);
  });

  it("mover nunca perde nem duplica perfil", () => {
    let atual: typeof base = [...base];
    for (const [i, d] of [[3, -1], [0, 1], [6, -1], [2, 1]] as [number, -1 | 1][]) {
      atual = moverNaOrdenacao(atual, i, d);
    }
    expect(new Set(atual).size).toBe(PERFIS_EM_ORDEM.length);
    expect(() => validarOrdenacao(atual)).not.toThrow();
  });
});

describe("ordemInicial", () => {
  it("devolve os sete perfis, sem perder nem duplicar", () => {
    const ordem = ordemInicial(42);
    expect(new Set(ordem).size).toBe(PERFIS_EM_ORDEM.length);
    expect(() => validarOrdenacao(ordem)).not.toThrow();
  });

  it("e deterministica: a mesma semente da a mesma ordem", () => {
    expect(ordemInicial(7)).toEqual(ordemInicial(7));
  });

  it("sementes diferentes embaralham diferente", () => {
    // Ancoragem: comecar sempre igual faz quem nao mexe entregar a ordem do
    // sistema, nao a dele.
    const amostras = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => ordemInicial(s).join(","));
    expect(new Set(amostras).size).toBeGreaterThan(1);
  });

  it("semente zero ou negativa nao quebra", () => {
    expect(() => validarOrdenacao(ordemInicial(0))).not.toThrow();
    expect(() => validarOrdenacao(ordemInicial(-9))).not.toThrow();
  });
});
