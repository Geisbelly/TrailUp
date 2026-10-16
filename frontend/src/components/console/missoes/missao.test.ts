import { describe, expect, it } from "vitest";
import { FORMULARIO_DE_MISSAO_VAZIO, percentualDeEntrega, prazoParaCampo, resumoDeEntregas, rotuloDoPrazo, validarMissao, type FormularioDeMissao } from "./missao";

const base = (extra: Partial<FormularioDeMissao> = {}): FormularioDeMissao => ({
  titulo: "Cinemática em movimento",
  objetivo: "Prever e comparar tempos de queda.",
  topicoId: "12",
  prazo: "",
  moedas: "",
  pontos: "50",
  ...extra,
});

describe("validarMissao", () => {
  it("monta um payload de atividade com tipo 'missao', objetivo na descrição e pontuação máxima", () => {
    const r = validarMissao(base({ titulo: "  Missão  Um ", objetivo: " alvo " }));
    expect(r.ok).toBe(true);
    expect(r.payload).toEqual({ topico_id: 12, titulo: "Missão  Um", descricao: "alvo", tipo: "missao", data_entrega: null, pontuacao_maxima: 50, moedas: 0 });
    expect(r.erros).toBeNull();
  });

  it("prazo preenchido vira ISO; inválido é erro", () => {
    const ok = validarMissao(base({ prazo: "2026-10-20T23:59" }));
    expect(ok.payload!.data_entrega).toBe(new Date("2026-10-20T23:59").toISOString());
    expect(validarMissao(base({ prazo: "ontem" })).erros!.prazo).toBeTruthy();
  });

  it("título, objetivo, tópico e pontos são obrigatórios", () => {
    const r = validarMissao(FORMULARIO_DE_MISSAO_VAZIO);
    expect(r.ok).toBe(false);
    expect(r.payload).toBeNull();
    expect(Object.keys(r.erros!).sort()).toEqual(["objetivo", "pontos", "titulo", "topicoId"]);
  });

  it("limites de tamanho", () => {
    expect(validarMissao(base({ titulo: "ab" })).erros!.titulo).toBeTruthy();
    expect(validarMissao(base({ titulo: "x".repeat(81) })).erros!.titulo).toBeTruthy();
    expect(validarMissao(base({ objetivo: "x".repeat(601) })).erros!.objetivo).toBeTruthy();
  });

  it("pontuação: inteiro de 1 a 1000", () => {
    for (const p of ["0", "-5", "1,5", "abc", "1001", ""]) expect(validarMissao(base({ pontos: p })).erros!.pontos).toBeTruthy();
    expect(validarMissao(base({ pontos: "1000" })).ok).toBe(true);
  });

  it("tópico precisa ser id positivo", () => {
    for (const t of ["", "0", "-2", "x"]) expect(validarMissao(base({ topicoId: t })).erros!.topicoId).toBeTruthy();
  });
});

describe("prazo", () => {
  it("ida e volta pelo campo datetime-local, no fuso do navegador", () => {
    const campo = "2026-10-20T23:59";
    expect(prazoParaCampo(new Date(campo).toISOString())).toBe(campo);
  });
  it("vazio ou inválido vira vazio", () => {
    expect(prazoParaCampo(null)).toBe("");
    expect(prazoParaCampo("x")).toBe("");
  });
  it("rótulo curto da lista", () => {
    expect(rotuloDoPrazo(new Date(2026, 8, 28, 12).toISOString())).toBe("28/09");
    expect(rotuloDoPrazo(null)).toBe("Sem prazo");
  });
});

describe("entregas", () => {
  it("resumo e percentual, sem dividir por zero nem passar de 100%", () => {
    expect(resumoDeEntregas(19, 34)).toBe("19/34");
    expect(resumoDeEntregas(40, 34)).toBe("34/34");
    expect(percentualDeEntrega(17, 34)).toBe(50);
    expect(percentualDeEntrega(0, 0)).toBe(0);
    expect(percentualDeEntrega(50, 34)).toBe(100);
  });
});

describe("moedas", () => {
  it("vazio é nenhuma; inteiro de 0 a 1000 passa", () => {
    expect(validarMissao(base()).payload.moedas).toBe(0);
    expect(validarMissao(base({ moedas: "25" })).payload.moedas).toBe(25);
    expect(validarMissao(base({ moedas: "1000" })).ok).toBe(true);
  });
  it("rejeita negativo, decimal, texto e acima do teto", () => {
    for (const m of ["-1", "2,5", "abc", "1001"]) expect(validarMissao(base({ moedas: m })).erros.moedas).toBeTruthy();
  });
});
