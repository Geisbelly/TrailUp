import { describe, expect, it } from "vitest";
import { avaliarRisco, type MotivoDoModelo, type SinaisDoBanco } from "./risco";
import { fatorPrincipal, primeiroNome, sugestaoDoFator, sugestaoDoFatorDeReprovacao } from "./sugestaoDoRisco";

const hoje = new Date("2026-10-31T15:00:00Z");
const turma = { notaMedia: 7.4 };
const nada: SinaisDoBanco = {
  semDado: false,
  ultimaAtividadeEm: "2026-10-30T12:00:00Z",
  inativoDesde: null,
  evadidoDesde: null,
  estagnadoDesde: null,
  estagnadoTopico: null,
  riscoFaixa: "normal",
  riscoOrigem: "modelo",
};
const risco = (sinais: Partial<SinaisDoBanco>, nota: number | null = null) => {
  const r = avaliarRisco({ sinais: { ...nada, ...sinais }, nota }, turma, hoje);
  if (!r) throw new Error("esperava risco");
  return r;
};

// DAT-45: o sistema não mede emoção; a sugestão não pode atribuí-la ao aluno.
const EMOCAO = /ansios|ansiedade|frustra|sobrecarg|estress|desmotiv|trist|depress|diagn/i;

describe("sugestaoDoFator", () => {
  it("tópico parado: cita o tópico e o nome", () => {
    const r = risco({ estagnadoDesde: "2026-10-16T12:00:00Z", estagnadoTopico: "Frações" });
    expect(sugestaoDoFator(r.fatores[0], "Ana")).toBe(
      "Abra Frações com Ana: pergunte em que ponto travou e ofereça o próximo material em outro formato (áudio ou apresentação).",
    );
  });

  it("tópico parado sem nome conhecido não inventa tópico", () => {
    const r = risco({ estagnadoDesde: "2026-10-16T12:00:00Z", estagnadoTopico: null });
    expect(sugestaoDoFator(r.fatores[0], "Ana")).toContain("Abra o tópico parado com Ana");
  });

  it("evasão: contato fora do app, com os dias medidos", () => {
    const desde = "2026-09-30T12:00:00Z";
    const r = risco({ inativoDesde: desde, evadidoDesde: desde });
    const texto = sugestaoDoFator(r.fatores[0], "Bia");
    expect(texto).toContain("Procure Bia fora do app");
    expect(texto).toContain("há 31 dias sem estudar");
  });

  it("inatividade e nota têm ação própria", () => {
    const r = risco({ inativoDesde: "2026-10-22T12:00:00Z" }, 4);
    expect(sugestaoDoFator(r.fatores[0], "Caio")).toContain("convite para retomar");
    expect(sugestaoDoFator(r.fatores[1], "Caio")).toContain("atividades que baixaram a nota");
  });

  it.each<[MotivoDoModelo, string]>([
    ["entregas_perdidas", "nova data para as atividades vencidas"],
    ["uso_caiu", "combine um horário curto de estudo"],
    ["entrega_atrasada", "lembre o prazo da próxima atividade"],
    ["sem_nota", "primeira atividade avaliada"],
    ["nota_baixa", "atividades que baixaram a nota"],
  ])("risco do modelo com motivo %s leva à ação desse motivo", (motivo, trecho) => {
    const r = risco({ riscoFaixa: "alto", riscoMotivo: motivo });
    expect(sugestaoDoFator(r.fatores[0], "Davi")).toContain(trecho);
  });

  it("risco do modelo sem motivo dá uma ação genérica, sem afirmar causa", () => {
    const r = risco({ riscoFaixa: "alto" });
    expect(sugestaoDoFator(r.fatores[0], "Eva")).toBe(
      "Converse com Eva sobre como está o estudo e combine o próximo passo da trilha.",
    );
  });

  it("nenhuma sugestão fala de emoção ou saúde", () => {
    const motivos: (MotivoDoModelo | null)[] = ["entregas_perdidas", "uso_caiu", "entrega_atrasada", "sem_nota", "nota_baixa", null];
    const textos = [
      ...motivos.map((m) => sugestaoDoFator(risco({ riscoFaixa: "alto", riscoMotivo: m }).fatores[0], "Ana")),
      ...risco({ inativoDesde: "2026-10-22T12:00:00Z", estagnadoDesde: "2026-10-16T12:00:00Z" }, 3).fatores.map((f) =>
        sugestaoDoFator(f, "Ana"),
      ),
      ...["queda_de_atividade", "acertos_baixos", "faltas", "prazos_perdidos", "abandono_recorrente"].map((f) =>
        sugestaoDoFatorDeReprovacao({ fator: f, texto: "" }, "Ana"),
      ),
    ];
    for (const t of textos) expect(t).not.toMatch(EMOCAO);
  });
});

describe("fatorPrincipal", () => {
  it("o modelo com motivo é o que mais pesou", () => {
    const r = risco({ riscoFaixa: "alto", riscoMotivo: "uso_caiu", inativoDesde: "2026-10-22T12:00:00Z" });
    expect(fatorPrincipal(r).criterio).toBe("abandono");
  });

  it("o modelo sem motivo cede a vez ao fato seguinte", () => {
    const r = risco({ riscoFaixa: "alto", estagnadoDesde: "2026-10-16T12:00:00Z", estagnadoTopico: "Frações" });
    expect(fatorPrincipal(r).criterio).toBe("estagnacao");
  });

  it("o modelo sem motivo e sozinho continua sendo o principal", () => {
    expect(fatorPrincipal(risco({ riscoFaixa: "atencao" })).criterio).toBe("abandono");
  });
});

describe("sugestaoDoFatorDeReprovacao", () => {
  it("cada fator da RPC tem ação; prazos e queda reusam as do modelo", () => {
    expect(sugestaoDoFatorDeReprovacao({ fator: "prazos_perdidos", texto: "" }, "Ana")).toContain("atividades vencidas");
    expect(sugestaoDoFatorDeReprovacao({ fator: "queda_de_atividade", texto: "" }, "Ana")).toContain("caiu nesta semana");
    expect(sugestaoDoFatorDeReprovacao({ fator: "acertos_baixos", texto: "" }, "Ana")).toContain("questões erradas");
    expect(sugestaoDoFatorDeReprovacao({ fator: "faltas", texto: "" }, "Ana")).toContain("aulas perdidas");
    expect(sugestaoDoFatorDeReprovacao({ fator: "abandono_recorrente", texto: "" }, "Ana")).toContain("partes menores");
  });

  it("fator desconhecido fica sem sugestão em vez de uma inventada", () => {
    expect(sugestaoDoFatorDeReprovacao({ fator: "novo_fator", texto: "x" }, "Ana")).toBeNull();
  });
});

describe("primeiroNome", () => {
  it("pega o primeiro nome e não quebra com nome vazio", () => {
    expect(primeiroNome("  Ana Maria Souza ")).toBe("Ana");
    expect(primeiroNome("")).toBe("o aluno");
  });

  it("sem nome, a frase que começa pelo nome começa com maiúscula", () => {
    expect(sugestaoDoFatorDeReprovacao({ fator: "abandono_recorrente", texto: "" }, "o aluno")).toMatch(/^O aluno abre/);
  });
});
