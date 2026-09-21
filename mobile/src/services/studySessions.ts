import type { SupabaseClient } from '@supabase/supabase-js';

export type StudySessionScope = 'topic' | 'content' | 'activity';

function sessionId() {
  return globalThis.crypto?.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

export async function saveStudySession(client: SupabaseClient, params: {
  alunoId: string; scope: StudySessionScope;
  topicoId: number; conteudoId: number | null; atividadeId: number | null;
  startedAtMs: number; endedAtMs: number;
}) {
  const payload = {
    p_sessao: sessionId(), p_aluno: params.alunoId, p_scope: params.scope,
    p_topico: params.topicoId, p_conteudo: params.conteudoId, p_atividade: params.atividadeId,
    p_aberto_em: new Date(params.startedAtMs).toISOString(),
    p_fechado_em: new Date(params.endedAtMs).toISOString(),
  };
  // Uma resposta perdida pode ser retentada com o MESMO id de sessão, sem
  // somar o intervalo duas vezes (idempotência por ON CONFLICT no banco).
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await client.rpc('trailup_registrar_sessao_estudo', payload);
    if (!error) return;
    if (attempt === 1 || error.code === '42501') throw error;
  }
}
