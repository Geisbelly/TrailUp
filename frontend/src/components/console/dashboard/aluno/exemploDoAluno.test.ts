import { describe, expect, it } from "vitest";
import { alunosDeExemplo, TOTAL_DE_ALUNOS } from "../exemploDaPesquisa";
import { montarJornada } from "./jornada";
import {
  cuidadoDeExemplo,
  evolucaoDeExemplo,
  jornadaDeExemplo,
  personalizacaoDeExemplo,
  tentativasDeExemplo,
} from "./exemploDoAluno";

const HOJE = new Date("2026-11-24T15:00:00");
const ALUNOS = alunosDeExemplo(7, "Turma de demonstração", HOJE);

describe("detalhe dos alunos de exemplo", () => {
  it("todo aluno de exemplo tem trilha, modo e última atividade", () => {
    expect(ALUNOS).toHaveLength(TOTAL_DE_ALUNOS);
    for (const a of ALUNOS) {
      expect(a.topicos).toHaveLength(6);
      expect(a.modoOperacao).not.toBe("");
      expect(a.ultimaAtividade).toBeTruthy();
      // A trilha soma a conclusão da tabela.
      const media = a.topicos.reduce((s, t) => s + t.percentual, 0) / a.topicos.length;
      expect(media).toBeCloseTo(a.porcentagemConcluida, 5);
    }
  });

  it("a evolução termina na nota, nos acertos e na conclusão do cartão", () => {
    const evolucao = evolucaoDeExemplo(7, HOJE);
    for (const a of ALUNOS) {
      const serie = evolucao.filter((l) => l.aluno_id === a.id).sort((x, y) => x.dia.localeCompare(y.dia));
      expect(serie.length).toBeGreaterThan(1);
      const ultimo = serie[serie.length - 1];
      expect(ultimo.nota_media_desempenho).toBe(a.notaMedia);
      expect(ultimo.taxa_acertos_pct).toBe(a.acertosPercentual);
      expect(ultimo.progresso_trilha_pct).toBe(a.porcentagemConcluida);
      expect(ultimo.classe_id).toBe(7);
    }
  });

  it("todos têm tentativas, jornada e personalização; os em risco também têm cuidado", () => {
    let comCuidado = 0;
    for (const a of ALUNOS) {
      const tentativas = tentativasDeExemplo(a.id, HOJE);
      expect(tentativas?.atividades.length).toBeGreaterThan(0);
      expect(tentativas?.regra.duracaoSeg).toBe(600);
      const jornada = jornadaDeExemplo(a.id, HOJE);
      expect(jornada?.eventos.length).toBeGreaterThan(0);
      const montada = montarJornada({
        eventos: jornada!.eventos,
        topicos: jornada!.topicos,
        sessoes: jornada!.sessoes,
        totalAtividades: jornada!.atividades.length,
        topicosConcluidos: new Set(a.topicos.filter((t) => t.status === "concluido").map((t) => t.id)),
        agora: HOJE,
      });
      expect(montada.passos.length).toBeGreaterThan(0);
      const personalizacao = personalizacaoDeExemplo(a.id, HOJE);
      expect(personalizacao?.personalizacoes.length).toBeGreaterThan(0);
      expect(personalizacao?.progressoItens.length).toBe(personalizacao!.personalizacoes.length * 4);
      const cuidado = cuidadoDeExemplo(a.id, HOJE);
      if (a.riscoFaixa !== "normal") expect(cuidado?.momentos.length).toBeGreaterThan(0);
      if (cuidado?.momentos.length) comCuidado += 1;
    }
    expect(comCuidado).toBeGreaterThanOrEqual(7);
  });

  it("as tentativas ficam em torno dos acertos e ninguém passa de três", () => {
    for (const a of ALUNOS) {
      for (const r of tentativasDeExemplo(a.id, HOJE)!.atividades) {
        expect(r.feitas).toBeLessThanOrEqual(3);
        if (r.ultima?.acertos != null) expect(Math.abs(r.ultima.acertos - a.acertosPercentual)).toBeLessThanOrEqual(10);
      }
    }
  });

  it("aluno de verdade não recebe dado de exemplo", () => {
    const id = "6f1c2d3e-0000-4000-8000-000000000001";
    expect(tentativasDeExemplo(id, HOJE)).toBeNull();
    expect(jornadaDeExemplo(id, HOJE)).toBeNull();
    expect(cuidadoDeExemplo(id, HOJE)).toBeNull();
    expect(personalizacaoDeExemplo(id, HOJE)).toBeNull();
    expect(evolucaoDeExemplo(7, HOJE).some((l) => l.aluno_id === id)).toBe(false);
  });

  it("é determinístico para o mesmo dia", () => {
    expect(jornadaDeExemplo(ALUNOS[4].id, HOJE)).toEqual(jornadaDeExemplo(ALUNOS[4].id, HOJE));
    expect(tentativasDeExemplo(ALUNOS[8].id, HOJE)).toEqual(tentativasDeExemplo(ALUNOS[8].id, HOJE));
  });
});
