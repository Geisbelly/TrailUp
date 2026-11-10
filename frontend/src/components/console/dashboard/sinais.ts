import { faixaDoRisco, motivoDoModelo, type SinaisDoBanco } from "./risco";

/** Uma linha de vw_metricas_engajamento_aluno_classe com as colunas dos sinais (F5, 20261031_05). */
export type LinhaEngajamento = {
  aluno_id: string;
  classe_id: number;
  sem_dado: boolean | null;
  ultima_atividade_em: string | null;
  inativo_desde: string | null;
  evadido_desde: string | null;
  estagnado_desde: string | null;
  estagnado_topico_id: number | null;
  /** Faixa do modelo de evasão do core (20261031_08): alto, atencao, normal ou "sem dados". */
  risco_abandono_faixa?: string | null;
  risco_abandono_origem?: string | null;
  /** O que pesou na faixa do modelo (20261110_01); ausente em banco sem a migration. */
  risco_abandono_motivo?: string | null;
};

/**
 * O banco ainda não tem a coluna do motivo (migration 20261110_01 não aplicada). Só ela: outra coluna
 * faltando é erro de verdade e não deve ser escondida pela segunda leitura.
 */
export function faltaColunaDoMotivo(erro: { code?: string; message?: string } | null | undefined): boolean {
  if (!erro) return false;
  return (erro.code === "42703" || erro.code === "PGRST204") && /risco_abandono_motivo/.test(erro.message ?? "");
}

export const chaveAlunoTurma = (alunoId: string, classeId: number) => `${alunoId}:${classeId}`;

export function juntarSinais(engajamento: LinhaEngajamento[], nomesDosTopicos: Map<number, string>): Map<string, SinaisDoBanco> {
  const sinais = new Map<string, SinaisDoBanco>();
  for (const l of engajamento) {
    sinais.set(chaveAlunoTurma(l.aluno_id, Number(l.classe_id)), {
      // Sem a coluna (build antigo do banco), trata como sem dado: nada vira sinal por engano.
      semDado: l.sem_dado !== false,
      ultimaAtividadeEm: l.ultima_atividade_em,
      inativoDesde: l.inativo_desde,
      evadidoDesde: l.evadido_desde,
      estagnadoDesde: l.estagnado_desde,
      estagnadoTopico: l.estagnado_topico_id === null ? null : nomesDosTopicos.get(Number(l.estagnado_topico_id)) ?? null,
      riscoFaixa: faixaDoRisco(l.risco_abandono_faixa),
      riscoOrigem:
        l.risco_abandono_origem === "modelo" || l.risco_abandono_origem === "inatividade" ? l.risco_abandono_origem : null,
      riscoMotivo: motivoDoModelo(l.risco_abandono_motivo),
    });
  }
  return sinais;
}
