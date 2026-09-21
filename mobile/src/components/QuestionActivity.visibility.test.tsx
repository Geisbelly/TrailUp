import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToString } = require('react-dom/server');
const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = { exports };
};
function Host({ children }: { children?: React.ReactNode }) { return <div>{children}</div>; }
mockModule('react-native', { View: Host, Text: Host, ScrollView: Host, TouchableOpacity: Host, TextInput: () => null, Image: () => null,
  Modal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => visible ? <div>{children}</div> : null });
mockModule('@expo/vector-icons', { Ionicons: () => null });
mockModule('@/components/ContentRenderer', { ContentRenderer: () => null });
mockModule('@/constants/profileImages', { getGuardianFaceImage: () => null });
mockModule('@/context/MetricasContext', { useMetricas: () => ({ recordAppEvent: () => undefined }) });
mockModule('@/context/TrilhaContext', { useTrilha: () => ({ registrarRespostaQuestao: async () => undefined }) });
mockModule('@/context/SessaoContext', { useUsuario: () => ({ usuario: { id: 'aluno', perfilAtivo: 'conqueror', modoResposta: 'imediato' } }) });
mockModule('@/styles/GlobalStyle', { Color: {}, FontFamily: {} });
mockModule('@/utils/contentBlocks', { normalizeContentBlock: () => null });
mockModule('@/utils/profileShellTheme', { getProfileShellPalette: () => ({}) });
mockModule('@/models/QuestaoAluno', { QuestaoAluno: {} });
mockModule('@/utils/essayValidation', { validateEssayAnswerWithAi: async () => ({}) });
const { default: QuestionActivity } = require('./QuestionActivity');
const question = { id: 2, enunciado: 'Qual alternativa?', alternativas: ['Alpha', 'Beta'], resposta_correta: 'Beta' };

test('questão nova em atividade concluída não mostra gabarito nem resposta herdada', () => {
  const html = renderToString(<QuestionActivity reviewMode initialQuestionIndex={1} atividade={{ id: 5, status: 'concluido', resposta_aluno: 'Alpha', questoes: [{ ...question, id: 1, resposta_aluno: 'Alpha' }, question] }} />);
  assert.doesNotMatch(html, /Gabarito:|Sua ultima resposta:|Ver respostas anteriores/);
  assert.match(html, /Qual alternativa/);
});
test('revisão de questão realmente respondida permite consultar gabarito', () => {
  const html = renderToString(<QuestionActivity reviewMode atividade={{ id: 5, status: 'concluido', questoes: [{ ...question, resposta_aluno: 'Alpha' }] }} />);
  assert.match(html, /Gabarito:/);
});
