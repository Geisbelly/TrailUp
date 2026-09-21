/** Reads records from stdin; prints only selection IDs and material counts. */
/* eslint-disable @typescript-eslint/no-require-imports */
const supabaseModulePath = require.resolve('@/database/supabase');
(require.cache as Record<string, unknown>)[supabaseModulePath] = { exports: { supabase: {} } };
const { normalizePersonalizedTopicPayload, orderPersonalizationRecordsByTeacherContent } = require('../utils/personalization') as typeof import('../utils/personalization');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const records = JSON.parse(input.replace(/^\uFEFF/, ''));
  const selected = orderPersonalizationRecordsByTeacherContent(records, []);
  for (const record of selected as any[]) {
    const payload = normalizePersonalizedTopicPayload({ record, classeId: record.classe_id,
      topicoId: record.topico_id, fallbackBlocks: [], fallbackActivities: [] });
    const counts: Record<string, number> = {};
    payload.primaryBlocks.forEach((block) => { counts[block.tipo] = (counts[block.tipo] ?? 0) + 1; });
    console.log(JSON.stringify({ topic: record.topico_id, record: record.id, counts,
      activities: payload.primaryActivities.length,
      questions: payload.primaryActivities.reduce((sum, activity) => sum + activity.questoes.length, 0) }));
  }
});
