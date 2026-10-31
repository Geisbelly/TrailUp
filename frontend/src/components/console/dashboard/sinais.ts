import type { SinaisDoBanco } from "./risco";

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
};

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
    });
  }
  return sinais;
}
