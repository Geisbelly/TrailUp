// src/components/activities/QuestionActivity.tsx
import { ContentRenderer } from '@/components/ContentRenderer';
import { bannerImages, getProfileImageByString } from '@/constants/profileImages';
import { useMetricas } from '@/context/MetricasContext';
import { useUsuario } from '@/context/SessaoContext';
import { useTrilha } from '@/context/TrilhaContext';
import { ContentBlock } from '@/interfaces/componentes_simples/IContentBlock';
import { Color, FontFamily } from '@/styles/GlobalStyle';
import { normalizeContentBlock } from '@/utils/contentBlocks';
import { getProfileShellPalette } from '@/utils/profileShellTheme';
import { QuestaoAluno } from '@/models/QuestaoAluno';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Props = {
  atividade: any;
  topicoId?: number;
  initialQuestionIndex?: number;
  onQuestionIndexChange?: (questionIndex: number) => void;
  timedOut?: boolean;
  reviewMode?: boolean;
  onComplete?: (result?: {
    correto?: boolean;
    acertosPercentual?: number;
    questaoId?: number;
    atividadeId?: number;
    resposta?: string;
    tentativa?: number;
    timedOut?: boolean;
    scorePenaltyPct?: number;
    scoreAwarded?: number;
    pontuacaoMaxima?: number;
    avaliacaoMetadata?: Record<string, unknown> | null;
    completed?: boolean;
    questionIndex?: number;
  }) => void;
};

function normalizeBooleanValue(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (['true', 'verdadeiro', 'v', '1', 'sim', 'yes'].includes(normalized)) {
    return 'true';
  }

  if (['false', 'falso', 'f', '0', 'nao', 'não', 'no'].includes(normalized)) {
    return 'false';
  }

  return null;
}

function isTrueFalseType(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase();

  return [
    'true_false',
    'true or false',
    'true_or_false',
    'truefalse',
    'verdadeiro_falso',
    'verdadeiro ou falso',
    'verdadeiro/falso',
    'booleano',
  ].includes(normalized);
}

function isFillBlankType(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase();

  return [
    'fill_blank',
    'fili_blank',
    'fill in the blank',
    'fill-in-the-blank',
    'fillblank',
    'completar_lacuna',
    'completar lacuna',
    'lacuna',
  ].includes(normalized);
}

function isDissertativaType(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return [
    'dissertativa',
    'aberta',
    'texto_livre',
    'ensaio',
    'essay',
    'questao_aberta',
    'questao aberta',
    'open',
    'open_ended',
    'open-ended',
    'open_text',
    'open text',
  ].includes(normalized);
}

function formatTrueFalseLabel(value: unknown) {
  const normalized = normalizeBooleanValue(value);
  if (normalized === 'true') return 'Verdadeiro';
  if (normalized === 'false') return 'Falso';
  return String(value ?? '');
}

function normalizeDisplayText(value: unknown) {
  return String(value ?? '').trim();
}

// Normalização usada apenas para comparação técnica das respostas.
function normalizeAnswerComparisonValue(value: unknown) {
  const text = normalizeDisplayText(value);
  if (!text) return '';

  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

const ANSWER_SIMILARITY_THRESHOLD = 0.82;

function normalizeStrictAnswerValue(value: unknown) {
  return normalizeAnswerComparisonValue(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const matrix = Array.from({ length: left.length + 1 }, (_, row) =>
    Array.from({ length: right.length + 1 }, (_, col) => {
      if (row === 0) return col;
      if (col === 0) return row;
      return 0;
    })
  );

  for (let row = 1; row <= left.length; row += 1) {
    for (let col = 1; col <= right.length; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost
      );
    }
  }

  return matrix[left.length][right.length];
}

function normalizedLevenshteinSimilarity(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  if (maxLength === 0) return 1;
  const distance = levenshteinDistance(left, right);
  return 1 - distance / maxLength;
}

function isTextAnswerEquivalent(input: unknown, expected: unknown) {
  const normalizedInput = normalizeStrictAnswerValue(input);
  const normalizedExpected = normalizeStrictAnswerValue(expected);

  if (!normalizedInput || !normalizedExpected) return false;
  if (normalizedInput === normalizedExpected) return true;

  if (
    (normalizedInput.includes(normalizedExpected) ||
      normalizedExpected.includes(normalizedInput)) &&
    Math.min(normalizedInput.length, normalizedExpected.length) >= 4
  ) {
    return true;
  }

  return (
    normalizedLevenshteinSimilarity(normalizedInput, normalizedExpected) >=
    ANSWER_SIMILARITY_THRESHOLD
  );
}

function getAcceptedAnswers(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => getAcceptedAnswers(item));
  }

  if (value && typeof value === 'object') {
    const candidate =
      (value as any).acceptedAnswers ??
      (value as any).answers ??
      (value as any).respostas ??
      (value as any).alternativas ??
      (value as any).value;

    if (candidate != null && candidate !== value) {
      return getAcceptedAnswers(candidate);
    }
  }

  const text = String(value ?? '').trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (parsed !== value && (Array.isArray(parsed) || typeof parsed === 'object')) {
      return getAcceptedAnswers(parsed);
    }
  } catch {}

  return text
    .split(/\s*(?:\||;|\n)\s*/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatFillBlankStatement(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return 'Complete a lacuna no texto abaixo.';

  return text
    .replace(/(__+|\[\s*\]|\[blank\]|\{\{blank\}\}|<blank\s*\/?>)/gi, ' ______ ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildBlockSignature(block: ContentBlock) {
  if (typeof block.payload === 'string') {
    return `${block.tipo}:${block.payload.trim()}`;
  }

  return `${block.tipo}:${String(
    block.payload.url ??
      block.payload.uri ??
      block.payload.src ??
      block.payload.html ??
      block.payload.markdown ??
      block.payload.texto ??
      block.payload.legenda ??
      block.id
  ).trim()}`;
}

function collectMediaCandidates(source: any) {
  const collected: any[] = [];

  const pushCandidate = (value: any, forcedType?: string) => {
    if (value == null) return;

    if (Array.isArray(value)) {
      value.forEach((entry) => pushCandidate(entry, forcedType));
      return;
    }

    if (typeof value === 'object') {
      collected.push(
        forcedType && !value.tipo && !value.mimeType
          ? { ...value, tipo: forcedType }
          : value
      );
      return;
    }

    const text = String(value).trim();
    if (!text) return;
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (parsed !== value) {
          pushCandidate(parsed, forcedType);
          return;
        }
      } catch {}
    }

    collected.push(forcedType ? { tipo: forcedType, url: text } : text);
  };

  const metadata = (() => {
    const raw = source?.metadata;
    if (raw && typeof raw === 'object') {
      return raw as Record<string, unknown>;
    }
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return parsed as Record<string, unknown>;
        }
      } catch {}
    }
    return null;
  })();

  pushCandidate(source?.midia);
  pushCandidate(source?.midia_url);
  pushCandidate(source?.audio_url, 'audio');
  pushCandidate(source?.video_url, 'video');
  pushCandidate(source?.imagem_url, 'imagem');
  pushCandidate(source?.image_url, 'imagem');
  pushCandidate(source?.pdf_url, 'pdf');
  pushCandidate(source?.arquivo_url, 'documento');
  pushCandidate(source?.file_url, 'documento');
  pushCandidate(source?.document_url, 'documento');
  pushCandidate(source?.documento_url, 'documento');
  pushCandidate(source?.apresentacao_url, 'apresentacao');
  pushCandidate(source?.embed_html, 'embed');
  pushCandidate(source?.html, 'embed');
  pushCandidate(source?.midias);
  pushCandidate(source?.media);
  pushCandidate(source?.anexos);
  pushCandidate(source?.arquivos);
  pushCandidate(source?.fontes);
  pushCandidate(source?.materiais);
  pushCandidate(metadata?.midia);
  pushCandidate(metadata?.midia_url);
  pushCandidate(metadata?.audio_url, 'audio');
  pushCandidate(metadata?.video_url, 'video');
  pushCandidate(metadata?.imagem_url, 'imagem');
  pushCandidate(metadata?.image_url, 'imagem');
  pushCandidate(metadata?.pdf_url, 'pdf');
  pushCandidate(metadata?.arquivo_url, 'documento');
  pushCandidate(metadata?.file_url, 'documento');
  pushCandidate(metadata?.document_url, 'documento');
  pushCandidate(metadata?.documento_url, 'documento');
  pushCandidate(metadata?.apresentacao_url, 'apresentacao');
  pushCandidate(metadata?.embed_html, 'embed');
  pushCandidate(metadata?.html, 'embed');
  pushCandidate(metadata?.midias);
  pushCandidate(metadata?.media);
  pushCandidate(metadata?.anexos);
  pushCandidate(metadata?.arquivos);
  pushCandidate(metadata?.fontes);
  pushCandidate(metadata?.materiais);

  return collected;
}

