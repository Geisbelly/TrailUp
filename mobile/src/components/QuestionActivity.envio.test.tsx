/**
 * O envio da múltipla escolha com a tela de verdade: tocar, confirmar e trocar de questão.
 *
 * 24/11, atividade 11 na web: `questao_responder` levou de 5 a 7 s, o aluno avançou durante a
 * espera, e o resultado da questão 1 abriu por cima da questão 2, que ele não tinha respondido.
 * Parecia que a tela corrigia todas com uma resposta só e marcava as outras como erradas.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
/* eslint-disable @typescript-eslint/no-require-imports */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const TR = require('react-test-renderer');
const mockModule = (path: string, exports: unknown) => {
  (require.cache as Record<string, unknown>)[require.resolve(path)] = { exports };
};
type Props = Record<string, unknown> & { children?: React.ReactNode };
const Host = (props: Props) => React.createElement('host', props, props.children);
const Toque = (props: Props) => React.createElement('toque', props, props.children);
const Rolagem = React.forwardRef(function Rolagem(props: Props, ref) {
  React.useImperativeHandle(ref, () => ({ scrollToEnd() {} }));
  return React.createElement('host', null, props.children);
});
mockModule('react-native', {
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
  View: Host, Text: Host, ScrollView: Rolagem, TouchableOpacity: Toque, TextInput: () => null, Image: () => null,
  Modal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
    visible ? React.createElement('modal', null, children) : null,
});
mockModule('@expo/vector-icons', { Ionicons: () => null });
mockModule('@/components/ContentRenderer', { ContentRenderer: () => null });
mockModule('@/components/textoRico/TextoRico', { TextoRico: ({ texto }: { texto?: string | null }) => React.createElement('host', null, texto ?? '') });
mockModule('@/constants/profileImages', { getGuardianFaceImage: () => null });
mockModule('@/context/MetricasContext', { useMetricas: () => ({ recordAppEvent: () => undefined }) });
mockModule('@/context/TrilhaContext', { useTrilha: () => ({ registrarRespostaQuestao: async () => undefined }) });
mockModule('@/context/SessaoContext', { useUsuario: () => ({ usuario: { id: 'aluno', perfilAtivo: 'conqueror', modoResposta: 'imediato' } }) });
mockModule('@/styles/GlobalStyle', { Color: {}, FontFamily: {} });
mockModule('@/utils/contentBlocks', { normalizeContentBlock: () => null });
mockModule('@/utils/profileShellTheme', { getProfileShellPalette: () => ({}) });
mockModule('@/hooks/useDesktopWeb', { useDesktopWeb: () => true });
mockModule('@/models/QuestaoAluno', { QuestaoAluno: {} });
mockModule('@/utils/essayValidation', { validateEssayAnswerWithAi: async () => ({}) });
mockModule('@/services/loja/lojaService', { gastarSegundaChance: async () => ({ ok: false }) });

const gabarito: Record<number, string> = { 31: 'Depender', 32: 'Fluxograma', 33: 'Decomposição' };
const enviados: { questaoId: number; resposta: string }[] = [];
let atrasoMs = 0;
let semRede = false;
mockModule('@/services/questaoNoBanco', {
  ...require('@/services/questaoNoBanco.core'),
  responderQuestao: async (p: { questaoId: number; resposta: string }) => {
    enviados.push({ questaoId: p.questaoId, resposta: p.resposta });
    if (atrasoMs) await new Promise((r) => setTimeout(r, atrasoMs));
    if (semRede) throw new TypeError('Failed to fetch');
    const correta = p.resposta === gabarito[p.questaoId];
    return {
      correta, acertosPercentual: correta ? 100 : 0, regra: 'primeira', tentativa: 1,
      gabaritoLiberado: true, respostaCorreta: gabarito[p.questaoId],
    };
  },
  revelarGabarito: async (id: number) => ({ respostaCorreta: gabarito[id] }),
});
// Gabarito no aparelho (`20261124_07`): o que o aparelho acha que é certo, e a fila sem rede.
let gabaritoLocal: Record<number, string[]> | null = null;
const naFila: { questaoId: number; resposta: string }[] = [];
mockModule('@/services/gabaritoNoAparelho', {
  ...require('@/services/gabaritoNoAparelho.core'),
  carregarGabaritos: async () => gabaritoLocal,
  gabaritosEmMemoria: () => gabaritoLocal,
  enviarFila: async () => [],
  respostasNaFila: async () => [...naFila],
  guardarNaFila: async (_aluno: string, item: { questaoId: number; resposta: string }) => {
    naFila.push({ questaoId: item.questaoId, resposta: item.resposta });
  },
});
mockModule('@/components/resposta/EditorDeCodigo', { EditorDeCodigo: () => null });
mockModule('@/components/resposta/EditorNumerico', { EditorNumerico: () => null });
mockModule('@/components/resposta/EditorDeExpressao', { EditorDeExpressao: () => null });
mockModule('@/components/textoRico/BlocoDeCodigo', { BlocoDeCodigo: () => null });
const { default: QuestionActivity } = require('./QuestionActivity');

