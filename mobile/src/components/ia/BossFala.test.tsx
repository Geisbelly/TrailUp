import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToString } = require('react-dom/server');
const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = { exports };
};
type Cue = { id: string; message: string; createdAt: number; featureKey?: string; topicoId?: number; itemKey?: string | null; speakerName?: string };
let cues: Cue[] = [];
let dispensado = '';
let tocar: () => void = () => {};
let imagem: unknown;
function Host({ children }: { children?: React.ReactNode }) { return <div>{children}</div>; }
mockModule('react-native', {
  View: Host, Text: Host,
  Image: ({ source }: { source: unknown }) => { imagem = source; return null; },
  Pressable: ({ onPress, children, accessibilityLabel }: { onPress: () => void; children: React.ReactNode; accessibilityLabel?: string }) => {
    tocar = onPress;
    return <button aria-label={accessibilityLabel}>{children}</button>;
  },
  StyleSheet: { create: (value: unknown) => value },
});
mockModule('@/context/IAContext', { useIA: () => ({ pendingCharacterCues: cues, dismissCharacterCue: (id: string) => { dispensado = id; } }) });
mockModule('@/styles/GlobalStyle', { FontFamily: {} });
const { BossFala } = require('./BossFala');

const palette = { surfaceElevated: '#111', borderStrong: '#222', accentMuted: '#333', accent: '#4af', text: '#eee' };
const props = { topicoId: 131, itemKey: 'content:192', arte: 'boss-02.png', palette };

test('mostra a fala do boss com o nome e a arte do catálogo, e fecha ao toque', () => {
  cues = [
    { id: 'guia', message: 'Dica do guia', createdAt: 0, featureKey: 'mentor_character', topicoId: 131 },
    { id: 'golpe', message: 'Esse numerador doeu!', createdAt: 0, featureKey: 'battle_mode', topicoId: 131, itemKey: 'content:192', speakerName: 'Guardiã das Frações' },
  ];
  const html = renderToString(<BossFala {...props} />);
  assert.match(html, /Esse numerador doeu!/);
  assert.match(html, /Guardiã das Frações/);
  assert.doesNotMatch(html, /Dica do guia/);
  assert.equal(imagem, 'boss-02.png');
  tocar();
  assert.equal(dispensado, 'golpe');
});

test('sem aviso do boss deste confronto, nada aparece', () => {
  cues = [{ id: 'x', message: 'De outro conteúdo', createdAt: 0, featureKey: 'battle_mode', topicoId: 131, itemKey: 'content:7' }];
  assert.equal(renderToString(<BossFala {...props} />), '');
  cues = [];
  assert.equal(renderToString(<BossFala {...props} />), '');
});
