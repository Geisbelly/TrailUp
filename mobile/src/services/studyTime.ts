import type { SupabaseClient } from '@supabase/supabase-js';

function intervalId() {
  return globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

export async function saveStudyTime(client: SupabaseClient, params: {
  alunoId: string; topicoId: number; conteudoId: number | null; atividadeId: number | null; minutes: number;
}) {
  const payload = {
    p_intervalo: intervalId(), p_aluno: params.alunoId, p_topico: params.topicoId,
    p_conteudo: params.conteudoId, p_atividade: params.atividadeId, p_tempo_min: params.minutes,
  };
  // A lost response can be retried with the SAME interval, without adding time twice.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await client.rpc('trailup_registrar_intervalo_estudo', payload);
    if (!error) return;
    if (attempt === 1 || error.code === '42501') throw error;
  }
}
