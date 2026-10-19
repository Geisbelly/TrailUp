import { describe, expect, it } from "vitest";
import { CRITERIOS, criterioValido, formatarPontos, perfisDominantes, podio, rotuloDoCriterio } from "./rankings";

const p = (n: number) => ({ aluno_id: `a${n}`, aluno_nome: `Aluno ${n}`, posicao: n, pontuacao: n * 10 });

describe("podio", () => {
  it("ordena visualmente 2º, 1º, 3º", () => {
    expect(podio([p(1), p(2), p(3), p(4)]).map((x) => x.aluno?.aluno_id)).toEqual(["a2", "a1", "a3"]);
  });
  it("mantém a coluna quando faltam alunos", () => {
    const r = podio([p(1)]);
    expect(r.map((x) => x.lugar)).toEqual([2, 1, 3]);
    expect(r[0].aluno).toBeNull();
  });
});

describe("critério", () => {
  it("desconhecido vira pontuação", () => expect(criterioValido("xyz")).toBe("pontuacao"));
  // `percentual` é o `rank_tipo` 1 do banco ("Percentual Concluído") e o mobile já o trata
  // como percentual. Faltando no vocabulário do console, caía no fallback e o mesmo ranking
  // aparecia como "pontuação" para o professor e como percentual para o aluno.
  it("percentual é reconhecido, não cai no fallback", () => {
    expect(criterioValido("percentual")).toBe("percentual");
    expect(rotuloDoCriterio("percentual")).toBe("percentual");
  });
  it("os critérios do banco todos se reconhecem", () => {
    for (const c of ["percentual", "pontuacao", "tempo"]) expect(criterioValido(c)).toBe(c);
  });
  it("rótulo em minúsculas", () => expect(rotuloDoCriterio("tempo")).toBe("tempo"));

  // Esta lista espelha o `CASE rt.criterio` de `vw_rank_posicoes_por_classe_todas`, que
  // termina em `ELSE 0`: critério fora do CASE ranqueia a turma inteira em zero, em silêncio.
  // Os cinco entraram na view em `20261021_06` — medido antes: ranking de `acertos` mostrava
  // zero para todos, e `percentual` era reescrito para `pontuacao` ao abrir a edição.
  it.each(["pontuacao", "tempo", "acertos", "percentual", "ranqueada", "missoes"])(
    "%s é expressável e não é reescrito",
    (chave) => {
      expect(CRITERIOS.map((c) => c.chave)).toContain(chave);
      expect(criterioValido(chave)).toBe(chave);
    },
  );

  it("todo critério da lista tem rótulo", () => {
    for (const { chave, rotulo } of CRITERIOS) {
      expect(rotulo.trim(), `${chave} sem rótulo`).not.toBe("");
    }
  });
});

describe("perfisDominantes", () => {
  it("escolhe a maior afinidade e ignora perfil desconhecido", () => {
    const m = perfisDominantes([
      { aluno_id: "a", afinidade: 30, perfil: { nome: "Seeker" } },
      { aluno_id: "a", afinidade: 70, perfil: { nome: "Achiever" } },
      { aluno_id: "b", afinidade: 90, perfil: { nome: "Outro" } },
    ]);
    expect(m.get("a")).toBe("achiever");
    expect(m.has("b")).toBe(false);
  });
});

describe("formatarPontos", () => {
  it("nulo vira traço", () => expect(formatarPontos(null)).toBe("—"));
  it("separa milhar", () => expect(formatarPontos(2940)).toBe("2.940"));
});
