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
import { useWindowDimensions } from 'react-native';
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
import { resolveActiveBrainHexProfile } from '@/utils/brainHex';
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

function buildPersonalizacaoCacheKey(
  alunoId: string,
  classeId: number,
  profile: BrainHexProfile,
) {
  return `@trailup/personalizacao-v4/${alunoId}/${classeId}/${profile}`
}

function buildProgressoItensCacheKey(
  alunoId: string,
  classeId: number,
  profile: BrainHexProfile,
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
  perfil: BrainHexProfile
  visual: Visual
  grafo: GraphLayout
  reload: () => Promise<void>
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


  const perfil = useMemo(
    () =>
      resolveActiveBrainHexProfile(
        usuario?.perfis ?? null,
        usuario?.perfilAtivo,
        'seeker',
      ),
    [usuario?.perfilAtivo, usuario?.perfis],
  )
  const visual: Visual = pickVisual(perfil)
  const activeProfileKey = perfil
  const personalizationScope = `${usuario?.id ?? ''}:${classeAtual?.classe_id ?? ''}:${activeProfileKey}`
  const personalizationScopeRef = useRef(personalizationScope)
  personalizationScopeRef.current = personalizationScope

  const [nodesState, setNodesState] = useState<NodeItem[]>([])
  const [unlockedState, setUnlockedState] = useState<NodeId[]>([])
  const unlockedStateRef = useRef<NodeId[]>([])
  const confirmedUnlockedRef = useRef<NodeId[]>([])
  const unlockedScopeRef = useRef<string | null>(null)
  const unlockedPersistQueueRef = useRef<Promise<void>>(Promise.resolve())
  const [personalizedTopics, setPersonalizedTopics] = useState<Record<number, PersonalizedTopicPayload>>({})
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
    profile: BrainHexProfile,
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
    profile: BrainHexProfile,
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

  useEffect(() => {
    personalizationHydratedClassRef.current = null
    personalizationRequestsRef.current.clear()
    personalizationAttemptedRef.current.clear()
    setPersonalizedTopics({})
  }, [personalizationScope])

  useEffect(() => {
    const classeId = classeAtual?.classe_id
    if (!classeId || !usuario?.id) return

    let ativo = true
    ;(async () => {
      try {
        const raw = await AsyncStorage.getItem(
          buildPersonalizacaoCacheKey(usuario.id, classeId, perfil)
        )
        if (!raw || !ativo) return
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
  }, [classeAtual?.classe_id, perfil, usuario?.id])

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
      const lista = await Classe.findAllByAluno(usuario.id, { withDetalhe: true })
      if (requestId !== classesRequestRef.current) return
      setClasses(lista)
      // O login exige escolha, inclusive com uma única matrícula. Um refresh
      // conserva a escolha, mas nunca escolhe outra turma se ela foi removida.
      const selected = findSelectedClass(lista, classeAtualRef.current?.classe_id, usuario.id)
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
      if (!selected) return
      classeAtualRef.current = selected
      setClasseAtual(selected)
    },
    [classes, usuario?.id]
  )

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
    if (!classeAtual || !usuario?.id) return
    const hydrationKey = `${usuario.id}:${classeAtual.classe_id}:${activeProfileKey}`
    if (personalizationHydratedClassRef.current === hydrationKey) return
    personalizationHydratedClassRef.current = hydrationKey

    try {
      const expectedContentCount = classeAtual.topicos.reduce(
        (total, topico) => total + Math.max(1, topico.conteudos?.length ?? 0),
        0
      )
      const response = await personalizacaoProvider.listarPersonalizacoesPersistidasPerfil({
        classeId: classeAtual.classe_id,
        brainhexProfileKey: activeProfileKey,
        limit: Math.max(20, expectedContentCount * 2),
      })
      if (personalizationScopeRef.current !== hydrationKey) return

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

      for (const topico of classeAtual.topicos) {
        const records = orderPersonalizationRecordsByTeacherContent(
          recordsByTopico.get(topico.id) ?? [],
          topico.conteudos ?? []
        )
        if (!records.length) continue

        const payloads = records.map((item) => {
          maybeRequestMissingMediaForRecord(item, topico)
          return buildPayloadForTopico(item, topico, "remote")
        })
        const payload = aggregatePersonalizedTopicPayloads(payloads)
        if (!payload) continue

        personalizationAttemptedRef.current.add(`${usuario.id}:${classeAtual.classe_id}:${activeProfileKey}:${topico.id}`)
        byTopico[topico.id] = payload
        void prefetchPersonalizedPayload(payload)
      }

      if (Object.keys(byTopico).length) {
        setPersonalizedTopics((prev) => ({ ...prev, ...byTopico }))
        await persistPersonalizedTopicsCache(
          usuario.id,
          classeAtual.classe_id,
          activeProfileKey,
          byTopico,
        )
      }
    } catch (err) {
      if (personalizationScopeRef.current === hydrationKey) personalizationHydratedClassRef.current = null
      console.warn('[TrilhaContext] Erro ao hidratar personalizacoes:', err)
    }
  }, [activeProfileKey, buildPayloadForTopico, classeAtual, maybeRequestMissingMediaForRecord, persistPersonalizedTopicsCache, personalizacaoProvider, usuario?.id])

  const ensureTopicoPersonalizado = useCallback(async (
    topicoId: number,
    options: EnsurePersonalizationOptions = {}
  ) => {
    const forceRefresh = options.forceRefresh === true
    if (!forceRefresh && personalizedTopics[topicoId]) return personalizedTopics[topicoId]
    if (!classeAtual || !usuario?.id) return null

    const topico = classeAtual.topicos.find((item) => item.id === topicoId)
    if (!topico) return null

    const key = `${usuario.id}:${classeAtual.classe_id}:${activeProfileKey}:${topicoId}`
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
        const listResponse = await personalizacaoProvider.listarPersonalizacoesPersistidasPerfil({
          classeId: classeAtual.classe_id,
          topicoId,
          brainhexProfileKey: activeProfileKey,
          limit: Math.max(10, (topico.conteudos?.length ?? 0) * 2),
        })
        if (personalizationScopeRef.current !== personalizationScope) return null

        const records = orderPersonalizationRecordsByTeacherContent(
          listResponse?.itens ?? [],
          topico.conteudos ?? []
        )
        if (!records.length) return null

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
        await persistPersonalizedTopicsCache(usuario.id, classeAtual.classe_id, activeProfileKey, {
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
        console.warn('[TrilhaContext] Erro ao garantir personalizacao:', err)
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
    buildPayloadForTopico,
    classeAtual,
    activeProfileKey,
    maybeRequestMissingMediaForRecord,
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
          console.warn('[TrilhaContext] Erro na Edge Function personalize_path:', edgeResult.error)
        }
      } catch (edgeError) {
        console.warn('[TrilhaContext] Falha ao invocar Edge personalize_path:', edgeError)
      }

      const { data: dbThemeRaw, error: dbThemeError } = await supabase
        .from('classe_mapa_tema')
        .select('world_name, world_subtitle, world_description, template_id, palette, countries')
        .eq('classe_id', classeAtual.classe_id)
        .maybeSingle()

      if (dbThemeError) {
        console.warn('[TrilhaContext] Falha ao carregar classe_mapa_tema:', dbThemeError)
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
      console.warn('[TrilhaContext] Erro ao buscar grafo, usando fallback:', e)
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
              console.warn('[TrilhaContext] Falha ao sincronizar progresso remoto:', error)
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
          buildProgressoItensCacheKey(alunoId, classeId, activeProfileKey)
        )
        if (cancelado) return
        const parsed = raw ? JSON.parse(raw) : []
        hidratados = Array.isArray(parsed) ? parsed : []
        setProgressoItens(hidratados)
      } catch (err) {
        console.warn('[TrilhaContext] Erro ao carregar cache local de progresso personalizado:', err)
      }

      // A jornada pode usar material-base compartilhado e gerações parciais
      // com arquivos utilizáveis, assim como a projeção canônica do banco.
      const { data: personalizacoesAtivas, error: personalizacoesError } = await supabase
        .from('conteudo_personalizado')
        .select('id')
        .or(`aluno_id.eq.${alunoId},aluno_id.is.null`)
        .eq('classe_id', classeId)
        .eq('brainhex_profile_key', activeProfileKey)

      if (cancelado) return
      if (personalizacoesError) {
        // Sem rede: o que veio do cache continua valendo, não zera.
        console.warn('[TrilhaContext] Falha ao buscar personalizacao ativa:', personalizacoesError)
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
        await persistProgressoItensCache(alunoId, classeId, activeProfileKey, [])
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
        console.warn('[TrilhaContext] Falha ao buscar progresso personalizado:', error)
        return
      }

      const remoto = (data ?? []) as LinhaProgressoItem[]
      // Nunca regride: se uma escrita otimista local ainda não chegou ao
      // servidor (fila de reenvio em progressoOutbox), a leitura fresca não
      // pode apagá-la.
      const linhas = mesclarLinhasProgresso(hidratados, remoto)
      setProgressoItens(linhas)
      await persistProgressoItensCache(alunoId, classeId, activeProfileKey, linhas)

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
  }, [activeProfileKey, classeAtual?.classe_id, persistProgressoItensCache, usuario?.id])

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
      console.warn('[TrilhaContext] Erro ao atualizar tópico:', err);
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
      console.warn('[TrilhaContext] Erro ao atualizar progresso da classe:', err);
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
          console.warn('[TrilhaContext] Falha ao registrar passos do percurso:', error);
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
      console.error('[TrilhaContext] Erro ao marcar tópico iniciado:', err);
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
      console.error('[TrilhaContext] Erro ao marcar tópico concluído:', err);
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
      console.error('[TrilhaContext] Erro ao marcar conteúdo visto:', err);
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
      console.error('[TrilhaContext] Erro ao registrar atividade:', err);
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
      if (!topico) throw new Error('TÃ³pico nÃ£o encontrado')

      const conteudo = topico.conteudos.find((c) => c.id === conteudoId)
      if (!conteudo) throw new Error('ConteÃºdo nÃ£o encontrado')

      // O tempo em si nao e mais gravado aqui: vem da telemetria, por
      // trigger (`20260826_19`). Este acumulo era leitura-soma-escrita sobre
      // uma base que podia estar velha, e a escrita que falhava so virava
      // `console.warn` -- o intervalo se perdia para sempre.
      await conteudo.registrarVisita(usuario.id)
      await atualizarProgressoClasse()
    } catch (err) {
      console.warn('[TrilhaContext] Erro ao registrar tempo do conteÃºdo:', err)
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
      if (!topico) throw new Error('TÃ³pico nÃ£o encontrado')

      const atividade = topico.atividades.find((a) => a.id === atividadeId)
      if (!atividade) throw new Error('Atividade nÃ£o encontrada')

      // Idem conteudo: o tempo vem da telemetria. E este caminho ainda
      // zerava `acertos_percentual` de quebra.
      await atividade.registrarVisita(usuario.id)
      await atualizarProgressoClasse()
    } catch (err) {
      console.warn('[TrilhaContext] Erro ao registrar tempo da atividade:', err)
    }
  }, [classeAtual, usuario, atualizarProgressoClasse])

  const registrarTempoTopico = useCallback(async (
    topicoId: number,
    tempoGastoMin: number
  ) => {
    if (!classeAtual || !usuario) return

    // O tempo nao e mais gravado daqui (vem da telemetria, por trigger), mas
    // continua sendo a CONDICAO: sem tempo decorrido nao houve visita a
    // registrar, e um upsert por evento vazio so gera escrita a toa.
    const tempoNormalizado = Math.max(0, Number(tempoGastoMin ?? 0))
    if (!Number.isFinite(tempoNormalizado) || tempoNormalizado <= 0) return

    try {
      const topico = classeAtual.topicos.find((t) => t.id === topicoId)
      if (!topico) throw new Error('Topico nao encontrado')

      const { error } = await supabase
        .from('topico_aluno')
        .upsert(
          {
            aluno_id: usuario.id,
            topico_id: topicoId,
            // Sem `status` nem `percentual_concluido`: sao derivados no banco
            // pelo trigger de progresso. Mandar o valor local aqui gravava por
            // cima da conta certa com o que a memoria do app tivesse no
            // momento -- e este caminho dispara a cada registro de tempo, o
            // que fazia o percentual correto durar segundos.
            //
            // O `status` que estava aqui tambem era ternario morto: os dois
            // ramos devolviam 'em andamento', entao um topico com 0% era
            // marcado como iniciado so por ter tido tempo contabilizado.
            ultima_atividade: topico.ultima_atividade ?? null,
            ultima_visualizacao: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'aluno_id,topico_id',
          }
        )

      if (error) throw error
      await refreshTopico(topicoId)
      await atualizarProgressoClasse()
    } catch (err) {
      console.warn('[TrilhaContext] Erro ao registrar tempo do topico:', err)
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
      await persistProgressoItensCache(usuario.id, classeAtual.classe_id, activeProfileKey, proximasLinhas)
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
          console.warn('[TrilhaContext] Falha ao salvar progresso personalizado direto no Supabase:', directErr)
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
      await persistProgressoItensCache(usuario.id, classeAtual.classe_id, activeProfileKey, proximasLinhas)
      try {
        await enfileirarProgressoItem({ ...progressoPayload, aluno_id: usuario.id })
      } catch (erroFila) {
        console.warn('[TrilhaContext] Falha ao enfileirar progresso personalizado:', erroFila)
      }

      throw directErr
    }
  }, [activeProfileKey, atualizarProgressoClasse, classeAtual, persistProgressoItensCache, personalizedTopics, personalizacaoProvider, refreshTopico, usuario?.id])

  const registrarRespostaQuestao = useCallback(async ({
    topicoId,
    atividadeId,
    questaoId,
    resposta,
    correta,
    acertosPercentual = 0,
    tempoGastoSeg,
  }: RegistrarRespostaQuestaoParams) => {
    if (!classeAtual || !usuario) return;

    let persistedAttempt: { tentativa?: number } | null = null;
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
      console.warn('[TrilhaContext] Erro ao salvar resposta da questao:', err);
      throw err;
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
      perfil,
      visual,
      grafo,
      reload,
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
      perfil,
      visual,
      grafo,
      reload,
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
