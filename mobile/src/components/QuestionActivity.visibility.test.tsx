import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
/* eslint-disable @typescript-eslint/no-require-imports */
const { renderToString } = require('react-dom/server');
const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = { exports };
};
function Host({ children }: { children?: React.ReactNode }) { return <div>{children}</div>; }
mockModule('react-native', { Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default }, View: Host, Text: Host, ScrollView: Host, TouchableOpacity: Host, TextInput: () => null, Image: () => null,
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
// A versão de tela larga (#346) fica fora deste teste.
mockModule('@/hooks/useDesktopWeb', { useDesktopWeb: () => false });
mockModule('@/models/QuestaoAluno', { QuestaoAluno: {} });
mockModule('@/utils/essayValidation', { validateEssayAnswerWithAi: async () => ({}) });
// A segunda chance comprada fala com o Supabase. Este teste só olha o HTML.
mockModule('@/services/loja/lojaService', { gastarSegundaChance: async () => ({ ok: false }) });
// As RPCs da questão (#1065) também carregam o cliente do Supabase, que exige a URL no
// ambiente e derruba o arquivo no CI. As funções puras vêm do `.core` de verdade.
mockModule('@/services/questaoNoBanco', {
  ...require('@/services/questaoNoBanco.core'),
  responderQuestao: async () => { throw new Error('fora do teste'); },
  revelarGabarito: async () => { throw new Error('fora do teste'); },
});
const { default: QuestionActivity } = require('./QuestionActivity');
const question = { id: 2, enunciado: 'Qual alternativa?', alternativas: ['Alpha', 'Beta'], resposta_correta: 'Beta' };

test('questão nova em atividade concluída não mostra gabarito nem resposta herdada', () => {
  const html = renderToString(<QuestionActivity reviewMode initialQuestionIndex={1} atividade={{ id: 5, status: 'concluido', resposta_aluno: 'Alpha', questoes: [{ ...question, id: 1, resposta_aluno: 'Alpha' }, question] }} />);
  assert.doesNotMatch(html, /Gabarito:|Sua ultima resposta:|Ver respostas anteriores/);
  assert.match(html, /Qual alternativa/);
});
test('revisão de questão personalizada realmente respondida permite consultar gabarito', () => {
  // A personalizada (id negativo, sem linha em `questoes`) ainda traz o gabarito no payload.
  const local = { ...question, id: -2, isPersonalizedLocal: true, resposta_aluno: 'Alpha' };
  const html = renderToString(<QuestionActivity reviewMode atividade={{ id: 5, status: 'concluido', questoes: [local] }} />);
  assert.match(html, /Gabarito: (<!-- -->)?Beta/);
});
test('questão da turma não usa o gabarito que vier no payload: ele só chega pelo banco', () => {
  // #1065: o gabarito da turma vem de `revelarGabarito`, num efeito que o `renderToString`
  // não roda. Mesmo com `resposta_correta` no objeto, o primeiro desenho não o mostra.
  const html = renderToString(<QuestionActivity reviewMode atividade={{ id: 5, status: 'concluido', questoes: [{ ...question, resposta_aluno: 'Alpha' }] }} />);
  assert.doesNotMatch(html, /Gabarito:/);
  assert.match(html, /Sua ultima resposta:/);
});
test('nova tentativa reabre só a questão errada, sem a resposta antiga nem trava', () => {
  const atividade = {
    id: 5,
    status: 'concluido',
    questoes: [
      { ...question, id: 1, resposta_aluno: 'Beta', correta_aluno: true },
      { ...question, id: 2, resposta_aluno: 'Alpha', correta_aluno: false },
    ],
  };
  const errada = renderToString(<QuestionActivity initialQuestionIndex={1} questoesARefazer={[2]} atividade={atividade} />);
  assert.doesNotMatch(errada, /Sua ultima resposta:|Ver respostas anteriores|Gabarito:/);
  // Sem a nova tentativa, a mesma questão continua respondida.
  const antes = renderToString(<QuestionActivity initialQuestionIndex={1} atividade={atividade} />);
  assert.match(antes, /Ver respostas anteriores/);
  // A questão certa não reabre.
  const certa = renderToString(<QuestionActivity initialQuestionIndex={0} questoesARefazer={[2]} atividade={atividade} />);
  assert.match(certa, /Ver respostas anteriores/);
});
