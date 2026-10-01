import { describe, expect, it } from "vitest";
import {
  comparacaoComMedia,
  destaques,
  erroMedio,
  faixaDeErro,
  idDoConteudoNaChave,
  metricasPorConteudo,
  type MetricaDeConteudo,
} from "./conteudo";

describe("idDoConteudoNaChave", () => {
  it("lê o conteúdo do professor no segundo pedaço, como o banco", () => {
    expect(idDoConteudoNaChave("content:192:personalization:3832:personalized:131:content:6")).toBe(192);
    expect(idDoConteudoNaChave("content:7")).toBe(7);
  });

  it("ignora outros prefixos e ids não numéricos", () => {
    expect(idDoConteudoNaChave("slide:7:takeaway:7-0")).toBeNull();
    expect(idDoConteudoNaChave("activity:12")).toBeNull();
    expect(idDoConteudoNaChave("content:abc")).toBeNull();
  });
});

describe("metricasPorConteudo", () => {
  const base = {
    conteudos: [
      { id: 1, topico_id: 10, titulo: "Cinemática", tipo: "arquivo", ordem: 1 },
      { id: 2, topico_id: 10, titulo: "Vetores", tipo: "arquivo", ordem: 2 },
      { id: 3, topico_id: 99, titulo: "Órfão", tipo: null, ordem: 1 },
    ],
    topicos: [{ id: 10, classe_id: 1, nome: "Movimento" }],
    matriculas: [
      { aluno_id: "a", classe_id: 1 },
      { aluno_id: "b", classe_id: 1 },
      { aluno_id: "c", classe_id: 1 },
    ],
    conteudoAluno: [
      { aluno_id: "a", conteudo_id: 1, status: "concluido", percentual_concluido: 100 },
      { aluno_id: "b", conteudo_id: 1, status: "não iniciado", percentual_concluido: 0 },
      { aluno_id: "c", conteudo_id: 1, status: "em andamento", percentual_concluido: 30 },
      { aluno_id: "fora", conteudo_id: 1, status: "concluido", percentual_concluido: 100 },
    ],
    progressoPersonalizado: [
      { aluno_id: "b", classe_id: 1, item_key: "content:1:personalization:9:personalized:1:content:2" },
      { aluno_id: "b", classe_id: 1, item_key: "slide:3:quiz" },
    ],
    vinculos: [
      { atividade_id: 100, conteudo_id: 2 },
      { atividade_id: 101, conteudo_id: 2 },
    ],
    atividadeAluno: [
      { aluno_id: "a", atividade_id: 100, status: "concluido", acertos_percentual: 80 },
      { aluno_id: "b", atividade_id: 101, status: "concluido", acertos_percentual: 40 },
      { aluno_id: "c", atividade_id: 100, status: "não iniciado", acertos_percentual: 0 },
      { aluno_id: "fora", atividade_id: 100, status: "concluido", acertos_percentual: 0 },
    ],
  };

  const r = metricasPorConteudo(base);

  it("consumo junta progresso do conteúdo e material personalizado, só de matriculados", () => {
    expect(r.find((m) => m.conteudoId === 1)).toMatchObject({ alunos: 3, abriram: 3, concluiram: 1, topico: "Movimento", classeId: 1 });
  });

  it("erro só com tentativas concluídas de matriculados nas atividades ligadas", () => {
    expect(r.find((m) => m.conteudoId === 2)).toMatchObject({ erroPct: 40, tentativas: 2, abriram: 0 });
    expect(r.find((m) => m.conteudoId === 1)?.erroPct).toBeNull();
  });

  it("conteúdo de tópico fora do escopo não entra", () => {
    expect(r.map((m) => m.conteudoId)).toEqual([1, 2]);
  });
});

const metrica = (p: Partial<MetricaDeConteudo>): MetricaDeConteudo => ({
  conteudoId: 1,
  titulo: "A",
  topico: "T",
  classeId: 1,
  formato: null,
  alunos: 10,
  abriram: 0,
  concluiram: 0,
  erroPct: null,
  tentativas: 0,
  ...p,
});

describe("destaques", () => {
  it("mais consumido, maior dificuldade e maior conclusão, cada um da própria medida", () => {
    const d = destaques([
      metrica({ conteudoId: 1, titulo: "A", abriram: 9, concluiram: 2, erroPct: 10, tentativas: 5 }),
      metrica({ conteudoId: 2, titulo: "B", abriram: 5, concluiram: 8, erroPct: 54, tentativas: 5 }),
    ]);
    expect([d.maisConsumido?.conteudoId, d.maiorDificuldade?.conteudoId, d.maiorConclusao?.conteudoId]).toEqual([1, 2, 2]);
  });

  it("sem dado para a medida, o destaque é null (nada de card com zero)", () => {
    const d = destaques([metrica({ abriram: 0, concluiram: 0 })]);
    expect(d).toEqual({ maisConsumido: null, maiorDificuldade: null, maiorConclusao: null });
  });

  it("empate decide pelo título, para o card não trocar sozinho", () => {
    const d = destaques([metrica({ conteudoId: 2, titulo: "Zeta", abriram: 5 }), metrica({ conteudoId: 1, titulo: "Alfa", abriram: 5 })]);
    expect(d.maisConsumido?.titulo).toBe("Alfa");
  });
});

describe("erroMedio, faixaDeErro e comparacaoComMedia", () => {
  it("média de erro ponderada pelas tentativas", () => {
    expect(erroMedio([metrica({ erroPct: 10, tentativas: 3 }), metrica({ erroPct: 50, tentativas: 1 })])).toBe(20);
    expect(erroMedio([metrica({})])).toBeNull();
  });

  it("faixas de erro", () => {
    expect([10, 15, 16, 39, 40].map(faixaDeErro)).toEqual(["baixo", "baixo", "medio", "medio", "alto"]);
  });

  it("comparação com 5 pontos de tolerância", () => {
    expect(comparacaoComMedia(54, 29)).toBe("pior que a média da turma (29%)");
    expect(comparacaoComMedia(10, 29)).toBe("melhor que a média da turma (29%)");
    expect(comparacaoComMedia(31, 29)).toBe("na média da turma (29%)");
    expect(comparacaoComMedia(31, null)).toBeNull();
  });
});
