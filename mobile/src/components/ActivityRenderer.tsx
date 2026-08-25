// src/components/activities/ActivityRenderer.tsx
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import QuestionActivity from './QuestionActivity'
import TextoActivity from './TextoActivity'
import VideoActivity from './VideoActivity'

export type ActivityCompletePayload = {
  correto?: boolean;
  acertosPercentual?: number;
  timedOut?: boolean;
  scorePenaltyPct?: number;
  scoreAwarded?: number;
  pontuacaoMaxima?: number;
  avaliacaoMetadata?: Record<string, unknown> | null;
  completed?: boolean;
  questionIndex?: number;
};

type Props = {
  atividade: any;
  topicoId?: number;
  onComplete?: (result?: ActivityCompletePayload) => void;
  initialQuestionIndex?: number;
  onQuestionIndexChange?: (questionIndex: number) => void;
  timedOut?: boolean;
  reviewMode?: boolean;
};

function normalizeActivityType(value: unknown) {
  const tipo = String(value ?? '').trim().toLowerCase();

  if (!tipo) return "quiz";

  if (
    [
      "dissertativa",
      "aberta",
      "texto_livre",
      "ensaio",
      "essay",
      "questao_aberta",
      "questao aberta",
      "open",
      "open_ended",
      "open-ended",
      "open_text",
      "open text",
    ].includes(tipo)
  ) {
    return "essay";
  }

  if (
    [
      'true_false',
      'true or false',
      'true_or_false',
      'truefalse',
      'verdadeiro_falso',
      'verdadeiro ou falso',
      'verdadeiro/falso',
      'booleano',
    ].includes(tipo)
  ) {
    return 'true_false';
  }

  if (
    [
      'fill_blank',
      'fili_blank',
      'fill in the blank',
      'fill-in-the-blank',
      'fillblank',
      'completar_lacuna',
      'completar lacuna',
      'lacuna',
    ].includes(tipo)
  ) {
    return 'fill_blank';
  }

  if (
    [
      "multipla_escolha",
      "multipla escolha",
      "multiple_choice",
      "multi_select",
      "multiselect",
      "checkbox",
      "marcar",
      "escolha",
      "pergunta",
      "questao_objetiva",
      "questao objetiva",
      "objetiva",
      "quiz",
      "questao",
    ].includes(tipo)
  ) {
    return "quiz";
  }

  return tipo;
}

export function ActivityRenderer({
  atividade,
  onComplete,
  topicoId,
  initialQuestionIndex,
  onQuestionIndexChange,
  timedOut = false,
  reviewMode = false,
}: Props) {
  const [localReviewMode, setLocalReviewMode] = React.useState(reviewMode);
  const userChoseReviewRef = React.useRef(false);

  React.useEffect(() => {
    if (!userChoseReviewRef.current) {
      setLocalReviewMode(reviewMode);
    }
  }, [reviewMode]);

  if (!atividade) return null;

  const hasQuestoes = Array.isArray(atividade?.questoes) && atividade.questoes.length > 0;
  const tipo = normalizeActivityType(atividade?.tipo);
  const atividadeConcluida =
    String(atividade?.status ?? '').toLowerCase().includes('concl') ||
    Number(atividade?.percentual_concluido ?? 0) >= 100;

  const registry: Record<string, React.ComponentType<any>> = {
    questao: QuestionActivity,
    quiz: QuestionActivity,
    true_false: QuestionActivity,
    fill_blank: QuestionActivity,
    essay: QuestionActivity,
    video: VideoActivity,
    texto: TextoActivity,
  };

  const Component = registry[tipo] ?? (hasQuestoes ? QuestionActivity : undefined);

  if (atividadeConcluida && !localReviewMode) {
    const acertosPct = Number(atividade?.acertos_percentual ?? 0);
    const temAcertos = Number.isFinite(acertosPct) && acertosPct > 0;

    return (
      <View style={summaryStyles.container}>
        <View style={summaryStyles.iconRow}>
          <Text style={summaryStyles.checkmark}>✓</Text>
        </View>
        <Text style={summaryStyles.title}>
          {atividade?.titulo ?? 'Atividade concluída'}
        </Text>
        {temAcertos && (
          <Text style={summaryStyles.score}>
            {Math.round(acertosPct)}% de acertos
          </Text>
        )}
        <View style={summaryStyles.btnRow}>
          <Pressable
            onPress={() => onComplete?.({ completed: true })}
            style={[summaryStyles.btn, summaryStyles.btnPrimary]}
          >
            <Text style={summaryStyles.btnPrimaryText}>Continuar</Text>
          </Pressable>
          <Pressable
            onPress={() => { userChoseReviewRef.current = true; setLocalReviewMode(true); }}
            style={summaryStyles.btn}
          >
            <Text style={summaryStyles.btnSecondaryText}>Revisar respostas</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!Component) {
    return (
      <TextoActivity
        atividade={{ titulo: 'Tipo não suportado', conteudo: JSON.stringify(atividade, null, 2) }}
      />
    );
  }

  return (
    <Component
      atividade={atividade}
      onComplete={onComplete}
      topicoId={topicoId}
      initialQuestionIndex={initialQuestionIndex}
      onQuestionIndexChange={onQuestionIndexChange}
      timedOut={timedOut}
      reviewMode={localReviewMode}
    />
  );
}

const summaryStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 12,
  },
  iconRow: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1a3a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 28,
    color: '#4ade80',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#e8e8e8',
    textAlign: 'center',
  },
  score: {
    fontSize: 14,
    color: '#a0a0a0',
  },
  btnRow: {
    flexDirection: 'column',
    gap: 8,
    width: '100%',
    marginTop: 8,
  },
  btn: {
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  btnPrimary: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  btnPrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  btnSecondaryText: {
    color: '#a0a0a0',
    fontSize: 14,
  },
});
