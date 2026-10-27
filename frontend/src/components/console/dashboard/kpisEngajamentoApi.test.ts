import { beforeEach, describe, expect, it, vi } from "vitest";

const sb = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: sb.rpc } }));

import { carregarKpisEngajamentoTurma } from "./kpisEngajamentoApi";

const resposta = {
  versao: 1,
  classe_id: 54,
  periodo: {
    inicio: "2026-10-05",
    fim: "2026-10-18",
    timezone: "America/Sao_Paulo",
    inicio_utc: "2026-10-05T03:00:00Z",
    fim_exclusivo_utc: "2026-10-19T03:00:00Z",
    dias: 14,
  },
  populacao: { alunos_matriculados: 2 },
  engajamento: {
    alunos_ativos: 0,
    taxa_atividade_pct: 0,
    tempo_ativo_seg: 0,
    tempo_presenca_seg: 0,
    tempo_ocioso_seg: 0,
    tempo_ativo_medio_por_aluno_ativo_seg: null,
    sessoes: 0,
    alunos_com_sessao: 0,
    sessoes_media_por_aluno_ativo: null,
  },
  retorno_semanal: {
    definicao: "ativo_em_duas_semanas_calendario_completas_consecutivas",
    retornaram: 0,
    elegiveis: 0,
    taxa_pct: null,
    semanas: [],
  },
  jornada_sessoes: {
    total: 0,
    concluidas: 0,
    encerradas_sem_conclusao: 0,
    em_aberto: 0,
  },
  estado_atual: {
    medido_em: "2026-10-26T15:00:00Z",
    historico_disponivel: false,
    conclusao: { alvos: 0, concluidos: 0, taxa_pct: null },
    personalizacao: {
      definicao_elegivel: "perfil_dominante_ou_segundo_com_afinidade_maior_que_20",
      perfis: [],
    },
  },
} as const;

beforeEach(() => sb.rpc.mockReset());

describe("carregarKpisEngajamentoTurma", () => {
  it("envia período e timezone com os nomes da RPC", async () => {
    sb.rpc.mockResolvedValue({ data: resposta, error: null });

    await carregarKpisEngajamentoTurma(
      54,
      "2026-10-05",
      "2026-10-18",
      "America/Recife",
    );

    expect(sb.rpc).toHaveBeenCalledWith("metricas_engajamento_turma", {
      p_classe_id: 54,
      p_inicio: "2026-10-05",
      p_fim: "2026-10-18",
      p_timezone: "America/Recife",
    });
  });

  it("preserva ausência de medida como null, sem fabricar zero", async () => {
    sb.rpc.mockResolvedValue({ data: resposta, error: null });

    const kpis = await carregarKpisEngajamentoTurma(
      54,
      "2026-10-05",
      "2026-10-18",
    );

    expect(kpis.engajamento.tempo_ativo_medio_por_aluno_ativo_seg).toBeNull();
    expect(kpis.engajamento.sessoes_media_por_aluno_ativo).toBeNull();
    expect(kpis.retorno_semanal.taxa_pct).toBeNull();
    expect(kpis.estado_atual.conclusao.taxa_pct).toBeNull();
  });

  it("propaga o erro do Supabase", async () => {
    const erro = { code: "42501", message: "sem_permissao" };
    sb.rpc.mockResolvedValue({ data: null, error: erro });

    await expect(
      carregarKpisEngajamentoTurma(54, "2026-10-05", "2026-10-18"),
    ).rejects.toBe(erro);
  });

  it("recusa payload que não cumpre a versão do contrato", async () => {
    sb.rpc.mockResolvedValue({ data: { versao: 2 }, error: null });

    await expect(
      carregarKpisEngajamentoTurma(54, "2026-10-05", "2026-10-18"),
    ).rejects.toThrow("resposta_invalida_metricas_engajamento");
  });
});
