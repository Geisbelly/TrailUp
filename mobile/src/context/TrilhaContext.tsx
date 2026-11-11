// src/context/TrilhaContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { BrainHexProfile } from '@/constants/profileImages';
import { useUsuario } from '@/context/SessaoContext';
import { supabase } from '@/database/supabase';
import {
  GraphLayout,
  NodeId,
  NodeItem,
  useGraphLayout,
} from '@/hooks/use-grafo-trilha';
import {
  PersonalizedNodeHint,
  PersonalizedTopicPayload,
} from '@/interfaces/personalizacao/IPersonalizedTopic';
import { Classe } from '@/models/Classe';
import { QuestaoAluno } from '@/models/QuestaoAluno';
import { Topico } from '@/models/Topico';
import { PersonalizacaoRlsError } from "@/services/personalizacao/errors";
import { saveStudySession } from '@/services/studySessions';
import { usePersonalizacaoProvider } from "@/services/personalizacao/PersonalizacaoProviderContext";
import {
  buildClassMapTheme,
  MapWorldTheme,
  normalizeRemoteMapTheme,
} from '@/utils/classMapTheme';
import { buildClasseResumoFallback } from '@/utils/classeMetrics';
import { findSelectedClass } from '@/utils/classSelection';
import { manterDetalheAnterior } from '@/utils/detalheDasTurmas';
import {
  buildSlideBonusDedupeKey,
  computeSlideBonusPercent,
  isSlideItemKey,
} from '@/utils/slideXpBonus';
import {
  agregarProgressoPersonalizado,
  aplicarEventoProgresso,
  mesclarLinhasProgresso,
  topicosComPendenciaPersonalizada,
  type LinhaProgressoItem,
  type ProgressoPersonalizado,
} from '@/utils/progressoPersonalizado';
import {
  drenarProgressoOutbox,
  enfileirarProgressoItem,
} from '@/services/progressoOutbox';
import { buildContentBlocks, isUrl } from '@/utils/contentBlocks';
import { ensureCachedNativeContent } from '@/utils/nativeContentCache';
import { executarComConcorrencia } from '@/utils/prefetchPool';
import { versionedCacheKey } from '@/utils/materialCacheVersion';
import {
  aggregatePersonalizedTopicPayloads,
  buildContentScopedPersonalizationItemKey,
  normalizePersonalizedTopicPayload,
  orderPersonalizationRecordsByTeacherContent,
} from '@/utils/personalization';
import { inferModoApresentacao } from '@/utils/presentationOrder';
import { mesclarSugestoes, type SugestaoMaterial } from '@/utils/materialSuggestion';
import { perfilVisualDoAluno } from '@/utils/brainHex';
import { lerConfigDaMistura, lerConteudosIniciados, registrarExposicao, type ExposicaoLinha } from '@/services/personalizacao/misturaMaterial';
import { assinaturaDosPerfis, chaveDoPerfilDaRota, pesosDaRota, type ChaveDaMistura } from '@/utils/rotaDeMaterial';
import { perfilDoRegistroCarimbado, podePedirMidiaDoRegistro, resolverRegistrosDoTopico } from '@/utils/rotaDoTopicoResolver';
import { houveVisita, payloadDeVisitaDoTopico } from '@/utils/visitaDoTopico';
import { buildSupabasePublicStorageUrl, looksLikeStorageObjectPath } from '@/utils/supabaseStorage';
import {
  clampPercent,
  normalizeNullableNonNegativeNumber,
} from '@/utils/dataValidation';
import {
  buildUnlockedTopicsStorageKey,
  mergeUnlockedTopicIds,
  normalizeRemoteTopicLocked,
} from '@/utils/unlockedTopics';
import { resolveGraphNodeAccess } from '@/utils/graphNodeAccess';
import { buildGraphFromTopicos, isTopicoUnlockedLocal } from '@/utils/topicoGraph';
import { progressoCanonicoTopico } from '@/utils/topicoProgress';
import { buildPersonalizedProgressSeed, seedPersonalizedProgress } from '@/utils/personalizedProgressSeed';
import { avisarFalha } from '@/services/saude/medicao';
import { respostaCompleta, respostaCompletaPorPerfil, semTopicosSemMaterial } from '@/utils/personalizacaoAprovada';

type Visual = 'mapa' | 'arvore' | 'lista'

function pickVisual(perfil: BrainHexProfile): Visual {
  switch (perfil) {
    case 'seeker':
    case 'conqueror':
    case 'daredevil':
      return 'mapa'
    case 'mastermind':
    case 'survivor':
      return 'arvore'
    case 'achiever':
    case 'socializer':
    default:
      return 'lista'
  }
}

function registrosParaIniciados(itens: Record<string, any>[]) {
  return itens
    .map((item) => ({
      id: Number(item?.id),
      conteudo_id: Number(item?.conteudo_id) > 0 ? Number(item.conteudo_id) : null,
      perfil: perfilDoRegistroCarimbado(item),
    }))
    .filter((item) => Number.isInteger(item.id) && item.id > 0)
}

function buildPersonalizacaoCacheKey(
  alunoId: string,
  classeId: number,
  profile: string,
) {
  return `@trailup/personalizacao-v4/${alunoId}/${classeId}/${profile}`
}

// Ordem aconselhada de material por tópico. É do aluno na turma, não do perfil
// (a sugestão é por aluno × tópico), e fica fora do cache da personalização para
// não mexer no payload que já está gravado lá.
function buildSugestoesMaterialCacheKey(alunoId: string, classeId: number) {
  return `@trailup/sugestao-material-v1/${alunoId}/${classeId}`
}

function buildProgressoItensCacheKey(
  alunoId: string,
  classeId: number,
  profile: string,
) {
  return `@trailup/progresso-itens-v1/${alunoId}/${classeId}/${profile}`
}

const PREFETCHABLE_TYPES = new Set([
  'pdf',
  'documento',
  'apresentacao',
  'imagem',
  'audio',
  'video',
]);

const MEDIA_GENERATION_COOLDOWN_MS = 3 * 60 * 1000;

// Quantos materiais o prefetch baixa ao mesmo tempo. Quatro por ser o meio
// termo medido: em serie o aluno espera a soma de tudo, e com os 12 de uma vez
// a banda do celular e' dividida entre todos -- nenhum material chega cedo, e o
// gateway passa a responder 429 sob rajada.
const PREFETCH_SIMULTANEOS = 4;

type PrefetchEntry = { url: string; hint?: string | null; key: string; revisao?: number };

function parseJsonStringSafe<T = unknown>(value: unknown): T | unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return value;

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    return value;
  }
}

function asLooseRecord(value: unknown): Record<string, any> {
  const parsed = parseJsonStringSafe<Record<string, any>>(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, any>)
    : {};
}

function asLooseArray(value: unknown): unknown[] {
  const parsed = parseJsonStringSafe<unknown[]>(value);
  return Array.isArray(parsed) ? parsed : [];
}

function normalizeMediaFormat(value: unknown): string | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'pdf') return 'pdf';
  if (['documento', 'document', 'doc', 'docs', 'docx'].includes(normalized)) return 'documento';
  if (['apresentacao', 'apresentação', 'presentation', 'slides', 'slide', 'ppt', 'pptx'].includes(normalized)) {
    return 'apresentacao';
  }
  if (['imagem', 'image', 'img'].includes(normalized)) return 'imagem';
  if (normalized === 'audio') return 'audio';
  if (normalized === 'video') return 'video';
  return null;
}

function hasMediaUrlInSection(sectionValue: unknown) {
  const section = asLooseRecord(sectionValue);
  const payload = asLooseRecord(section.payload);
  const candidates = [
    section.arquivo_url,
    section.file_url,
    section.documento_url,
    section.apresentacao_url,
    section.imagem_url,
    section.audio_url,
    section.video_url,
    section.url,
    section.uri,
    section.src,
    payload.arquivo_url,
    payload.file_url,
    payload.documento_url,
    payload.apresentacao_url,
    payload.imagem_url,
    payload.image_url,
    payload.audio_url,
    payload.video_url,
    payload.url,
    payload.uri,
    payload.src,
  ];
  return candidates.some(
    (candidate) =>
      typeof candidate === 'string' &&
      (isUrl(candidate) || looksLikeStorageObjectPath(candidate))
  );
}

function collectMissingRequestedMediaFormats(record: Record<string, any>) {
  const plano = asLooseRecord(record.plano);
  const materiais = asLooseRecord(record.materiais);

  const requested = new Set<string>();
  const generated = new Set<string>();

  asLooseArray(plano.formatos).forEach((format) => {
    const normalized = normalizeMediaFormat(format);
    if (normalized) requested.add(normalized);
  });

  const prioritized = normalizeMediaFormat(plano.formato_prioritario ?? record.formato_prioritario);
  if (prioritized) requested.add(prioritized);

  asLooseArray(record.formatos_gerados).forEach((format) => {
    const normalized = normalizeMediaFormat(format);
    if (normalized) generated.add(normalized);
  });

  Array.from(PREFETCHABLE_TYPES).forEach((format) => {
    if (hasMediaUrlInSection(materiais[format])) {
      generated.add(format);
    }
  });

  return Array.from(requested).filter((format) => !generated.has(format));
}

function collectPrefetchEntries(payload: PersonalizedTopicPayload | null): PrefetchEntry[] {
  if (!payload) return [];
  const seen = new Set<string>();
  const entries: PrefetchEntry[] = [];

  const pushUrl = (url: unknown, hint: string | null | undefined, key: string,
                   revisao?: number) => {
    if (typeof url !== 'string' || !isUrl(url)) return;
    // Reancora na origem do app antes de baixar: a URL gravada pode ter sido
    // montada com a base errada no servidor (host interno do deploy), e ai o
    // prefetch falhava com "Unable to resolve host" pra CADA material - 18
    // avisos num carregamento. Ver utils/storageOrigin.ts.
    const utilizavel = buildSupabasePublicStorageUrl(url);
    if (seen.has(utilizavel)) return;
    seen.add(utilizavel);
    entries.push({ url: utilizavel, hint, key, revisao });
  };

  const handleBlock = (block: any, keyPrefix: string) => {
    if (!block) return;
    const payloadObj = typeof block.payload === 'object' && block.payload ? block.payload : null;
    const url =
      payloadObj?.url ??
      payloadObj?.uri ??
      payloadObj?.src ??
      (typeof block.payload === 'string' ? block.payload : null);
    pushUrl(url, String(block.tipo ?? ''), `${keyPrefix}:${block.id ?? 'block'}`,
      typeof payloadObj?.revisao === 'number' ? payloadObj.revisao : undefined);
  };

  (payload.primaryBlocks ?? []).forEach((block: any, index: number) => {
    handleBlock(block, `primary:${index}`);
  });
  (payload.steps ?? []).forEach((step: any, stepIndex: number) => {
    (step?.blocks ?? []).forEach((block: any, blockIndex: number) => {
      handleBlock(block, `step:${stepIndex}:${blockIndex}`);
    });

    const activity = step?.activity;
    if (!activity) return;
    pushUrl(activity.pdf_url, 'pdf', `activity:${stepIndex}:pdf`);
    pushUrl(activity.documento_url, 'documento', `activity:${stepIndex}:documento`);
    pushUrl(activity.apresentacao_url, 'apresentacao', `activity:${stepIndex}:apresentacao`);
    pushUrl(activity.audio_url, 'audio', `activity:${stepIndex}:audio`);
    pushUrl(activity.video_url, 'video', `activity:${stepIndex}:video`);
    pushUrl(activity.imagem_url, 'imagem', `activity:${stepIndex}:imagem`);
  });

  return entries.filter((entry) => PREFETCHABLE_TYPES.has(String(entry.hint ?? '').toLowerCase()));
}

async function prefetchPersonalizedPayload(payload: PersonalizedTopicPayload | null) {
  // Na web nao existe cache de arquivo: `expo-file-system/legacy` resolve para
  // um shim com `documentDirectory = null` e NENHUM metodo, entao cada chamada
  // estoura. Sem esta saida eram ate 12 tentativas por topico, todas falhando e
  // virando `console.warn` - trabalho jogado fora e ruido que esconde erro de
  // verdade (#28). O material continua carregando pela rede na hora de exibir.
  if (Platform.OS === "web") return;

  const entries = collectPrefetchEntries(payload);
  if (!entries.length) return;

  const limited = entries.slice(0, 12);
  // Baixa em paralelo com teto: era um `await` por item, e com o gateway
  // custando ~800ms de 302 antes de cada download, 12 materiais viravam ~15s
  // de "Preparando seu modulo..." antes do primeiro aparecer.
  await executarComConcorrencia(
    limited,
    PREFETCH_SIMULTANEOS,
    (entry) =>
      ensureCachedNativeContent(
        // Versionada pela revisao: sem isso o prefetch rebaixa o arquivo
        // antigo e o aluno nunca ve o material regerado.
        `${entry.key}:${versionedCacheKey(entry.url, { revisao: entry.revisao })}`,
        entry.url,
        { extensionHint: entry.hint ?? undefined }
      ),
    (err) => {
      console.warn('[TrilhaContext] Falha ao prefetch de material personalizado:', err);
    }
  );
}


function cloneClasse(classe: Classe, patch: Partial<Classe> = {}): Classe {
  const copy = Object.assign(Object.create(Object.getPrototypeOf(classe)), classe) as Classe
  Object.assign(copy, patch)
  return copy
}

