import type { PersonalizedTopicPayload } from '../interfaces/personalizacao/IPersonalizedTopic';
import { buildContentScopedPersonalizationItemKey } from './personalization';

/** Registra o denominador inteiro, inclusive os passos ainda não visitados. */
export function buildPersonalizedProgressSeed(alunoId: string, payload: PersonalizedTopicPayload) {
  const rows = new Map<string, Record<string, unknown>>();
  for (const step of payload.steps) {
    const metadata = step.metadata ?? {};
    const recordId = Number(metadata.personalizacao_id ?? metadata.personalizationId ?? payload.planMeta?.recordId);
    if (!Number.isFinite(recordId) || recordId <= 0) continue;
    const contentId = Number(metadata.conteudo_id ?? metadata.contentId);
    const key = buildContentScopedPersonalizationItemKey({
      itemKey: step.item_key, personalizacaoId: recordId,
      conteudoId: Number.isFinite(contentId) && contentId > 0 ? contentId : null,
    });
    if (!key || key.startsWith('slide:')) continue;
    rows.set(`${recordId}:${key}`, {
      aluno_id: alunoId, classe_id: payload.classeId, topico_id: payload.topicoId,
      personalizacao_id: recordId, item_key: key, item_kind: step.kind,
      item_title: step.title, status: 'nao_iniciado', percentual_concluido: 0,
      metadata: { ...metadata, seeded_from_journey: true },
    });
  }
  return [...rows.values()];
}

export async function seedPersonalizedProgress(
  client: { from: (table: string) => { upsert: (rows: Record<string, unknown>[], options: {
    onConflict: string; ignoreDuplicates?: boolean;
  }) => PromiseLike<{ error: unknown }> } },
  rows: Record<string, unknown>[],
) {
  if (!rows.length) return;
  const manifests = new Map<number, Record<string, unknown>>();
  for (const row of rows) {
    const id = Number(row.personalizacao_id);
    const manifest = manifests.get(id) ?? {
      aluno_id: row.aluno_id, personalizacao_id: id, classe_id: row.classe_id,
      topico_id: row.topico_id, item_keys: [], updated_at: new Date().toISOString(),
    };
    (manifest.item_keys as string[]).push(String(row.item_key));
    manifests.set(id, manifest);
  }
  const { error: manifestError } = await client.from('personalizacao_percurso').upsert([...manifests.values()], {
    onConflict: 'aluno_id,personalizacao_id',
  });
  if (manifestError) throw manifestError;
  // DO NOTHING preserva respostas, tempos e conclusões existentes, inclusive
  // quando o aluno termina um item enquanto o denominador está carregando.
  const { error } = await client.from('personalizacao_item_progresso').upsert(rows, {
    onConflict: 'aluno_id,personalizacao_id,item_key', ignoreDuplicates: true,
  });
  if (error) throw error;
}
