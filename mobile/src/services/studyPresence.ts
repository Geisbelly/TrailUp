import { supabase } from '@/database/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import { summarizeStudyDates } from '@/utils/studyPresence';

export type StudyPresence = {
  dias_ativos: number;
  registros_recentes: number;
  semana_diaria: number[];
  ultimo_registro: string | null;
};

const PAGE_SIZE = 500;
const RPC_RETRY_MS = 60_000;

// Mesmas evidências da RPC, sem contar login/heartbeat como estudo e sem
// inventar eventos de recompensa. A leitura direta continua sujeita à RLS.
const SOURCES = [
  { table: 'eventos_aluno', column: 'criado_em', extra: 'tipo', naiveUtc: true },
  { table: 'questao_aluno', column: 'criado_em', extra: 'resposta', naiveUtc: false },
  { table: 'topico_aluno', column: 'ultima_visualizacao', extra: '', naiveUtc: true },
  { table: 'conteudo_aluno', column: 'ultima_visualizacao', extra: '', naiveUtc: true },
  { table: 'atividade_aluno', column: 'ultima_visualizacao', extra: '', naiveUtc: true },
  { table: 'personalizacao_item_progresso', column: 'updated_at', extra: '', naiveUtc: false },
  { table: 'telemetria_time_metric_entries', column: 'captured_at', extra: '', naiveUtc: false },
  { table: 'estudo_intervalos', column: 'criado_em', extra: '', naiveUtc: false },
] as const;

async function loadSavedEvidence(client: SupabaseClient, userId: string, now: Date): Promise<StudyPresence> {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);

  const sources = await Promise.all(SOURCES.map(async (source) => {
    const dates: string[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const query = client.from(source.table)
        .select(source.extra ? `${source.column},${source.extra}` : source.column)
        .eq('aluno_id', userId)
        .not(source.column, 'is', null)
        .lte(source.column, now.toISOString())
        .order(source.column, { ascending: false, nullsFirst: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (source.table === 'eventos_aluno') {
        query.or('tipo.like.topico_*,tipo.like.conteudo_*,tipo.like.atividade_*,tipo.eq.presenca_aula,tipo.eq.participacao_aula');
      } else if (source.table === 'questao_aluno') {
        query.not('resposta', 'is', null).neq('resposta', '');
      } else if (source.table === 'personalizacao_item_progresso') {
        query.or('percentual_concluido.gt.0,tempo_gasto_min.gt.0');
      } else if (source.table === 'telemetria_time_metric_entries') {
        query.eq('scope', 'topic').gt('active_sec', 0);
      }

      const { data, error } = await query;
      // Não converte erro de permissão/rede em "zero dias" nem resumo parcial.
      if (error) throw error;
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      for (const row of rows) {
        if (source.table === 'eventos_aluno' && !/^(topico_|conteudo_|atividade_|presenca_aula$|participacao_aula$)/.test(String(row.tipo))) continue;
        if (source.table === 'questao_aluno' && !String(row.resposta ?? '').trim()) continue;
        let value = String(row[source.column] ?? '');
        // As colunas sem timezone no banco são UTC, não hora local do aparelho.
        if (source.naiveUtc && !/(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value)) value += 'Z';
        const timestamp = Date.parse(value);
        if (!Number.isFinite(timestamp) || timestamp > now.getTime()) continue;
        dates.push(value);
        // Conserva o último estudo mesmo se for anterior à janela de 7 dias.
        if (timestamp < start.getTime()) return dates;
      }
      if (rows.length < PAGE_SIZE) return dates;
    }
  }));
  return summarizeStudyDates(sources.flat(), now);
}

export function createStudyPresenceLoader(client: SupabaseClient, options: {
  now?: () => Date;
  warn?: (message: string) => void;
} = {}) {
  const now = options.now ?? (() => new Date());
  const warn = options.warn ?? console.warn;
  const pending = new Map<string, Promise<StudyPresence>>();
  let retryRpcAt = 0;

  async function load(userId: string): Promise<StudyPresence> {
    const currentTime = now();
    if (currentTime.getTime() >= retryRpcAt) {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
      const { data, error } = await client.rpc('trailup_resumo_presenca', { p_timezone: timezone });
      if (!error) {
        retryRpcAt = 0;
        if (!data || !Array.isArray(data.semana_diaria) || data.semana_diaria.length !== 7) {
          throw new Error('Resumo de presença inválido');
        }
        return data as StudyPresence;
      }
      // PGRST202 é função ausente no cache; erros de autorização não são fallback.
      if (error.code !== 'PGRST202') throw error;
      if (currentTime.getTime() >= retryRpcAt) {
        warn('[Presenca] Resumo ainda indisponível no cache do Supabase; usando os registros de estudo salvos.');
      }
      retryRpcAt = currentTime.getTime() + RPC_RETRY_MS;
    }
    return loadSavedEvidence(client, userId, currentTime);
  }

  return (userId: string): Promise<StudyPresence> => {
    if (!userId) return Promise.reject(new Error('Aluno não autenticado'));
    const existing = pending.get(userId);
    if (existing) return existing;
    const request = load(userId).finally(() => {
      if (pending.get(userId) === request) pending.delete(userId);
    });
    pending.set(userId, request);
    return request;
  };
}

export const loadStudyPresence = createStudyPresenceLoader(supabase);
