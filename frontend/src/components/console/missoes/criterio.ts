// Critério de missão: a ponte entre o formulário do professor e o que o banco avalia.
//
// `missoes.criterio` é JSONB e o avaliador é o mesmo das conquistas
// (`trg_eventos_aluno_after_iud`, extraído para função compartilhada na fase 3). Cada métrica
// lê **sua própria chave** de parâmetro, e errar a chave não dá erro nenhum: o avaliador faz
// `COALESCE((criterio->>'chave')::int, 0)`, então chave errada vira alvo **zero** e a missão
// é concluída na hora, para todo mundo. Por isso o mapa abaixo é copiado do avaliador, e há
// teste que trava cada par.

export type MetricaDeMissao =
  | "minutos_totais"
  | "dias_seguidos"
  | "topicos_concluidos"
  | "atividades_concluidas"
  | "acertos_percentual"
  | "trilha_percentual";

/** Chave de parâmetro que o avaliador lê para cada métrica. Copiado de `trg_eventos_aluno_after_iud`. */
export const CHAVE_DO_ALVO: Record<MetricaDeMissao, string> = {
  minutos_totais: "minutos",
  dias_seguidos: "dias_seguidos",
  topicos_concluidos: "minimo",
  atividades_concluidas: "minimo",
  acertos_percentual: "percentual",
  trilha_percentual: "percentual",
};

type Definicao = {
  rotulo: string;
  unidade: string;
  /** Maior alvo aceito. Percentual para em 100; contagem e minutos têm teto de sanidade. */
  max: number;
  ajuda: string;
};

/**
 * As seis que fazem sentido o professor escolher e que têm **um** alvo numérico.
 *
 * O banco aceita as 12 de `fn_conquista_metrica_suportada`; as outras seis ficam fora **desta
 * tela** de propósito: `eventos_totais` e `eventos_do_tipo` são contagem de evento interno,
 * `topicos_visitados` se confunde com `topicos_concluidos` para quem está preenchendo o
 * formulário, e `atividade_rapida`/`atividades_rapidas`/`evento_medalha` precisam de dois
 * parâmetros. Missão da IA e do sistema continuam podendo usar todas.
 */
export const METRICAS: ReadonlyArray<{ chave: MetricaDeMissao } & Definicao> = [
  {
    chave: "minutos_totais",
    rotulo: "Minutos de estudo",
    unidade: "minutos",
    max: 100000,
    ajuda: "Soma do tempo em atividades e conteúdos, desde sempre.",
  },
  {
    chave: "dias_seguidos",
    rotulo: "Dias seguidos",
    unidade: "dias",
    max: 365,
    ajuda: "Maior sequência de dias com atividade no app.",
  },
  {
    chave: "topicos_concluidos",
    rotulo: "Tópicos concluídos",
    unidade: "tópicos",
    max: 1000,
    ajuda: "Quantos tópicos o aluno fechou.",
  },
  {
    chave: "atividades_concluidas",
    rotulo: "Atividades concluídas",
    unidade: "atividades",
    max: 1000,
    ajuda: "Quantas atividades o aluno concluiu.",
  },
  {
    chave: "acertos_percentual",
    rotulo: "Percentual de acertos",
    unidade: "%",
    max: 100,
    ajuda: "Melhor percentual de acertos numa atividade.",
  },
  {
    chave: "trilha_percentual",
    rotulo: "Percentual da trilha",
    unidade: "%",
    max: 100,
    ajuda: "Maior percentual concluído de um tópico.",
  },
] as const;

export function definicaoDaMetrica(chave: string): ({ chave: MetricaDeMissao } & Definicao) | null {
  return METRICAS.find((m) => m.chave === chave) ?? null;
}

/** `criterio` de missão-meta. Usa a chave de parâmetro que o avaliador espera. */
export function criterioDeMeta(metrica: MetricaDeMissao, alvo: number): Record<string, unknown> {
  return { metrica, [CHAVE_DO_ALVO[metrica]]: alvo };
}

/**
 * `criterio` de missão-entrega: aponta a atividade que o aluno precisa concluir.
 *
 * É o mesmo formato que `20261019_05` grava ao migrar `atividades.tipo = 'missao'`, e por
 * decisão de produto deixou de ser exceção da migração para ser um dos dois caminhos do
 * editor.
 */
export function criterioDeEntrega(atividadeId: number): Record<string, unknown> {
  return { metrica: "atividade_especifica", atividade_id: atividadeId };
}

/** Texto curto para o cartão da missão. */
export function rotuloDoCriterio(criterio: unknown): string {
  if (!criterio || typeof criterio !== "object") return "Sem critério";
  const c = criterio as Record<string, unknown>;
  const metrica = String(c.metrica ?? "");
  if (metrica === "atividade_especifica") return "Concluir a atividade";
  // Métricas de delta da fase 5b — o formulário do professor não as oferece, mas a diária usa.
  if (metrica === "minutos_no_dia") {
    const n = c.minutos;
    return n == null ? "Minutos no dia" : `Minutos no dia: ${n}`;
  }
  if (metrica === "eventos_no_dia") {
    const n = c.minimo;
    const ev = String(c.evento ?? "");
    const oQue = ev.includes("atividade") ? "atividades" : ev.includes("conteudo") ? "conteúdos" : "ações";
    return n == null ? `Eventos no dia (${oQue})` : `${n} ${oQue} no dia`;
  }
  const def = definicaoDaMetrica(metrica);
  if (!def) return metrica || "Sem critério";
  const alvo = c[CHAVE_DO_ALVO[def.chave]];
  return alvo == null ? def.rotulo : `${def.rotulo}: ${alvo}${def.unidade === "%" ? "%" : ` ${def.unidade}`}`;
}
