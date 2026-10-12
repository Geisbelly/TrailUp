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

export type Movimento = { id: number; valor: number; descricao: string; quando: string };

const EVENTO: Record<string, string> = {
  conteudo_concluido: "Conteúdo concluído",
  atividade_concluida: "Atividade concluída",
  atividade_acertada: "Acerto",
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
    return { id: l.id, valor: Number(l.delta) || 0, descricao, quando: formatarQuando(l.criado_em, agora) };
  });
}

export type LimitesTurma = { prazoDiasTotal: number; prazoPorAtividade: number; segundaChancePorTopico: number };

/** Sem linha em `loja_config_classe`, valem os padrões da tabela (2, 2 e 1). */
export function limitesDaTurma(linha: Partial<Record<string, unknown>> | null | undefined): LimitesTurma {
  const n = (v: unknown, padrao: number) => (typeof v === "number" && Number.isFinite(v) ? v : padrao);
  return {
    prazoDiasTotal: n(linha?.prazo_max_dias_total, 2),
    prazoPorAtividade: n(linha?.prazo_max_por_ativ, 2),
    segundaChancePorTopico: n(linha?.retry_max_por_topico, 1),
  };
}
