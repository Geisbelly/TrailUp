import assert from 'node:assert/strict';
import test from 'node:test';

import type { SlideData } from '../types';
import {
  MAX_CONCEPT_TITLE_CHARS,
  MAX_GUIDE_ANALOGY_CHARS,
  MAX_GUIDE_SPEECH_CHARS,
  MAX_NARRATIVE_BEAT_CHARS,
  MAX_PARAGRAPH_CHARS,
  MAX_TAKEAWAY_CHARS,
  sanitizeSlideTextBudget,
} from './slideTextBudget';

function slide(extra: Partial<SlideData> = {}): SlideData {
  return { contentParagraphs: [], ...extra } as SlideData;
}

/** O loop de repeticao do modelo, em miniatura. */
function repetido(vezes: number): string {
  return 'o mecanismo de escalonamento preemptivo garante justica entre processos. '.repeat(vezes);
}

test('corta o paragrafo que veio em loop de repeticao', () => {
  // 160 mil caracteres numa unica string foi o que o log de producao mostrou.
  const gigante = repetido(2400);
  assert.ok(gigante.length > 150_000, 'o caso de teste precisa ser grande de verdade');

  const [resultado] = sanitizeSlideTextBudget([slide({ contentParagraphs: [gigante] })]);

  assert.equal(resultado.contentParagraphs.length, 1);
  assert.ok(resultado.contentParagraphs[0].length <= MAX_PARAGRAPH_CHARS);
  assert.ok(resultado.contentParagraphs[0].endsWith('…'));
});

test('paragrafo denso de verdade passa intacto', () => {
  // 900 caracteres e' o teto de um paragrafo denso; ele nao pode ser mexido.
  const denso = 'a'.repeat(900);

  const [resultado] = sanitizeSlideTextBudget([slide({ contentParagraphs: [denso] })]);

  assert.equal(resultado.contentParagraphs[0], denso);
});

test('corta cada campo livre no seu proprio limite', () => {
  const longo = repetido(60);

  const [resultado] = sanitizeSlideTextBudget([
    slide({
      conceptTitle: longo,
      contentParagraphs: [longo, longo],
      keyTakeaways: [longo],
      characterGuide: { name: 'Amina', speechText: longo, analogy: longo },
      thematicStorytelling: {
        storyArcPhase: 'Fase 1',
        environmentSetting: 'Cidadela',
        voiceTone: 'Amina',
        narrativeBeat: longo,
      },
    }),
  ]);

  assert.ok((resultado.conceptTitle ?? '').length <= MAX_CONCEPT_TITLE_CHARS);
  for (const p of resultado.contentParagraphs) {
    assert.ok(p.length <= MAX_PARAGRAPH_CHARS);
  }
  assert.ok((resultado.keyTakeaways?.[0] ?? '').length <= MAX_TAKEAWAY_CHARS);
  assert.ok((resultado.characterGuide?.speechText ?? '').length <= MAX_GUIDE_SPEECH_CHARS);
  assert.ok((resultado.characterGuide?.analogy ?? '').length <= MAX_GUIDE_ANALOGY_CHARS);
  assert.ok(
    (resultado.thematicStorytelling?.narrativeBeat ?? '').length <= MAX_NARRATIVE_BEAT_CHARS,
  );
});

test('preserva os campos que nao sao de texto livre', () => {
  const original = slide({
    // `id` no lugar do `slideNumber` que estava aqui: `slideNumber` nao existe
    // em `SlideData` (nem em lugar nenhum do src), entao a assercao provava
    // pass-through de um campo inventado -- passava porque o sanitizador
    // espalha chaves desconhecidas. `id` e campo obrigatorio de verdade, e
    // perde-lo quebraria a montagem do deck.
    id: 'slide-7',
    title: 'Escalonamento',
    interactiveType: 'quiz',
    characterGuide: { name: 'Amina', title: 'Estrategista', tone: 'resoluto' },
    contentParagraphs: ['curto'],
  } as Partial<SlideData>);

  const [resultado] = sanitizeSlideTextBudget([original]);

  assert.equal(resultado.id, 'slide-7');
  assert.equal(resultado.title, 'Escalonamento');
  assert.equal(resultado.interactiveType, 'quiz');
  assert.equal(resultado.characterGuide?.name, 'Amina');
  assert.equal(resultado.characterGuide?.title, 'Estrategista');
  assert.equal(resultado.characterGuide?.tone, 'resoluto');
});

test('slide sem nenhum campo livre nao estoura', () => {
  const [resultado] = sanitizeSlideTextBudget([slide()]);

  assert.deepEqual(resultado.contentParagraphs, []);
  assert.equal(resultado.characterGuide, undefined);
  assert.equal(resultado.thematicStorytelling, undefined);
});

test('entrada invalida volta como veio, sem lancar', () => {
  assert.deepEqual(sanitizeSlideTextBudget(undefined as unknown as SlideData[]), undefined);
  assert.deepEqual(sanitizeSlideTextBudget([]), []);
  assert.deepEqual(
    sanitizeSlideTextBudget([null as unknown as SlideData]),
    [null as unknown as SlideData],
  );
});
