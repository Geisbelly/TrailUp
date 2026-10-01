import { describe, expect, it } from "vitest";
import { chaveAlunoTurma, juntarSinais } from "./sinais";

describe("juntarSinais", () => {
  it("abandono e última sessão por aluno e turma, sem misturar turmas", () => {
    const sinais = juntarSinais(
      [
        { aluno_id: "a", classe_id: 1, taxa_abandono_pct: 40 },
        { aluno_id: "a", classe_id: 2, taxa_abandono_pct: null },
      ],
      [
        { aluno_id: "a", classe_id: 1, dia: "2026-09-20" },
        { aluno_id: "a", classe_id: 1, dia: "2026-09-27T00:00:00" },
        { aluno_id: "a", classe_id: 2, dia: "2026-09-21" },
        { aluno_id: "b", classe_id: 1, dia: "2026-09-22" },
      ],
    );
    expect(sinais.get(chaveAlunoTurma("a", 1))).toEqual({ abandonoPct: 40, ultimaSessao: "2026-09-27" });
    expect(sinais.get(chaveAlunoTurma("a", 2))).toEqual({ abandonoPct: null, ultimaSessao: "2026-09-21" });
    expect(sinais.get(chaveAlunoTurma("b", 1))).toEqual({ abandonoPct: null, ultimaSessao: "2026-09-22" });
    expect(sinais.get(chaveAlunoTurma("c", 1))).toBeUndefined();
  });
});
