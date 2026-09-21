import assert from 'node:assert/strict';
import test from 'node:test';
import { mediaUrlPath } from './mediaUrlPath';
import { isHtmlDeckUrl } from './htmlDeck';
import { personalizedAvailabilityScore } from './personalizationAvailability';

/* eslint-disable @typescript-eslint/no-require-imports */
const supabaseModulePath = require.resolve('@/database/supabase');
(require.cache as Record<string, unknown>)[supabaseModulePath] = { exports: { supabase: {} } };
const { normalizePersonalizedTopicPayload, orderPersonalizationRecordsByTeacherContent } = require('./personalization') as typeof import('./personalization');
const formats = require('./contentBlocks') as typeof import('./contentBlocks');

const gateway = (file: string) => `https://example.supabase.co/functions/v1/storage-redirect?path=${encodeURIComponent(`brainhex/mastermind/${file}`)}&hideQuiz=true`;

test('gateway conserva o caminho do arquivo na identificação do formato', () => {
  assert.equal(mediaUrlPath(gateway('parte 1.md')), 'brainhex/mastermind/parte 1.md');
  assert.equal(formats.isMarkdownUrl(gateway('text.md')), true);
  assert.equal(formats.isAudioUrl(gateway('audio.wav')), true);
  assert.equal(formats.isPresentationUrl(gateway('deck.html')), true);
  assert.equal(formats.isPdfUrl(gateway('material.pdf')), true);
  assert.equal(formats.isImageUrl(gateway('figura.png')), true);
  assert.equal(isHtmlDeckUrl(gateway('deck.html')), true);
  assert.equal(isHtmlDeckUrl(gateway('deck.pptx')), false);
});

test('links diretos, relativos e parâmetros de outros serviços não mudam', () => {
  assert.equal(mediaUrlPath('https://example.com/deck.html?v=2#slide'), 'https://example.com/deck.html');
  assert.equal(mediaUrlPath('pasta/texto.md'), 'pasta/texto.md');
  assert.equal(formats.isAudioUrl('https://example.com/other?path=audio.wav'), false);
});

test('normalizador preserva áudios e apresentações em várias partes via gateway', () => {
  const parts = (ext: string) => [1, 2].map((ordem) => ({ ordem, arquivo_url: gateway(`parte-${ordem}.${ext}`) }));
  const result = normalizePersonalizedTopicPayload({
    record: { id: 1, conteudo_id: 177, materiais: {
      audio: { partes: parts('wav') }, apresentacao: { partes: parts('html') },
      markdown: { arquivo_url: gateway('texto.md') },
    } }, classeId: 32, topicoId: 128, fallbackBlocks: [], fallbackActivities: [],
  });
  assert.equal(result.primaryBlocks.filter((block) => block.tipo === 'audio').length, 2);
  assert.equal(result.primaryBlocks.filter((block) => block.tipo === 'apresentacao').length, 2);
  assert.equal(result.primaryBlocks.filter((block) => block.tipo === 'markdown').length, 1);
});

test('registro novo vazio não esconde versão com texto, áudio e apresentação disponíveis', () => {
  const ready = { id: 3608, conteudo_id: 177, updated_at: '2026-09-01', materiais: {
    markdown: { arquivo_url: gateway('texto.md') }, audio: { arquivo_url: gateway('audio.wav') },
    apresentacao: { arquivo_url: gateway('deck.html') },
  } };
  const empty = { id: 3696, conteudo_id: 177, updated_at: '2026-09-20', materiais: { cards: { payload: [{ frente: 'Card' }] } } };
  assert.deepEqual(orderPersonalizationRecordsByTeacherContent([empty, ready], [{ id: 177 }]), [ready]);
});

test('roteiro sem arquivo não é considerado áudio pronto', () => {
  assert.equal(personalizedAvailabilityScore({ materiais: { audio: { payload: { roteiro: 'Texto' } } } }), 0);
});

test('empate de material disponível mantém a versão mais recente', () => {
  const media = { markdown: { payload: { markdown: '# Aula' } } };
  assert.equal(orderPersonalizationRecordsByTeacherContent([
    { id: 1, conteudo_id: 177, updated_at: '2026-09-01', materiais: media },
    { id: 2, conteudo_id: 177, updated_at: '2026-09-20', materiais: media },
  ], [{ id: 177 }])[0].id, 2);
});

test('arquivo apenas na única parte é carregado sem duplicar etapas', () => {
  const result = normalizePersonalizedTopicPayload({
    record: { id: 1, conteudo_id: 177, materiais: {
      audio: { partes: [{ arquivo_url: gateway('audio.wav') }] },
      apresentacao: { partes: [{ arquivo_url: gateway('deck.html') }] },
      markdown: { partes: [{ arquivo_url: gateway('texto.md') }] },
    } }, classeId: 32, topicoId: 128, fallbackBlocks: [], fallbackActivities: [],
  });
  assert.deepEqual(result.primaryBlocks.map((block) => block.tipo).sort(), ['apresentacao', 'audio', 'markdown']);
});

test('carrega todas as atividades do quiz, incluindo o campo questions', () => {
  const result = normalizePersonalizedTopicPayload({
    record: { id: 1, conteudo_id: 177, materiais: { quiz: { payload: { atividades: [
      { titulo: 'Primeiro', questoes: [{ enunciado: 'A?', alternativas: ['A', 'B'] }] },
      { titulo: 'Segundo', questions: [{ enunciado: 'B?', alternativas: ['A', 'B'] }] },
    ] } } } }, classeId: 32, topicoId: 128, fallbackBlocks: [], fallbackActivities: [],
  });
  assert.equal(result.primaryActivities.length, 2);
  assert.equal(result.primaryActivities.flatMap((activity) => activity.questoes).length, 2);
  assert.notEqual(result.primaryActivities[0].id, result.primaryActivities[1].id);
  assert.equal(new Set(result.steps.map((step) => step.item_key)).size, 2);
});

test('mantém questões nos formatos legados de quiz', () => {
  const questions = [{ enunciado: 'A?' }, { enunciado: 'B?' }];
  for (const payload of [questions, { atividades: questions }, { questoes: questions }]) {
    const result = normalizePersonalizedTopicPayload({
      record: { id: 1, conteudo_id: 177, materiais: { quiz: { payload } } },
      classeId: 32, topicoId: 128, fallbackBlocks: [], fallbackActivities: [],
    });
    assert.equal(result.primaryActivities.length, 1);
    assert.equal(result.primaryActivities[0].questoes.length, 2);
  }
});
