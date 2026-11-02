import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AAA_TEXT,
  PROFILE_SIGNATURES,
  UI_BOUNDARY,
  buildDeckColorTokens,
  contrastRatio,
  hexToHsl,
  type DeckMode,
  type DeckProfileKey,
} from './deckTheme';
import { getDeckProfileIdentity, guideInitials } from './deckProfileIdentity';

const PROFILES = Object.keys(PROFILE_SIGNATURES) as DeckProfileKey[];
const MODES: DeckMode[] = ['dark', 'light'];

test('cor-assinatura espelha microservice/src/constants/brainHex.ts', () => {
  assert.deepEqual(PROFILE_SIGNATURES, {
    seeker: '#17a398',
    survivor: '#4e5a66',
    daredevil: '#d7263d',
    mastermind: '#5b3fd9',
    conqueror: '#1e4fd6',
    socializer: '#f4623a',
    achiever: '#c9a227',
  });
});

test('todo texto passa AAA (7:1) em toda superficie, nos 7 perfis e nos dois modos', () => {
  for (const profile of PROFILES) {
    for (const mode of MODES) {
      const t = buildDeckColorTokens(profile, mode);
      const surfaces = { bg: t.bg, surface: t.surface, surface2: t.surface2, surfaceAccent: t.surfaceAccent };
      const texts = { ink: t.ink, inkMuted: t.inkMuted, accent: t.accent, success: t.success, warning: t.warning, danger: t.danger, info: t.info };
      for (const [textName, text] of Object.entries(texts)) {
        for (const [surfaceName, surface] of Object.entries(surfaces)) {
          const ratio = contrastRatio(text, surface);
          assert.ok(ratio >= AAA_TEXT, `${profile}/${mode}: ${textName} ${text} sobre ${surfaceName} ${surface} = ${ratio.toFixed(2)}`);
        }
      }
      // Texto sobre o botao primario (fundo = accent).
      assert.ok(contrastRatio(t.onAccent, t.accent) >= AAA_TEXT, `${profile}/${mode}: onAccent`);
      // Feedback colorido sobre a propria superficie semantica.
      assert.ok(contrastRatio(t.success, t.successSurface) >= AAA_TEXT, `${profile}/${mode}: success`);
      assert.ok(contrastRatio(t.warning, t.warningSurface) >= AAA_TEXT, `${profile}/${mode}: warning`);
      assert.ok(contrastRatio(t.danger, t.dangerSurface) >= AAA_TEXT, `${profile}/${mode}: danger`);
      assert.ok(contrastRatio(t.ink, t.successSurface) >= AAA_TEXT, `${profile}/${mode}: ink em success`);
      assert.ok(contrastRatio(t.ink, t.dangerSurface) >= AAA_TEXT, `${profile}/${mode}: ink em danger`);
      // Borda que delimita controle (WCAG 1.4.11) contra as superficies dele.
      assert.ok(contrastRatio(t.borderStrong, t.surface) >= UI_BOUNDARY, `${profile}/${mode}: borderStrong`);
      assert.ok(contrastRatio(t.borderStrong, t.surface2) >= UI_BOUNDARY, `${profile}/${mode}: borderStrong em surface2`);
    }
  }
});

test('o accent so muda a luminosidade da cor-assinatura: matiz e saturacao ficam (nada de misturar com branco)', () => {
  for (const profile of PROFILES) {
    const [h0, s0] = hexToHsl(PROFILE_SIGNATURES[profile]);
    for (const mode of MODES) {
      const [h, s, l] = hexToHsl(buildDeckColorTokens(profile, mode).accent);
      // Arredondar para hex de 8 bits mexe um pouco em H/S; misturar com
      // branco derrubaria a saturacao muito alem disto.
      const dh = Math.min(Math.abs(h - h0), 360 - Math.abs(h - h0));
      assert.ok(dh <= 2.5, `${profile}/${mode}: matiz ${h0.toFixed(1)} -> ${h.toFixed(1)}`);
      assert.ok(Math.abs(s - s0) <= 3, `${profile}/${mode}: saturacao ${s0.toFixed(1)} -> ${s.toFixed(1)}`);
      const [, , l0] = hexToHsl(PROFILE_SIGNATURES[profile]);
      if (mode === 'dark') assert.ok(l >= l0 - 0.5, `${profile}: no escuro o accent so clareia`);
      else assert.ok(l <= l0 + 0.5, `${profile}: no claro o accent so escurece`);
    }
  }
});

test('success/warning/danger/info sao fixos por modo, iguais nos 7 perfis', () => {
  for (const mode of MODES) {
    const ref = buildDeckColorTokens('seeker', mode);
    for (const profile of PROFILES) {
      const t = buildDeckColorTokens(profile, mode);
      assert.equal(t.success, ref.success);
      assert.equal(t.warning, ref.warning);
      assert.equal(t.danger, ref.danger);
      assert.equal(t.info, ref.info);
    }
  }
});

test('perfil desconhecido ou com caixa diferente cai no perfil certo (ou no Achiever)', () => {
  assert.equal(buildDeckColorTokens('Seeker', 'dark').accent, buildDeckColorTokens('seeker', 'dark').accent);
  assert.equal(buildDeckColorTokens('MASTERMIND', 'light').accent, buildDeckColorTokens('mastermind', 'light').accent);
  assert.equal(buildDeckColorTokens(undefined, 'dark').accent, buildDeckColorTokens('achiever', 'dark').accent);
});

test('identidade do perfil: guia, estilo e emblema proprios, sem repetir desenho entre perfis', () => {
  const guias: Record<DeckProfileKey, string> = {
    seeker: 'Amara',
    survivor: 'Kenji',
    daredevil: 'Ember',
    mastermind: 'Idris',
    conqueror: 'Amina',
    socializer: 'Mateo e Zuri',
    achiever: 'Kwame',
  };
  const emblemas = new Set<string>();
  const estilos = new Set<string>();
  for (const profile of PROFILES) {
    const id = getDeckProfileIdentity(profile);
    assert.equal(id.guideName, guias[profile]);
    emblemas.add(id.emblemPaths);
    estilos.add(id.styleName);
  }
  // Um icone, um significado: cada perfil com o seu.
  assert.equal(emblemas.size, PROFILES.length);
  assert.equal(estilos.size, PROFILES.length);
});

test('iniciais do guia para o avatar', () => {
  assert.equal(guideInitials('Mateo e Zuri'), 'MZ');
  assert.equal(guideInitials('Amara'), 'A');
  assert.equal(guideInitials(''), '✦');
});
