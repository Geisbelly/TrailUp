/**
 * O payload do upsert de visita em `topico_aluno`.
 *
 * Mora aqui, fora de `TrilhaContext.tsx`, porque aquele arquivo importa
 * react-native e nao carrega no runner de node -- entao a regra abaixo nunca
 * teve teste no caminho que roda de verdade.
 *
 * ## A regra
 *
 * `status`, `percentual_concluido` e `tempo_gasto_min` sao DERIVADOS no banco:
 * os dois primeiros por `trailup_recalcular_topico_aluno`, o terceiro por
 * `tempo_direto_min + trailup_tempo_sessao_min(...)` desde `20260921_01`.
 * Nenhum cliente escreve nenhum dos tres.
 *
 * Ja houve QUATRO gravadores fazendo isso, todos com a conta sobre o material
 * do professor apenas, e todos rodando DEPOIS do trigger -- a conta certa
 * nunca sobrevivia. E este caminho dispara a cada registro de tempo, entao o
 * percentual correto durava segundos.
 *
 * O `status` que vivia aqui era, alem disso, um ternario morto: os dois ramos
 * devolviam 'em andamento', e um topico com 0% era marcado como iniciado so
 * por ter tido tempo contabilizado.
 */
export type VisitaDoTopico = {
  aluno_id: string;
  topico_id: number;
  ultima_atividade: number | null;
  ultima_visualizacao: string;
  updated_at: string;
};

export function payloadDeVisitaDoTopico(params: {
  alunoId: string;
  topicoId: number;
  ultimaAtividade?: number | null;
  agoraIso?: string;
}): VisitaDoTopico {
  const agora = params.agoraIso ?? new Date().toISOString();
  return {
    aluno_id: params.alunoId,
    topico_id: params.topicoId,
    ultima_atividade: params.ultimaAtividade ?? null,
    ultima_visualizacao: agora,
    updated_at: agora,
  };
}

/**
 * Sem tempo decorrido nao houve visita a registrar: um upsert por evento vazio
 * e escrita a toa. O tempo e CONDICAO, nao conteudo -- ele nao entra no
 * payload.
 */
export function houveVisita(tempoGastoMin: unknown): boolean {
  const tempo = Number(tempoGastoMin ?? 0);
  return Number.isFinite(tempo) && tempo > 0;
}