type No = { type: string; props: Props & { onPress?: () => unknown; disabled?: boolean; accessibilityLabel?: string; accessibilityRole?: string } };
const textoDe = (c: unknown): string => {
  if (c == null || typeof c === 'boolean') return '';
  if (typeof c === 'string' || typeof c === 'number') return String(c);
  if (Array.isArray(c)) return c.map(textoDe).join(' ');
  return textoDe((c as { props?: Props }).props?.children);
};
const textoDaTela = (no: unknown): string => {
  if (no == null) return '';
  if (typeof no === 'string') return no;
  if (Array.isArray(no)) return no.map(textoDaTela).join(' ');
  return textoDaTela((no as { children?: unknown }).children);
};

const atividade = {
  id: 11,
  tipo: 'multipla',
  questoes: [
    { id: 31, tipo: 'multipla', enunciado: 'Q31', alternativas: '["Depender","Ter passos","Produzir saída","Ser finito"]' },
    { id: 32, tipo: 'multipla', enunciado: 'Q32', alternativas: '["Fluxograma","Tabela-verdade","Pseudocódigo","Narrativa"]' },
    { id: 33, tipo: 'multipla', enunciado: 'Q33', alternativas: '["Compilação","Decomposição","Padrões","Abstração"]' },
  ],
};

async function montar(extra: Record<string, unknown> = {}) {
  let tela: { root: { findAll: (f: (n: No) => boolean) => No[] }; toJSON: () => unknown; unmount: () => void } | null = null;
  await TR.act(async () => {
    tela = TR.create(React.createElement(QuestionActivity, { atividade: structuredClone(atividade), topicoId: 1, onComplete: async () => undefined, ...extra }));
  });
  const t = tela!;
  const achar = (f: (n: No) => boolean) => t.root.findAll((n) => n.type === 'toque' && f(n))[0];
  const tocar = async (f: (n: No) => boolean, esperarMs = 10) => {
    const no = achar(f);
    assert.ok(no, 'botão não encontrado');
    await TR.act(async () => {
      if (!no.props.disabled) no.props.onPress?.();
      await new Promise((r) => setTimeout(r, esperarMs));
    });
  };
  const comTexto = (trecho: string) => (n: No) => textoDe(n.props.children).includes(trecho);
  const alternativa = (rotulo: string) => (n: No) => n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === rotulo;
  return {
    tela: t,
    achar,
    tocar,
    comTexto,
    alternativa,
    texto: () => textoDaTela(t.toJSON()).replace(/\s+/g, ' '),
    modalAberto: () => t.root.findAll((n) => n.type === 'modal').length > 0,
    desmontar: async () => TR.act(async () => t.unmount()),
  };
}