function normalizePercentual(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null
}

function isDoneState(status: unknown, percentual?: unknown) {
  const normalized = String(status ?? '').toLowerCase()
  const pct = normalizePercentual(percentual)
  return (
    normalized === 'concluido' ||
    normalized === 'done' ||
    normalized === 'complete' ||
    normalized === 'finished' ||
    normalized.includes('concl') ||
    (pct != null && pct >= 100)
  )
}

function isStartedState(status: unknown, percentual?: unknown) {
  const normalized = String(status ?? '').toLowerCase()
  const pct = normalizePercentual(percentual)
  return normalized.includes('andamento') || normalized.includes('progress') || (pct != null && pct > 0)
}

function mergeProgressState(
  persistedStatus: unknown,
  persistedPercentual: unknown,
  localStatus: unknown,
  localPercentual: unknown
) {
  const persistedPct = normalizePercentual(persistedPercentual)
  const localPct = normalizePercentual(localPercentual)
  const persistedDone = isDoneState(persistedStatus, persistedPct)
  const localDone = isDoneState(localStatus, localPct)

  if (localDone && !persistedDone) {
    return {
      status: localStatus ?? persistedStatus ?? null,
      percentual: 100,
    }
  }

  if (!persistedDone && localPct != null && (persistedPct == null || localPct > persistedPct)) {
    return {
      status: localStatus ?? persistedStatus ?? null,
      percentual: localPct,
    }
  }

  if (!isStartedState(persistedStatus, persistedPct) && isStartedState(localStatus, localPct)) {
    return {
      status: localStatus ?? persistedStatus ?? null,
      percentual: localPct ?? persistedPct ?? 0,
    }
  }

  return {
    status: persistedStatus ?? localStatus ?? null,
    percentual: persistedPct ?? localPct ?? null,
  }
}

function mergeQuestaoLocalState(persistedQuestao: any, localQuestao: any) {
  if (!localQuestao) return persistedQuestao

  const merged = Object.assign(
    Object.create(Object.getPrototypeOf(persistedQuestao)),
    persistedQuestao
  ) as any

  merged.resposta_aluno = persistedQuestao.resposta_aluno ?? localQuestao.resposta_aluno ?? null
  merged.correta_aluno = persistedQuestao.correta_aluno ?? localQuestao.correta_aluno ?? null
  merged.ultima_tentativa =
    persistedQuestao.ultima_tentativa ?? localQuestao.ultima_tentativa ?? null
  merged.acertos_percentual =
    persistedQuestao.acertos_percentual ?? localQuestao.acertos_percentual ?? null
  merged.tempo_gasto_seg =
    persistedQuestao.tempo_gasto_seg ?? localQuestao.tempo_gasto_seg ?? null

  return merged
}

function mergeAtividadeLocalState(persistedAtividade: any, localAtividade: any) {
  if (!localAtividade) return persistedAtividade

  const questoesAtualizadas = persistedAtividade.questoes.map((questao: any) => {
    const localQuestao = localAtividade.questoes.find((item: any) => item.id === questao.id)
    return mergeQuestaoLocalState(questao, localQuestao)
  })

  const merged = Object.assign(
    Object.create(Object.getPrototypeOf(persistedAtividade)),
    persistedAtividade,
    {
      questoes: questoesAtualizadas,
    }
  ) as any

  merged.resposta_aluno = persistedAtividade.resposta_aluno ?? localAtividade.resposta_aluno ?? null
  merged.correta_aluno = persistedAtividade.correta_aluno ?? localAtividade.correta_aluno ?? null
  merged.ultima_tentativa =
    persistedAtividade.ultima_tentativa ?? localAtividade.ultima_tentativa ?? null
  merged.acertos_percentual =
    persistedAtividade.acertos_percentual ?? localAtividade.acertos_percentual ?? null
  merged.tempo_gasto_min =
    persistedAtividade.tempo_gasto_min ?? localAtividade.tempo_gasto_min ?? null
  merged.mostrar_gabarito_ao_errar =
    persistedAtividade.mostrar_gabarito_ao_errar ??
    localAtividade.mostrar_gabarito_ao_errar ??
    null
  const mergedProgress = mergeProgressState(
    persistedAtividade.status,
    persistedAtividade.percentual_concluido,
    localAtividade.status,
    localAtividade.percentual_concluido
  )
  merged.status = mergedProgress.status
  merged.percentual_concluido = mergedProgress.percentual
  merged.tempo_gasto_min = persistedAtividade.tempo_gasto_min ?? localAtividade.tempo_gasto_min ?? 0

  return merged
}

function mergeConteudoLocalState(persistedConteudo: any, localConteudo: any) {
  if (!localConteudo) return persistedConteudo

  const merged = Object.assign(
    Object.create(Object.getPrototypeOf(persistedConteudo)),
    persistedConteudo
  ) as any

  const mergedProgress = mergeProgressState(
    persistedConteudo.status,
    persistedConteudo.percentual_concluido,
    localConteudo.status,
    localConteudo.percentual_concluido
  )
  merged.status = mergedProgress.status
  merged.percentual_concluido = mergedProgress.percentual
  merged.tempo_gasto_min = persistedConteudo.tempo_gasto_min ?? localConteudo.tempo_gasto_min ?? 0
  merged.ultima_visualizacao =
    localConteudo.ultima_visualizacao ??
    persistedConteudo.ultima_visualizacao ??
    null

  return merged
}

function mergeTopicoLocalState(persistedTopico: Topico, localTopico?: Topico | null) {
  if (!localTopico) return persistedTopico

  const conteudosAtualizados = persistedTopico.conteudos.map((conteudo) => {
    const localConteudo = localTopico.conteudos.find((item) => item.id === conteudo.id)
    return mergeConteudoLocalState(conteudo, localConteudo)
  })

  const atividadesAtualizadas = persistedTopico.atividades.map((atividade) => {
    const localAtividade = localTopico.atividades.find((item) => item.id === atividade.id)
    return mergeAtividadeLocalState(atividade, localAtividade)
  })

  const mergedTopico = Object.assign(Object.create(Object.getPrototypeOf(persistedTopico)), persistedTopico, {
    conteudos: conteudosAtualizados,
    atividades: atividadesAtualizadas,
  }) as Topico

  // O agregado do tópico é o da projeção persistida, não o máximo do cache.
  mergedTopico.ultima_atividade =
    localTopico.ultima_atividade ?? persistedTopico.ultima_atividade ?? null
  mergedTopico.ultima_visualizacao =
    localTopico.ultima_visualizacao ?? persistedTopico.ultima_visualizacao ?? null
  mergedTopico.tempo_gasto_min = persistedTopico.tempo_gasto_min ?? localTopico.tempo_gasto_min ?? 0

  return mergedTopico
}


function formatToIconName(heroFormat?: string | null) {
  const format = String(heroFormat ?? '').toLowerCase()
  if (format === 'pdf') return 'file-pdf-box'
  if (format === 'documento') return 'file-document-outline'
  if (format === 'apresentacao') return 'presentation'
  if (format === 'imagem') return 'image-outline'
  if (format === 'audio') return 'headphones'
  if (format === 'video') return 'play-circle'
  if (format === 'cards') return 'cards-outline'
  if (format === 'quiz') return 'help-circle'
  return undefined
}

