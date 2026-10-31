import type { JanelaTemporal } from "./DashboardHeader";

/** Um item de `por_topico.topicos` da RPC metricas_engajamento_turma (versão 2, migration 20261031_06). */
export type KpiDoTopico = {
  topico_id: number;
  ordem: number | null;
  tempo_ativo_seg: number | null;
  tempo_ativo_medio_por_aluno_ativo_seg: number | null;
  alunos_ativos: number;
  sessoes: number;
  iniciaram: number;
  concluiram: number;
  estagnados: number;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const diasAntes = (hoje: Date, n: number) => new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - n));

/**
 * O período (datas de calendário, inclusivas) que a janela do cabeçalho pede à RPC. "Tudo" é o
 * último ano: a RPC recusa mais de 366 dias (`periodo_excede_366_dias`).
 */
export function periodoDaJanela(janela: JanelaTemporal, hoje: Date): { inicio: string; fim: string } {
  const fim = iso(hoje);
  switch (janela) {
    case "7d":
      return { inicio: iso(diasAntes(hoje, 6)), fim };
    case "30d":
      return { inicio: iso(diasAntes(hoje, 29)), fim };
    case "mes_atual":
      return { inicio: iso(new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1))), fim };
    case "tudo":
      return { inicio: iso(diasAntes(hoje, 365)), fim };
  }
}

/** Lê `por_topico` da resposta da RPC; versão 1 (sem a chave) ou forma inesperada = lista vazia. */
export function lerPorTopico(resposta: unknown): KpiDoTopico[] | null {
  if (!resposta || typeof resposta !== "object") return null;
  const bloco = (resposta as { por_topico?: { topicos?: unknown } }).por_topico;
  if (!bloco || !Array.isArray(bloco.topicos)) return null;
  return bloco.topicos as KpiDoTopico[];
}
