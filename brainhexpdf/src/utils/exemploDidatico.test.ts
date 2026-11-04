// O "Exemplo visual didatico" segue a cor do perfil e o claro/escuro do deck.
import assert from 'node:assert/strict';
import test from 'node:test';

import { BRAIN_HEX_PROFILES } from '../data/brainHexProfiles';
import type { DeckData, SlideData } from '../types';
import { generateInteractiveHtml } from './deckExportUtils';
import { PROFILE_SIGNATURES, buildDeckColorTokens } from './deckTheme';
import { ImageGenerationUnavailableError } from './imageGenerationErrors';
import {
  buildFallbackIllustrationSvgMarkup,
  isFallbackIllustrationUri,
  resolveSlideIllustrations,
  wrapSvgText,
  type ImageGenerator,
} from './slideIllustrations';

const PERFIS = Object.keys(PROFILE_SIGNATURES);
// A paleta propria que existia antes: nenhuma destas cores pode voltar.
const PALETA_ANTIGA = ['#0ea5e9', '#38bdf8', '#0284c7', '#081c24', '#0d0d12', '#09090d', '#050508'];

function slide(overrides: Partial<SlideData> = {}): SlideData {
  return {
    id: 's1',
    type: 'concept_breakdown',
    title: 'A Essência da Divisão de Grandezas',
    subtopic: 'A Essência da Divisão de Grandezas',
    pedagogicalObjective: 'Compreender a definição matemática de divisão de grandezas e seu papel na equidade.',
    contentParagraphs: ['Parágrafo.'],
    layout: 'split-character',
    ...overrides,
  } as SlideData;
}

const semImagem: ImageGenerator = async () => {
  throw new ImageGenerationUnavailableError('quota');
};

test('cada perfil usa o accent do proprio deck, nunca a paleta antiga', () => {
  for (const perfil of PERFIS) {
    const svg = buildFallbackIllustrationSvgMarkup(slide(), perfil);
    const escuro = buildDeckColorTokens(perfil, 'dark');
    assert.ok(svg.includes(`var(--accent, ${escuro.accent})`), perfil);
    assert.ok(svg.includes(`var(--surface, ${escuro.surface})`), perfil);
    for (const cor of PALETA_ANTIGA) assert.ok(!svg.toLowerCase().includes(cor), `${perfil}: ${cor}`);
  }
});

test('socializer sai na familia coral do deck, nao em azul', () => {
  const svg = buildFallbackIllustrationSvgMarkup(slide(), 'Socializer');
  assert.ok(svg.includes(buildDeckColorTokens('socializer', 'dark').accent));
});

test('o titulo quebra em linhas inteiras em vez de cortar no meio da palavra', () => {
  const svg = buildFallbackIllustrationSvgMarkup(slide(), 'socializer');
  assert.ok(!svg.includes('>A Essência da Di<'));
  assert.deepEqual(wrapSvgText('A Essência da Divisão de Grandezas', 22, 3), ['A Essência da Divisão', 'de Grandezas']);
  const longo = wrapSvgText('palavra '.repeat(30), 20, 2);
  assert.equal(longo.length, 2);
  assert.ok(longo[1].endsWith('…'));
});

test('texto do slide e escapado no SVG', () => {
  const svg = buildFallbackIllustrationSvgMarkup(slide({ subtopic: '<script>x</script> & "a"' }), 'seeker');
  assert.ok(!svg.includes('<script>'));
});

test('o SVG de reserva e reconhecido; SVG do professor nao', async () => {
  const [gerado] = await resolveSlideIllustrations([slide()], [], semImagem, { targetProfile: 'Socializer' });
  assert.ok(isFallbackIllustrationUri(gerado.referenceImageDataUri));
  const doProfessor = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`;
  assert.equal(isFallbackIllustrationUri(doProfessor), false);
  assert.equal(isFallbackIllustrationUri('data:image/png;base64,AAAA'), false);
});

test('no deck exportado o exemplo entra inline e usa as variaveis do tema', async () => {
  const [comExemplo] = await resolveSlideIllustrations([slide()], [], semImagem, { targetProfile: 'Socializer' });
  const deck: DeckData = {
    id: 'deck-exemplo',
    title: 'Frações',
    subtitle: '',
    subject: 'Matemática',
    targetProfile: 'Socializer',
    rankLevel: 'Guardião',
    slides: [comExemplo],
    themeConfig: BRAIN_HEX_PROFILES.Socializer,
    createdAt: '2026-11-04',
    author: 'TrailUp',
    estimatedMinutes: 1,
    tags: [],
  };
  // O corpo do slide vai dentro de uma string JS no HTML: as aspas saem escapadas.
  const html = generateInteractiveHtml(deck).replace(/\\"/g, '"');
  assert.ok(html.includes('class="figure-svg"'));
  assert.ok(html.includes('data-trailup-exemplo-didatico="1"'));
  assert.ok(html.includes('fill:var(--accent'));
  // Nao vai como <img> com o data URI (preso ao modo escuro).
  assert.ok(!html.includes(`<img src="${comExemplo.referenceImageDataUri}"`));
});

test('prompts de ilustracao pedem a cor-assinatura oficial', async () => {
  const prompts: string[] = [];
  await resolveSlideIllustrations([slide()], [], async ({ prompt }) => {
    prompts.push(prompt);
    return null;
  }, { targetProfile: 'Socializer' });
  assert.ok(prompts[0].includes(PROFILE_SIGNATURES.socializer));
  assert.ok(!prompts[0].includes('#0ea5e9'));
});
