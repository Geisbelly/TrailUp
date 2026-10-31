// Regra de exibição da spec de métricas (§4.2, D-2): todo card tem quatro estados distintos, nunca
// colapsados em zero. A disponibilidade vem do banco (vw_metricas_disponibilidade, F0): métrica cuja
// invariante falhou, ou cuja auditoria não rodou nas últimas 26 h, fica "em revisão".

export type EstadoDoCard = "valor" | "sem_dado" | "em_revisao" | "erro";

export type Disponibilidade = { disponivel: boolean; motivo: string | null };

/** Chaves de `metricas_catalogo` que o console exibe (F5, migration 20261031_07). */
export const CHAVE = {
  tempoAtivo: "prof.tempo_ativo",
  riscoAbandono: "prof.risco_abandono",
  retornoSemanal: "prof.retorno_semanal",
  abandonoPorEtapa: "prof.abandono_por_etapa",
  inatividade: "prof.inatividade",
  estagnado: "prof.estagnado",
} as const;

export type ChaveDoCatalogo = (typeof CHAVE)[keyof typeof CHAVE];

/**
 * Ordem de precedência: erro de leitura > em revisão > sem dado > valor. Card sem chave no catálogo
 * (acerto, chat — fora da F5) não passa pela disponibilidade. Disponibilidade que não carregou
 * (mapa vazio ou sem a chave) também não esconde o número: o card não fica refém de outra leitura.
 */
export function estadoDoCard(args: {
  valor: number | null;
  erro: string | null;
  chave?: ChaveDoCatalogo;
  disponibilidade: Map<string, Disponibilidade>;
}): EstadoDoCard {
  if (args.erro) return "erro";
  if (args.chave) {
    const d = args.disponibilidade.get(args.chave);
    if (d && !d.disponivel) return "em_revisao";
  }
  return args.valor === null ? "sem_dado" : "valor";
}

export const TEXTO_DO_ESTADO: Record<Exclude<EstadoDoCard, "valor">, string> = {
  sem_dado: "Sem dado ainda",
  em_revisao: "Em revisão",
  erro: "Não foi possível carregar",
};
