// Extrato e limites da Loja na web em tela larga (#346, protótipo v4,
// 12-loja.md §5). Puro, para rodar em Node.
// O extrato lê `moedas_ledger` (20260912_01_moedas_razao.py): saldo é a soma
// de `delta`, e `motivo` diz de onde veio cada linha.

export type LinhaRazao = {
  id: number;
  delta: number | string;
  motivo: string;
  evento_tipo: string | null;
  compra_id: number | null;
  criado_em: string;
};

export type Movimento = { id: number; valor: number; descricao: string; quando: string; motivo: string };

export type FiltroDeExtrato = "todos" | "evento" | "compra" | "estorno" | "concessao" | "dotacao";

export function filtrarExtrato<T extends { motivo: string }>(linhas: readonly T[], filtro: FiltroDeExtrato): T[] {
  if (filtro === "todos") return [...linhas];
  return linhas.filter((l) => l.motivo === filtro);
}

const EVENTO: Record<string, string> = {
  conteudo_concluido: "Conteúdo concluído",
  atividade_concluida: "Atividade concluída",
  atividade_acertada: "Acerto",
  atividade_aprovada: "Atividade aprovada",
  atividade_conclusao_config: "Conclusão da atividade",
  meta_atingida: "Meta alcançada",
};
const MOTIVO: Record<string, string> = {
  dotacao: "Dotação da turma",
  estorno: "Estorno",
  concessao: "Concessão do professor",
};

/** "Hoje, 18:40", "Ontem" ou "dd/mm", no fuso de quem vê. */
export function formatarQuando(iso: string, agora: Date): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((dia(agora) - dia(data)) / 86_400_000);
  const hh = String(data.getHours()).padStart(2, "0");
  const mm = String(data.getMinutes()).padStart(2, "0");
  if (dias === 0) return `Hoje, ${hh}:${mm}`;
  if (dias === 1) return "Ontem";
  return `${String(data.getDate()).padStart(2, "0")}/${String(data.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * `itemDaCompra`: compra_id → nome do item (de `loja_compras` + catálogo).
 * Linha sem tradução conhecida mostra o motivo cru, para nada sumir do extrato.
 */
export function montarExtrato(linhas: readonly LinhaRazao[], itemDaCompra: ReadonlyMap<number, string>, agora: Date): Movimento[] {
  return linhas.map((l) => {
    let descricao: string;
    if (l.motivo === "evento") descricao = EVENTO[l.evento_tipo ?? ""] ?? "Estudo";
    else if (l.motivo === "compra") {
      const item = l.compra_id != null ? itemDaCompra.get(l.compra_id) : undefined;
      descricao = item ? `Compra · ${item}` : "Compra";
    } else descricao = MOTIVO[l.motivo] ?? l.motivo;
    return { id: l.id, valor: Number(l.delta) || 0, descricao, quando: formatarQuando(l.criado_em, agora), motivo: l.motivo };
  });
}

export type LimitesTurma = {
  prazoDiasTotal: number;
  prazoPorAtividade: number;
  segundaChancePorTopico: number;
  prazoMinDias: number;
  prazoMaxDias: number;
  tempoMinMinutos: number;
  tempoMaxMinutos: number;
  tempoPorAtividade: number;
};

/** Sem linha em `loja_config_classe`, valem os padrões da tabela (2, 2 e 1). */
export function limitesDaTurma(linha: Partial<Record<string, unknown>> | null | undefined): LimitesTurma {
  const n = (v: unknown, padrao: number) => (typeof v === "number" && Number.isFinite(v) ? v : padrao);
  return {
    prazoDiasTotal: n(linha?.prazo_max_dias_total, 2),
    prazoPorAtividade: n(linha?.prazo_max_por_ativ, 2),
    segundaChancePorTopico: n(linha?.retry_max_por_topico, 1),
    prazoMinDias: n(linha?.prazo_extensao_min_dias, 1),
    prazoMaxDias: n(linha?.prazo_extensao_max_dias, 1),
    tempoMinMinutos: n(linha?.tempo_extra_min_minutos, 5),
    tempoMaxMinutos: n(linha?.tempo_extra_max_minutos, 15),
    tempoPorAtividade: n(linha?.tempo_max_por_ativ, 30),
  };
}

/**
 * Dias de prazo extra que o aluno já somou nesta turma: o mesmo teto que
 * `loja_usar_item` confere contra `prazo_max_dias_total` (soma de
 * `atividade_prazo_aluno.dias_extras` nas atividades da turma).
 */
export function diasDePrazoUsados(
  linhas: readonly { dias_extras?: unknown; atividades?: unknown }[] | null | undefined,
  classeId: number,
): number {
  let soma = 0;
  for (const linha of linhas ?? []) {
    const atividade = Array.isArray(linha.atividades) ? linha.atividades[0] : linha.atividades;
    const topico = (atividade as { topicos?: unknown } | null | undefined)?.topicos;
    const classe = (Array.isArray(topico) ? topico[0] : topico) as { classe_id?: unknown } | null | undefined;
    if (Number(classe?.classe_id) !== classeId) continue;
    const dias = Number(linha.dias_extras);
    if (Number.isFinite(dias) && dias > 0) soma += Math.floor(dias);
  }
  return soma;
}
