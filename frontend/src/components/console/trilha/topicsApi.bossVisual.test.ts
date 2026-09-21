import { beforeEach, describe, expect, it, vi } from 'vitest';

const sb = vi.hoisted(() => ({
  metadata: {} as Record<string, unknown>,
  writes: [] as Record<string, unknown>[],
  error: null as unknown,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq']) builder[method] = () => builder;
    for (const method of ['update', 'insert']) builder[method] = (payload: Record<string, unknown>) => { sb.writes.push(payload); return builder; };
    const result = () => ({ data: { id: 10, metadata: sb.metadata }, error: sb.error });
    builder.single = async () => result();
    builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return builder;
  },
} }));

import { saveContent, updateContent, updateContentMetadata } from './topicsApi';

describe('boss visual persistence', () => {
  beforeEach(() => {
    sb.metadata = { files: [{ path: 'lesson.pdf', name: 'Lesson', size: 42 }], boss_visual: 'boss-01', custom: 'keep' };
    sb.writes = [];
    sb.error = null;
  });
  it('changes a boss without deleting attachments or other metadata', async () => {
    await saveContent({ id: 10, topico_id: 1, titulo: 'Aula', tipo: 'texto', conteudo: 'Texto', boss_visual: 'boss-31' });
    expect(sb.writes[0].metadata).toEqual({ ...sb.metadata, boss_visual: 'boss-31' });
  });
  it('saves the chosen boss with a new content', async () => {
    await saveContent({ topico_id: 1, titulo: 'Aula', tipo: 'texto', conteudo: 'Texto', boss_visual: 'boss-02' });
    expect(sb.writes[0].metadata).toEqual({ boss_visual: 'boss-02' });
  });
  it('automatic clears only the chosen boss', async () => {
    await saveContent({ id: 10, topico_id: 1, titulo: 'Aula', tipo: 'texto', conteudo: 'Texto', boss_visual: null });
    expect(sb.writes[0].metadata).toEqual({ ...sb.metadata, boss_visual: null });
  });
  it('attachment updates preserve the chosen boss', async () => {
    await updateContentMetadata(10, { files: [] });
    await updateContent(10, { metadata: { files: [] } });
    for (const payload of sb.writes) expect(payload.metadata).toEqual({ ...sb.metadata, files: [] });
  });
  it('stops when metadata cannot be read', async () => {
    sb.error = new Error('denied');
    await expect(saveContent({ id: 10, topico_id: 1, titulo: 'Aula', tipo: 'texto', conteudo: 'Texto', boss_visual: 'boss-02' })).rejects.toThrow('denied');
    expect(sb.writes).toHaveLength(0);
  });
});