function getRecommendedTopicIds(topicos: Topico[]) {
  const ordered = [...topicos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
  const current = ordered.find((t) => {
    const status = String(t.status ?? '').toLowerCase()
    const pct = Number(t.percentual_concluido ?? 0)
    return !status.includes('concl') && pct < 100
  })

  const currentId = current?.id ?? null
  const recommendedIds = new Set<number>()

  if (currentId != null) {
    recommendedIds.add(currentId)
  }

  if (Array.isArray(current?.next)) {
    current?.next.map(Number).filter(Boolean).forEach((id) => recommendedIds.add(id))
  }

  return {
    currentId,
    recommendedIds,
  }
}

function decorateNodesWithPersonalization(
  nodes: NodeItem[],
  topicos: Topico[],
  personalizedTopics: Record<number, PersonalizedTopicPayload>
) {
  const { currentId, recommendedIds } = getRecommendedTopicIds(topicos)

  return nodes.map((node) => {
    const topicoId = Number(node.id)
    const hint = personalizedTopics[topicoId]?.nodeHint
    const isFocus = topicoId === currentId
    const isRecommended = recommendedIds.has(topicoId)

    return {
      ...node,
      icon: formatToIconName(hint?.heroFormat),
      resumo: hint?.summary ?? undefined,
      badgeLabel: !isFocus && isRecommended ? 'Recom.' : undefined,
      badgeTone: isFocus
        ? ('focus' as const)
        : isRecommended
        ? ('recommended' as const)
        : undefined,
      heroFormat: hint?.heroFormat ?? null,
      recommended: isRecommended,
    }
  })
}

function reconcileNodesWithClasse(
  nodes: NodeItem[],
  classe: Classe,
  topicosPendentes?: Set<number>
) {
  const localGraph = buildGraphFromTopicos(classe, topicosPendentes)
  const localNodeMap = new Map(localGraph.nodes.map((node) => [String(node.id), node] as const))
  const locallyUnlocked = new Set(localGraph.unlocked.map(String))

  return nodes.map((node) => {
    const localNode = localNodeMap.get(String(node.id))
    if (!localNode) return node

    const access = resolveGraphNodeAccess({
      remoteCompleted: !!node.completed,
      remoteLocked: !!node.locked,
      localCompleted: !!localNode.completed,
      locallyUnlocked: locallyUnlocked.has(String(node.id)),
    })

    return { ...node, ...access }
  })
}

type RegistrarRespostaQuestaoParams = {
  topicoId: number
  atividadeId: number
  questaoId: number
  resposta: string
  correta: boolean | null
  acertosPercentual?: number
  tempoGastoSeg?: number
  /**
   * A resposta já foi gravada pelo banco (`questao_responder`, `20261108_01`): só o estado local
   * acompanha. Sem isto, grava direto em `questao_aluno` (questão sem RPC, app antigo).
   */
  jaGravada?: { tentativa: number | null }
}

type EnsurePersonalizationResult = PersonalizedTopicPayload | null
type EnsurePersonalizationOptions = {
  forceRefresh?: boolean
  triggerCycleId?: string | null
}

type TrilhaContextValue = {
  carregando: boolean
  erro: Error | null
  classes: Classe[]
  classeAtual: Classe | null
  selecionarClasse: (classeId: number) => void
  trocarTurma: () => void
  perfil: BrainHexProfile
  visual: Visual
  grafo: GraphLayout
  reload: () => Promise<void>
  /** Tenta de novo só o detalhe de uma turma que falhou na escolha de turma. */
  recarregarTurma: (classeId: number) => Promise<void>
  refreshTopico: (topicoId: number) => Promise<void>
  
  // ✅ Novos métodos
  marcarTopicoIniciado: (topicoId: number) => Promise<void>
  marcarTopicoConcluido: (topicoId: number) => Promise<void>
  marcarConteudoVisto: (topicoId: number, conteudoId: number) => Promise<void>
  registrarAtividadeConcluida: (
    topicoId: number,
    atividadeId: number,
    acertosPercentual: number,
    options?: {
      pontuacaoObtida?: number | null
      pontuacaoMaxima?: number | null
      avaliacaoMetadata?: Record<string, unknown> | null
    }
  ) => Promise<void>
  registrarTempoTopico: (topicoId: number, tempoGastoMin: number) => Promise<void>
  registrarTempoConteudo: (topicoId: number, conteudoId: number, tempoGastoMin: number) => Promise<void>
  registrarTempoAtividade: (topicoId: number, atividadeId: number, tempoGastoMin: number) => Promise<void>
  registrarSessaoConteudo: (topicoId: number, conteudoId: number, startedAtMs: number, endedAtMs: number) => Promise<void>
  registrarSessaoAtividade: (topicoId: number, atividadeId: number, startedAtMs: number, endedAtMs: number) => Promise<void>
  registrarSessaoTopico: (topicoId: number, startedAtMs: number, endedAtMs: number) => Promise<void>
  salvarProgressoItemPersonalizado: (params: {
    topicoId: number
    itemKey: string
    itemKind: "content" | "activity" | "cards"
    itemTitle: string
    status: "nao_iniciado" | "em_andamento" | "concluido"
    percentualConcluido: number
    acertosPercentual?: number | null
    tempoGastoMin?: number | null
    pontuacaoObtida?: number | null
    pontuacaoMaxima?: number | null
    metadata?: Record<string, unknown> | null
  }) => Promise<void>
  registrarRespostaQuestao: (params: RegistrarRespostaQuestaoParams) => Promise<void>
  deveMostrarGabaritoAoErrar: (atividade?: any, questao?: any) => boolean
  getProximosTopicos: (topicoId?: number | null) => Topico[]
  personalizedTopics: Record<number, PersonalizedTopicPayload>
  /**
   * Ordem aconselhada de material por tópico, já disponível ANTES de o tópico
   * abrir (lida do banco junto com a personalização, e do cache local). A tela
   * do tópico congela a do tópico ao abrir; o que chegar depois vale para a
   * próxima abertura.
   */
  sugestoesMaterial: Record<number, SugestaoMaterial>
  /** Guarda a sugestão que a API devolveu (mapa + cache) para a próxima abertura. */
  registrarSugestaoMaterial: (topicoId: number, sugestao: SugestaoMaterial) => void
  ensureTopicoPersonalizado: (
    topicoId: number,
    options?: EnsurePersonalizationOptions
  ) => Promise<EnsurePersonalizationResult>
  getNodePersonalizationHint: (topicoId: number) => PersonalizedNodeHint | null
  mapTheme: MapWorldTheme | null
  trilhaSlideBonusPercent: number
  progressoPersonalizado: ProgressoPersonalizado
}

const TrilhaContext = createContext<TrilhaContextValue | null>(null)

export const TrilhaProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { usuario } = useUsuario()
  const personalizacaoProvider = usePersonalizacaoProvider()

  const [classes, setClasses] = useState<Classe[]>([])
  const [classeAtual, setClasseAtual] = useState<Classe | null>(null)
  const [carregando, setCarregando] = useState<boolean>(true)
  const [erro, setErro] = useState<Error | null>(null)
  const classesRequestRef = useRef(0)
  const [slideBonusKeys, setSlideBonusKeys] = useState<Set<string>>(new Set())
  const [progressoItens, setProgressoItens] = useState<LinhaProgressoItem[]>([])


  // UM so' lugar responde "qual e' o perfil do aluno" (ver `perfilVisualDoAluno`). Aqui ficava
  // uma segunda resposta, com default 'seeker': enquanto `perfis` nao chegava do banco, o
  // cabecalho e o guardiao da trilha saiam em verde por cima de um corpo roxo.
  const perfil = useMemo(() => perfilVisualDoAluno(usuario), [usuario])
  const visual: Visual = pickVisual(perfil)
  const activeProfileKey = perfil

  // Mistura de material por conteúdo (spec 2026-11-11-mistura-de-material-por-conteudo): `null`
  // até a chave chegar de `app_config`. Desligada, nada abaixo muda — as chaves e as leituras são
  // as de antes. Ligada, a trilha lê o material dos perfis representativos e a rota de cada tópico
  // decide de qual perfil vem cada conteúdo.
  const [misturaConfig, setMisturaConfig] = useState<{ chave: ChaveDaMistura; bonus: number } | null>(null)
  const misturaLigada = misturaConfig?.chave === 'alternancia'
  // `usuario.perfis` é um array novo a cada evento de sessão (inclusive `TOKEN_REFRESHED`). As
  // dependências usam a assinatura por valor; os carregadores leem o array pela ref.
  const perfisDoAlunoRef = useRef(usuario?.perfis)
  perfisDoAlunoRef.current = usuario?.perfis
  const perfisDoAlunoAssinatura = assinaturaDosPerfis(usuario?.perfis)
  const pesosDaMistura = useMemo(
    () => pesosDaRota(perfisDoAlunoRef.current, activeProfileKey, misturaConfig?.bonus ?? 0.5),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a assinatura é a identidade de `usuario.perfis`
    [activeProfileKey, misturaConfig?.bonus, perfisDoAlunoAssinatura],
  )
  // O ativo sempre entra na leitura: registro legado (sem conteúdo) e conteúdo que nenhum
  // representativo cobre continuam saindo dele, como antes.
  const perfisDaMistura = useMemo(
    () => [...new Set<BrainHexProfile>([activeProfileKey, ...pesosDaMistura.map((p) => p.perfil)])],
    [activeProfileKey, pesosDaMistura],
  )
  const perfilDaRotaChave = chaveDoPerfilDaRota(misturaConfig?.chave ?? 'desligada', activeProfileKey, pesosDaMistura)
  const personalizationScope = `${usuario?.id ?? ''}:${classeAtual?.classe_id ?? ''}:${perfilDaRotaChave}`
  const personalizationScopeRef = useRef(personalizationScope)
  personalizationScopeRef.current = personalizationScope

  const [nodesState, setNodesState] = useState<NodeItem[]>([])
  const [unlockedState, setUnlockedState] = useState<NodeId[]>([])
  const unlockedStateRef = useRef<NodeId[]>([])
  const confirmedUnlockedRef = useRef<NodeId[]>([])
  const unlockedScopeRef = useRef<string | null>(null)
  const unlockedPersistQueueRef = useRef<Promise<void>>(Promise.resolve())
  const [personalizedTopics, setPersonalizedTopics] = useState<Record<number, PersonalizedTopicPayload>>({})
  const [sugestoesMaterial, setSugestoesMaterial] = useState<Record<number, SugestaoMaterial>>({})
  const sugestoesMaterialRef = useRef<Record<number, SugestaoMaterial>>({})
  // Tópicos que ainda têm passo personalizado pendente. Isso afeta o estado de
  // conclusão/progresso, mas não pode revogar um desbloqueio já conquistado.
  // Só entra tópico cujo payload personalizado está carregado.
  const topicosPendentesPersonalizados = useMemo(() => {
    const passosPorTopico: Record<number, number> = {}
    for (const [chave, payload] of Object.entries(personalizedTopics)) {
      const total = Array.isArray(payload?.steps) ? payload.steps.length : 0
      if (total > 0) passosPorTopico[Number(chave)] = total
    }
    return new Set(
      topicosComPendenciaPersonalizada({ passosPorTopico, linhas: progressoItens })
    )
  }, [personalizedTopics, progressoItens])

  const [remoteMapThemeState, setRemoteMapThemeState] = useState<Record<string, unknown> | null>(null)
  // Refs "espelho" para classeAtual/personalizedTopics: permitem que fetchGraphData leia o
  // estado mais recente sem depender das referencias de objeto (que mudam a cada progresso
  // salvo) no seu useCallback — caso contrario cada marcacao de progresso recria fetchGraphData
  // e realimenta o useEffect que o dispara, num loop que nunca deixa o grafo/progresso estabilizar.
  const classeAtualRef = useRef<Classe | null>(null)
  const classesRef = useRef<Classe[]>([])
  useEffect(() => { classesRef.current = classes }, [classes])
  const personalizedTopicsRef = useRef<Record<number, PersonalizedTopicPayload>>({})
  const topicosPendentesPersonalizadosRef = useRef<Set<number>>(new Set())
  classeAtualRef.current = classeAtual
  personalizedTopicsRef.current = personalizedTopics
  topicosPendentesPersonalizadosRef.current = topicosPendentesPersonalizados
  const personalizationRequestsRef = useRef<Map<string, Promise<EnsurePersonalizationResult>>>(new Map())
  const personalizationAttemptedRef = useRef<Set<string>>(new Set())
  const personalizationRefreshCycleRef = useRef<Map<string, string>>(new Map())
  const personalizationAnalysisRefreshRef = useRef<Set<string>>(new Set())
  const personalizationHydratedClassRef = useRef<string | null>(null)
  const mediaGenerationRetryRef = useRef<Map<string, number>>(new Map())
  const progressSaveWarnRef = useRef<Map<string, number>>(new Map())
  const progressSeedRef = useRef(new Set<string>())
  const rtDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const unlockedScope =
    usuario?.id && classeAtual?.classe_id
      ? buildUnlockedTopicsStorageKey(usuario.id, classeAtual.classe_id)
      : null

  const rememberUnlockedIds = useCallback((incoming: NodeId[]) => {
    if (unlockedScopeRef.current !== unlockedScope) {
      unlockedScopeRef.current = unlockedScope
      unlockedStateRef.current = []
      confirmedUnlockedRef.current = []
    }

    const merged = mergeUnlockedTopicIds(confirmedUnlockedRef.current, incoming)
    confirmedUnlockedRef.current = merged
    unlockedStateRef.current = merged
    setUnlockedState(merged)

    if (unlockedScope) {
      const snapshot = merged
      unlockedPersistQueueRef.current = unlockedPersistQueueRef.current
        .then(async () => {
          const raw = await AsyncStorage.getItem(unlockedScope)
          const persisted = raw ? JSON.parse(raw) : []
          const safePersisted = Array.isArray(persisted) ? persisted : []
          const durable = mergeUnlockedTopicIds(snapshot, safePersisted)

          if (unlockedScopeRef.current === unlockedScope) {
            const current = mergeUnlockedTopicIds(confirmedUnlockedRef.current, durable)
            confirmedUnlockedRef.current = current
            unlockedStateRef.current = current
            setUnlockedState(current)
          }
          await AsyncStorage.setItem(unlockedScope, JSON.stringify(durable))
        })
        .catch((err) => {
          console.warn('[TrilhaContext] Erro ao preservar topicos desbloqueados:', err)
        })
    }
  }, [unlockedScope])

  const showLocalUnlockedIds = useCallback((incoming: NodeId[]) => {
    const visible = mergeUnlockedTopicIds(confirmedUnlockedRef.current, incoming)
    unlockedStateRef.current = visible
    setUnlockedState(visible)
  }, [])

  useEffect(() => {
    unlockedScopeRef.current = unlockedScope
    unlockedStateRef.current = []
    confirmedUnlockedRef.current = []
    setUnlockedState([])
    if (!unlockedScope) return

    let active = true
    void AsyncStorage.getItem(unlockedScope)
      .then((raw) => {
        if (!active || unlockedScopeRef.current !== unlockedScope || !raw) return
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return
        const merged = mergeUnlockedTopicIds(confirmedUnlockedRef.current, parsed)
        confirmedUnlockedRef.current = merged
        unlockedStateRef.current = merged
        setUnlockedState(merged)
      })
      .catch((err) => {
        console.warn('[TrilhaContext] Erro ao restaurar topicos desbloqueados:', err)
      })

    return () => {
      active = false
    }
  }, [unlockedScope])

  const persistPersonalizedTopicsCache = useCallback(async (
    alunoId: string,
    classeId: number,
    profile: string,
    payloads: Record<number, PersonalizedTopicPayload>
  ) => {
    try {
      await AsyncStorage.setItem(
        buildPersonalizacaoCacheKey(alunoId, classeId, profile),
        JSON.stringify(payloads)
      )
    } catch (err) {
      console.warn('[TrilhaContext] Erro ao salvar cache de personalizacao:', err)
    }
  }, [])

  const persistProgressoItensCache = useCallback(async (
    alunoId: string,
    classeId: number,
    profile: string,
    linhas: LinhaProgressoItem[]
  ) => {
    try {
      await AsyncStorage.setItem(
        buildProgressoItensCacheKey(alunoId, classeId, profile),
        JSON.stringify(linhas)
      )
    } catch (err) {
      console.warn('[TrilhaContext] Erro ao salvar cache de progresso personalizado:', err)
    }
  }, [])

  // A chave da mistura, uma vez por aluno. Com teto de espera: sem rede, a trilha não pode ficar
  // parada esperando `app_config` — cai na desligada, que é o comportamento de antes.
  useEffect(() => {
    if (!usuario?.id) return
    let ativo = true
    const desligada = { chave: 'desligada' as ChaveDaMistura, bonus: 0.5 }
    const teto = new Promise<typeof desligada>((resolve) => setTimeout(() => resolve(desligada), 4000))
    void Promise.race([lerConfigDaMistura(supabase), teto]).then((config) => {
      if (ativo) setMisturaConfig((atual) => (atual && atual.chave === config.chave && atual.bonus === config.bonus ? atual : config))
    })
    return () => {
      ativo = false
    }
  }, [usuario?.id])

  useEffect(() => {
    personalizationHydratedClassRef.current = null
    personalizationRequestsRef.current.clear()
    personalizationAttemptedRef.current.clear()
    setPersonalizedTopics({})
    sugestoesMaterialRef.current = {}
    setSugestoesMaterial({})
  }, [personalizationScope])

  // Junta sugestões ao mapa e grava o cache. Mesclar (e não substituir) é o que
  // impede uma leitura vazia do banco — RLS ainda sem policy — de apagar o que a
  // API já tinha devolvido.
  const aplicarSugestoesMaterial = useCallback((
    alunoId: string,
    classeId: number,
    novas: Record<number, SugestaoMaterial> | null | undefined,
  ) => {
    const atuais = sugestoesMaterialRef.current
    const mescladas = mesclarSugestoes(atuais, novas)
    if (mescladas === atuais) return
    sugestoesMaterialRef.current = mescladas
    setSugestoesMaterial(mescladas)
    AsyncStorage.setItem(
      buildSugestoesMaterialCacheKey(alunoId, classeId),
      JSON.stringify(mescladas)
    ).catch((err) => {
      console.warn('[TrilhaContext] Erro ao salvar cache de sugestao de material:', err)
    })
  }, [])

  const registrarSugestaoMaterial = useCallback((topicoId: number, sugestao: SugestaoMaterial) => {
    const classe = classeAtualRef.current
    if (!usuario?.id || !classe) return
    // Resposta atrasada de um tópico de outra turma não entra no mapa desta.
    if (!classe.topicos.some((topico) => topico.id === topicoId)) return
    aplicarSugestoesMaterial(usuario.id, classe.classe_id, { [topicoId]: sugestao })
  }, [aplicarSugestoesMaterial, usuario?.id])

  // Leitura do banco, best-effort: falha (rede, RLS) vira "nada novo", e a
  // tela segue na ordem canônica ou na sugestão que já estava em cache.
  const lerSugestoesMaterial = useCallback(async (
    alunoId: string,
    classeId: number,
    topicoId?: number | null,
  ) => {
    try {
      return await personalizacaoProvider.listarSugestoesMaterialTurma({ alunoId, classeId, topicoId })
    } catch (err) {
      console.warn('[TrilhaContext] Sugestao de material indisponivel no banco:', err)
      return null
    }
  }, [personalizacaoProvider])

  useEffect(() => {
    const classeId = classeAtual?.classe_id
    // Não espera a chave: antes dela, `perfilDaRotaChave` é o perfil puro (a chave de hoje). Se
    // ela chegar ligada, a chave do cache muda e este efeito relê com a nova.
    if (!classeId || !usuario?.id) return

    let ativo = true
    ;(async () => {
      try {
        // As duas leituras chegam juntas ao estado: a sugestão precisa estar no
        // mapa no mesmo render em que o payload em cache deixa o tópico pronto,
        // senão a tela congelaria a ordem sem ela.
        const [raw, rawSugestoes] = await Promise.all([
          AsyncStorage.getItem(buildPersonalizacaoCacheKey(usuario.id, classeId, perfilDaRotaChave)),
          AsyncStorage.getItem(buildSugestoesMaterialCacheKey(usuario.id, classeId)).catch(() => null),
        ])
        if (!ativo) return
        if (rawSugestoes) {
          try {
            const sugestoes = JSON.parse(rawSugestoes) as Record<number, SugestaoMaterial>
            if (sugestoes && typeof sugestoes === 'object') {
              // Cache primeiro, banco por cima: o que já chegou do banco/API vence.
              const mescladas = mesclarSugestoes(sugestoes, sugestoesMaterialRef.current)
              sugestoesMaterialRef.current = mescladas
              setSugestoesMaterial(mescladas)
            }
          } catch (err) {
            console.warn('[TrilhaContext] Cache de sugestao de material ilegivel:', err)
          }
        }
        if (!raw) return
        const parsed = JSON.parse(raw) as Record<number, PersonalizedTopicPayload>
        if (parsed && typeof parsed === 'object') {
          // Remote data may have arrived while AsyncStorage was being read.
          setPersonalizedTopics((prev) => ({ ...parsed, ...prev }))
          Object.values(parsed).forEach((payload) => {
            void prefetchPersonalizedPayload(payload)
          })
        }
      } catch (err) {
        console.warn('[TrilhaContext] Erro ao carregar cache local de personalizacao:', err)
      }
    })()

    return () => {
      ativo = false
    }
  }, [classeAtual?.classe_id, perfilDaRotaChave, usuario?.id])

  const syncClasseLocally = useCallback((sourceClasse: Classe) => {
    const nextResumo = buildClasseResumoFallback(sourceClasse, sourceClasse.resumo)
    const nextClasse = cloneClasse(sourceClasse, {
      topicos: [...sourceClasse.topicos],
      resumo: nextResumo ?? sourceClasse.resumo,
    })

    // Mantém o espelho síncrono para operações que continuam na mesma ação
    // (por exemplo, navegar após concluir um tópico) enxergarem o resultado
    // recém-recarregado sem precisar esperar outro render.
    classeAtualRef.current = nextClasse

    setClasses((prev) =>
      prev.map((classe) =>
        classe.classe_id === nextClasse.classe_id
          ? cloneClasse(nextClasse, {
              topicos: [...nextClasse.topicos],
              resumo: nextClasse.resumo,
            })
          : classe
      )
    )
    setClasseAtual((prev) =>
      prev && prev.classe_id === nextClasse.classe_id
        ? cloneClasse(nextClasse, {
            topicos: [...nextClasse.topicos],
            resumo: nextClasse.resumo,
          })
        : prev
    )

    const { nodes, unlocked } = buildGraphFromTopicos(nextClasse, topicosPendentesPersonalizados)
    setNodesState(decorateNodesWithPersonalization(nodes, nextClasse.topicos, personalizedTopics))
    showLocalUnlockedIds(unlocked)
  }, [personalizedTopics, showLocalUnlockedIds, topicosPendentesPersonalizados])

  const carregarClasses = useCallback(async () => {
    const requestId = ++classesRequestRef.current
    if (!usuario?.id) {
      setClasses([])
      setClasseAtual(null)
      setNodesState([])
      setUnlockedState([])
      unlockedStateRef.current = []
      confirmedUnlockedRef.current = []
      unlockedScopeRef.current = null
      setCarregando(false)
      return
    }
    setCarregando(true)
    setErro(null)
    try {
      const lista = manterDetalheAnterior(
        await Classe.findAllByAluno(usuario.id, { withDetalhe: true }),
        classesRef.current
      )
      if (requestId !== classesRequestRef.current) return
      setClasses(lista)
      // O login exige escolha, inclusive com uma única matrícula. Um refresh
      // conserva a escolha, mas nunca escolhe outra turma se ela foi removida.
      // Turma sem detalhe não abre: volta para a escolha, onde aparece o aviso dela.
      const found = findSelectedClass(lista, classeAtualRef.current?.classe_id, usuario.id)
      const selected = found?.detalheErro ? null : found
      classeAtualRef.current = selected
      setClasseAtual(selected)
    } catch (e: any) {
      if (requestId === classesRequestRef.current) setErro(e)
    } finally {
      if (requestId === classesRequestRef.current) setCarregando(false)
    }
  }, [usuario?.id])

  useEffect(() => {
    void carregarClasses()
    // Ignora respostas de uma sessão encerrada ou de uma busca ultrapassada.
    return () => { classesRequestRef.current += 1 }
  }, [carregarClasses])

  const selecionarClasse = useCallback(
    (classeId: number) => {
      const selected = findSelectedClass(classes, classeId, usuario?.id)
      if (!selected || selected.detalheErro) return
      classeAtualRef.current = selected
      setClasseAtual(selected)
    },
    [classes, usuario?.id]
  )

  const recarregarTurma = useCallback(async (classeId: number) => {
    const requestId = classesRequestRef.current
    const turma = classesRef.current.find((c) => c.classe_id === classeId)
    if (!turma) return
    let patch: Partial<Classe>
    try {
      patch = { topicos: await Classe.loadDetalhado(turma.aluno_id, turma.classe_id), detalheErro: null }
    } catch (e: any) {
      console.warn(`[TrilhaContext] Detalhe da turma ${classeId} falhou de novo (${e?.code ?? 'sem código'}):`, e?.message)
      patch = { detalheErro: e instanceof Error ? e : new Error(String(e?.message ?? e)) }
    }
    // Um "Atualizar turmas" no meio do caminho já trouxe uma lista mais nova.
    if (requestId !== classesRequestRef.current) return
    setClasses((prev) => prev.map((c) => (c.classe_id === classeId ? cloneClasse(c, patch) : c)))
  }, [])

  // Esquece a turma escolhida: o `ClassSelectionGate` volta a mostrar a escolha, como no
  // login. Sem isto a única saída da tela de tópicos era encerrar a sessão.
  const trocarTurma = useCallback(() => {
    classeAtualRef.current = null
    setClasseAtual(null)
  }, [])

  const buildPayloadForTopico = useCallback(
    (
      record: Record<string, any>,
      topico: Topico,
      source: "cache" | "remote" | "fallback" = "remote"
    ) => {
      const presentationMode = inferModoApresentacao({
        alunoNome: usuario?.modoOperacao_nome ?? null,
        alunoDescricao: usuario?.modoOperacao_descricao ?? null,
        ordem: usuario?.modoOperacao_ordem,
        classeResumo: classeAtual?.resumo?.modoOperacao ?? null,
      })
      const recordContentId = Number(record?.conteudo_id ?? Number.NaN)
      const orderedTeacherContents = [...(topico.conteudos ?? [])].sort(
        (left: any, right: any) => {
          const leftOrder = Number(left?.ordem ?? Number.MAX_SAFE_INTEGER)
          const rightOrder = Number(right?.ordem ?? Number.MAX_SAFE_INTEGER)
          if (leftOrder !== rightOrder) return leftOrder - rightOrder
          return Number(left?.id ?? 0) - Number(right?.id ?? 0)
        }
      )
      const fallbackContents = Number.isFinite(recordContentId) && recordContentId > 0
        ? orderedTeacherContents.filter(
            (conteudo: any) => Number(conteudo?.id) === recordContentId
          )
        : orderedTeacherContents

      return normalizePersonalizedTopicPayload({
        record,
        classeId: classeAtual?.classe_id ?? topico.classe_id,
        topicoId: topico.id,
        fallbackBlocks: fallbackContents.flatMap((conteudo: any) =>
          buildContentBlocks(conteudo)
        ),
        fallbackActivities: topico.atividades ?? [],
        presentationMode,
        source,
      })
    },
    [
      classeAtual?.classe_id,
      classeAtual?.resumo?.modoOperacao,
      usuario?.modoOperacao_descricao,
      usuario?.modoOperacao_nome,
      usuario?.modoOperacao_ordem,
    ]
  )

  const maybeRequestMissingMediaForRecord = useCallback(
    (record: Record<string, any>, topico: Topico) => {
      if (!usuario?.id || !classeAtual || !personalizacaoProvider.hasApiConfigured()) return;
      // A API gera a mídia para o perfil dominante: registro de outro perfil da rota não pede.
      if (!podePedirMidiaDoRegistro(record, activeProfileKey)) return;

      // API só usa 'processando_midias' (em andamento) e 'pronto'/'partial'/'failed' (terminais)
      // para o status do registro — nunca 'pending'/'processing'.
      const status = String(record?.status ?? '').toLowerCase();
      if (status === 'processando_midias') return;

      const missingFormats = collectMissingRequestedMediaFormats(record);
      if (!missingFormats.length) return;

      const recordContentId = Number(record?.conteudo_id ?? Number.NaN);
      const focusedContentId =
        Number.isFinite(recordContentId) && recordContentId > 0
          ? recordContentId
          : topico?.conteudos?.length === 1
          ? Number(topico.conteudos[0]?.id ?? Number.NaN) || null
          : null;
      const retryKey = `${usuario.id}:${classeAtual.classe_id}:${activeProfileKey}:${topico.id}:${focusedContentId ?? "topico"}:${Number(record?.id ?? 0)}:${missingFormats.join(',')}`;
      const now = Date.now();
      const lastAttempt = mediaGenerationRetryRef.current.get(retryKey) ?? 0;
      if (now - lastAttempt < MEDIA_GENERATION_COOLDOWN_MS) return;
      mediaGenerationRetryRef.current.set(retryKey, now);

      void personalizacaoProvider.solicitarPersonalizacao({
        classe_id: classeAtual.classe_id,
        topico_id: topico.id,
        conteudo_id: focusedContentId,
        conteudo_foco_id: focusedContentId,
      })
        .then(() => {
          console.log(
            '[TrilhaContext] Retentativa de personalizacao disparada para midias faltantes:',
            { topicoId: topico.id, conteudoId: focusedContentId, missingFormats }
          );
        })
        .catch((err) => {
          // Falhas também respeitam o cooldown: remover a tentativa daqui
          // disparava novas requisições a cada hidratação com a API offline.
          console.warn(
            '[TrilhaContext] Falha ao disparar retentativa de personalizacao para midias faltantes:',
            err
          );
        });
    },
    [activeProfileKey, classeAtual, personalizacaoProvider, usuario?.id]
  );

  const hydratePersonalizedTopics = useCallback(async () => {
    if (!classeAtual || !usuario?.id || !misturaConfig) return
    const hydrationKey = `${usuario.id}:${classeAtual.classe_id}:${perfilDaRotaChave}`
    if (personalizationHydratedClassRef.current === hydrationKey) return
    personalizationHydratedClassRef.current = hydrationKey

    try {
      const expectedContentCount = classeAtual.topicos.reduce(
        (total, topico) => total + Math.max(1, topico.conteudos?.length ?? 0),
        0
      )
      // Uma consulta por turma, em paralelo com a personalização, para a ordem
      // aconselhada estar no mapa quando o payload chegar (ver `aplicarSugestoesMaterial`).
      const sugestoesPromise = lerSugestoesMaterial(usuario.id, classeAtual.classe_id)
      const limiteDaTurma = Math.max(20, expectedContentCount * 2)
      const response = misturaLigada
        ? await personalizacaoProvider.listarPersonalizacoesPersistidasPerfis({
            classeId: classeAtual.classe_id,
            brainhexProfileKeys: perfisDaMistura,
            limit: limiteDaTurma,
          })
        : await personalizacaoProvider.listarPersonalizacoesPersistidasPerfil({
            classeId: classeAtual.classe_id,
            brainhexProfileKey: activeProfileKey,
            limit: limiteDaTurma,
          })
      const iniciados = misturaLigada
        ? await lerConteudosIniciados(
            supabase,
            usuario.id,
            classeAtual.classe_id,
            registrosParaIniciados(response?.itens ?? []),
          )
        : new Map<number, BrainHexProfile>()
      const sugestoes = await sugestoesPromise
      if (personalizationScopeRef.current !== hydrationKey) return
      aplicarSugestoesMaterial(usuario.id, classeAtual.classe_id, sugestoes)

      const byTopico: Record<number, PersonalizedTopicPayload> = {}
      const topicosById = new Map(classeAtual.topicos.map((topico) => [topico.id, topico] as const))
      const recordsByTopico = new Map<number, Record<string, any>[]>()

      for (const item of response?.itens ?? []) {
        const topicoId = Number(item?.topico_id)
        if (!topicoId) continue
        const topico = topicosById.get(topicoId)
        if (!topico) continue
        const records = recordsByTopico.get(topicoId) ?? []
        records.push(item)
        recordsByTopico.set(topicoId, records)
      }

      const exposicoes: ExposicaoLinha[] = []
      for (const topico of classeAtual.topicos) {
        const daRota = misturaLigada
          ? resolverRegistrosDoTopico({
              registros: recordsByTopico.get(topico.id) ?? [],
              topico,
              alunoId: usuario.id,
              classeId: classeAtual.classe_id,
              perfilAtivo: activeProfileKey,
              perfis: perfisDoAlunoRef.current,
              config: misturaConfig,
              iniciados,
              perfilDoRegistro: perfilDoRegistroCarimbado,
            })
          : null
        if (daRota) exposicoes.push(...daRota.exposicoes)
        const records = orderPersonalizationRecordsByTeacherContent(
          daRota?.registros ?? recordsByTopico.get(topico.id) ?? [],
          topico.conteudos ?? []
        )
        if (!records.length) continue

        const payloads = records.map((item) => {
          maybeRequestMissingMediaForRecord(item, topico)
          return buildPayloadForTopico(item, topico, "remote")
        })
        const payload = aggregatePersonalizedTopicPayloads(payloads)
        if (!payload) continue

        personalizationAttemptedRef.current.add(`${usuario.id}:${classeAtual.classe_id}:${perfilDaRotaChave}:${topico.id}`)
        byTopico[topico.id] = payload
        void prefetchPersonalizedPayload(payload)
      }
      // Sem esperar: a exposição é registro para a análise, não condição para o material aparecer.
      if (exposicoes.length) void registrarExposicao(supabase, exposicoes)

      // Material recusado ou regerado (de volta a pendente) some da RLS; com a lista inteira em
      // mãos, o tópico que ficou sem registro sai da tela e do cache (20261110_09).
      const completa = misturaLigada
        ? respostaCompletaPorPerfil(response?.itens ?? [], limiteDaTurma)
        : respostaCompleta(response?.itens?.length ?? 0, limiteDaTurma)
      if (completa) {
        const comMaterial = new Set(Object.keys(byTopico).map(Number))
        setPersonalizedTopics((prev) =>
          semTopicosSemMaterial(
            { ...prev, ...byTopico },
            classeAtual.topicos.map((topico) => topico.id),
            comMaterial,
          )
        )
      } else if (Object.keys(byTopico).length) {
        setPersonalizedTopics((prev) => ({ ...prev, ...byTopico }))
      }
      if (completa || Object.keys(byTopico).length) {
        await persistPersonalizedTopicsCache(
          usuario.id,
          classeAtual.classe_id,
          perfilDaRotaChave,
          byTopico,
        )
      }
    } catch (err) {
      if (personalizationScopeRef.current === hydrationKey) personalizationHydratedClassRef.current = null
      avisarFalha("personalizacao/hidratar", '[TrilhaContext] Erro ao hidratar personalizacoes:', err)
    }
  }, [activeProfileKey, aplicarSugestoesMaterial, buildPayloadForTopico, classeAtual, lerSugestoesMaterial, maybeRequestMissingMediaForRecord, misturaConfig, misturaLigada, perfilDaRotaChave, perfisDaMistura, persistPersonalizedTopicsCache, personalizacaoProvider, usuario?.id])

  const ensureTopicoPersonalizado = useCallback(async (
    topicoId: number,
    options: EnsurePersonalizationOptions = {}
  ) => {
    const forceRefresh = options.forceRefresh === true
    if (!forceRefresh && personalizedTopics[topicoId]) return personalizedTopics[topicoId]
    if (!classeAtual || !usuario?.id) return null

    const topico = classeAtual.topicos.find((item) => item.id === topicoId)
    if (!topico) return null

    const key = `${usuario.id}:${classeAtual.classe_id}:${perfilDaRotaChave}:${topicoId}`
    const triggerCycleId = options.triggerCycleId ?? null
    if (
      forceRefresh &&
      triggerCycleId &&
      personalizationRefreshCycleRef.current.get(key) === triggerCycleId
    ) {
      return personalizedTopics[topicoId] ?? null
    }

    if (
      forceRefresh &&
      triggerCycleId &&
      personalizationAnalysisRefreshRef.current.has(key)
    ) {
      return personalizedTopics[topicoId] ?? null
    }

    if (!forceRefresh && personalizationAttemptedRef.current.has(key)) {
      return personalizedTopics[topicoId] ?? null
    }

    const requestKey = forceRefresh ? `${key}:refresh:${triggerCycleId ?? "manual"}` : key
    const existing = personalizationRequestsRef.current.get(requestKey)
    if (existing) return existing

    const request = (async () => {
      try {
        personalizationAttemptedRef.current.add(key)
        const sugestoesPromise = lerSugestoesMaterial(usuario.id, classeAtual.classe_id, topicoId)
        const limiteDoTopico = Math.max(10, (topico.conteudos?.length ?? 0) * 2)
        // Antes da chave chegar (`misturaConfig` nulo), lê como desligada: quando ela chega ligada,
        // o escopo muda e o resultado daqui é descartado pela checagem de escopo abaixo.
        const listResponse = misturaLigada
          ? await personalizacaoProvider.listarPersonalizacoesPersistidasPerfis({
              classeId: classeAtual.classe_id,
              topicoId,
              brainhexProfileKeys: perfisDaMistura,
              limit: limiteDoTopico,
            })
          : await personalizacaoProvider.listarPersonalizacoesPersistidasPerfil({
              classeId: classeAtual.classe_id,
              topicoId,
              brainhexProfileKey: activeProfileKey,
              limit: limiteDoTopico,
            })
        const itens = listResponse?.itens ?? []
        const daRota = misturaLigada && misturaConfig
          ? resolverRegistrosDoTopico({
              registros: itens,
              topico,
              alunoId: usuario.id,
              classeId: classeAtual.classe_id,
              perfilAtivo: activeProfileKey,
              perfis: perfisDoAlunoRef.current,
              config: misturaConfig,
              iniciados: await lerConteudosIniciados(
                supabase,
                usuario.id,
                classeAtual.classe_id,
                registrosParaIniciados(itens),
              ),
              perfilDoRegistro: perfilDoRegistroCarimbado,
            })
          : null
        const sugestoes = await sugestoesPromise
        if (personalizationScopeRef.current !== personalizationScope) return null
        aplicarSugestoesMaterial(usuario.id, classeAtual.classe_id, sugestoes)
        if (daRota?.exposicoes.length) void registrarExposicao(supabase, daRota.exposicoes)

        const records = orderPersonalizationRecordsByTeacherContent(
          daRota?.registros ?? itens,
          topico.conteudos ?? []
        )
        if (!records.length) {
          // Nada aprovado para este tópico (20261110_09): o que estava na tela sai, e o aluno
          // segue pelo material do professor.
          setPersonalizedTopics((prev) => semTopicosSemMaterial(prev, [topicoId], new Set()))
          return null
        }

        const payloads = records.map((record) => {
          maybeRequestMissingMediaForRecord(record, topico)
          return buildPayloadForTopico(
            record,
            topico,
            forceRefresh ? "remote" : "cache"
          )
        })
        const payload = aggregatePersonalizedTopicPayloads(payloads)
        if (!payload) return null

        setPersonalizedTopics((prev) => ({ ...prev, [topicoId]: payload }))
        await persistPersonalizedTopicsCache(usuario.id, classeAtual.classe_id, perfilDaRotaChave, {
          [topicoId]: payload,
        })
        void prefetchPersonalizedPayload(payload)
        if (forceRefresh && triggerCycleId) {
          personalizationRefreshCycleRef.current.set(key, triggerCycleId)
          personalizationAnalysisRefreshRef.current.add(key)
        }
        return payload
      } catch (err) {
        personalizationAttemptedRef.current.delete(key)
        avisarFalha("personalizacao/garantir", '[TrilhaContext] Erro ao garantir personalizacao:', err)
        try {
          const jobs = await personalizacaoProvider.listarJobsPersistidosAluno({
            alunoId: usuario.id,
            classeId: classeAtual.classe_id,
            limit: 10,
          })
          const pendingForTopico = jobs.find((job: any) => {
            if (job?.topico_id != null && Number(job.topico_id) !== topicoId) return false
            return ['pending', 'processing', 'partial'].includes(String(job?.status ?? '').toLowerCase())
          })
          if (pendingForTopico) {
            console.log('[TrilhaContext] Personalizacao ainda em processamento para o topico:', topicoId)
          }
        } catch {}
        return null
      } finally {
        personalizationRequestsRef.current.delete(requestKey)
      }
    })()

    personalizationRequestsRef.current.set(requestKey, request)
    return request
  }, [
    aplicarSugestoesMaterial,
    buildPayloadForTopico,
    classeAtual,
    activeProfileKey,
    lerSugestoesMaterial,
    maybeRequestMissingMediaForRecord,
    misturaConfig,
    misturaLigada,
    perfilDaRotaChave,
    perfisDaMistura,
    persistPersonalizedTopicsCache,
    personalizedTopics,
    personalizationScope,
    personalizacaoProvider,
    usuario?.id,
  ])

  const getNodePersonalizationHint = useCallback((topicoId: number) => {
    return personalizedTopics[topicoId]?.nodeHint ?? null
  }, [personalizedTopics])

  const fetchGraphData = useCallback(async () => {
    let classeAtual = classeAtualRef.current
    let personalizedTopics = personalizedTopicsRef.current
    const requestedScope = personalizationScopeRef.current
    if (!classeAtual) return
    setCarregando(true)
    setErro(null)
    try {
      const userId = usuario?.id
      if (!userId) {
        console.warn('[TrilhaContext] Sessao ainda nao hidratada para buscar grafo, usando fallback local.')
        const { nodes, unlocked } = buildGraphFromTopicos(
          classeAtual,
          topicosPendentesPersonalizadosRef.current,
        )
        setNodesState(decorateNodesWithPersonalization(nodes, classeAtual.topicos, personalizedTopics))
        showLocalUnlockedIds(unlocked)
        setRemoteMapThemeState(null)
        return
      }

      console.log('[TrilhaContext] Chamando personalize_path com:', {
        userId,
        classeId: classeAtual.classe_id,
        perfil,
        visual
      })

      let data: any = null
      try {
        const edgeResult = await supabase.functions.invoke('personalize_path', {
          body: {
            userId,
            classeId: classeAtual.classe_id,
            perfil,
            visual,
          },
        })
        data = edgeResult.data ?? null
        if (edgeResult.error) {
          avisarFalha("trilha/grafo-edge", '[TrilhaContext] Erro na Edge Function personalize_path:', edgeResult.error)
        }
      } catch (edgeError) {
        avisarFalha("trilha/grafo-edge-chamada", '[TrilhaContext] Falha ao invocar Edge personalize_path:', edgeError)
      }

      const { data: dbThemeRaw, error: dbThemeError } = await supabase
        .from('classe_mapa_tema')
        .select('world_name, world_subtitle, world_description, template_id, palette, countries')
        .eq('classe_id', classeAtual.classe_id)
        .maybeSingle()

      if (dbThemeError) {
        avisarFalha("trilha/tema", '[TrilhaContext] Falha ao carregar classe_mapa_tema:', dbThemeError)
      }

      const latestClasse = classeAtualRef.current
      if (!latestClasse || requestedScope !== personalizationScopeRef.current) return
      // Theme/layout requests can finish after a completed activity refreshed
      // progress. Never restore the older lock state captured before the await.
      classeAtual = latestClasse
      personalizedTopics = personalizedTopicsRef.current

      const dbMapTheme =
        dbThemeRaw
          ? {
              world_name: dbThemeRaw.world_name,
              world_subtitle: dbThemeRaw.world_subtitle,
              world_description: dbThemeRaw.world_description,
              template_id: dbThemeRaw.template_id,
              palette: dbThemeRaw.palette,
              countries: dbThemeRaw.countries,
              class_label: classeAtual.resumo?.materia_nome ?? `Classe ${classeAtual.classe_id}`,
              source: 'db',
            }
          : null

      const incoming = Array.isArray(data?.nodes) ? (data.nodes as any[]) : []
      const incomingMapTheme =
        (data?.mapTheme as Record<string, unknown> | null | undefined) ??
        (data?.map_theme as Record<string, unknown> | null | undefined) ??
        (data?.world as Record<string, unknown> | null | undefined) ??
        (dbMapTheme as Record<string, unknown> | null | undefined) ??
        null

      if (incoming.length) {
        console.log('[TrilhaContext] Grafo da Edge Function:', incoming.length, 'nós')
        
        const mapped: NodeItem[] = incoming.map((n: any, i: number) => ({
          id: String(n.id),
          titulo: String(n.title ?? n.titulo ?? `Nó ${i + 1}`),
          next: [],
          locked: normalizeRemoteTopicLocked(n.locked, n.unlocked, n.status),
          completed: !!n.completed,
          sequence: i + 1,
          x: typeof n.x === 'number' ? n.x : undefined,
          y: typeof n.y === 'number' ? n.y : undefined,
          tipo: n.type ?? n.tipo,
        }))

        const by = new Map(mapped.map((n) => [n.id, n] as const))
        for (const e of (data.edges as any[]) ?? []) {
          const from = String(e.from)
          const to = String(e.to)
          const f = by.get(from)
          if (f) f.next = [...(f.next ?? []), to]
        }

        const nodesWithProgress = reconcileNodesWithClasse(
          mapped,
          classeAtual,
          topicosPendentesPersonalizadosRef.current,
        )
        setNodesState(decorateNodesWithPersonalization(nodesWithProgress, classeAtual.topicos, personalizedTopics))
        rememberUnlockedIds(nodesWithProgress.filter((n) => n.locked === false).map((n) => n.id))
        setRemoteMapThemeState(incomingMapTheme)
      } else {
        console.log('[TrilhaContext] Usando fallback (buildGraphFromTopicos)')
        const { nodes, unlocked } = buildGraphFromTopicos(
          classeAtual,
          topicosPendentesPersonalizadosRef.current,
        )
        setNodesState(decorateNodesWithPersonalization(nodes, classeAtual.topicos, personalizedTopics))
        showLocalUnlockedIds(unlocked)
        setRemoteMapThemeState(incomingMapTheme)
      }
    } catch (e: any) {
      const latestClasse = classeAtualRef.current
      if (!latestClasse || requestedScope !== personalizationScopeRef.current) return
      classeAtual = latestClasse
      personalizedTopics = personalizedTopicsRef.current
      avisarFalha("trilha/grafo", '[TrilhaContext] Erro ao buscar grafo, usando fallback:', e)
      const { nodes, unlocked } = buildGraphFromTopicos(
        classeAtual!,
        topicosPendentesPersonalizadosRef.current,
      )
      setNodesState(decorateNodesWithPersonalization(nodes, classeAtual.topicos, personalizedTopics))
      showLocalUnlockedIds(unlocked)
      setRemoteMapThemeState(null)
      setErro(e)
    } finally {
      if (requestedScope === personalizationScopeRef.current) setCarregando(false)
    }
    // Depende só de classe_id/perfil/usuario/visual (nao do objeto classeAtual nem de
    // personalizedTopics inteiros): esses sao lidos via ref dentro da funcao para nao recriar
    // fetchGraphData - e retrigger o fetch - a cada progresso local salvo (ver classeAtualRef acima).
  }, [perfil, rememberUnlockedIds, showLocalUnlockedIds, usuario?.id, visual])

  useEffect(() => {
    fetchGraphData()
  }, [fetchGraphData])

  useEffect(() => {
    hydratePersonalizedTopics()
  }, [hydratePersonalizedTopics])

  useEffect(() => {
    if (!classeAtual || !usuario?.id) return undefined

    const channel = personalizacaoProvider.subscribePersonalizacoesPersistidasClasse({
      classeId: classeAtual.classe_id,
      alunoId: usuario.id,
      onChange: () => {
        personalizationHydratedClassRef.current = null
        void hydratePersonalizedTopics()
      },
    })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [activeProfileKey, classeAtual, hydratePersonalizedTopics, personalizacaoProvider, usuario?.id])

  const mapTheme = useMemo(() => {
    if (!classeAtual) return null

    const baseNodes = nodesState.length ? nodesState : buildGraphFromTopicos(classeAtual, topicosPendentesPersonalizados).nodes
    return (
      normalizeRemoteMapTheme(remoteMapThemeState, classeAtual, baseNodes) ??
      buildClassMapTheme(classeAtual, baseNodes)
    )
  }, [classeAtual, nodesState, remoteMapThemeState, topicosPendentesPersonalizados])

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    ;(async () => {
      const userId = usuario?.id
      const classeAtual = classeAtualRef.current
      if (!userId || !classeAtual) return

      const refreshCanonicalGraph = () => {
        if (rtDebounceRef.current) clearTimeout(rtDebounceRef.current)
        rtDebounceRef.current = setTimeout(() => {
          void (async () => {
            try {
              const [topicos, resumo] = await Promise.all([
                Classe.loadDetalhado(userId, classeAtual.classe_id),
                cloneClasse(classeAtual).refreshResumo(),
              ])
              const current = classeAtualRef.current
              if (!current || personalizationScopeRef.current !== personalizationScope) return
              syncClasseLocally(cloneClasse(current, {
                topicos: topicos.map((topico) => mergeTopicoLocalState(
                  topico, current.topicos.find((item) => item.id === topico.id) ?? null,
                )),
                resumo: resumo ?? current.resumo,
              }))
            } catch (error) {
              avisarFalha("sync/progresso-remoto", '[TrilhaContext] Falha ao sincronizar progresso remoto:', error)
            }
          })()
        }, 500)
      }

      channel = supabase
        .channel('rt_trilha')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'conteudo_aluno', filter: `aluno_id=eq.${userId}` },
          refreshCanonicalGraph
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'atividade_aluno', filter: `aluno_id=eq.${userId}` },
          refreshCanonicalGraph
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'topico_aluno', filter: `aluno_id=eq.${userId}` },
          refreshCanonicalGraph
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'classe_mapa_tema', filter: `classe_id=eq.${classeAtual.classe_id}` },
          () => fetchGraphData()
        )
        .subscribe()
    })()

    return () => {
      if (rtDebounceRef.current) clearTimeout(rtDebounceRef.current)
      if (channel) supabase.removeChannel(channel)
    }
    // classe_id (nao o objeto classeAtual) evita recriar o canal realtime a cada progresso
    // local salvo - so precisa reabrir quando a classe/usuario realmente mudam.
  }, [classeAtual?.classe_id, fetchGraphData, personalizationScope, syncClasseLocally, usuario?.id])

  useEffect(() => {
    const classeId = classeAtual?.classe_id
    const alunoId = usuario?.id
    setSlideBonusKeys(new Set())
    if (!classeId || !alunoId) {
      setProgressoItens([])
      return
    }
    let cancelado = false
    let hidratados: LinhaProgressoItem[] = []
    ;(async () => {
      // Hidrata do cache primeiro: mantém o último progresso conhecido
      // visível de imediato, inclusive offline, em vez de zerar a tela até a
      // rede responder (ou de nunca voltar a mostrar nada, se ela não vier).
      try {
        const raw = await AsyncStorage.getItem(
          buildProgressoItensCacheKey(alunoId, classeId, perfilDaRotaChave)
        )
        if (cancelado) return
        const parsed = raw ? JSON.parse(raw) : []
        hidratados = Array.isArray(parsed) ? parsed : []
        setProgressoItens(hidratados)
      } catch (err) {
        console.warn('[TrilhaContext] Erro ao carregar cache local de progresso personalizado:', err)
      }

      // A rede espera a chave da mistura (o cache acima, não): ligada, o progresso é o dos
      // registros de todos os perfis da rota. Quando ela chega, este efeito roda de novo.
      if (!misturaConfig) return

      // A jornada pode usar material-base compartilhado e gerações parciais
      // com arquivos utilizáveis, assim como a projeção canônica do banco.
      const consultaAtivas = supabase
        .from('conteudo_personalizado')
        .select('id')
        .or(`aluno_id.eq.${alunoId},aluno_id.is.null`)
        .eq('classe_id', classeId)
      const { data: personalizacoesAtivas, error: personalizacoesError } = misturaLigada
        ? await consultaAtivas.in('brainhex_profile_key', perfisDaMistura)
        : await consultaAtivas.eq('brainhex_profile_key', activeProfileKey)

      if (cancelado) return
      if (personalizacoesError) {
        // Sem rede: o que veio do cache continua valendo, não zera.
        avisarFalha("personalizacao/ativa", '[TrilhaContext] Falha ao buscar personalizacao ativa:', personalizacoesError)
        return
      }

      const personalizacaoIds = (personalizacoesAtivas ?? [])
        .map((row) => Number(row.id))
        .filter((id) => Number.isInteger(id) && id > 0)

      if (!personalizacaoIds.length) {
        // Resposta autoritativa do servidor (não uma falha de rede): não há
        // personalização para esta classe/perfil, então o cache antigo (de
        // uma classe/perfil anterior) realmente não vale mais.
        setProgressoItens([])
        setSlideBonusKeys(new Set())
        await persistProgressoItensCache(alunoId, classeId, perfilDaRotaChave, [])
        return
      }

      const { data, error } = await supabase
        .from('personalizacao_item_progresso')
        .select(
          'personalizacao_id, topico_id, item_key, item_kind, status, percentual_concluido, acertos_percentual, tempo_gasto_min'
        )
        .eq('aluno_id', alunoId)
        .eq('classe_id', classeId)
        .in('personalizacao_id', personalizacaoIds)

      if (cancelado) return
      if (error) {
        // Idem: sem rede, o progresso hidratado do cache continua valendo.
        avisarFalha("personalizacao/progresso", '[TrilhaContext] Falha ao buscar progresso personalizado:', error)
        return
      }

      const remoto = (data ?? []) as LinhaProgressoItem[]
      // Nunca regride: se uma escrita otimista local ainda não chegou ao
      // servidor (fila de reenvio em progressoOutbox), a leitura fresca não
      // pode apagá-la.
      const linhas = mesclarLinhasProgresso(hidratados, remoto)
      setProgressoItens(linhas)
      await persistProgressoItensCache(alunoId, classeId, perfilDaRotaChave, linhas)

      const keys = new Set<string>()
      for (const row of linhas) {
        if (!isSlideItemKey(String(row.item_key ?? ''))) continue
        keys.add(buildSlideBonusDedupeKey(Number(row.topico_id), String(row.item_key)))
      }
      setSlideBonusKeys(keys)
    })()

    return () => {
      cancelado = true
    }
  }, [activeProfileKey, classeAtual?.classe_id, misturaConfig, misturaLigada, perfilDaRotaChave, perfisDaMistura, persistProgressoItensCache, usuario?.id])

  // O caso que a fila existe para cobrir: o app foi morto ou perdeu rede com
  // progresso pendente. A tentativa acontece na abertura seguinte, antes de
  // qualquer gravação nova.
  useEffect(() => {
    void drenarProgressoOutbox((p) => personalizacaoProvider.salvarProgressoPersonalizadoDiretoSupabase(p))
      .catch(() => undefined)
  }, [])

  // A conclusão personalizada é salva em uma tabela separada da projeção da
  // trilha. Recalcular a lista de pendências precisa refletir no grafo atual;
  // esperar um novo carregamento da classe deixava o próximo tópico travado
  // até sair e entrar na tela.
  useEffect(() => {
    const classe = classeAtualRef.current
    if (!classe || !nodesState.length) return

    const nodesWithProgress = reconcileNodesWithClasse(
      nodesState,
      classe,
      topicosPendentesPersonalizados,
    )
    const nextNodes = decorateNodesWithPersonalization(
      nodesWithProgress,
      classe.topicos,
      personalizedTopics,
    )
    const changed = nextNodes.some((node, index) => {
      const previous = nodesState[index]
      return (
        !previous ||
        previous.id !== node.id ||
        previous.locked !== node.locked ||
        previous.completed !== node.completed
      )
    })
    if (changed) setNodesState(nextNodes)
    showLocalUnlockedIds(nodesWithProgress.filter((node) => node.locked === false).map((node) => node.id))
  }, [nodesState, personalizedTopics, showLocalUnlockedIds, topicosPendentesPersonalizados])

  const trilhaSlideBonusPercent = useMemo(
    () => computeSlideBonusPercent(slideBonusKeys),
    [slideBonusKeys]
  )

  // Segundo livro-caixa do progresso, agregado uma vez e compartilhado: as telas
  // de métrica liam só o material do professor. Ver progressoPersonalizado.ts.
  const progressoPersonalizado = useMemo(
    () => agregarProgressoPersonalizado(progressoItens),
    [progressoItens]
  )


  const { width: winW } = useWindowDimensions()
  const grafo = useGraphLayout(nodesState, {
    width: Math.max(360, (winW || 0) - 48),
    levelGap: winW < 420 ? 240 : 200,
    nodeGap:  winW < 420 ? 36  : 24,
    nodeWidth: 140,
    nodeHeight: 120,
    unlockedIds: unlockedState,
  })

  const mostrarRespostaCorretaDefault = useMemo(() => {
    const raw =
      classeAtual?.resumo?.modoOperacao ??
      usuario?.modoOperacao_nome ??
      usuario?.modoOperacao_descricao ??
      ''
    const norm = String(raw ?? '').toLowerCase()
    if (norm.includes('sem gabarito') || norm.includes('ocultar resposta')) return false
    return true
  }, [classeAtual?.resumo?.modoOperacao, usuario?.modoOperacao_nome, usuario?.modoOperacao_descricao])

  const deveMostrarGabaritoAoErrar = useCallback(
    (atividade?: any, questao?: any) => {
      const questaoFlag = questao?.mostrar_gabarito_ao_errar
      if (questaoFlag === true || questaoFlag === false) return !!questaoFlag

      const atividadeFlag = atividade?.mostrar_gabarito_ao_errar
      if (atividadeFlag === true || atividadeFlag === false) return !!atividadeFlag

      return mostrarRespostaCorretaDefault
    },
    [mostrarRespostaCorretaDefault]
  )

  const reload = useCallback(async () => {
    await carregarClasses()
    await fetchGraphData()
  }, [carregarClasses, fetchGraphData])

  const refreshTopico = useCallback(async (topicoId: number) => {
    const requestedClasse = classeAtualRef.current;
    if (!requestedClasse) return;

    try {
      console.log('[TrilhaContext] Atualizando tópico:', topicoId);

      const topicoAtualizado = await Classe.loadDetalhado(
        requestedClasse.aluno_id,
        requestedClasse.classe_id
      );

      const currentClasse = classeAtualRef.current;
      if (!currentClasse || currentClasse.classe_id !== requestedClasse.classe_id ||
          currentClasse.aluno_id !== requestedClasse.aluno_id) return;
      const topicoLocal = currentClasse.topicos.find((t) => t.id === topicoId) ?? null
      const novoTopicoPersistido = topicoAtualizado.find((t: Topico) => t.id === topicoId);
      const novoTopico = novoTopicoPersistido
        ? mergeTopicoLocalState(novoTopicoPersistido, topicoLocal)
        : null
      if (!novoTopico) {
        console.warn('[TrilhaContext] Tópico não encontrado após reload:', topicoId);
        return;
      }

      const topicosAtualizados = currentClasse.topicos.map((t) => t.id === topicoId ? novoTopico : t)
      syncClasseLocally(cloneClasse(currentClasse, { topicos: topicosAtualizados }));

      console.log('[TrilhaContext] Tópico atualizado com sucesso');
    } catch (err) {
      avisarFalha("topico/atualizar", '[TrilhaContext] Erro ao atualizar tópico:', err);
    }
  }, [syncClasseLocally]);

  const atualizarProgressoClasse = useCallback(async () => {
    const requestedClasse = classeAtualRef.current;
    if (!requestedClasse) return;
    try {
      // `classe_aluno` é calculada por trigger/function no banco. Depois de
      // persistir o item-fonte, apenas recarregamos a projeção canônica; uma
      // conta local não conhece a jornada personalizada nem seus pesos.
      const resumoCanonico = await cloneClasse(requestedClasse).refreshResumo()
      if (!resumoCanonico) return

      // Uma resposta tardia do resumo não pode restaurar tópicos do render
      // anterior e desfazer o refresh que acabou de liberar o próximo módulo.
      const currentClasse = classeAtualRef.current;
      if (!currentClasse || currentClasse.classe_id !== requestedClasse.classe_id ||
          currentClasse.aluno_id !== requestedClasse.aluno_id) return;
      syncClasseLocally(cloneClasse(currentClasse, {
        topicos: [...currentClasse.topicos],
        resumo: resumoCanonico,
      }))
    } catch (err) {
      avisarFalha("classe/progresso", '[TrilhaContext] Erro ao atualizar progresso da classe:', err);
    }
  }, [syncClasseLocally]);

  // ✅ NOVOS MÉTODOS usando Models

  useEffect(() => {
    if (!usuario?.id || !classeAtual?.classe_id) return;
    const alunoId = usuario.id;
    const classeId = classeAtual.classe_id;
    let active = true;
    void (async () => {
      for (const payload of Object.values(personalizedTopics)) {
        if (!active || payload.classeId !== classeId) continue;
        const rows = buildPersonalizedProgressSeed(alunoId, payload);
        if (!rows.length) continue;
        const seedKey = `percurso-v1:${alunoId}:${classeId}:${activeProfileKey}:${JSON.stringify(rows.map((row) => [row.personalizacao_id, row.item_key]))}`;
        if (progressSeedRef.current.has(seedKey)) continue;
        progressSeedRef.current.add(seedKey);
        try {
          await seedPersonalizedProgress(supabase, rows);
          // A new render may cancel this effect while the write is running.
          // Do not lose the canonical refresh of an already-completed write.
          if (personalizationScopeRef.current !== personalizationScope) return;
          await refreshTopico(payload.topicoId);
          await atualizarProgressoClasse();
        } catch (error) {
          progressSeedRef.current.delete(seedKey);
          avisarFalha("percurso/passos", '[TrilhaContext] Falha ao registrar passos do percurso:', error);
        }
      }
    })();
    return () => { active = false; };
  }, [activeProfileKey, atualizarProgressoClasse, classeAtual?.classe_id, personalizationScope, personalizedTopics, refreshTopico, usuario?.id]);

  const marcarTopicoIniciado = useCallback(async (topicoId: number) => {
    if (!classeAtual || !usuario) return;

    try {
      const topico = classeAtual.topicos.find(t => t.id === topicoId);
      if (!topico) throw new Error('Tópico não encontrado');

      await topico.marcarIniciado(usuario.id);
      syncClasseLocally(cloneClasse(classeAtual, { topicos: [...classeAtual.topicos] }));
      await refreshTopico(topicoId);
    } catch (err) {
      avisarFalha("topico/iniciado", '[TrilhaContext] Erro ao marcar tópico iniciado:', err);
      throw err;
    }
  }, [classeAtual, usuario, refreshTopico, syncClasseLocally]);

  const marcarTopicoConcluido = useCallback(async (topicoId: number) => {
    if (!classeAtual || !usuario) return;

    try {
      const topico = classeAtual.topicos.find(t => t.id === topicoId);
      if (!topico) throw new Error('Tópico não encontrado');

      await topico.marcarConcluido(usuario.id);
      // A conclusão efetiva vem do recálculo do banco. Não otimista status nem
      // percentual aqui, pois isso pode liberar o próximo tópico com passos
      // personalizados ainda pendentes.
      await refreshTopico(topicoId);
      await atualizarProgressoClasse();
      const atualizado = classeAtualRef.current?.topicos.find((item) => item.id === topicoId);
      if (progressoCanonicoTopico(atualizado) !== 100) {
        throw new Error('Ainda existem etapas sem conclusão confirmada no Supabase. Revise as atividades pendentes e tente novamente.');
      }
    } catch (err) {
      avisarFalha("topico/concluido", '[TrilhaContext] Erro ao marcar tópico concluído:', err);
      throw err;
    }
  }, [classeAtual, usuario, atualizarProgressoClasse, refreshTopico]);

  const marcarConteudoVisto = useCallback(async (topicoId: number, conteudoId: number) => {
    if (!classeAtual || !usuario) return;
    try {
      const topico = classeAtual.topicos.find(t => t.id === topicoId);
      if (!topico) throw new Error('Tópico não encontrado');
      const conteudo = topico.conteudos.find(c => c.id === conteudoId);
      if (!conteudo) throw new Error('Conteúdo não encontrado');

      // Atualiza estado local imediatamente (antes do upsert)
      conteudo.status = 'concluido';
      conteudo.percentual_concluido = 100;
      // Sem palpite otimista do percentual: `calcularPercentual` so conhece o
      // material do professor, e mostrar o numero dele aqui faria a barra
      // pular para um valor errado por meio segundo ate o `refreshTopico`
      // abaixo trazer o que o banco calculou sobre o percurso inteiro. Manter
      // o valor anterior por um instante e menos pior que mostrar o errado.
      syncClasseLocally(cloneClasse(classeAtual, { topicos: [...classeAtual.topicos] }));

      // Persiste no banco
      await conteudo.marcarVisto(usuario.id);
      await topico.atualizarProgresso(usuario.id);
      await atualizarProgressoClasse();

      // Sincronização remota com delay para evitar race com índice do Supabase
      setTimeout(() => void refreshTopico(topicoId), 500);
    } catch (err) {
      avisarFalha("conteudo/visto", '[TrilhaContext] Erro ao marcar conteúdo visto:', err);
      throw err;
    }
  }, [classeAtual, usuario, atualizarProgressoClasse, refreshTopico, syncClasseLocally]);

  const registrarAtividadeConcluida = useCallback(async (
    topicoId: number,
    atividadeId: number,
    acertosPercentual: number,
    options?: {
      pontuacaoObtida?: number | null
      pontuacaoMaxima?: number | null
      avaliacaoMetadata?: Record<string, unknown> | null
    }
  ) => {
    if (!classeAtual || !usuario) return;
    try {
      const topico = classeAtual.topicos.find(t => t.id === topicoId);
      if (!topico) throw new Error('Tópico não encontrado');
      const atividade = topico.atividades.find(a => a.id === atividadeId);
      if (!atividade) throw new Error('Atividade não encontrada');

      // Only mark the activity locally after Supabase confirms the write.
      // Otherwise a retry is mistaken for a review and never saves completion.
      await atividade.registrarConclusao(
        usuario.id,
        acertosPercentual,
        undefined,
        options?.pontuacaoObtida ?? null,
        options?.pontuacaoMaxima ?? null,
        options?.avaliacaoMetadata ?? null
      );
      await topico.atualizarProgresso(usuario.id);
      await atualizarProgressoClasse();
      await refreshTopico(topicoId);
    } catch (err) {
      avisarFalha("atividade/registrar", '[TrilhaContext] Erro ao registrar atividade:', err);
      throw err;
    }
  }, [classeAtual, usuario, atualizarProgressoClasse, refreshTopico]);

  const registrarTempoConteudo = useCallback(async (
    topicoId: number,
    conteudoId: number,
    tempoGastoMin: number
  ) => {
    if (!classeAtual || !usuario) return

    const tempoNormalizado = Math.max(0, Number(tempoGastoMin ?? 0))
    if (!Number.isFinite(tempoNormalizado) || tempoNormalizado <= 0) return

    try {
      const topico = classeAtual.topicos.find((t) => t.id === topicoId)
      if (!topico) throw new Error('Tópico não encontrado')

      const conteudo = topico.conteudos.find((c) => c.id === conteudoId)
      if (!conteudo) throw new Error('Conteúdo não encontrado')

      // O tempo em si nao e mais gravado aqui: vem da telemetria, por
      // trigger (`20260826_19`). Este acumulo era leitura-soma-escrita sobre
      // uma base que podia estar velha, e a escrita que falhava so virava
      // `console.warn` -- o intervalo se perdia para sempre.
      await conteudo.registrarVisita(usuario.id)
      await atualizarProgressoClasse()
    } catch (err) {
      avisarFalha("tempo/conteudo", '[TrilhaContext] Erro ao registrar tempo do conteúdo:', err)
    }
  }, [classeAtual, usuario, atualizarProgressoClasse])

  const registrarTempoAtividade = useCallback(async (
    topicoId: number,
    atividadeId: number,
    tempoGastoMin: number
  ) => {
    if (!classeAtual || !usuario) return

    const tempoNormalizado = Math.max(0, Number(tempoGastoMin ?? 0))
    if (!Number.isFinite(tempoNormalizado) || tempoNormalizado <= 0) return

    try {
      const topico = classeAtual.topicos.find((t) => t.id === topicoId)
      if (!topico) throw new Error('Tópico não encontrado')

      const atividade = topico.atividades.find((a) => a.id === atividadeId)
      if (!atividade) throw new Error('Atividade não encontrada')

      // Idem conteudo: o tempo vem da telemetria. E este caminho ainda
      // zerava `acertos_percentual` de quebra.
      await atividade.registrarVisita(usuario.id)
      await atualizarProgressoClasse()
    } catch (err) {
      avisarFalha("tempo/atividade", '[TrilhaContext] Erro ao registrar tempo da atividade:', err)
    }
  }, [classeAtual, usuario, atualizarProgressoClasse])

  const registrarTempoTopico = useCallback(async (
    topicoId: number,
    tempoGastoMin: number
  ) => {
    if (!classeAtual || !usuario) return

    // O tempo nao e gravado daqui (e derivado no banco), mas continua sendo a
    // CONDICAO: sem tempo decorrido nao houve visita a registrar.
    if (!houveVisita(tempoGastoMin)) return

    try {
      const topico = classeAtual.topicos.find((t) => t.id === topicoId)
      if (!topico) throw new Error('Topico nao encontrado')

      // O payload mora em `visitaDoTopico.ts` para poder ser testado: o que
      // NAO pode estar nele (`status`, `percentual_concluido`,
      // `tempo_gasto_min`) e a regra que ja foi quebrada por quatro
      // gravadores diferentes.
      const { error } = await supabase
        .from('topico_aluno')
        .upsert(
          payloadDeVisitaDoTopico({
            alunoId: usuario.id,
            topicoId,
            ultimaAtividade: topico.ultima_atividade ?? null,
          }),
          {
            onConflict: 'aluno_id,topico_id',
          }
        )

      if (error) throw error
      await refreshTopico(topicoId)
      await atualizarProgressoClasse()
    } catch (err) {
      avisarFalha("tempo/topico", '[TrilhaContext] Erro ao registrar tempo do topico:', err)
    }
  }, [atualizarProgressoClasse, classeAtual, refreshTopico, usuario])

  const registrarSessaoConteudo = useCallback(async (
    topicoId: number,
    conteudoId: number,
    startedAtMs: number,
    endedAtMs: number
  ) => {
    if (!usuario?.id) return
    await saveStudySession(supabase, {
      alunoId: usuario.id, scope: 'content', topicoId, conteudoId, atividadeId: null, startedAtMs, endedAtMs,
    })
  }, [usuario])

  const registrarSessaoAtividade = useCallback(async (
    topicoId: number,
    atividadeId: number,
    startedAtMs: number,
    endedAtMs: number
  ) => {
    if (!usuario?.id) return
    await saveStudySession(supabase, {
      alunoId: usuario.id, scope: 'activity', topicoId, conteudoId: null, atividadeId, startedAtMs, endedAtMs,
    })
  }, [usuario])

  const registrarSessaoTopico = useCallback(async (
    topicoId: number,
    startedAtMs: number,
    endedAtMs: number
  ) => {
    if (!usuario?.id) return
    await saveStudySession(supabase, {
      alunoId: usuario.id, scope: 'topic', topicoId, conteudoId: null, atividadeId: null, startedAtMs, endedAtMs,
    })
  }, [usuario])

  const salvarProgressoItemPersonalizado = useCallback(async ({
    topicoId,
    itemKey,
    itemKind,
    itemTitle,
    status,
    percentualConcluido,
    acertosPercentual,
    tempoGastoMin,
    pontuacaoObtida,
    pontuacaoMaxima,
    metadata,
  }: {
    topicoId: number
    itemKey: string
    itemKind: "content" | "activity" | "cards"
    itemTitle: string
    status: "nao_iniciado" | "em_andamento" | "concluido"
    percentualConcluido: number
    acertosPercentual?: number | null
    tempoGastoMin?: number | null
    pontuacaoObtida?: number | null
    pontuacaoMaxima?: number | null
    metadata?: Record<string, unknown> | null
  }) => {
    if (!classeAtual || !usuario?.id) return

    const payload = personalizedTopics[topicoId]
    const matchingStep = payload?.steps?.find((step) => {
      if (String(step.item_key ?? "").trim() === String(itemKey).trim()) return true
      return (
        step.activity?.personalizationKey != null &&
        String(step.activity.personalizationKey).trim() === String(itemKey).trim()
      )
    })
    const stepMetadata =
      matchingStep?.metadata && typeof matchingStep.metadata === "object"
        ? (matchingStep.metadata as Record<string, unknown>)
        : {}
    const keyContentId = String(itemKey).startsWith("content:")
      ? Number(String(itemKey).split(":")[1])
      : Number.NaN
    const conteudoId = Number(
      stepMetadata.conteudo_id ??
        stepMetadata.contentId ??
        (Number.isFinite(keyContentId) ? keyContentId : Number.NaN)
    )
    const personalizacaoId = Number(
      stepMetadata.personalizacao_id ??
        stepMetadata.personalizationId ??
        payload?.planMeta?.recordId ??
        0
    )
    if (!payload || !personalizacaoId) return
    const progressItemKey = buildContentScopedPersonalizationItemKey({
      itemKey,
      conteudoId: Number.isFinite(conteudoId) && conteudoId > 0 ? conteudoId : null,
      personalizacaoId,
    })

    const percentualNormalizado = clampPercent(percentualConcluido ?? 0)
    const acertosNormalizado =
      acertosPercentual == null ? null : clampPercent(acertosPercentual)
    const tempoNormalizado = normalizeNullableNonNegativeNumber(tempoGastoMin ?? null)
    const pontuacaoObtidaNormalizada = normalizeNullableNonNegativeNumber(pontuacaoObtida ?? null)
    const pontuacaoMaximaNormalizada = normalizeNullableNonNegativeNumber(pontuacaoMaxima ?? null)

    const progressoPayload = {
      personalizacao_id: personalizacaoId,
      classe_id: classeAtual.classe_id,
      topico_id: topicoId,
      item_key: progressItemKey,
      item_kind: itemKind,
      item_title: itemTitle,
      status,
      percentual_concluido: percentualNormalizado,
      acertos_percentual: acertosNormalizado,
      tempo_gasto_min: tempoNormalizado,
      pontuacao_obtida: pontuacaoObtidaNormalizada,
      pontuacao_maxima: pontuacaoMaximaNormalizada,
      metadata: {
        ...stepMetadata,
        ...(metadata ?? {}),
        ...(Number.isFinite(conteudoId) && conteudoId > 0
          ? {
              conteudo_id: conteudoId,
              contentId: conteudoId,
            }
          : {}),
        personalizacao_id: personalizacaoId,
        personalizationId: personalizacaoId,
      },
    }

    const evento: LinhaProgressoItem = {
      topico_id: topicoId,
      item_key: progressItemKey,
      item_kind: itemKind,
      status,
      percentual_concluido: percentualNormalizado,
      acertos_percentual: acertosNormalizado,
      tempo_gasto_min: tempoNormalizado,
    }

    try {
      await personalizacaoProvider.salvarProgressoPersonalizadoDiretoSupabase({
        ...progressoPayload,
        aluno_id: usuario.id,
      })
      if (isSlideItemKey(itemKey)) {
        const dedupeKey = buildSlideBonusDedupeKey(topicoId, itemKey)
        setSlideBonusKeys((prev) => {
          if (prev.has(dedupeKey)) return prev
          const next = new Set(prev)
          next.add(dedupeKey)
          return next
        })
      }

      let proximasLinhas: LinhaProgressoItem[] = []
      setProgressoItens((previous) => {
        proximasLinhas = aplicarEventoProgresso(previous, evento)
        return proximasLinhas
      })
      await persistProgressoItensCache(usuario.id, classeAtual.classe_id, perfilDaRotaChave, proximasLinhas)
      // A gravação voltou a funcionar: escoa o que ficou para trás na fila.
      void drenarProgressoOutbox((p) => personalizacaoProvider.salvarProgressoPersonalizadoDiretoSupabase(p))
        .catch(() => undefined)

      if (status === 'concluido' || percentualNormalizado > 0) {
        await refreshTopico(topicoId)
        await atualizarProgressoClasse()
      }
      return
    } catch (directErr) {
      const warnKey = `${usuario.id}:${classeAtual.classe_id}:${topicoId}:${progressItemKey}`
      const now = Date.now()
      const lastWarnAt = progressSaveWarnRef.current.get(warnKey) ?? 0
      if (now - lastWarnAt > 60_000) {
        progressSaveWarnRef.current.set(warnKey, now)
        if (directErr instanceof PersonalizacaoRlsError) {
          console.warn(
            '[TrilhaContext] RLS bloqueando gravacao em personalizacao_item_progresso. Ajuste policy no Supabase para auth.uid() = aluno_id.'
          )
        } else {
          avisarFalha("sync/progresso-direto", '[TrilhaContext] Falha ao salvar progresso personalizado direto no Supabase:', directErr)
        }
      }

      // Sem rede (ou RLS): o progresso não pode se perder. Atualiza o estado
      // local (mesma regra de nunca regredir) e guarda para reenvio, em vez
      // de só logar e deixar o evento desaparecer com o catch.
      let proximasLinhas: LinhaProgressoItem[] = []
      setProgressoItens((previous) => {
        proximasLinhas = aplicarEventoProgresso(previous, evento)
        return proximasLinhas
      })
      await persistProgressoItensCache(usuario.id, classeAtual.classe_id, perfilDaRotaChave, proximasLinhas)
      try {
        await enfileirarProgressoItem({ ...progressoPayload, aluno_id: usuario.id })
      } catch (erroFila) {
        avisarFalha("sync/progresso-fila", '[TrilhaContext] Falha ao enfileirar progresso personalizado:', erroFila)
      }

      throw directErr
    }
  }, [atualizarProgressoClasse, classeAtual, perfilDaRotaChave, persistProgressoItensCache, personalizedTopics, personalizacaoProvider, refreshTopico, usuario?.id])

  const registrarRespostaQuestao = useCallback(async ({
    topicoId,
    atividadeId,
    questaoId,
    resposta,
    correta,
    acertosPercentual = 0,
    tempoGastoSeg,
    jaGravada,
  }: RegistrarRespostaQuestaoParams) => {
    if (!classeAtual || !usuario) return;

    let persistedAttempt: { tentativa?: number } | null = null;
    if (jaGravada) {
      persistedAttempt = jaGravada.tentativa != null ? { tentativa: jaGravada.tentativa } : null;
    } else {
      try {
        persistedAttempt = await QuestaoAluno.registrarResposta({
          alunoId: usuario.id,
          atividadeId,
          questaoId,
          resposta,
          correta,
          acertos_percentual: acertosPercentual,
          tempo_gasto_seg: tempoGastoSeg,
        });
      } catch (err) {
        avisarFalha("questao/salvar-resposta", '[TrilhaContext] Erro ao salvar resposta da questao:', err);
        throw err;
      }
    }

    const targetClasseId = classeAtual.classe_id;
    const applyToClasse = (classe: Classe): Classe => {
      if (classe.classe_id !== targetClasseId) return classe;

      const topicosAtualizados = classe.topicos.map((t) => {
        if (t.id !== topicoId) return t;

        const atividadesAtualizadas = t.atividades.map((a) => {
          if (a.id !== atividadeId) return a;

          const questoesAtualizadas = a.questoes.map((q) => {
            if (q.id !== questaoId) return q;
            const cloneQuestao = Object.assign(Object.create(Object.getPrototypeOf(q)), q) as any;
            cloneQuestao.resposta_aluno = resposta;
            cloneQuestao.correta_aluno = correta;
            cloneQuestao.ultima_tentativa =
              persistedAttempt?.tentativa ?? (cloneQuestao.ultima_tentativa ?? 0) + 1;
            cloneQuestao.acertos_percentual = acertosPercentual;
            cloneQuestao.tempo_gasto_seg = tempoGastoSeg ?? null;
            if (correta === true) {
              cloneQuestao.status = 'concluido';
            }
            return cloneQuestao;
          });

          const atividadeClone = Object.assign(Object.create(Object.getPrototypeOf(a)), a, {
            questoes: questoesAtualizadas,
            resposta_aluno: resposta,
            correta_aluno: correta,
            acertos_percentual: acertosPercentual,
            ultima_tentativa: persistedAttempt?.tentativa ?? (a.ultima_tentativa ?? 0) + 1,
          });

          return atividadeClone;
        });

        const topicoClone = Object.assign(Object.create(Object.getPrototypeOf(t)), t, {
          atividades: atividadesAtualizadas,
        });

        return topicoClone;
      });

      return cloneClasse(classe, { topicos: topicosAtualizados });
    };

    setClasses((prev) => prev.map((c) => applyToClasse(c)));
    setClasseAtual((prev) => (prev ? applyToClasse(prev) : prev));
  }, [classeAtual, usuario]);

  const getProximosTopicos = useCallback((topicoId?: number | null): Topico[] => {
    const classeAtualRefrescada = classeAtualRef.current ?? classeAtual;
    if (!classeAtualRefrescada) return [];

    const topicosOrdenados = [...classeAtualRefrescada.topicos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
    const atual = topicoId != null ? topicosOrdenados.find((t) => t.id === topicoId) : null;
    const ordemAtual = atual?.ordem ?? (atual ? topicosOrdenados.findIndex((t) => t.id === atual.id) : null);

    const restantes = topicosOrdenados.filter((t) => {
      if (topicoId != null && t.id === topicoId) return false;
      return (
        unlockedStateRef.current.includes(String(t.id)) ||
        isTopicoUnlockedLocal(t, topicosOrdenados, topicosPendentesPersonalizados)
      );
    });

    const futuros = ordemAtual == null
      ? restantes
      : restantes.filter((t) => (t.ordem ?? 0) > (ordemAtual as number));
    const fallbackPool = futuros.length ? futuros : restantes;

    const nextIds: number[] = Array.isArray(atual?.next)
      ? (atual?.next as number[]).map(Number).filter(Boolean)
      : [];

    const preferidos = nextIds
      .map((id) => fallbackPool.find((t) => t.id === id))
      .filter((t): t is Topico => !!t);

    const naoProximos = fallbackPool.filter((t) => !nextIds.includes(t.id));

    const naoConcluidos = naoProximos.filter((t) => {
      const st = (t.status ?? '').toString().toLowerCase();
      const pct = Number(t.percentual_concluido ?? 0);
      return !(st.includes('concl') || pct >= 100);
    });

    const concluidos = naoProximos.filter((t) => !naoConcluidos.includes(t));

    const combinado = [...preferidos, ...naoConcluidos, ...concluidos];
    const seen = new Set<number>();
    const unicos: Topico[] = [];
    for (const t of combinado) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      unicos.push(t);
    }
    return unicos;
  }, [classeAtual, topicosPendentesPersonalizados]);

  const value: TrilhaContextValue = useMemo(
    () => ({
      carregando,
      erro,
      classes,
      classeAtual,
      selecionarClasse,
      trocarTurma,
      perfil,
      visual,
      grafo,
      reload,
      recarregarTurma,
      refreshTopico,
      marcarTopicoIniciado,
      marcarTopicoConcluido,
      marcarConteudoVisto,
      registrarAtividadeConcluida,
      registrarTempoTopico,
      registrarTempoConteudo,
      registrarTempoAtividade,
      registrarSessaoConteudo,
      registrarSessaoAtividade,
      registrarSessaoTopico,
      salvarProgressoItemPersonalizado,
      registrarRespostaQuestao,
      deveMostrarGabaritoAoErrar,
      getProximosTopicos,
      personalizedTopics,
      sugestoesMaterial,
      registrarSugestaoMaterial,
      ensureTopicoPersonalizado,
      getNodePersonalizationHint,
      mapTheme,
      trilhaSlideBonusPercent,
      progressoPersonalizado,
    }),
    [
      carregando,
      erro,
      classes,
      classeAtual,
      selecionarClasse,
      trocarTurma,
      perfil,
      visual,
      grafo,
      reload,
      recarregarTurma,
      refreshTopico,
      marcarTopicoIniciado,
      marcarTopicoConcluido,
      marcarConteudoVisto,
      registrarAtividadeConcluida,
      registrarTempoTopico,
      registrarTempoConteudo,
      registrarTempoAtividade,
      registrarSessaoConteudo,
      registrarSessaoAtividade,
      registrarSessaoTopico,
      salvarProgressoItemPersonalizado,
      registrarRespostaQuestao,
      deveMostrarGabaritoAoErrar,
      getProximosTopicos,
      personalizedTopics,
      sugestoesMaterial,
      registrarSugestaoMaterial,
      ensureTopicoPersonalizado,
      getNodePersonalizationHint,
      mapTheme,
      trilhaSlideBonusPercent,
      progressoPersonalizado,
    ]
  )

  return (
    <TrilhaContext.Provider value={value}>{children}</TrilhaContext.Provider>
  )
}

export const useTrilha = () => {
  const ctx = useContext(TrilhaContext)
  if (!ctx) throw new Error('useTrilha deve ser usado dentro de um TrilhaProvider')
  return ctx
}
