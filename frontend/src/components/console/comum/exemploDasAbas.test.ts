import { describe, expect, it } from "vitest";
import { estadoDaEntrega } from "../notas/fila";
import { ehAlunoDeExemplo, TOTAL_DE_ALUNOS, TRILHA_DE_EXEMPLO } from "../dashboard/exemploDaPesquisa";
import {
  batalhasDeExemplo,
  ehGuildaDeExemplo,
  entreguesDeExemplo,
  filaDeExemplo,
  ganhadoresDeExemplo,
  guildasDeExemplo,
  perfisDeExemplo,
  posicoesDeExemplo,
  SEM_GUILDA_NO_EXEMPLO,
  TOPICOS_DE_EXEMPLO,
} from "./exemploDasAbas";

import { metricaPorChave, type Limiar, type MetricaChave } from "../conquistas/criterio";
import type { BrainHexProfileKey } from "@/features/signup/brainhex";

const HOJE = new Date("2026-11-24T12:00:00Z");

describe("exemplos das abas da turma de demonstração", () => {
  it("o ranking traz os 32 alunos de exemplo em ordem, com empate dividindo o lugar", () => {
    const p = posicoesDeExemplo("pontuacao", [], HOJE);
    expect(p).toHaveLength(TOTAL_DE_ALUNOS);
    expect(p.every((l) => ehAlunoDeExemplo(l.aluno_id))).toBe(true);
    for (let i = 1; i < p.length; i += 1) {
      expect(p[i - 1].pontuacao!).toBeGreaterThanOrEqual(p[i].pontuacao!);
      if (p[i - 1].pontuacao === p[i].pontuacao) expect(p[i].posicao).toBe(p[i - 1].posicao);
      else expect(p[i].posicao).toBe(i + 1);
    }
    // Quem tem conclusão, acerto e tempo altos no painel lidera a pontuação.
    expect(p[0].aluno_nome).toBe("Paula (exemplo)");
  });

  it("o aluno de verdade entra no meio dos exemplos, na posição da pontuação dele", () => {
    const real = { aluno_id: "uuid-real", aluno_nome: "Aluno de teste", posicao: 1, pontuacao: 999_999 };
    const p = posicoesDeExemplo("percentual", [real], HOJE);
    expect(p).toHaveLength(TOTAL_DE_ALUNOS + 1);
    expect(p[0]).toMatchObject({ aluno_id: "uuid-real", posicao: 1 });
    const zero = posicoesDeExemplo("percentual", [{ ...real, pontuacao: 0 }], HOJE);
    expect(zero[zero.length - 1].aluno_id).toBe("uuid-real");
  });

  it("todo critério dá pontuação inteira e não negativa", () => {
    for (const c of ["pontuacao", "tempo", "acertos", "percentual", "ranqueada", "missoes", "elo"] as const) {
      for (const l of posicoesDeExemplo(c, [], HOJE)) {
        expect(Number.isInteger(l.pontuacao)).toBe(true);
        expect(l.pontuacao!).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("cada aluno de exemplo tem perfil para a tabela", () => {
    expect(perfisDeExemplo(HOJE).size).toBe(TOTAL_DE_ALUNOS);
  });

  it("as guildas usam alunos distintos e deixam o número declarado sem guilda", () => {
    const g = guildasDeExemplo(4, HOJE);
    const membros = g.flatMap((x) => x.membros.map((m) => m.alunoId));
    expect(new Set(membros).size).toBe(membros.length);
    expect(TOTAL_DE_ALUNOS - membros.length).toBe(SEM_GUILDA_NO_EXEMPLO);
    expect(g.every((x) => ehGuildaDeExemplo(x.id) && x.limite === 4 && x.membros.length <= 4)).toBe(true);
  });

  it("o ranking de batalhas bate com os duelos encerrados", () => {
    const { duelos, ranking } = batalhasDeExemplo(HOJE);
    expect(duelos.filter((d) => d.status === "aberto")).toHaveLength(1);
    const encerrados = duelos.filter((d) => d.status === "encerrado");
    for (const linha of ranking) {
      const deles = encerrados.filter((d) => d.guildaNome === linha.nome || d.rivalNome === linha.nome);
      expect(linha.duelos).toBe(deles.length);
      const vitorias = deles.filter(
        (d) => d.resultado === "vitoria" && (d.vencedorEquipe === 1 ? d.guildaNome : d.rivalNome) === linha.nome,
      ).length;
      expect(linha.vitorias).toBe(vitorias);
      expect(linha.empates).toBe(deles.filter((d) => d.resultado === "empate").length);
    }
    const nomesDasGuildas = new Set(guildasDeExemplo(4, HOJE).map((g) => g.nome));
    expect(ranking.every((l) => nomesDasGuildas.has(l.nome))).toBe(true);
  });

  it("a fila de notas tem entregas em todos os estados, nos tópicos de exemplo", () => {
    const fila = filaDeExemplo(HOJE);
    const estados = new Set(fila.map(estadoDaEntrega));
    expect(estados).toEqual(new Set(["revisar", "sem_nota", "sem_entrega", "corrigida"]));
    const topicos = new Set(TOPICOS_DE_EXEMPLO.map((t) => t.id));
    expect(fila.every((l) => ehAlunoDeExemplo(l.alunoId) && topicos.has(l.topicoId))).toBe(true);
    const chaves = fila.map((l) => `${l.alunoId}-${l.atividadeId}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("entregas de exemplo ficam dentro da turma de exemplo e não mudam entre leituras", () => {
    for (const id of [1, 2, 33, 150, 9999]) {
      expect(entreguesDeExemplo(id)).toBeGreaterThan(0);
      expect(entreguesDeExemplo(id)).toBeLessThanOrEqual(TOTAL_DE_ALUNOS);
      expect(entreguesDeExemplo(id)).toBe(entreguesDeExemplo(id));
    }
  });

  describe("ganhadores de exemplo seguem o critério da conquista", () => {
    const conquista = (chave: MetricaChave, limiar: Limiar, perfil: BrainHexProfileKey | null = null) => ({
      escopo: perfil ? ("perfil" as const) : ("comum" as const),
      perfil,
      criterio: { metrica: metricaPorChave(chave)!, limiar, aparencia: null },
    });
    const n = (chave: MetricaChave, limiar: Limiar, perfil: BrainHexProfileKey | null = null) =>
      ganhadoresDeExemplo(conquista(chave, limiar, perfil), HOJE);

    it("uma atividade entregue: todos os alunos de exemplo, que já avançaram na trilha", () => {
      expect(n("atividades_concluidas", 1)).toBe(TOTAL_DE_ALUNOS);
    });

    it("limiar mais alto nunca tem mais ganhadores", () => {
      for (const chave of ["atividades_concluidas", "minutos_totais", "acertos_percentual", "topicos_visitados"] as const) {
        expect(n(chave, 4)).toBeGreaterThanOrEqual(n(chave, 8));
      }
      expect(n("acertos_percentual", 50)).toBeGreaterThan(n("acertos_percentual", 90));
      expect(n("acertos_percentual", 90)).toBeGreaterThan(0);
      expect(n("atividade_rapida", 5)).toBeLessThanOrEqual(n("atividade_rapida", 30));
    });

    it("todos os tópicos é o mesmo que o número de tópicos da trilha", () => {
      expect(n("topicos_visitados", "todos")).toBe(n("topicos_visitados", TRILHA_DE_EXEMPLO.length));
    });

    it("conquista por perfil conta só quem tem o perfil entre os representativos", () => {
      const porPerfil = n("atividades_concluidas", 1, "seeker");
      expect(porPerfil).toBeGreaterThan(0);
      expect(porPerfil).toBeLessThan(TOTAL_DE_ALUNOS);
    });
  });
});