test('cada questão manda a própria alternativa, e o resultado é o dela', async () => {
  enviados.length = 0;
  atrasoMs = 0;
  const t = await montar();
  try {
    const escolhas = ['Depender', 'Fluxograma', 'Decomposição'];
    for (let i = 0; i < escolhas.length; i++) {
      await t.tocar(t.alternativa(escolhas[i]));
      await t.tocar(t.comTexto('Confirmar resposta'));
      assert.match(t.texto(), new RegExp(`Questão ${i + 1}: `));
      await t.tocar(t.comTexto('Fechar'));
      if (i < escolhas.length - 1) await t.tocar(t.comTexto('Próxima'));
    }
    assert.deepEqual(enviados, [
      { questaoId: 31, resposta: 'Depender' },
      { questaoId: 32, resposta: 'Fluxograma' },
      { questaoId: 33, resposta: 'Decomposição' },
    ]);
  } finally {
    await t.desmontar();
  }
});

test('com o banco lento, não se avança durante o envio, e o resultado da 1 não cai sobre a 2', async () => {
  enviados.length = 0;
  atrasoMs = 200;
  const t = await montar();
  try {
    await t.tocar(t.alternativa('Ter passos'));
    await t.tocar(t.comTexto('Confirmar resposta'));
    assert.match(t.texto(), /Enviando resposta/);
    // Antes: "Próxima" ficava livre, o aluno ia para a 2 e o "Revise e tente de novo" da 1 abria nela.
    await t.tocar(t.comTexto('Próxima'), 300);
    assert.match(t.texto(), /Questão 1 de 3/);
    assert.equal(t.modalAberto(), true);
    assert.match(t.texto(), /Questão 1: Revise e tente de novo/);
    assert.doesNotMatch(t.texto(), /Q32/);
  } finally {
    await t.desmontar();
    atrasoMs = 0;
  }
});

const daTurma = { alunoId: 'aluno', classeId: 68 };

test('com o gabarito no aparelho, o resultado sai antes de o banco responder', async () => {
  enviados.length = 0;
  atrasoMs = 400;
  gabaritoLocal = { 31: ['Depender'], 32: ['Fluxograma'], 33: ['Decomposição'] };
  const t = await montar(daTurma);
  try {
    await t.tocar(t.alternativa('Depender'));
    await t.tocar(t.comTexto('Confirmar resposta'));
    assert.doesNotMatch(t.texto(), /Enviando resposta/);
    assert.equal(t.modalAberto(), true);
    assert.match(t.texto(), /Questão 1: /);
    assert.doesNotMatch(t.texto(), /Revise e tente de novo/);
    // O banco recebeu a mesma resposta, e é ele que grava.
    assert.deepEqual(enviados, [{ questaoId: 31, resposta: 'Depender' }]);
    await t.tocar(t.comTexto('Fechar'), 500);
    assert.equal(t.modalAberto(), false);
  } finally {
    await t.desmontar();
    atrasoMs = 0;
    gabaritoLocal = null;
  }
});

test('se o banco discordar do aparelho, vale o banco', async () => {
  enviados.length = 0;
  atrasoMs = 50;
  // O aparelho está desatualizado: acha que a 31 é "Ter passos"; o banco diz "Depender".
  gabaritoLocal = { 31: ['Ter passos'] };
  const t = await montar(daTurma);
  try {
    await t.tocar(t.alternativa('Ter passos'));
    await t.tocar(t.comTexto('Confirmar resposta'));
    await t.tocar(t.comTexto('Fechar'), 150);
    assert.equal(t.modalAberto(), true);
    assert.match(t.texto(), /Vale a correção do servidor/);
  } finally {
    await t.desmontar();
    atrasoMs = 0;
    gabaritoLocal = null;
  }
});

test('sem rede, a resposta corrigida no aparelho fica na fila para o banco', async () => {
  enviados.length = 0;
  naFila.length = 0;
  semRede = true;
  gabaritoLocal = { 31: ['Depender'] };
  const t = await montar(daTurma);
  try {
    await t.tocar(t.alternativa('Depender'));
    await t.tocar(t.comTexto('Confirmar resposta'), 50);
    assert.doesNotMatch(t.texto(), /Revise e tente de novo/);
    assert.deepEqual(naFila, [{ questaoId: 31, resposta: 'Depender' }]);
    assert.match(t.texto(), /Sem conexão: 1 resposta guardada/);
  } finally {
    await t.desmontar();
    semRede = false;
    gabaritoLocal = null;
    naFila.length = 0;
  }
});
