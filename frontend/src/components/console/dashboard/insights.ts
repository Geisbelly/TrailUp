// Aba "Insights" da visão da turma (docs/frontend/redesign-fase-2/01-analise-dashboard.md,
// seção 4.8). As sínteses vêm de `intervencoes` (migration 20260929_01),
// gravadas pela API em lotes (`geracao_id`). A tela mostra o lote mais
// recente de cada turma; aceitar/ignorar é UPDATE direto no Supabase.

export type Insight = {
  id: string;
  classe_id: number;
  aluno_id: string | null;
  escopo: "turma" | "aluno";
  natureza: "sugestao" | "observacao";
  texto: string | null;
  base: string | null;
  status: "pending" | "applied" | "dismissed";
  motivo_descarte: MotivoDescarte | null;
  geracao_id: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type MotivoDescarte = "ja_resolvido" | "nao_se_aplica" | "revisar_depois";

export const MOTIVOS_DE_DESCARTE: { valor: MotivoDescarte; rotulo: string }[] = [
  { valor: "ja_resolvido", rotulo: "Já resolvido" },
  { valor: "nao_se_aplica", rotulo: "Não se aplica agora" },
  { valor: "revisar_depois", rotulo: "Vou revisar depois" },
];

export const rotuloDoMotivo = (motivo: MotivoDescarte | null) =>
  MOTIVOS_DE_DESCARTE.find((m) => m.valor === motivo)?.rotulo ?? null;

export type EscopoDoFiltro = "tudo" | "turma" | "alunos";

export const JANELA_DE_ACEITACAO_DIAS = 30;
const DIA_MS = 86_400_000;

/**
 * O lote mais recente de cada turma, em ordem de criação. Um lote é o que a
 * API gravou de uma vez (mesmo `geracao_id`); linhas sem `geracao_id` não
 * vieram da geração de insights e ficam fora.
 */
export function loteMaisRecentePorTurma(linhas: Insight[]): Insight[] {
  const ultimoLote = new Map<number, { geracao: string; em: string }>();
  for (const l of linhas) {
    if (!l.geracao_id) continue;
    const atual = ultimoLote.get(l.classe_id);
    if (!atual || l.created_at > atual.em) ultimoLote.set(l.classe_id, { geracao: l.geracao_id, em: l.created_at });
  }
  const lotes = new Set([...ultimoLote.values()].map((v) => v.geracao));
  return linhas
    .filter((l) => l.geracao_id !== null && lotes.has(l.geracao_id) && Boolean(l.texto?.trim()))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

/** Quando o lote mais novo mostrado foi gerado (null = nunca). */
export function geradoEm(lote: Insight[]): string | null {
  return lote.reduce<string | null>((max, l) => (max === null || l.created_at > max ? l.created_at : max), null);
}

export function filtrarPorEscopo(lote: Insight[], filtro: EscopoDoFiltro): Insight[] {
  if (filtro === "turma") return lote.filter((l) => l.escopo === "turma");
  if (filtro === "alunos") return lote.filter((l) => l.escopo === "aluno");
  return lote;
}

export type TaxaDeAceitacao = { aceitas: number; respondidas: number; pct: number | null };

/**
 * Sugestões aceitas ÷ sugestões respondidas (aceitas + ignoradas) cuja
 * decisão caiu nos últimos 30 dias. Observação não entra: não tem o que
 * aceitar. Pendente não entra: ainda não é um "não". Nada respondido = pct
 * null (sem número, não 0%).
 */
export function taxaDeAceitacao(linhas: Insight[], agora: Date, dias = JANELA_DE_ACEITACAO_DIAS): TaxaDeAceitacao {
  const desde = agora.getTime() - dias * DIA_MS;
  let aceitas = 0;
  let respondidas = 0;
  for (const l of linhas) {
    if (l.natureza !== "sugestao" || l.status === "pending" || !l.resolved_at) continue;
    if (new Date(l.resolved_at).getTime() < desde) continue;
    respondidas++;
    if (l.status === "applied") aceitas++;
  }
  return { aceitas, respondidas, pct: respondidas === 0 ? null : (aceitas / respondidas) * 100 };
}

export function textoDaAceitacao(taxa: TaxaDeAceitacao): string {
  if (taxa.pct === null) return `Nenhuma sugestão respondida nos últimos ${JANELA_DE_ACEITACAO_DIAS} dias`;
  return `${Math.round(taxa.pct)}% das sugestões aceitas nos últimos ${JANELA_DE_ACEITACAO_DIAS} dias (${taxa.aceitas} de ${taxa.respondidas})`;
}

export function formatarGeradoHa(iso: string | null, agora: Date): string {
  if (!iso) return "Ainda não gerado";
  const minutos = Math.max(0, Math.floor((agora.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutos < 1) return "Gerado agora";
  if (minutos < 60) return `Gerado há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Gerado há ${horas} h`;
  const diasPassados = Math.floor(horas / 24);
  return `Gerado há ${diasPassados} ${diasPassados === 1 ? "dia" : "dias"}`;
}

/** Abrir a aba dispara uma geração só se o que existe já estiver velho. */
export const IDADE_PARA_REGERAR_MS = 12 * 60 * 60_000;

export function precisaGerar(ultimaGeracao: string | null, agora: Date): boolean {
  return ultimaGeracao === null || agora.getTime() - new Date(ultimaGeracao).getTime() > IDADE_PARA_REGERAR_MS;
}

/** Erro do PostgREST quando a coluna não existe: a migration não foi aplicada. */
export function eMigracaoPendente(erro: { code?: string; message?: string } | null | undefined): boolean {
  if (!erro) return false;
  return erro.code === "42703" || erro.code === "PGRST204" || /column .* does not exist|insights_indisponiveis|migracao pendente/i.test(erro.message ?? "");
}
