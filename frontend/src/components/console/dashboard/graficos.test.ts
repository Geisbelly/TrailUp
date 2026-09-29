import { describe, expect, it } from "vitest";
import type { TurmaDistribuicao, TurmaPerfilMetricas } from "../useTurmaKpis";
import { abandonoPorPerfil, distribuicaoDeNotas, tomDaFaixa } from "./graficos";

const linhaPerfil = (p: Partial<TurmaPerfilMetricas>): TurmaPerfilMetricas => ({
  classe_id: 1,
  segmento: "majoritario",
  perfil_nome: "Seeker",
  total_alunos_segmento: 10,
  taxa_abandono_pct: 0,
  media_nota: 0,
  taxa_acertos_pct: 0,
  taxa_uso_chat_pct: 0,
  uso_chat_apos_erro_pct: 0,
  ...p,
});

describe("abandonoPorPerfil", () => {
  it("devolve sempre os 7 perfis na ordem fixa, com null onde não há dado", () => {
    const r = abandonoPorPerfil([linhaPerfil({ perfil_nome: "Achiever", taxa_abandono_pct: 18 })], "majoritario");
    expect(r.map((x) => x.perfil)).toEqual(["seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever"]);
    expect(r[6].valor).toBe(18);
    expect(r[0].valor).toBeNull();
  });

  it("filtra pelo segmento escolhido", () => {
    const linhas = [
      linhaPerfil({ segmento: "majoritario", taxa_abandono_pct: 10 }),
      linhaPerfil({ segmento: "segundo", taxa_abandono_pct: 40 }),
    ];
    expect(abandonoPorPerfil(linhas, "segundo")[0].valor).toBe(40);
  });

  it("junta turmas do mesmo perfil ponderando pelos alunos do segmento", () => {
    const linhas = [
      linhaPerfil({ classe_id: 1, total_alunos_segmento: 30, taxa_abandono_pct: 10 }),
      linhaPerfil({ classe_id: 2, total_alunos_segmento: 10, taxa_abandono_pct: 50 }),
    ];
    expect(abandonoPorPerfil(linhas, "majoritario")[0].valor).toBe(20);
  });

  it("sem alunos para ponderar, cai na média simples", () => {
    const linhas = [
      linhaPerfil({ classe_id: 1, total_alunos_segmento: 0, taxa_abandono_pct: 10 }),
      linhaPerfil({ classe_id: 2, total_alunos_segmento: 0, taxa_abandono_pct: 30 }),
    ];
    expect(abandonoPorPerfil(linhas, "majoritario")[0].valor).toBe(20);
  });
});

describe("tomDaFaixa", () => {
  it("decide pelo nome, com ou sem acento", () => {
    expect(tomDaFaixa("alta")).toBe("success");
    expect(tomDaFaixa("Média-alta")).toBe("info");
    expect(tomDaFaixa("media_alta")).toBe("info");
    expect(tomDaFaixa("média")).toBe("warning");
    expect(tomDaFaixa("Baixa")).toBe("destructive");
    expect(tomDaFaixa("0 a 4")).toBeNull();
  });
});

describe("distribuicaoDeNotas", () => {
  const linha = (faixa: string, total: number, metrica = "nota_media", classe_id = 1): TurmaDistribuicao => ({
    classe_id,
    metrica,
    faixa,
    total_alunos: total,
    percentual: 0,
  });

  it("soma as turmas por faixa, ignora outras métricas e ordena da mais alta para a mais baixa", () => {
    const r = distribuicaoDeNotas([
      linha("baixa", 2),
      linha("alta", 5),
      linha("media", 3),
      linha("alta", 4, "nota_media", 2),
      linha("alta", 99, "tempo_uso"),
    ]);
    expect(r).toEqual([
      { faixa: "alta", total: 9, tom: "success" },
      { faixa: "media", total: 3, tom: "warning" },
      { faixa: "baixa", total: 2, tom: "destructive" },
    ]);
  });
});
