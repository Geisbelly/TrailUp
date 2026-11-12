import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { persistenciaAposErro, proporcaoDeTeoria, type LinhaTempo, type LinhaTentativa } from "./indicadoresDeComportamento";

// Paridade com o banco: os mesmos casos rodam no SQL de `fn_perfil_observado_recalcular`
// (20261111_05, `api/tests/test_e2e_perfil_observado_em_sombra.py`). Se a conta mudar num lado,
// o arquivo de casos acusa no outro.

type Caso = {
  nome: string;
  tentativas: { atividade: number; numero: number; acertos: number | null }[];
  conteudo_min: number[];
  atividade_min: number[];
  esperado: Record<"survivor" | "mastermind", { valor: number; n: number } | null>;
};

const { casos } = JSON.parse(
  readFileSync(new URL("../../../../api/tests/fixtures/perfil_observado_casos.json", import.meta.url), "utf-8"),
) as { casos: Caso[] };

function tentativasDo(caso: Caso): LinhaTentativa[] {
  return caso.tentativas.map((t) => ({
    questao_id: t.atividade,
    attempt_number: t.numero,
    is_correct: t.acertos === null ? null : t.acertos >= 100,
  }));
}

function tempoDo(caso: Caso): LinhaTempo[] {
  return [
    ...caso.conteudo_min.map((min) => ({ tipo: "teoria" as const, tempo_ativo_seg: min * 60 })),
    ...caso.atividade_min.map((min) => ({ tipo: "atividade" as const, tempo_ativo_seg: min * 60 })),
  ];
}

function resumo(o: { valor: number; n: number } | null) {
  return o === null ? null : { valor: o.valor, n: o.n };
}

describe("vetor observado: paridade TypeScript × banco", () => {
  it("o arquivo de casos não está vazio", () => {
    expect(casos.length).toBeGreaterThanOrEqual(5);
  });

  for (const caso of casos) {
    it(caso.nome, () => {
      const survivor = resumo(persistenciaAposErro(tentativasDo(caso)));
      const mastermind = resumo(proporcaoDeTeoria(tempoDo(caso)));
      for (const [obtido, esperado] of [
        [survivor, caso.esperado.survivor],
        [mastermind, caso.esperado.mastermind],
      ] as const) {
        if (esperado === null) {
          expect(obtido).toBeNull();
        } else {
          expect(obtido).not.toBeNull();
          expect(obtido!.valor).toBeCloseTo(esperado.valor, 9);
          expect(obtido!.n).toBe(esperado.n);
        }
      }
    });
  }
});
