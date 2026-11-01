import { describe, expect, it } from "vitest";
import { CHAVE, estadoDoCard, type Disponibilidade } from "./disponibilidade";

const disp = (entradas: [string, boolean][]) =>
  new Map<string, Disponibilidade>(entradas.map(([k, d]) => [k, { disponivel: d, motivo: d ? null : "invariante_falhou:I16" }]));

describe("estadoDoCard", () => {
  it("valor quando disponível e com observação", () => {
    expect(estadoDoCard({ valor: 12, erro: null, chave: CHAVE.tempoAtivo, disponibilidade: disp([[CHAVE.tempoAtivo, true]]) })).toBe("valor");
  });

  it("zero é valor, null é sem dado", () => {
    expect(estadoDoCard({ valor: 0, erro: null, disponibilidade: new Map() })).toBe("valor");
    expect(estadoDoCard({ valor: null, erro: null, disponibilidade: new Map() })).toBe("sem_dado");
  });

  it("invariante falhou: em revisão mesmo com número na view", () => {
    expect(estadoDoCard({ valor: 40, erro: null, chave: CHAVE.retornoSemanal, disponibilidade: disp([[CHAVE.retornoSemanal, false]]) })).toBe("em_revisao");
  });

  it("erro de leitura vence tudo: não vira vazio nem zero", () => {
    expect(estadoDoCard({ valor: null, erro: "permission denied", chave: CHAVE.tempoAtivo, disponibilidade: disp([[CHAVE.tempoAtivo, false]]) })).toBe("erro");
  });

  it("card sem chave do catálogo, ou disponibilidade sem a chave, não é escondido", () => {
    expect(estadoDoCard({ valor: 70, erro: null, disponibilidade: disp([[CHAVE.tempoAtivo, false]]) })).toBe("valor");
    expect(estadoDoCard({ valor: 70, erro: null, chave: CHAVE.tempoAtivo, disponibilidade: new Map() })).toBe("valor");
  });
});
