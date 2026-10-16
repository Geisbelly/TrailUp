// src/components/activities/ActivityRenderer.tsx
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useUsuario } from '@/context/SessaoContext'
import { questionActivityScope } from '@/utils/questionAnswerVisibility'
import { activityRendererKey, normalizeActivityType } from '@/utils/activityType'

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

export { normalizeActivityType } from '@/utils/activityType';

export function ActivityRenderer(props: Props) {
  const { usuario } = useUsuario();
  if (!props.atividade) return null;
  const scope = questionActivityScope(props.atividade, usuario?.id, usuario?.perfilAtivo, props.topicoId);
  return <ActivityRendererContent key={scope} {...props} />;
}

function ActivityRendererContent({
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

  const componentes: Record<string, React.ComponentType<any>> = {
    question: QuestionActivity,
    video: VideoActivity,
    texto: TextoActivity,
  };
  const chave = activityRendererKey(tipo, hasQuestoes);
  const Component = chave ? componentes[chave] : undefined;

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
            accessibilityRole="button"
          >
            <Text style={summaryStyles.btnPrimaryText}>Continuar</Text>
          </Pressable>
          <Pressable
            onPress={() => { userChoseReviewRef.current = true; setLocalReviewMode(true); }}
            style={summaryStyles.btn}
            accessibilityRole="button"
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
        atividade={{ titulo: 'Atividade indisponível', conteudo: 'Não foi possível abrir esta atividade. Tente carregar o tópico novamente.' }}
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
