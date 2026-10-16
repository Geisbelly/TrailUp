// Critério das conquistas da turma. A métrica é uma LISTA FECHADA — espelho da
// `METRICAS` de api/alembic/versions/20260909_01_conquistas_por_metrica.py, que o
// banco confere por CHECK. Texto livre aqui reproduziria o defeito que deixou 21
// das 27 conquistas mortas (issue #158): métrica nova é migration, não digitação.

export type MetricaChave =
  | "atividades_concluidas"
  | "dias_seguidos"
  | "minutos_totais"
  | "acertos_percentual"
  | "topicos_visitados"
  | "atividade_rapida";

export type Metrica = {
  chave: MetricaChave;
  rotulo: string;
  /** Chave dentro de `criterio` onde o banco lê o limiar. */
  campo: "minimo" | "dias_seguidos" | "minutos" | "percentual" | "visitados" | "max_tempo";
  unidade: string;
  min: number;
  max?: number;
  /** `topicos_visitados` aceita a palavra "todos". */
  aceitaTodos?: boolean;
};

export const METRICAS: readonly Metrica[] = [
  { chave: "atividades_concluidas", rotulo: "Atividades concluídas", campo: "minimo", unidade: "atividades", min: 1 },
  { chave: "dias_seguidos", rotulo: "Dias seguidos de estudo", campo: "dias_seguidos", unidade: "dias", min: 2 },
  { chave: "minutos_totais", rotulo: "Minutos acumulados", campo: "minutos", unidade: "min", min: 1 },
  { chave: "acertos_percentual", rotulo: "Acertos (%)", campo: "percentual", unidade: "%", min: 1, max: 100 },
  { chave: "topicos_visitados", rotulo: "Tópicos distintos visitados", campo: "visitados", unidade: "tópicos", min: 1, aceitaTodos: true },
  { chave: "atividade_rapida", rotulo: "Conclusão rápida", campo: "max_tempo", unidade: "min (máx.)", min: 1 },
];

export type Limiar = number | "todos";

export function metricaPorChave(chave: string | null | undefined): Metrica | null {
  return METRICAS.find((m) => m.chave === chave) ?? null;
}

// (strictNullChecks está desligado no projeto: união discriminada não estreita, então duas chaves exclusivas.)
export type ResultadoDoLimiar = { ok: boolean; valor: Limiar | null; erro: string | null };

const falha = (erro: string): ResultadoDoLimiar => ({ ok: false, valor: null, erro });

/** Valida o que o professor digitou no campo de limiar, para a métrica escolhida. */
export function validarLimiar(metrica: Metrica, texto: string): ResultadoDoLimiar {
  const bruto = texto.trim().toLowerCase().replace(",", ".");
  if (!bruto) return falha("Informe o valor mínimo para ganhar a conquista.");
  if (metrica.aceitaTodos && bruto === "todos") return { ok: true, valor: "todos", erro: null };
  const n = Number(bruto);
  if (!Number.isFinite(n)) return falha("Use só números.");
  if (!Number.isInteger(n)) return falha("Use um número inteiro.");
  if (n < metrica.min) return falha(`O mínimo é ${metrica.min}.`);
  if (metrica.max !== undefined && n > metrica.max) return falha(`O máximo é ${metrica.max}.`);
  return { ok: true, valor: n, erro: null };
}

export type Aparencia = { icone: string; cor: string };

/** O `criterio` que o banco guarda: a métrica, o limiar na chave que ela lê e, à parte, a aparência. */
export function montarCriterio(metrica: Metrica, limiar: Limiar, aparencia?: Aparencia): Record<string, unknown> {
  const criterio: Record<string, unknown> = { metrica: metrica.chave, [metrica.campo]: limiar };
  if (aparencia) criterio.aparencia = aparencia;
  return criterio;
}

export type CriterioLido = { metrica: Metrica; limiar: Limiar; aparencia: Aparencia | null };

function lerLimiar(bruto: unknown): Limiar | null {
  if (bruto === "todos") return "todos";
  if (typeof bruto === "number" && Number.isFinite(bruto)) return bruto;
  if (typeof bruto === "string" && bruto.trim() !== "" && Number.isFinite(Number(bruto))) return Number(bruto);
  return null;
}

/** Lê um `criterio` do banco; devolve null para métrica desconhecida ou limiar ausente (conquista fora da lista da turma). */
export function lerCriterio(criterio: unknown): CriterioLido | null {
  if (!criterio || typeof criterio !== "object") return null;
  const c = criterio as Record<string, unknown>;
  const metrica = metricaPorChave(typeof c.metrica === "string" ? c.metrica : null);
  if (!metrica) return null;
  const limiar = lerLimiar(c[metrica.campo]);
  if (limiar === null) return null;
  const ap = c.aparencia as Partial<Aparencia> | undefined;
  const aparencia = ap && typeof ap.icone === "string" && typeof ap.cor === "string" ? { icone: ap.icone, cor: ap.cor } : null;
  return { metrica, limiar, aparencia };
}

/** "Acertos ≥ 80%", "Todos os tópicos visitados", "Conclusão em até 30 min" — para a lista. */
export function descreverCriterio(metrica: Metrica, limiar: Limiar): string {
  switch (metrica.chave) {
    case "acertos_percentual":
      return `Acertos ≥ ${limiar}%`;
    case "topicos_visitados":
      return limiar === "todos" ? "Todos os tópicos visitados" : `${limiar} ${limiar === 1 ? "tópico visitado" : "tópicos visitados"}`;
    case "atividade_rapida":
      return `Conclusão em até ${limiar} min`;
    case "dias_seguidos":
      return `${limiar} dias seguidos`;
    case "minutos_totais":
      return `${limiar} min acumulados`;
    default:
      return `${limiar} ${limiar === 1 ? "atividade concluída" : "atividades concluídas"}`;
  }
}
