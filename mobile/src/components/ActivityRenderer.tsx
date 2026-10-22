// src/components/activities/ActivityRenderer.tsx
import React, { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useUsuario } from '@/context/SessaoContext'
import { FontFamily } from '@/styles/GlobalStyle'
import { getProfileShellPalette } from '@/utils/profileShellTheme'
import { questionActivityScope } from '@/utils/questionAnswerVisibility'
import { activityRendererKey, normalizeActivityType } from '@/utils/activityType'

import { UsarItemNaAtividade } from '@/components/loja/UsarItemNaAtividade'
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
  classeId?: number | null;
};

export { normalizeActivityType } from '@/utils/activityType';

export function ActivityRenderer(props: Props) {
  const { usuario } = useUsuario();
  if (!props.atividade) return null;
  const scope = questionActivityScope(props.atividade, usuario?.id, usuario?.perfilAtivo, props.topicoId);
  return <ActivityRendererContent key={scope} {...props} alunoId={usuario?.id ?? null} />;
}

function ActivityRendererContent({
  atividade,
  onComplete,
  topicoId,
  initialQuestionIndex,
  onQuestionIndexChange,
  timedOut = false,
  reviewMode = false,
  classeId = null,
  alunoId = null,
}: Props & { alunoId?: string | null }) {
  const { usuario } = useUsuario();
  const palette = useMemo(
    () => getProfileShellPalette(usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfilAtivo, usuario?.perfis]
  );
  const [localReviewMode, setLocalReviewMode] = React.useState(reviewMode);
  const [retryLiberada, setRetryLiberada] = React.useState(false);
  const [novaTentativa, setNovaTentativa] = React.useState(0);
  const userChoseReviewRef = React.useRef(false);
  const painelDeItens = alunoId && classeId && atividade?.id ? (
    <UsarItemNaAtividade
      alunoId={alunoId}
      classeId={classeId}
      atividadeId={Number(atividade.id)}
      dataEntrega={atividade.data_entrega ?? null}
      onSegundaChance={() => {
        setRetryLiberada(true);
        setLocalReviewMode(false);
        userChoseReviewRef.current = false;
        setNovaTentativa((n) => n + 1);
      }}
    />
  ) : null;

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

  if (atividadeConcluida && !localReviewMode && !retryLiberada) {
    const acertosPct = Number(atividade?.acertos_percentual ?? 0);
    const temAcertos = Number.isFinite(acertosPct) && acertosPct > 0;

    return (
      <View>
        {painelDeItens}
      <View style={summaryStyles.container}>
        <View style={summaryStyles.iconRow}>
          <Text style={summaryStyles.checkmark}>✓</Text>
        </View>
        <Text style={[summaryStyles.title, { color: palette.text }]}>
          {atividade?.titulo ?? 'Atividade concluída'}
        </Text>
        {temAcertos && (
          <Text style={[summaryStyles.score, { color: palette.textMuted }]}>
            {Math.round(acertosPct)}% de acertos
          </Text>
        )}
        <View style={summaryStyles.btnRow}>
          <Pressable
            onPress={() => onComplete?.({ completed: true })}
            style={[summaryStyles.btn, { backgroundColor: palette.accent, borderColor: palette.accent }]}
            accessibilityRole="button"
          >
            <Text style={[summaryStyles.btnPrimaryText, { color: palette.background }]}>Continuar</Text>
          </Pressable>
          <Pressable
            onPress={() => { userChoseReviewRef.current = true; setLocalReviewMode(true); }}
            style={[summaryStyles.btn, { borderColor: palette.border }]}
            accessibilityRole="button"
          >
            <Text style={[summaryStyles.btnSecondaryText, { color: palette.textMuted }]}>Revisar respostas</Text>
          </Pressable>
        </View>
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
    <View>
      {painelDeItens}
      <Component
        atividade={atividade}
        onComplete={onComplete}
        topicoId={topicoId}
        initialQuestionIndex={initialQuestionIndex}
        onQuestionIndexChange={onQuestionIndexChange}
        timedOut={timedOut}
        reviewMode={localReviewMode}
        novaTentativa={novaTentativa}
        alunoId={alunoId}
        classeId={classeId}
      />
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 12,
  },
  // O verde do "concluido" fica: ali a cor e' SIGNIFICADO (deu certo), nao identidade de
  // perfil. Pintar o visto com o accent faria o acerto ficar vermelho para o daredevil.
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
    fontFamily: FontFamily.inikaBold,
    fontSize: 17,
    textAlign: 'center',
  },
  score: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
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
  },
  btnPrimaryText: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 15,
  },
  btnSecondaryText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
  },
});
