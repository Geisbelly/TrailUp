import { supabase } from "@/integrations/supabase/client";

export type SemanaEngajamento = {
  inicio: string;
  fim: string;
  completa: boolean;
  usuarios_ativos: number;
};

export type CoberturaPerfil = {
  perfil:
    | "seeker"
    | "survivor"
    | "daredevil"
    | "mastermind"
    | "conqueror"
    | "socializer"
    | "achiever";
  alunos_dominantes: number;
  alunos_elegiveis: number;
  alvos: number;
  alvos_cobertos: number;
  cobertos_compartilhados: number;
  cobertos_individuais: number;
  cobertura_pct: number | null;
};

export type KpisEngajamentoTurma = {
  versao: 1;
  classe_id: number;
  periodo: {
    inicio: string;
    fim: string;
    timezone: string;
    inicio_utc: string;
    fim_exclusivo_utc: string;
    dias: number;
  };
  populacao: {
    alunos_matriculados: number;
  };
  engajamento: {
    alunos_ativos: number;
    taxa_atividade_pct: number | null;
    tempo_ativo_seg: number;
    tempo_presenca_seg: number;
    tempo_ocioso_seg: number;
    tempo_ativo_medio_por_aluno_ativo_seg: number | null;
    sessoes: number;
    alunos_com_sessao: number;
    sessoes_media_por_aluno_ativo: number | null;
  };
  retorno_semanal: {
    definicao: "ativo_em_duas_semanas_calendario_completas_consecutivas";
    retornaram: number;
    elegiveis: number;
    taxa_pct: number | null;
    semanas: SemanaEngajamento[];
  };
  jornada_sessoes: {
    total: number;
    concluidas: number;
    encerradas_sem_conclusao: number;
    em_aberto: number;
  };
  estado_atual: {
    medido_em: string;
    historico_disponivel: false;
    conclusao: {
      alvos: number;
      concluidos: number;
      taxa_pct: number | null;
    };
    personalizacao: {
      definicao_elegivel: "perfil_dominante_ou_segundo_com_afinidade_maior_que_20";
      perfis: CoberturaPerfil[];
    };
  };
};

type RpcResult = {
  data: unknown;
  error: { message?: string; code?: string } | null;
};

type RpcClient = {
  rpc: (
    nome: string,
    params: Record<string, string | number>,
  ) => Promise<RpcResult>;
};

function isKpisEngajamentoTurma(value: unknown): value is KpisEngajamentoTurma {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return row.versao === 1
    && typeof row.classe_id === "number"
    && typeof row.periodo === "object"
    && row.periodo !== null
    && typeof row.engajamento === "object"
    && row.engajamento !== null
    && typeof row.retorno_semanal === "object"
    && row.retorno_semanal !== null
    && typeof row.estado_atual === "object"
    && row.estado_atual !== null;
}

export async function carregarKpisEngajamentoTurma(
  classeId: number,
  inicio: string,
  fim: string,
  timezone = "America/Sao_Paulo",
): Promise<KpisEngajamentoTurma> {
  const { data, error } = await (supabase as unknown as RpcClient).rpc(
    "metricas_engajamento_turma",
    {
      p_classe_id: classeId,
      p_inicio: inicio,
      p_fim: fim,
      p_timezone: timezone,
    },
  );
  if (error) throw error;
  if (!isKpisEngajamentoTurma(data)) {
    throw new Error("resposta_invalida_metricas_engajamento");
  }
  return data;
}
