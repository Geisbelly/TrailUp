// src/components/activities/ActivityRenderer.tsx
import React, { useMemo } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useMetricas } from '@/context/MetricasContext'
import { useUsuario } from '@/context/SessaoContext'
import { useBloqueioDeCaptura } from '@/hooks/useBloqueioDeCaptura'
import { FontFamily } from '@/styles/GlobalStyle'
import { getProfileShellPalette } from '@/utils/profileShellTheme'
import { questionActivityScope } from '@/utils/questionAnswerVisibility'
import { activityRendererKey, normalizeActivityType } from '@/utils/activityType'
import { deveBloquearCaptura } from '@/utils/bloqueioDeCaptura'

import { UsarItemNaAtividade } from '@/components/loja/UsarItemNaAtividade'
import {
  MENSAGEM_DA_RECUSA,
  TentativaRecusada,
  garantirTentativa,
  situacaoDasTentativas,
  type SituacaoTentativas,
} from '@/services/tentativasAtividade'
import { questoesParaRefazer, rotuloDasRestantes, tentativasLivres } from '@/services/tentativasAtividade.core'
import QuestionActivity, { resolveActivityGradingRules } from './QuestionActivity'
import TextoActivity from './TextoActivity'
import VideoActivity from './VideoActivity'
import { perfilVisualDoAluno } from "@/utils/brainHex";

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
  /**
   * O professor mudou a atividade e a IA pediu que este aluno a refaça (`alteracao_aluno`). A nota
   * de antes fica guardada no banco: refazer só pode subir. Não é segunda chance: não custa nada
   * e não tem o desconto de nova tentativa.
   */
  revisaoPedida?: { resumo: string | null } | null;
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
  revisaoPedida = null,
}: Props & { alunoId?: string | null }) {
  const { usuario } = useUsuario();
  const palette = useMemo(
    () => getProfileShellPalette(perfilVisualDoAluno(usuario)),
    [usuario]
  );
  const [localReviewMode, setLocalReviewMode] = React.useState(reviewMode);
  const [retryLiberada, setRetryLiberada] = React.useState(false);
  const [novaTentativa, setNovaTentativa] = React.useState(0);
  const [refazendoRevisao, setRefazendoRevisao] = React.useState(false);
  // Nova tentativa (#136, decisão de 02/11): os ids das questões erradas que ela reabre.
  const [refazendoErradas, setRefazendoErradas] = React.useState<number[] | null>(null);
  const [situacao, setSituacao] = React.useState<SituacaoTentativas | null>(null);
  const [abrindoTentativa, setAbrindoTentativa] = React.useState(false);
  const [avisoTentativa, setAvisoTentativa] = React.useState<string | null>(null);
  const userChoseReviewRef = React.useRef(false);
  const atividadeId = Number(atividade?.id);
  const personalizada = Boolean((atividade as any)?.isPersonalizedLocal);
  const concluidaAgora =
    String(atividade?.status ?? '').toLowerCase().includes('concl') ||
    Number(atividade?.percentual_concluido ?? 0) >= 100;
  const acertosAgora = atividade?.acertos_percentual;

  // Quantas tentativas sobram. Atividade em andamento: a tentativa é aberta antes (a tela da
  // trilha já faz isso, e a chamada é a mesma), para a aberta entrar na conta.
  React.useEffect(() => {
    if (personalizada || !Number.isFinite(atividadeId)) return;
    let ativo = true;
    const abrir = concluidaAgora ? Promise.resolve(null) : garantirTentativa(atividadeId).catch(() => null);
    abrir
      .then(() => situacaoDasTentativas(atividadeId))
      .then((s) => {
        if (ativo) setSituacao(s);
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [atividadeId, personalizada, concluidaAgora, acertosAgora, refazendoErradas]);
  const painelDeItens = alunoId && classeId && atividade?.id ? (
    <UsarItemNaAtividade
      alunoId={alunoId}
      classeId={classeId}
      atividadeId={Number(atividade.id)}
      dataEntrega={atividade.data_entrega ?? null}
      onSegundaChance={() => {
        // A nova tentativa grava nota, e vale a última (#136): o relógio dela começa no
        // servidor agora. Recusa (prazo, tentativas) aparece ao responder, com o motivo.
        if (!(atividade as any)?.isPersonalizedLocal) {
          garantirTentativa(Number(atividade.id)).catch(() => undefined);
        }
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

  // Print bloqueado só enquanto o aluno responde (#139). Calculado antes dos `return`
  // abaixo porque é um hook; as mesmas condições decidem o que é desenhado.
  const { recordAppEvent } = useMetricas();
  useBloqueioDeCaptura(
    deveBloquearCaptura({
      plataforma: Platform.OS,
      componente: activityRendererKey(
        normalizeActivityType(atividade?.tipo),
        Array.isArray(atividade?.questoes) && atividade.questoes.length > 0
      ),
      revisao: localReviewMode,
      mostrandoResumo:
        concluidaAgora && !localReviewMode && !retryLiberada && !refazendoRevisao && !refazendoErradas,
    }),
    () =>
      recordAppEvent({
        eventGroup: 'interaction',
        eventName: 'screen_capture_attempt',
        topicoId: topicoId ?? null,
        atividadeId: Number.isFinite(atividadeId) ? atividadeId : null,
        payload: { plataforma: Platform.OS },
      })
  );

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

  if (atividadeConcluida && !localReviewMode && !retryLiberada && !refazendoRevisao && !refazendoErradas) {
    const acertosPct = Number(atividade?.acertos_percentual ?? 0);
    const temAcertos = Number.isFinite(acertosPct) && acertosPct > 0;
    const erradas = hasQuestoes && !personalizada && !revisaoPedida ? questoesParaRefazer(atividade?.questoes) : [];
    const podeRefazer = situacao != null && situacao.restantes > 0 && erradas.length > 0;
    const valorDaRefeita = 100 - resolveActivityGradingRules(atividade).penalty_retry_pct;
    const refazer = () => {
      if (abrindoTentativa) return;
      setAbrindoTentativa(true);
      setAvisoTentativa(null);
      // A tentativa é aberta no servidor antes: é o relógio dele que vale, e ele recusa prazo e limite.
      garantirTentativa(atividadeId)
        .then((tentativa) => {
          if (!tentativa) {
            setAvisoTentativa('Não foi possível abrir uma nova tentativa agora.');
            return;
          }
          userChoseReviewRef.current = false;
          setLocalReviewMode(false);
          setRefazendoErradas(erradas);
        })
        .catch((err) =>
          setAvisoTentativa(
            err instanceof TentativaRecusada
              ? MENSAGEM_DA_RECUSA[err.motivo].descricao
              : 'Não foi possível abrir uma nova tentativa agora. Confira a conexão e tente de novo.'
          )
        )
        .finally(() => setAbrindoTentativa(false));
    };

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
        {revisaoPedida && hasQuestoes ? (
          <Text style={[summaryStyles.revisao, { color: palette.text }]}>
            O professor mudou esta atividade. Refaça quando puder: a sua nota de antes continua
            garantida e só pode subir.
          </Text>
        ) : null}
        {temAcertos && (
          <Text style={[summaryStyles.score, { color: palette.textMuted }]}>
            {Math.round(acertosPct)}% de acertos
          </Text>
        )}
        {podeRefazer ? (
          <Text style={[summaryStyles.revisao, { color: palette.textMuted }]}>
            {rotuloDasRestantes(situacao?.restantes ?? 0)}. Só as questões que você errou reabrem, e cada uma
            que acertar agora vale {valorDaRefeita}% dos pontos.
          </Text>
        ) : situacao != null && situacao.restantes === 0 && erradas.length > 0 ? (
          <Text style={[summaryStyles.revisao, { color: palette.textMuted }]}>
            Você já usou as {situacao.maximo} tentativas desta atividade.
          </Text>
        ) : null}
        {avisoTentativa ? (
          <Text accessibilityLiveRegion="polite" style={[summaryStyles.revisao, { color: palette.text }]}>
            {avisoTentativa}
          </Text>
        ) : null}
        <View style={summaryStyles.btnRow}>
          {podeRefazer ? (
            <Pressable
              onPress={refazer}
              disabled={abrindoTentativa}
              style={[summaryStyles.btn, { backgroundColor: palette.accent, borderColor: palette.accent }]}
              accessibilityRole="button"
              accessibilityState={{ disabled: abrindoTentativa, busy: abrindoTentativa }}
            >
              <Text style={[summaryStyles.btnPrimaryText, { color: palette.background }]}>
                {abrindoTentativa ? 'Abrindo a tentativa…' : 'Refazer as questões erradas'}
              </Text>
            </Pressable>
          ) : null}
          {revisaoPedida && hasQuestoes ? (
            <Pressable
              onPress={() => {
                userChoseReviewRef.current = false;
                setLocalReviewMode(false);
                setRefazendoRevisao(true);
              }}
              style={[summaryStyles.btn, { backgroundColor: palette.accent, borderColor: palette.accent }]}
              accessibilityRole="button"
            >
              <Text style={[summaryStyles.btnPrimaryText, { color: palette.background }]}>Refazer a atividade</Text>
            </Pressable>
          ) : null}
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
        refazendoRevisao={refazendoRevisao}
        questoesARefazer={refazendoErradas ?? undefined}
        tentativasLivres={situacao ? tentativasLivres(situacao) : null}
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
  revisao: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    lineHeight: 20,
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
