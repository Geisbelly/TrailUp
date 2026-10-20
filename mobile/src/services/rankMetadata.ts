import type { SupabaseClient } from '@supabase/supabase-js';

// `*` e não `id, classe_id`: `fim` só existe depois da `20261021_16`, e pedi-la antes daria 42703.
export const RANK_METADATA_SELECT = '*, rank_tipo(nome, descricao, criterio, icone)';

export async function loadRankMetadata(
  client: SupabaseClient,
  scope: { classeId: number } | { rankId: number },
) {
  let query = client.from('ranks').select(RANK_METADATA_SELECT);
  query = 'classeId' in scope
    ? query.eq('classe_id', scope.classeId)
    : query.eq('id', scope.rankId);
  const { data, error } = await query.order('id', { ascending: true });
  if (error) throw error;
  // Período encerrado (`fim` preenchido) é histórico do console: a turma no app vê só o atual.
  // A view `vw_ranks_info_por_classe` já filtra; este é o caminho de reserva.
  const linhas = 'classeId' in scope ? (data ?? []).filter((row: { fim?: string | null }) => !row.fim) : data ?? [];
  return linhas.map((row) => {
    // Metadata belongs to rank_tipo, not to the class's ranks row.
    const tipo = Array.isArray(row.rank_tipo) ? row.rank_tipo[0] : row.rank_tipo;
    return {
      rank_id: Number(row.id),
      classe_id: Number(row.classe_id),
      nome_rank: tipo?.nome ?? `Rank ${row.id}`,
      descricao: tipo?.descricao ?? null,
      criterio: tipo?.criterio ?? null,
      icone: tipo?.icone != null ? String(tipo.icone) : null,
    };
  });
}