function buildMediaBlocks(source: any, fallbackPrefix: string) {
  const seen = new Set<string>();

  return collectMediaCandidates(source)
    .map((candidate, index) => normalizeContentBlock(candidate, `${fallbackPrefix}-${index}`))
    .filter((block): block is ContentBlock => Boolean(block && block.tipo !== 'texto'))
    .filter((block) => {
      const signature = buildBlockSignature(block);
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
}

type GradingRules = {
  penalty_timeout_pct: number;
  penalty_retry_pct: number;
  penalty_answer_reveal_pct: number;
  zero_if_timeout: boolean;
  zero_if_wrong: boolean;
  zero_if_answer_revealed: boolean;
};

function clampPenalty(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, parsed));
}

function parseBooleanFlag(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function resolveActivityGradingRules(atividade: any): GradingRules {
  const rawRules =
    atividade?.metadata?.grading_rules ??
    atividade?.metadata?.gradingRules ??
    atividade?.grading_rules ??
    null;

  return {
    penalty_timeout_pct: clampPenalty(rawRules?.penalty_timeout_pct, 20),
    penalty_retry_pct: clampPenalty(rawRules?.penalty_retry_pct, 50),
    penalty_answer_reveal_pct: clampPenalty(rawRules?.penalty_answer_reveal_pct, 80),
    zero_if_timeout: parseBooleanFlag(rawRules?.zero_if_timeout, false),
    zero_if_wrong: parseBooleanFlag(rawRules?.zero_if_wrong, false),
    zero_if_answer_revealed: parseBooleanFlag(rawRules?.zero_if_answer_revealed, false),
  };
}

export default function QuestionActivity({
  atividade,
  onComplete,
  topicoId: topicoIdProp,
  initialQuestionIndex = 0,
  onQuestionIndexChange,
  timedOut = false,
  reviewMode = false,
}: Props) {
  const questoes = useMemo(() => (Array.isArray(atividade?.questoes) ? atividade.questoes : []), [atividade?.questoes]);
  const [questaoIndex, setQuestaoIndex] = useState(0);
  const { usuario } = useUsuario();
  const { registrarRespostaQuestao } = useTrilha();
  const { recordAppEvent } = useMetricas();
  const modoResposta = useMemo(
    () => String(usuario?.modoResposta ?? '').toLowerCase(),
    [usuario?.modoResposta]
  );
  const isPensante = modoResposta === 'pensante';
  const isImediato = !isPensante;
  const questao = questoes[questaoIndex];
  const isPersonalizedLocal = Boolean(
    (atividade as any)?.isPersonalizedLocal || (questao as any)?.isPersonalizedLocal
  );
  const topicoId = useMemo(() => {
    const candidato = topicoIdProp ?? (atividade as any)?.topico_id ?? (atividade as any)?.topicoId;
    return candidato != null ? Number(candidato) : null;
  }, [atividade, topicoIdProp]);
  const gradingRules = useMemo(() => resolveActivityGradingRules(atividade), [atividade]);
  const respostaAnterior = useMemo(
    () => questao?.resposta_aluno ?? atividade?.resposta_aluno ?? null,
    [questao?.resposta_aluno, atividade?.resposta_aluno]
  );
  const perfilNome = usuario?.perfis?.[0]?.nome || '';
  const perfilImage = getProfileImageByString(perfilNome) ?? bannerImages[6];
  const profilePalette = useMemo(
    () => getProfileShellPalette(perfilNome || null),
    [perfilNome]
  );
  const isTrueFalseActivity = useMemo(
    () => isTrueFalseType(atividade?.tipo) || isTrueFalseType(questao?.tipo),
    [atividade?.tipo, questao?.tipo]
  );
  const isFillBlankActivity = useMemo(
    () => isFillBlankType(atividade?.tipo) || isFillBlankType(questao?.tipo),
    [atividade?.tipo, questao?.tipo]
  );
  const isDissertativaActivity = useMemo(
    () => isDissertativaType(atividade?.tipo) || isDissertativaType(questao?.tipo),
    [atividade?.tipo, questao?.tipo]
  );
  const acceptedAnswers = useMemo(
    () => getAcceptedAnswers(questao?.resposta_correta),
    [questao?.resposta_correta]
  );
  const activityMediaBlocks = useMemo(
    () => buildMediaBlocks(atividade, `atividade-media-${atividade?.id ?? 'atividade'}`),
    [atividade]
  );
  const questionMediaBlocks = useMemo(
    () => buildMediaBlocks(questao, `questao-media-${questao?.id ?? questaoIndex}`),
    [questao, questaoIndex]
  );
  const mediaBlocks = useMemo(() => {
    const seen = new Set<string>();

    return [...questionMediaBlocks, ...activityMediaBlocks].filter((block) => {
      const signature = buildBlockSignature(block);
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
  }, [activityMediaBlocks, questionMediaBlocks]);
  const fillBlankPrompt = useMemo(
    () => formatFillBlankStatement(questao?.enunciado),
    [questao?.enunciado]
  );
  const alternativas = useMemo(() => {
    if (isTrueFalseActivity) {
      return ['Verdadeiro', 'Falso'];
    }

    if (isFillBlankActivity) {
      return [];
    }

    const raw = questao?.alternativas ?? [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return raw.split('|').map((s) => s.trim()).filter(Boolean);
      }
    }
    return [];
  }, [isFillBlankActivity, isTrueFalseActivity, questao?.alternativas]);
  const [selecionados, setSelecionados] = useState<Record<number, number | null>>({});
  const [respostasTexto, setRespostasTexto] = useState<Record<number, string>>({});
  const [stas, setStas] = useState<Record<number, 'certo' | 'errado' | null>>({});
  const [confirmados, setConfirmados] = useState<Record<number, boolean>>({});
  const [viuRespostas, setViuRespostas] = useState<Record<number, boolean>>({});
  const [reResponder, setReResponder] = useState(false);
  const [timeoutLocked, setTimeoutLocked] = useState<Record<number, boolean>>({});
  const [mostrarResposta, setMostrarResposta] = useState(false);
  const [modalVisivel, setModalVisivel] = useState(false);
  const [modalInfo, setModalInfo] = useState<{ titulo: string; descricao: string; pontos?: number; acerto?: boolean }>({
    titulo: '',
    descricao: '',
    pontos: 0,
    acerto: false,
  });

  useEffect(() => {
    const maxIndex = Math.max(0, questoes.length - 1);
    const nextIndex = Math.min(Math.max(0, initialQuestionIndex), maxIndex);
    setQuestaoIndex(nextIndex);
  }, [atividade?.id, initialQuestionIndex, questoes.length]);

  useEffect(() => {
    onQuestionIndexChange?.(questaoIndex);
  }, [onQuestionIndexChange, questaoIndex]);
  const atividadeConcluidaPersistida = useMemo(() => {
    const statusConcl = String(atividade?.status ?? '').toLowerCase().includes('concl');
    const percentualConcluido = Number(atividade?.percentual_concluido ?? 0);
    return statusConcl || percentualConcluido >= 100;
  }, [atividade?.status, atividade?.percentual_concluido]);
  const respondidaAntes = useMemo(() => {
    const questaoJaTemResposta = Boolean(questao?.resposta_aluno ?? respostaAnterior);
    return atividadeConcluidaPersistida || questaoJaTemResposta;
  }, [atividadeConcluidaPersistida, respostaAnterior, questao?.resposta_aluno]);
  const scrollRef = useRef<ScrollView | null>(null)

  useEffect(() => {
    if (reviewMode && respondidaAntes && atividadeConcluidaPersistida) {
      setConfirmados((prev) => ({ ...prev, [questaoIndex]: true }));
      setMostrarResposta(isImediato);
      setViuRespostas((prev) => ({ ...prev, [questaoIndex]: isImediato || !!prev[questaoIndex] }));
      setReResponder(false);
      return;
    }

    if (!reviewMode) {
      setMostrarResposta(false);
      setReResponder(false);
    }
  }, [reviewMode, respondidaAntes, atividadeConcluidaPersistida, questaoIndex, isImediato]);

  const checkResposta = useCallback((alt: any, idx: number) => {
    if (isDissertativaActivity) {
      const respostaDigitada = normalizeStrictAnswerValue(alt);
      if (!respostaDigitada) return false;
      const respostasCorretas = acceptedAnswers
        .map((answer) => normalizeStrictAnswerValue(answer))
        .filter(Boolean);

      if (!respostasCorretas.length) {
        return true;
      }

      return respostasCorretas.some((answer) =>
        isTextAnswerEquivalent(respostaDigitada, answer)
      );
    }

    const correto = questao?.resposta_correta
    if (correto == null) return false

    if (isFillBlankActivity) {
      const respostaDigitada = normalizeStrictAnswerValue(alt);
      const respostasCorretas = acceptedAnswers
        .map((answer) => normalizeStrictAnswerValue(answer))
        .filter(Boolean);

      if (!respostaDigitada || !respostasCorretas.length) return false;
      return respostasCorretas.some((answer) =>
        isTextAnswerEquivalent(respostaDigitada, answer)
      );
    }

    if (isTrueFalseActivity) {
      const altBool = normalizeBooleanValue(alt) ?? (idx === 0 ? 'true' : idx === 1 ? 'false' : null)
      const corretoBool = normalizeBooleanValue(correto)
      if (altBool && corretoBool) return altBool === corretoBool
    }

    const norm = (v: any) => String(v ?? '').trim().toLowerCase()
    // cobre: resposta igual ao texto da alternativa, indice, letra (A/B/C...)
    if (norm(alt) === norm(correto)) return true
    if (norm(idx) === norm(correto)) return true
    const letra = String.fromCharCode(65 + idx) // A, B, C...
    if (norm(letra) === norm(correto)) return true
    return false
  }, [acceptedAnswers, isDissertativaActivity, isFillBlankActivity, isTrueFalseActivity, questao?.resposta_correta])

  useEffect(() => {
    if (!respondidaAntes || respostaAnterior == null) return;

    if (isDissertativaActivity || isFillBlankActivity) {
      const respostaTxt = String(respostaAnterior);
      setRespostasTexto((prev) =>
        prev[questaoIndex] === respostaTxt ? prev : { ...prev, [questaoIndex]: respostaTxt }
      );
      if (atividadeConcluidaPersistida) {
        const acertou = checkResposta(respostaTxt, -1);
        setStas((prev) => ({ ...prev, [questaoIndex]: acertou ? 'certo' : 'errado' }));
      }
      return;
    }

    const norm = (v: any) => String(v ?? '').trim().toLowerCase();
    const idx = alternativas.findIndex((alt, i) => {
      if (isTrueFalseActivity) {
        const respostaBool = normalizeBooleanValue(respostaAnterior)
        const altBool = normalizeBooleanValue(alt) ?? (i === 0 ? 'true' : i === 1 ? 'false' : null)
        return respostaBool != null && altBool === respostaBool
      }

      return (
        norm(alt) === norm(respostaAnterior) ||
        norm(i) === norm(respostaAnterior) ||
        norm(String.fromCharCode(65 + i)) === norm(respostaAnterior)
      )
    });
    if (idx >= 0) {
      setSelecionados((prev) => ({ ...prev, [questaoIndex]: idx }));
      if (atividadeConcluidaPersistida) {
        const acertou = checkResposta(alternativas[idx], idx);
        setStas((prev) => ({ ...prev, [questaoIndex]: acertou ? 'certo' : 'errado' }));
      }
    }
  }, [
    respondidaAntes,
    respostaAnterior,
    alternativas,
    checkResposta,
    isDissertativaActivity,
    isFillBlankActivity,
    isTrueFalseActivity,
    questaoIndex,
    atividadeConcluidaPersistida,
  ]);

  useEffect(() => {
    if (confirmados[questaoIndex] || stas[questaoIndex] || respondidaAntes) {
      scrollRef.current?.scrollToEnd({ animated: true });
    }
  }, [confirmados, stas, respondidaAntes, questaoIndex]);

  if (!questao) {
    return (
      <View style={{ padding: 12 }}>
        <Text style={{ color: profilePalette.text, fontFamily: FontFamily.interMedium }}>
          Nenhuma questão disponível para esta atividade.
        </Text>
      </View>
    )
  }

  const bloqueioEdicaoPersistida = atividadeConcluidaPersistida && !reResponder;
  const jaTemTentativa =
    respondidaAntes || !!confirmados[questaoIndex] || Number(questao?.ultima_tentativa ?? 0) > 0;
  const respostasVisiveis = isImediato
    ? mostrarResposta || (atividadeConcluidaPersistida || !!confirmados[questaoIndex])
    : mostrarResposta;
  const mostrarRespostaAluno = respostasVisiveis && (respostaAnterior != null || questao?.resposta_aluno);
  const podeVerGabarito = respostasVisiveis;
  const selectedOption = selecionados[questaoIndex] ?? null;
  const statusAtual = respostasVisiveis ? stas[questaoIndex] : null;
  const viuRespostaAntes = !!viuRespostas[questaoIndex];
  const blockedByTimeout = !!timeoutLocked[questaoIndex];
  const respostaTextoAtual = String(respostasTexto[questaoIndex] ?? '');
  const podeConfirmar =
    !blockedByTimeout &&
    !bloqueioEdicaoPersistida &&
    (isFillBlankActivity || isDissertativaActivity
      ? respostaTextoAtual.trim().length > 0
      : selecionados[questaoIndex] != null);
  const respostaAnteriorExibida =
    respostaAnterior != null
      ? isTrueFalseActivity
        ? formatTrueFalseLabel(respostaAnterior)
        : isFillBlankActivity
        ? String(respostaAnterior)
        : String(respostaAnterior)
      : null;
  const gabaritoExibido =
    isDissertativaActivity
      ? "Avaliação manual"
      : isFillBlankActivity
      ? acceptedAnswers.length > 0
        ? acceptedAnswers.join(' ou ')
        : null
      : questao?.resposta_correta != null
      ? isTrueFalseActivity
        ? formatTrueFalseLabel(questao.resposta_correta)
        : String(questao.resposta_correta)
      : null;

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={{ padding: 12, paddingBottom: 160, gap: 8, flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
    >
      <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 8, color: profilePalette.text }}>
        {isFillBlankActivity ? 'Complete a lacuna do texto' : questao.enunciado}
      </Text>

      <Text style={{ color: profilePalette.textSubtle, fontFamily: FontFamily.interMedium, marginBottom: 4 }}>
        Questão {questaoIndex + 1} de {questoes.length}
      </Text>

      {mediaBlocks.length > 0 ? (
        <View
          style={{
            marginTop: 2,
            marginBottom: 6,
            padding: 12,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: profilePalette.border,
            backgroundColor: profilePalette.surface,
          }}
        >
          <ContentRenderer blocks={mediaBlocks} />
        </View>
      ) : null}

      {isTrueFalseActivity && (
        <View
          style={{
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: profilePalette.accentMuted,
            borderWidth: 1,
            borderColor: profilePalette.border,
            marginBottom: 4,
          }}
        >
          <Ionicons name="shuffle-outline" size={16} color={profilePalette.accent} />
          <Text style={{ color: profilePalette.text, fontFamily: FontFamily.interMedium }}>
            Verdadeiro ou falso
          </Text>
        </View>
      )}

      {isFillBlankActivity && (
        <View
          style={{
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: profilePalette.accentMuted,
            borderWidth: 1,
            borderColor: profilePalette.border,
            marginBottom: 4,
          }}
        >
          <Ionicons name="create-outline" size={16} color={profilePalette.accent} />
          <Text style={{ color: profilePalette.text, fontFamily: FontFamily.interMedium }}>
            Completar lacuna
          </Text>
        </View>
      )}

      {isPensante && (
        <Text style={{ color: profilePalette.textSubtle, fontFamily: FontFamily.interMedium }}>
          Modo de resposta: pensante (o gabarito fica oculto até você optar por vê-lo).
        </Text>
      )}

      {isPersonalizedLocal && (
        <Text style={{ color: profilePalette.textSubtle, fontFamily: FontFamily.interMedium }}>
          Esta atividade personalizada segue o fluxo oficial do módulo e registra seu progresso.
        </Text>
      )}

      {isFillBlankActivity && (
        <View style={{ gap: 10, marginTop: 6 }}>
          <View
            style={{
              padding: 16,
              borderRadius: 14,
              backgroundColor: profilePalette.surfaceElevated,
              borderWidth: 1,
              borderColor: profilePalette.border,
            }}
          >
            <Text
              style={{
                color: profilePalette.text,
                fontFamily: FontFamily.interMedium,
                fontSize: 16,
                lineHeight: 24,
              }}
            >
              {fillBlankPrompt}
            </Text>
          </View>

          <View
            style={{
              padding: 16,
              borderRadius: 14,
              backgroundColor: profilePalette.surface,
              borderWidth: 1,
              borderColor: profilePalette.border,
              gap: 8,
            }}
          >
            <Text style={{ color: profilePalette.text, fontFamily: FontFamily.interMedium }}>
              Sua resposta
            </Text>

            <TextInput
              value={respostaTextoAtual}
              onChangeText={(text) => {
                if (bloqueioEdicaoPersistida) return;
                setRespostasTexto((prev) => ({ ...prev, [questaoIndex]: text }));
                setStas((prev) => ({ ...prev, [questaoIndex]: null }));
                setConfirmados((prev) => ({ ...prev, [questaoIndex]: false }));
                setTimeoutLocked((prev) => ({ ...prev, [questaoIndex]: false }));
              }}
              editable={!bloqueioEdicaoPersistida}
              placeholder="Digite a palavra ou expressao"
              placeholderTextColor={profilePalette.textSubtle}
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                minHeight: 52,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: profilePalette.background,
                borderWidth: 1,
                borderColor: profilePalette.border,
                color: profilePalette.text,
                fontFamily: FontFamily.interMedium,
                fontSize: 16,
              }}
            />

            <Text
              style={{
                color: profilePalette.textSubtle,
                fontFamily: FontFamily.interMedium,
                fontSize: 12,
                lineHeight: 18,
              }}
            >
              Digite a palavra ou expressao que completa o texto.
            </Text>
          </View>
        </View>
      )}

      {isDissertativaActivity && (
        <View style={{ gap: 10, marginTop: 6 }}>
          <View style={{
            padding: 16, borderRadius: 14,
            backgroundColor: profilePalette.surface,
            borderWidth: 1, borderColor: profilePalette.border, gap: 8,
          }}>
            <Text style={{ color: profilePalette.text, fontFamily: FontFamily.interMedium }}>
              Sua resposta
            </Text>
            <TextInput
              multiline
              value={respostaTextoAtual}
              onChangeText={(text) => {
                if (bloqueioEdicaoPersistida) return;
                setRespostasTexto((prev) => ({ ...prev, [questaoIndex]: text }));
                setStas((prev) => ({ ...prev, [questaoIndex]: null }));
                setConfirmados((prev) => ({ ...prev, [questaoIndex]: false }));
                setTimeoutLocked((prev) => ({ ...prev, [questaoIndex]: false }));
              }}
              editable={!bloqueioEdicaoPersistida}
              placeholder="Digite sua resposta..."
              placeholderTextColor={profilePalette.textSubtle}
              style={{
                minHeight: 120,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: profilePalette.background,
                borderWidth: 1,
                borderColor: profilePalette.border,
                color: profilePalette.text,
                fontFamily: FontFamily.interMedium,
                fontSize: 16,
                textAlignVertical: 'top',
              }}
            />
          </View>
        </View>
      )}

      {!isFillBlankActivity && !isDissertativaActivity && alternativas.map((alt, i) => (
        <TouchableOpacity
          key={i}
          onPress={() => {
            if (bloqueioEdicaoPersistida) return;
            setSelecionados((prev) => ({ ...prev, [questaoIndex]: i }));
            setStas((prev) => ({ ...prev, [questaoIndex]: null }));
            setConfirmados((prev) => ({ ...prev, [questaoIndex]: false }));
            setTimeoutLocked((prev) => ({ ...prev, [questaoIndex]: false }));
          }}
          style={(() => {
            const isSelected = selectedOption === i;
            const selectedBackground =
              statusAtual === 'certo'
                ? 'rgba(34, 197, 94, 0.18)'
                : statusAtual === 'errado'
                ? 'rgba(239, 68, 68, 0.16)'
                : profilePalette.accentMuted;
            const selectedBorder =
              statusAtual === 'certo'
                ? '#22c55e'
                : statusAtual === 'errado'
                ? '#ef4444'
                : profilePalette.accent;

            return {
              padding: 12,
              marginTop: 6,
              backgroundColor: isSelected ? selectedBackground : profilePalette.surface,
              borderRadius: 10,
              borderWidth: isSelected ? 2 : 1,
              borderColor: isSelected ? selectedBorder : profilePalette.border,
              shadowColor: '#000',
              shadowOpacity: 0.08,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 2 },
              flexDirection: isTrueFalseActivity ? 'row' : 'column',
              alignItems: isTrueFalseActivity ? 'center' : undefined,
              gap: isTrueFalseActivity ? 12 : undefined,
            };
          })()}
        >
          {isTrueFalseActivity ? (
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor:
                  i === 0 ? 'rgba(34, 197, 94, 0.16)' : 'rgba(239, 68, 68, 0.16)',
              }}
            >
              <Ionicons
                name={i === 0 ? 'checkmark-circle' : 'close-circle'}
                size={22}
                color={i === 0 ? '#22c55e' : '#ef4444'}
              />
            </View>
          ) : null}

          <View style={{ flex: 1, gap: isTrueFalseActivity ? 2 : 0 }}>
            <Text style={{ color: profilePalette.text, fontFamily: FontFamily.interMedium }}>
              {alt}
            </Text>

            {isTrueFalseActivity ? (
              <Text
                style={{
                  color: profilePalette.textSubtle,
                  fontFamily: FontFamily.interMedium,
                  fontSize: 12,
                }}
              >
                {i === 0
                  ? 'Marque se a afirmação estiver correta.'
                  : 'Marque se a afirmação estiver incorreta.'}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        disabled={!podeConfirmar}
        onPress={() => {
          const escolhido = selecionados[questaoIndex];
          const respostaDigitada = respostaTextoAtual.trim();
          if (!podeConfirmar) return;

          const respostaSelecionada = isFillBlankActivity || isDissertativaActivity
            ? respostaDigitada
            : String(alternativas[escolhido ?? -1] ?? '');
          const acertou = isFillBlankActivity || isDissertativaActivity
            ? checkResposta(respostaSelecionada, -1)
            : checkResposta(alternativas[escolhido ?? -1], escolhido ?? -1);
          const acertosPercent = acertou
            ? viuRespostaAntes
              ? 20
              : reResponder
              ? 50
              : 100
            : 0;
          setStas((prev) => ({ ...prev, [questaoIndex]: acertou ? 'certo' : 'errado' }));
          setConfirmados((prev) => ({ ...prev, [questaoIndex]: true }));
          if (isFillBlankActivity || isDissertativaActivity) {
            setRespostasTexto((prev) => ({ ...prev, [questaoIndex]: respostaSelecionada }));
          }
          setReResponder(false)
          setMostrarResposta(isImediato ? true : false)
          if (!acertou && isImediato) {
            setViuRespostas((prev) => ({ ...prev, [questaoIndex]: true }));
          }

          // atualiza referencia local para reuso no contexto/topico
          if (questao) {
            (questao as any).resposta_aluno = respostaSelecionada;
            (questao as any).ultima_tentativa = (questao as any).ultima_tentativa ? (questao as any).ultima_tentativa + 1 : 1;
            if (acertou) {
              (questao as any).status = 'concluido';
            }
          }

          const pontosBase =
            atividade?.pontos ?? atividade?.pontuacao ?? atividade?.pontuacao_maxima ?? 0;
          const respostasProjetadas = questoes.map((item: any, idx: number) => {
            if (idx === questaoIndex) {
              return {
                respondida: true,
                correta: acertou,
                acertosPercentual: acertosPercent,
              };
            }

            const statusLocal = stas[idx];
            const acertoPersistido = Number((item as any)?.acertos_percentual ?? NaN);
            return {
              respondida: (item as any)?.resposta_aluno != null || !!confirmados[idx],
              correta:
                (item as any)?.correta_aluno ??
                (statusLocal === 'certo' ? true : statusLocal === 'errado' ? false : null),
              acertosPercentual: Number.isFinite(acertoPersistido)
                ? acertoPersistido
                : statusLocal === 'certo'
                ? 100
                : statusLocal === 'errado'
                ? 0
                : 0,
            };
          });
          const respostasRegistradas = respostasProjetadas.filter(
            (item: { respondida: boolean }) => item.respondida
          );
          const atividadeCompleta =
            questoes.length <= 1 || respostasRegistradas.length >= questoes.length;
          const acertoMedioAtividade = respostasRegistradas.length
            ? Math.max(
                0,
                Math.round(
                  respostasRegistradas.reduce(
                    (sum: number, item: { acertosPercentual: number }) =>
                      sum + Number(item.acertosPercentual ?? 0),
                    0
                  ) / respostasRegistradas.length
                )
              )
            : acertosPercent;
          const atividadeCorreta = atividadeCompleta
            ? respostasRegistradas.every((item: { correta: boolean | null }) => item.correta === true)
            : acertou;
          if (atividade) {
            (atividade as any).status = atividadeCompleta
              ? 'concluido'
              : (atividade as any).status || 'em andamento';
          }
          const multiplicador = acertou
            ? viuRespostaAntes
              ? 0.2
              : reResponder
              ? 0.5
              : 1
            : 0;
          const pontosBrutos = Math.max(
            0,
            Math.round(
              pontosBase *
                (atividadeCompleta ? acertoMedioAtividade / 100 : multiplicador)
            )
          );
          const gatilhoTimeout = timedOut;
          const gatilhoRespostaRevelada = viuRespostaAntes;
          const gatilhoReTentativa = reResponder;
          const gatilhoErro = !atividadeCorreta;
          const zeradoPorRegra =
            (gradingRules.zero_if_timeout && gatilhoTimeout) ||
            (gradingRules.zero_if_wrong && gatilhoErro) ||
            (gradingRules.zero_if_answer_revealed && gatilhoRespostaRevelada);

          let pontosGanhos = pontosBrutos;
          if (zeradoPorRegra) {
            pontosGanhos = 0;
          } else {
            if (gatilhoTimeout && gradingRules.penalty_timeout_pct > 0) {
              pontosGanhos = Math.max(
                0,
                Math.round(pontosGanhos * (1 - gradingRules.penalty_timeout_pct / 100))
              );
            }
            if (gatilhoReTentativa && gradingRules.penalty_retry_pct > 0) {
              pontosGanhos = Math.max(
                0,
                Math.round(pontosGanhos * (1 - gradingRules.penalty_retry_pct / 100))
              );
            }
            if (gatilhoRespostaRevelada && gradingRules.penalty_answer_reveal_pct > 0) {
              pontosGanhos = Math.max(
                0,
                Math.round(pontosGanhos * (1 - gradingRules.penalty_answer_reveal_pct / 100))
              );
            }
          }

          const scorePenaltyPct =
            pontosBrutos > 0
              ? Math.max(0, Math.round((1 - pontosGanhos / pontosBrutos) * 100))
              : 0;
          const avaliacaoMetadata = {
            grading_rules: gradingRules,
            triggers: {
              timed_out: gatilhoTimeout,
              retry_used: gatilhoReTentativa,
              answer_revealed: gatilhoRespostaRevelada,
              wrong_answer: gatilhoErro,
            },
            zeroed_by_rule: zeradoPorRegra,
            score_bruto: pontosBrutos,
            score_final: pontosGanhos,
            score_penalty_pct: scorePenaltyPct,
          };
          const explicacao =
            questao?.correcao ??
            questao?.explicacao ??
            questao?.comentario ??
            questao?.justificativa ??
            questao?.feedback ??
            '';
          if (acertou) {
            setModalInfo({
              titulo: atividadeCompleta ? 'Parabéns!' : 'Questão registrada',
              descricao: !atividadeCompleta
                ? 'Sua resposta foi registrada. Avance para as proximas questoes para concluir a atividade.'
                : viuRespostaAntes
                ? `Você já tinha visto o gabarito. Pontuação reduzida para ${pontosGanhos || 0} pontos (20%).`
                : timedOut
                ? `Você concluiu a atividade, mas o tempo expirou antes. Pontuação final: ${pontosGanhos || 0} pontos com penalidade de 20%.`
                : `Você ganhou ${pontosGanhos || 0} pontos. Continue assim!`,
              pontos: atividadeCompleta ? pontosGanhos : 0,
              acerto: true,
            });
          } else {
            const gabaritoTxt =
              gabaritoExibido != null && isImediato
                ? `Gabarito: ${gabaritoExibido}`
                : '';
            setModalInfo({
              titulo: isPensante ? 'Quer tentar de novo?' : 'Revise e tente de novo',
              descricao: isPensante
                ? 'Modo pensante ativo: mostramos apenas se está certo ou errado. Quer ver o gabarito ou tentar novamente? A nova tentativa vale metade da pontuação.'
                : `${gabaritoTxt}${gabaritoTxt && explicacao ? '\n\n' : ''}${explicacao || 'Revise o conteudo e tente novamente.'}`,
              acerto: false,
            });
          }
          setModalVisivel(true);
          recordAppEvent({
            eventGroup: 'performance',
            eventName: 'question_attempt',
            topicoId,
            atividadeId: atividade?.id ? Number(atividade.id) : undefined,
            questaoId: questao?.id ? Number(questao.id) : undefined,
            itemKey: atividade?.id ? `activity:${Number(atividade.id)}` : undefined,
            attemptNumber: (questao as any)?.ultima_tentativa ?? null,
            isCorrect: acertou,
            payload: {
              acertos_percentual: acertosPercent,
              completed: atividadeCompleta,
              timed_out: timedOut,
            },
          });
          recordAppEvent({
            eventGroup: 'performance',
            eventName: acertou ? 'question_correct' : 'question_wrong',
            topicoId,
            atividadeId: atividade?.id ? Number(atividade.id) : undefined,
            questaoId: questao?.id ? Number(questao.id) : undefined,
            itemKey: atividade?.id ? `activity:${Number(atividade.id)}` : undefined,
            attemptNumber: (questao as any)?.ultima_tentativa ?? null,
            isCorrect: acertou,
          });
          if (acertou && Number((questao as any)?.ultima_tentativa ?? 0) === 1) {
            recordAppEvent({
              eventGroup: 'performance',
              eventName: 'first_try_correct',
              topicoId,
              atividadeId: atividade?.id ? Number(atividade.id) : undefined,
              questaoId: questao?.id ? Number(questao.id) : undefined,
              itemKey: atividade?.id ? `activity:${Number(atividade.id)}` : undefined,
              attemptNumber: 1,
              isCorrect: true,
            });
          }
          onComplete?.({
            correto: atividadeCorreta,
            acertosPercentual: atividadeCompleta ? acertoMedioAtividade : acertosPercent,
            questaoId: questao?.id ? Number(questao.id) : undefined,
            atividadeId: atividade?.id ? Number(atividade.id) : undefined,
            resposta: respostaSelecionada,
            tentativa: (questao as any)?.ultima_tentativa ?? undefined,
            timedOut,
            scorePenaltyPct,
            scoreAwarded: pontosGanhos,
            pontuacaoMaxima: Number(atividade?.pontuacao_maxima ?? pontosBase ?? 0),
            avaliacaoMetadata,
            completed: atividadeCompleta,
            questionIndex: questaoIndex,
          })

          if (!isPersonalizedLocal && usuario?.id && questao?.id) {
            const respostaTxt = respostaSelecionada;
            if (topicoId != null) {
              registrarRespostaQuestao({
                topicoId: Number(topicoId),
                atividadeId: Number(atividade?.id ?? 0),
                questaoId: Number(questao.id),
                resposta: respostaTxt,
                correta: acertou,
                acertosPercentual: acertosPercent,
              }).catch((err) => console.warn('[QuestaoAluno] erro ao registrar resposta', err));
            } else {
              QuestaoAluno.registrarResposta({
                alunoId: usuario.id,
                atividadeId: Number(atividade?.id ?? 0),
                questaoId: Number(questao.id),
                resposta: respostaTxt,
                correta: acertou,
                acertos_percentual: acertosPercent,
              }).catch((err) => console.warn('[QuestaoAluno] erro ao registrar resposta', err));
            }
          }
        }}
        style={{
          marginTop: 14,
          padding: 12,
          borderRadius: 10,
          backgroundColor: podeConfirmar ? profilePalette.accent : profilePalette.inactive,
          alignItems: 'center',
          opacity: podeConfirmar ? 1 : 0.5,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>
          {blockedByTimeout ? 'Tempo encerrado para esta tentativa' : 'Confirmar resposta'}
        </Text>
      </TouchableOpacity>

      {blockedByTimeout ? (
        <Text style={{ marginTop: 8, color: '#fca5a5', fontFamily: FontFamily.interMedium }}>
          O tempo terminou. Interaja novamente com a resposta para iniciar uma nova tentativa local.
        </Text>
      ) : null}

      {timedOut ? (
        <Text style={{ marginTop: 8, color: '#fcd34d', fontFamily: FontFamily.interMedium }}>
          Tempo encerrado para esta atividade. Se concluir agora, a pontuação desta atividade recebe penalidade de 20%.
        </Text>
      ) : null}

      {stas[questaoIndex] && (
        <Text
          style={{
            marginTop: 12,
            fontWeight: '700',
            color: stas[questaoIndex] === 'certo' ? '#2ecc71' : '#e74c3c',
          }}
        >
          {stas[questaoIndex] === 'certo' ? 'Resposta correta!' : 'Resposta incorreta.'}
        </Text>
      )}

      {stas[questaoIndex] && isPensante && !respostasVisiveis && (
        <Text style={{ marginTop: 6, color: profilePalette.textSubtle, fontFamily: FontFamily.interMedium }}>
          Gabarito oculto. Use o botao abaixo para ver sua resposta e o correto ou tente novamente (50% dos pontos).
        </Text>
      )}

      {mostrarRespostaAluno && respostaAnteriorExibida != null && (
        <Text style={{ marginTop: 6, color: profilePalette.textMuted, fontFamily: FontFamily.interMedium }}>
          Sua ultima resposta: {respostaAnteriorExibida}
        </Text>
      )}

      {podeVerGabarito && gabaritoExibido != null && (
        <Text style={{ marginTop: 6, color: profilePalette.textMuted, fontFamily: FontFamily.interMedium }}>
          Gabarito: {gabaritoExibido}
        </Text>
      )}

      {jaTemTentativa && isPensante && !respostasVisiveis && (
        <Text style={{ marginTop: 10, color: profilePalette.textSubtle, fontFamily: FontFamily.interMedium }}>
          Modo pensante: clique para ver sua resposta e o gabarito ou tente novamente (vale metade da pontuação).
        </Text>
      )}

      {(respondidaAntes || confirmados[questaoIndex]) && (
        <TouchableOpacity
          onPress={() => {
            setSelecionados((prev) => ({ ...prev, [questaoIndex]: null }));
            setStas((prev) => ({ ...prev, [questaoIndex]: null }));
            setConfirmados((prev) => ({ ...prev, [questaoIndex]: false }));
            setTimeoutLocked((prev) => ({ ...prev, [questaoIndex]: false }));
            setReResponder(true)
            setMostrarResposta(false)
          }}
          style={{
            marginTop: 12,
            padding: 10,
            alignSelf: 'flex-start',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: profilePalette.accent,
            backgroundColor: profilePalette.accentMuted,
          }}
        >
          <Text style={{ color: profilePalette.accent, fontWeight: '700' }}>
            {isPensante ? 'Tentar novamente (50% dos pontos)' : 'Responder novamente'}
          </Text>
        </TouchableOpacity>
      )}

      {jaTemTentativa && (
        <TouchableOpacity
          onPress={() =>
            setMostrarResposta((v) => {
              const next = !v;
              if (next) setViuRespostas((prev) => ({ ...prev, [questaoIndex]: true }));
              return next;
            })
          }
          style={{
            marginTop: 12,
            padding: 10,
            alignSelf: 'flex-start',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: profilePalette.border,
            backgroundColor: profilePalette.surface,
          }}
        >
          <Text style={{ color: profilePalette.text, fontWeight: '700' }}>
            {mostrarResposta
              ? 'Ocultar respostas'
              : isPensante
              ? 'Ver minha resposta e gabarito'
              : 'Ver respostas anteriores'}
          </Text>
        </TouchableOpacity>
      )}

      {questoes.length > 1 && (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-start', gap: 10, marginTop: 16 }}>
          <TouchableOpacity
            disabled={questaoIndex === 0}
            onPress={() => {
              setQuestaoIndex((i) => Math.max(0, i - 1));
              setMostrarResposta(isImediato && respondidaAntes ? true : false);
              if (isImediato && respondidaAntes) {
                setViuRespostas((prev) => ({ ...prev, [Math.max(0, questaoIndex - 1)]: true }));
              }
            }}
            style={{
              minWidth: 112,
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: profilePalette.border,
              backgroundColor:
                questaoIndex === 0 ? profilePalette.inactive : profilePalette.surface,
            }}
          >
            <Text style={{ color: profilePalette.text }}>Anterior</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={questaoIndex === questoes.length - 1}
            onPress={() => {
              setQuestaoIndex((i) => Math.min(questoes.length - 1, i + 1));
              setMostrarResposta(isImediato && respondidaAntes ? true : false);
              if (isImediato && respondidaAntes) {
                setViuRespostas((prev) => ({ ...prev, [Math.min(questoes.length - 1, questaoIndex + 1)]: true }));
              }
            }}
            style={{
              minWidth: 112,
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: profilePalette.border,
              backgroundColor:
                questaoIndex === questoes.length - 1
                  ? profilePalette.inactive
                  : profilePalette.surface,
            }}
          >
            <Text style={{ color: profilePalette.text }}>Próxima</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={modalVisivel} transparent animationType="fade" onRequestClose={() => setModalVisivel(false)}>
        <View
          style={{
            flex: 1,
          backgroundColor: `${profilePalette.background}cc`,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          }}
        >
          <View
            style={{
              width: '100%',
              backgroundColor: profilePalette.surfaceElevated,
              borderRadius: 16,
              padding: 20,
              borderWidth: 1,
              borderColor: profilePalette.borderStrong,
            }}
          >
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <Image
                source={perfilImage}
                style={{ width: 64, height: 64, borderRadius: 32, marginBottom: 8 }}
              />
              <Text
                style={{
                  color: modalInfo.acerto ? '#2ecc71' : '#f1c40f',
                  fontSize: 18,
                  fontFamily: FontFamily.poppinsExtraBold,
                  textAlign: 'center',
                }}
              >
                {modalInfo.titulo}
              </Text>
            </View>
            <Text
              style={{
                color: profilePalette.text,
                fontFamily: FontFamily.interMedium,
                fontSize: 14,
                lineHeight: 20,
              }}
            >
              {modalInfo.descricao}
            </Text>
            {modalInfo.pontos ? (
              <Text style={{ marginTop: 10, color: profilePalette.accent, fontFamily: FontFamily.interMedium }}>
                Pontos: +{modalInfo.pontos}
              </Text>
            ) : null}
            <TouchableOpacity
              onPress={() => setModalVisivel(false)}
              style={{
                marginTop: 16,
                paddingVertical: 12,
                backgroundColor: profilePalette.accent,
                borderRadius: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: Color.colorWhite, fontFamily: FontFamily.interMedium }}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  )
}
