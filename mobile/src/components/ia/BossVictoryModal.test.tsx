import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToString } = require('react-dom/server');
const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = { exports };
};
const victory = { id: 'battle:131:192', userId: 'aluno', state: { topicoId: 131, itemKey: 'content:192', enemy: { name: 'Guardião', contentId: 192, avatarUrl: 'remote.png' } }, message: 'Desafio vencido!' };
let pending = [victory];
let classTopic = 131;
let imageSource: unknown;
let closed = '';
let closeButton: () => void;
function Host({ children }: { children?: React.ReactNode }) { return <div>{children}</div>; }
mockModule('react-native', {
  View: Host, Text: Host, ScrollView: Host, Modal: Host,
  Image: ({ source }: { source: unknown }) => { imageSource = source; return null; },
  Pressable: ({ onPress, children }: { onPress: () => void; children: React.ReactNode }) => { closeButton = onPress; return <button>{children}</button>; },
  StyleSheet: { create: (value: unknown) => value },
});
mockModule('@/context/IAContext', { useIA: () => ({ pendingBattleVictories: pending, dismissBattleVictory: (id: string) => { closed = id; pending = []; } }) });
mockModule('@/context/SessaoContext', { useUsuario: () => ({ usuario: { id: 'aluno' } }) });
mockModule('@/context/TrilhaContext', { useTrilha: () => ({ perfil: 'conqueror', classeAtual: { topicos: [{ id: classTopic }] } }) });
mockModule('@/hooks/useContentBossVisual', { useContentBossVisual: (topic: number, key: string, content: number) => topic === 131 && key === 'content:192' && content === 192 ? 'teacher-boss.png' : null });
mockModule('@/constants/bossVisuals', { bossVisuals: { 'boss-01': 'fallback.png' } });
mockModule('@/utils/profileShellTheme', { getProfileShellPalette: () => ({}) });
const { BossVictoryModal } = require('./BossVictoryModal');

test('destaca parabéns, boss escolhido para o conteúdo e botão de continuar', () => {
  pending = [victory]; classTopic = 131;
  const html = renderToString(<BossVictoryModal />);
  assert.match(html, /Parabéns!/);
  assert.match(html, /Você derrotou o boss!/);
  assert.match(html, /Guardião/);
  assert.equal(imageSource, 'teacher-boss.png');
  closeButton();
  assert.equal(closed, victory.id);
  assert.equal(renderToString(<BossVictoryModal />), '');
});
test('vitória não aparece para outra turma ou outro aluno', () => {
  pending = [victory]; classTopic = 999;
  assert.equal(renderToString(<BossVictoryModal />), '');
  pending = [{ ...victory, userId: 'outro' }]; classTopic = 131;
  assert.equal(renderToString(<BossVictoryModal />), '');
});
