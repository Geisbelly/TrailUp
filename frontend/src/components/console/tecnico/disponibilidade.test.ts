import { describe, expect, it } from "vitest";
import { contagem, estadoDoDia, formatarDisponibilidade, lerAcessosDosAlunos, lerDisponibilidade, orcamentoGastoPct, rotuloDaOrigem, ultimosDias } from "./disponibilidade";

describe("lerDisponibilidade", () => {
  it("recusa o que não é objeto", () => {
    expect(lerDisponibilidade(null)).toBeNull();
    expect(lerDisponibilidade([])).toBeNull();
  });

  it("estado que a tela não entende vira sem dado, nunca no ar", () => {
    const lido = lerDisponibilidade({ alvos: [{ id: "api", nome: "API", estado: "talvez" }] });
    expect(lido?.alvos[0].estado).toBe("sem_dado");
    expect(lido?.alvos[0].disponibilidade_pct).toBeNull();
  });

  it("não inventa número onde o banco devolveu nulo", () => {
    const lido = lerDisponibilidade({ banco: { tamanho_mb: null }, ia: { latencia_p95_ms: null } });
    expect(lido?.banco.tamanho_mb).toBeNull();
    expect(lido?.ia.latencia_p95_ms).toBeNull();
  });
});

describe("lerAcessosDosAlunos", () => {
  it("sem nome o aluno fica só com o código", () => {
    const [a] = lerAcessosDosAlunos({ alunos: [{ codigo: "a1b2c3", dias_com_acesso: 2, acessos: 3, minutos: 10, ultimo_acesso_em: null }] });
    expect(a).toEqual({ codigo: "a1b2c3", nome: null, dias_com_acesso: 2, acessos: 3, minutos: 10, ultimo_acesso_em: null });
  });
});

describe("rótulos e contas", () => {
  it("dia sem medida é sem dado, não dia bom", () => {
    expect(estadoDoDia(undefined)).toBe("sem_dado");
    expect(estadoDoDia({ dia: "2026-11-05", medidas: 0, boas: 0 })).toBe("sem_dado");
    expect(estadoDoDia({ dia: "2026-11-05", medidas: 10, boas: 10 })).toBe("bom");
    expect(estadoDoDia({ dia: "2026-11-05", medidas: 10, boas: 9 })).toBe("falhou");
  });

  it("orçamento sem meta ou sem medida não vira zero", () => {
    expect(orcamentoGastoPct({ minutos_fora_aula: 0, orcamento_aula_min: null, medidas_aula: 10 })).toBeNull();
    expect(orcamentoGastoPct({ minutos_fora_aula: 0, orcamento_aula_min: 90, medidas_aula: 0 })).toBeNull();
    expect(orcamentoGastoPct({ minutos_fora_aula: 45, orcamento_aula_min: 90, medidas_aula: 10 })).toBe(50);
  });

  it("contagem traz o denominador, e denominador zero é traço", () => {
    expect(contagem(3, 20)).toBe("3 de 20");
    expect(contagem(0, 0)).toBe("—");
  });

  it("formata com duas casas e nulo é traço", () => {
    expect(formatarDisponibilidade(99.5)).toBe("99,50%");
    expect(formatarDisponibilidade(null)).toBe("—");
  });

  it("os dias saem no fuso de Brasília e terminam hoje", () => {
    const dias = ultimosDias(new Date("2026-11-05T02:00:00Z"));
    expect(dias).toHaveLength(30);
    expect(dias[29]).toBe("2026-11-04");
  });

  it("origem desconhecida aparece crua, sem sumir", () => {
    expect(rotuloDaOrigem("app_api", [])).toBe("App sem alcançar a API");
    expect(rotuloDaOrigem("api", [{ id: "api", nome: "API" }])).toBe("API");
    expect(rotuloDaOrigem("novo", [])).toBe("novo");
  });
});
