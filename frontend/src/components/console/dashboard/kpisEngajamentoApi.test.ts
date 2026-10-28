import { beforeEach, describe, expect, it, vi } from "vitest";

const sb = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: sb.rpc } }));

import {
  carregarCoortesEngajamentoTurma,
  carregarKpisEngajamentoTurma,
} from "./kpisEngajamentoApi";

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

const perfis = [
  "seeker",
  "survivor",
  "daredevil",
  "mastermind",
  "conqueror",
  "socializer",
  "achiever",
] as const;

const coorte = (
  perfil: (typeof perfis)[number],
  tipo: "dominante" | "secundario_elegivel",
) => ({
  tipo,
  perfil,
  sobreposta: tipo === "secundario_elegivel",
  alunos: perfil === "seeker" ? 1 : 0,
  amostra_pequena: perfil === "seeker",
  engajamento: {
    alunos_ativos: 0,
    taxa_atividade_pct: null,
    tempo_ativo_seg: 0,
    tempo_presenca_seg: 0,
    tempo_ocioso_seg: 0,
    tempo_ativo_medio_por_aluno_ativo_seg: null,
    sessoes: 0,
    alunos_com_sessao: 0,
    sessoes_media_por_aluno_ativo: null,
  },
  retorno_semanal: { retornaram: 0, elegiveis: 0, taxa_pct: null },
  jornada_sessoes: { em_aberto: 0, encerradas_sem_conclusao: 0 },
  estado_atual: { conclusao: { alvos: 0, concluidos: 0, taxa_pct: null } },
});

const respostaCoortes = {
  versao: 1,
  classe_id: 54,
  periodo: resposta.periodo,
  segmentacao: {
    medida_em: "2026-10-27T12:00:00Z",
    historico_perfil_disponivel: false,
    comparacao_causal: false,
    perfil_dominante: "maior_afinidade_desempate_nome",
    secundario_elegivel: "segunda_maior_afinidade_maior_que_20",
  },
  geral: resposta,
  coortes_dominantes: perfis.map((perfil) => coorte(perfil, "dominante")),
  segmentos_secundarios: perfis.map((perfil) => coorte(perfil, "secundario_elegivel")),
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

describe("carregarCoortesEngajamentoTurma", () => {
  it("chama a RPC de coortes com a mesma janela auditável", async () => {
    sb.rpc.mockResolvedValue({ data: respostaCoortes, error: null });

    const resultado = await carregarCoortesEngajamentoTurma(
      54,
      "2026-10-05",
      "2026-10-18",
      "America/Recife",
    );

    expect(sb.rpc).toHaveBeenCalledWith("metricas_engajamento_coortes_turma", {
      p_classe_id: 54,
      p_inicio: "2026-10-05",
      p_fim: "2026-10-18",
      p_timezone: "America/Recife",
    });
    expect(resultado.coortes_dominantes).toHaveLength(7);
    expect(resultado.segmentos_secundarios).toHaveLength(7);
    expect(resultado.segmentacao.comparacao_causal).toBe(false);
  });

  it("preserva nulos e o aviso de amostra pequena", async () => {
    sb.rpc.mockResolvedValue({ data: respostaCoortes, error: null });
    const resultado = await carregarCoortesEngajamentoTurma(
      54,
      "2026-10-05",
      "2026-10-18",
    );

    expect(resultado.coortes_dominantes[0].amostra_pequena).toBe(true);
    expect(resultado.coortes_dominantes[0].retorno_semanal.taxa_pct).toBeNull();
  });

  it("propaga erro e recusa contrato sem os sete perfis", async () => {
    const erro = { code: "42501", message: "sem_permissao" };
    sb.rpc.mockResolvedValueOnce({ data: null, error: erro });
    await expect(
      carregarCoortesEngajamentoTurma(54, "2026-10-05", "2026-10-18"),
    ).rejects.toBe(erro);

    sb.rpc.mockResolvedValueOnce({
      data: { ...respostaCoortes, coortes_dominantes: [] },
      error: null,
    });
    await expect(
      carregarCoortesEngajamentoTurma(54, "2026-10-05", "2026-10-18"),
    ).rejects.toThrow("resposta_invalida_coortes_engajamento");
  });
});
