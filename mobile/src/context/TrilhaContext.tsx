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
import { usePersonalizacaoProvider } from "@/services/personalizacao/PersonalizacaoProviderContext";
import {
  buildClassMapTheme,
  MapWorldTheme,
  normalizeRemoteMapTheme,
} from '@/utils/classMapTheme';
import { buildClasseAcademicMetrics, buildClasseResumoFallback } from '@/utils/classeMetrics';
import { buildContentBlocks, isUrl } from '@/utils/contentBlocks';
import { ensureCachedNativeContent } from '@/utils/nativeContentCache';
import { normalizePersonalizedTopicPayload } from '@/utils/personalization';
import { inferModoApresentacao } from '@/utils/presentationOrder';
import { resolveDominantBrainHexProfile } from '@/utils/brainHex';
import { looksLikeStorageObjectPath } from '@/utils/supabaseStorage';
import {
  clampPercent,
  normalizeNullableNonNegativeNumber,
} from '@/utils/dataValidation';

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

function buildPersonalizacaoCacheKey(alunoId: string, classeId: number) {
  return `@trailup/personalizacao/${alunoId}/${classeId}`
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

type PrefetchEntry = { url: string; hint?: string | null; key: string };

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

  const pushUrl = (url: unknown, hint: string | null | undefined, key: string) => {
    if (typeof url !== 'string' || !isUrl(url)) return;
    if (seen.has(url)) return;
    seen.add(url);
    entries.push({ url, hint, key });
  };

  const handleBlock = (block: any, keyPrefix: string) => {
    if (!block) return;
    const payloadObj = typeof block.payload === 'object' && block.payload ? block.payload : null;
    const url =
      payloadObj?.url ??
      payloadObj?.uri ??
      payloadObj?.src ??
      (typeof block.payload === 'string' ? block.payload : null);
    pushUrl(url, String(block.tipo ?? ''), `${keyPrefix}:${block.id ?? 'block'}`);
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
  for (const entry of limited) {
    try {
      await ensureCachedNativeContent(
        `${entry.key}:${entry.url}`,
        entry.url,
        { extensionHint: entry.hint ?? undefined }
      );
    } catch (err) {
      console.warn('[TrilhaContext] Falha ao prefetch de material personalizado:', err);
    }
  }
}

function isTopicoConcluido(t: any): boolean {
  const st = (t?.status ?? '').toString().toLowerCase()
  const pct = Number(t?.percentual_concluido ?? 0)
  if (st === 'concluido' || st === 'done' || st === 'complete' || st === 'finished') return true
  if (pct >= 100) return true

  const conteudos = Array.isArray(t?.conteudos) ? t.conteudos : []
  const atividades = Array.isArray(t?.atividades) ? t.atividades : []

  if (!conteudos.length && !atividades.length) return false

  const conteudosConcluidos =
    conteudos.length === 0 ||
    conteudos.every((c: any) => {
      const sc = (c?.status ?? '').toString().toLowerCase()
      const pcc = Number(c?.percentual_concluido ?? 0)
      return sc.includes('concl') || sc === 'done' || pcc >= 100
    })

  const atividadesConcluidas =
    atividades.length === 0 ||
    atividades.every((a: any) => {
      const sa = (a?.status ?? '').toString().toLowerCase()
      const pac = Number(a?.percentual_concluido ?? 0)
      return sa.includes('concl') || sa === 'done' || pac >= 100
    })

  return conteudosConcluidos && atividadesConcluidas
}

function isTopicoUnlockedLocal(t: Topico, todos: Topico[]): boolean {
  if (!t.depende || (Array.isArray(t.depende) && t.depende.length === 0)) return true

  const deps: number[] =
    Array.isArray(t.depende)
      ? t.depende.map(Number).filter(Boolean)
      : []

  if (!deps.length) return true

  return deps.every((id) => {
    const dep = todos.find((x) => x.id === id)
    if (!dep) return true
    const st = (dep.status ?? '').toString().toLowerCase()
    const pct = Number(dep.percentual_concluido ?? 0)
    return st.includes('concl') || pct >= 100
  })
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
  merged.tempo_gasto_min = Math.max(
    Number(persistedAtividade.tempo_gasto_min ?? 0),
    Number(localAtividade.tempo_gasto_min ?? 0)
  )

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
  merged.tempo_gasto_min = Math.max(
    Number(persistedConteudo.tempo_gasto_min ?? 0),
    Number(localConteudo.tempo_gasto_min ?? 0)
  )
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

  const mergedProgress = mergeProgressState(
    persistedTopico.status,
    persistedTopico.percentual_concluido,
    localTopico.status,
    localTopico.percentual_concluido
  )
  mergedTopico.status = mergedProgress.status as any
  mergedTopico.percentual_concluido = mergedProgress.percentual
  mergedTopico.ultima_atividade =
    localTopico.ultima_atividade ?? persistedTopico.ultima_atividade ?? null
  mergedTopico.ultima_visualizacao =
    localTopico.ultima_visualizacao ?? persistedTopico.ultima_visualizacao ?? null
  mergedTopico.tempo_gasto_min = Math.max(
    Number(persistedTopico.tempo_gasto_min ?? 0),
    Number(localTopico.tempo_gasto_min ?? 0)
  )

  const recalculatedPct = mergedTopico.calcularPercentual()
  if (recalculatedPct > Number(mergedTopico.percentual_concluido ?? 0)) {
    mergedTopico.percentual_concluido = recalculatedPct
  }

  if (recalculatedPct >= 100) {
    mergedTopico.status = 'concluido'
  } else if (
    recalculatedPct > 0 &&
    !String(mergedTopico.status ?? '').toLowerCase().includes('concl')
  ) {
    mergedTopico.status = 'em andamento'
  }

  return mergedTopico
}

function buildGraphFromTopicos(classe: Classe): {
  nodes: NodeItem[]
  unlocked: NodeId[]
} {
  const ts = [...classe.topicos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
  const doneById = new Map<number, boolean>()
  for (const t of ts) {
    doneById.set(t.id, isTopicoConcluido(t))
  }

  const nodes: NodeItem[] = ts.map((t, i) => ({
    id: `${t.id}`,
    titulo: t.nome ?? `Tópico ${i + 1}`,
    next: [],
    locked: true,
    completed: !!doneById.get(t.id),
    sequence: i + 1,
  }))

  const byId = new Map(nodes.map((n) => [n.id, n] as const))
  const parents = new Map<string, Set<string>>()
  const ensureParents = (child: string) => {
    let set = parents.get(child)
    if (!set) { set = new Set(); parents.set(child, set) }
    return set
  }

  for (const t of ts) {
    const childId = `${t.id}`

    const deps: number[] =
      Array.isArray(t.depende) ? (t.depende as number[]) :
      typeof t.depende === 'object' && t.depende !== null ? Object.values(t.depende as any).map(Number).filter(Boolean) :
      []

    for (const d of deps) {
      const parentId = `${d}`
      const parentNode = byId.get(parentId)
      if (parentNode) {
        parentNode.next = [...(parentNode.next ?? []), childId]
      }
      ensureParents(childId).add(parentId)
    }

    const nexts: number[] =
      Array.isArray(t.next) ? (t.next as number[]) :
      typeof t.next === 'object' && t.next !== null ? Object.values(t.next as any).map(Number).filter(Boolean) :
      []

    if (nexts.length) {
      const fromNode = byId.get(childId)
      if (fromNode) {
        const toIds = nexts.map((n) => `${n}`)
        fromNode.next = [...(fromNode.next ?? []), ...toIds]
        for (const to of toIds) ensureParents(to).add(childId)
      }
    }
  }

  if (!nodes.some((n) => (n.next?.length ?? 0) > 0) && nodes.length > 1) {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].next = [nodes[i + 1].id]
    for (let i = 1; i < nodes.length; i++) ensureParents(nodes[i].id).add(nodes[i - 1].id)
  }

  const unlocked: NodeId[] = []
  for (const n of nodes) {
    const pset = parents.get(n.id)
    if (!pset || pset.size === 0) {
      unlocked.push(n.id)
    } else {
      const allParentsDone = Array.from(pset).every((pid) => {
        const num = Number(pid)
        return doneById.get(num) === true
      })
      if (allParentsDone) unlocked.push(n.id)
    }
  }

  return { nodes, unlocked }
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
      badgeLabel: isFocus ? 'Foco' : isRecommended ? 'Recom.' : undefined,
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

function reconcileNodesWithClasse(nodes: NodeItem[], classe: Classe) {
  const localGraph = buildGraphFromTopicos(classe)
  const localNodeMap = new Map(localGraph.nodes.map((node) => [String(node.id), node] as const))
  const unlockedIds = new Set(localGraph.unlocked.map((id) => String(id)))

  return nodes.map((node) => {
    const localNode = localNodeMap.get(String(node.id))
    if (!localNode) return node

    return {
      ...node,
      completed: !!localNode.completed,
      locked: !unlockedIds.has(String(node.id)),
    }
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
  selecionarClasse: (index: number) => void
  perfil: BrainHexProfile
  setPerfil: (p: BrainHexProfile) => void
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

  const [perfil, setPerfil] = useState<BrainHexProfile>('seeker')
  const visual: Visual = pickVisual(perfil)
  const dominantProfileKey = useMemo(
    () => resolveDominantBrainHexProfile(usuario?.perfis ?? null, perfil),
    [perfil, usuario?.perfis]
  )

  const [nodesState, setNodesState] = useState<NodeItem[]>([])
  const [unlockedState, setUnlockedState] = useState<NodeId[]>([])
  const [personalizedTopics, setPersonalizedTopics] = useState<Record<number, PersonalizedTopicPayload>>({})
  const [remoteMapThemeState, setRemoteMapThemeState] = useState<Record<string, unknown> | null>(null)
  const personalizationRequestsRef = useRef<Map<string, Promise<EnsurePersonalizationResult>>>(new Map())
  const personalizationAttemptedRef = useRef<Set<string>>(new Set())
  const personalizationRefreshCycleRef = useRef<Map<string, string>>(new Map())
  const personalizationAnalysisRefreshRef = useRef<Set<string>>(new Set())
  const personalizationHydratedClassRef = useRef<string | null>(null)
  const mediaGenerationRetryRef = useRef<Map<string, number>>(new Map())
  const progressSaveWarnRef = useRef<Map<string, number>>(new Map())
  const rtDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const persistPersonalizedTopicsCache = useCallback(async (
    alunoId: string,
    classeId: number,
    payloads: Record<number, PersonalizedTopicPayload>
  ) => {
    try {
      await AsyncStorage.setItem(
        buildPersonalizacaoCacheKey(alunoId, classeId),
        JSON.stringify(payloads)
      )
    } catch (err) {
      console.warn('[TrilhaContext] Erro ao salvar cache de personalizacao:', err)
    }
  }, [])

  useEffect(() => {
    const perfilResolvido = resolveDominantBrainHexProfile(usuario?.perfis ?? null, 'seeker')
    setPerfil(perfilResolvido)
  }, [usuario])

  useEffect(() => {
    if (!classeAtual || !usuario?.id) return

    let ativo = true
    ;(async () => {
      try {
        const raw = await AsyncStorage.getItem(
          buildPersonalizacaoCacheKey(usuario.id, classeAtual.classe_id)
        )
        if (!raw || !ativo) return
        const parsed = JSON.parse(raw) as Record<number, PersonalizedTopicPayload>
        if (parsed && typeof parsed === 'object') {
          setPersonalizedTopics((prev) => ({ ...prev, ...parsed }))
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
  }, [classeAtual, usuario?.id])

  const syncClasseLocally = useCallback((sourceClasse: Classe) => {
    const nextResumo = buildClasseResumoFallback(sourceClasse, sourceClasse.resumo)
    const nextClasse = cloneClasse(sourceClasse, {
      topicos: [...sourceClasse.topicos],
      resumo: nextResumo ?? sourceClasse.resumo,
    })

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

    const { nodes, unlocked } = buildGraphFromTopicos(nextClasse)
    setNodesState(decorateNodesWithPersonalization(nodes, nextClasse.topicos, personalizedTopics))
    setUnlockedState(unlocked)
  }, [personalizedTopics])

  const carregarClasses = useCallback(async () => {
    if (!usuario?.id) {
      setClasses([])
      setClasseAtual(null)
      setNodesState([])
      setUnlockedState([])
      setCarregando(false)
      return
    }
    setCarregando(true)
    setErro(null)
    try {
      const lista = await Classe.findAllByAluno(usuario.id, { withDetalhe: true })
      setClasses(lista)
      if (lista.length > 0) setClasseAtual(lista[0])
    } catch (e: any) {
      setErro(e)
    } finally {
      setCarregando(false)
    }
  }, [usuario?.id])

  useEffect(() => {
    carregarClasses()
  }, [carregarClasses])

  const selecionarClasse = useCallback(
    (index: number) => {
      if (index >= 0 && index < classes.length) {
        setClasseAtual(classes[index])
      }
    },
    [classes]
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

      return normalizePersonalizedTopicPayload({
        record,
        classeId: classeAtual?.classe_id ?? topico.classe_id,
        topicoId: topico.id,
        fallbackBlocks: topico.conteudos.flatMap((conteudo: any) => buildContentBlocks(conteudo)),
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

      const status = String(record?.status ?? '').toLowerCase();
      if (['pending', 'processing'].includes(status)) return;

      const missingFormats = collectMissingRequestedMediaFormats(record);
      if (!missingFormats.length) return;

      const retryKey = `${usuario.id}:${classeAtual.classe_id}:${dominantProfileKey}:${topico.id}:${Number(record?.id ?? 0)}:${missingFormats.join(',')}`;
      const now = Date.now();
      const lastAttempt = mediaGenerationRetryRef.current.get(retryKey) ?? 0;
      if (now - lastAttempt < MEDIA_GENERATION_COOLDOWN_MS) return;
      mediaGenerationRetryRef.current.set(retryKey, now);

      const focusedContentId =
        Number(record?.conteudo_id ?? topico?.conteudos?.[0]?.id ?? Number.NaN) || null;

      void personalizacaoProvider.solicitarPersonalizacao({
        classe_id: classeAtual.classe_id,
        topico_id: topico.id,
        conteudo_id: focusedContentId,
        conteudo_foco_id: focusedContentId,
      })
        .then(() => {
          console.log(
            '[TrilhaContext] Retentativa de personalizacao disparada para midias faltantes:',
            { topicoId: topico.id, missingFormats }
          );
        })
        .catch((err) => {
          mediaGenerationRetryRef.current.delete(retryKey);
          console.warn(
            '[TrilhaContext] Falha ao disparar retentativa de personalizacao para midias faltantes:',
            err
          );
        });
    },
    [classeAtual, dominantProfileKey, personalizacaoProvider, usuario?.id]
  );

  const hydratePersonalizedTopics = useCallback(async () => {
    if (!classeAtual || !usuario?.id) return
    const hydrationKey = `${usuario.id}:${classeAtual.classe_id}:${dominantProfileKey}`
    if (personalizationHydratedClassRef.current === hydrationKey) return
    personalizationHydratedClassRef.current = hydrationKey

    try {
      const response = await personalizacaoProvider.listarPersonalizacoesPersistidasPerfil({
        classeId: classeAtual.classe_id,
        brainhexProfileKey: dominantProfileKey,
        limit: Math.max(20, classeAtual.topicos.length * 3),
      })

      const byTopico: Record<number, PersonalizedTopicPayload> = {}
      const topicosById = new Map(classeAtual.topicos.map((topico) => [topico.id, topico] as const))

      for (const item of response?.itens ?? []) {
        const topicoId = Number(item?.topico_id)
        if (!topicoId || byTopico[topicoId]) continue
        const topico = topicosById.get(topicoId)
        if (!topico) continue
        maybeRequestMissingMediaForRecord(item, topico)
        personalizationAttemptedRef.current.add(`${usuario.id}:${classeAtual.classe_id}:${dominantProfileKey}:${topicoId}`)
        const payload = buildPayloadForTopico(item, topico, "remote")
        byTopico[topicoId] = payload
        void prefetchPersonalizedPayload(payload)
      }

      if (Object.keys(byTopico).length) {
        setPersonalizedTopics((prev) => ({ ...prev, ...byTopico }))
        await persistPersonalizedTopicsCache(usuario.id, classeAtual.classe_id, byTopico)
      }
    } catch (err) {
      personalizationHydratedClassRef.current = null
      console.warn('[TrilhaContext] Erro ao hidratar personalizacoes:', err)
    }
  }, [buildPayloadForTopico, classeAtual, dominantProfileKey, maybeRequestMissingMediaForRecord, persistPersonalizedTopicsCache, personalizacaoProvider, usuario?.id])

  const ensureTopicoPersonalizado = useCallback(async (
    topicoId: number,
    options: EnsurePersonalizationOptions = {}
  ) => {
    const forceRefresh = options.forceRefresh === true
    if (!forceRefresh && personalizedTopics[topicoId]) return personalizedTopics[topicoId]
    if (!classeAtual || !usuario?.id) return null

    const topico = classeAtual.topicos.find((item) => item.id === topicoId)
    if (!topico) return null

    const key = `${usuario.id}:${classeAtual.classe_id}:${dominantProfileKey}:${topicoId}`
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
          brainhexProfileKey: dominantProfileKey,
          limit: 5,
        })

        const record =
          (listResponse?.itens ?? [])
            .slice()
            .sort((a, b) => {
              const aTime = new Date(a?.updated_at ?? a?.gerado_em ?? 0).getTime()
              const bTime = new Date(b?.updated_at ?? b?.gerado_em ?? 0).getTime()
              return bTime - aTime
            })[0] ?? null

        if (!record) return null

        maybeRequestMissingMediaForRecord(record, topico)
        const payload = buildPayloadForTopico(record, topico, forceRefresh ? "remote" : "cache")
        setPersonalizedTopics((prev) => ({ ...prev, [topicoId]: payload }))
        await persistPersonalizedTopicsCache(usuario.id, classeAtual.classe_id, {
          [topicoId]: payload,
        })
        void prefetchPersonalizedPayload(payload)
        if (forceRefresh && triggerCycleId) {
          personalizationRefreshCycleRef.current.set(key, triggerCycleId)
          personalizationAnalysisRefreshRef.current.add(key)
        }
        return payload
      } catch (err) {
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
    dominantProfileKey,
    maybeRequestMissingMediaForRecord,
    persistPersonalizedTopicsCache,
    personalizedTopics,
    personalizacaoProvider,
    usuario?.id,
  ])

  const getNodePersonalizationHint = useCallback((topicoId: number) => {
    return personalizedTopics[topicoId]?.nodeHint ?? null
  }, [personalizedTopics])

  const fetchGraphData = useCallback(async () => {
    if (!classeAtual) return
    setCarregando(true)
    setErro(null)
    try {
      const userId = usuario?.id
      if (!userId) {
        console.warn('[TrilhaContext] Sessao ainda nao hidratada para buscar grafo, usando fallback local.')
        const { nodes, unlocked } = buildGraphFromTopicos(classeAtual)
        setNodesState(decorateNodesWithPersonalization(nodes, classeAtual.topicos, personalizedTopics))
        setUnlockedState(unlocked)
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

      const dbMapTheme =
        dbThemeRaw
          ? {
              world_name: dbThemeRaw.world_name,
              world_subtitle: dbThemeRaw.world_subtitle,
              world_description: dbThemeRaw.world_description,
              template_id: dbThemeRaw.template_id,
              palette: dbThemeRaw.palette,
              countries: dbThemeRaw.countries,
              class_label: classeAtual.resumo?.materia_nome ?? classeAtual.descricao ?? `Classe ${classeAtual.classe_id}`,
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
          locked: !!n.locked,
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

        const nodesWithProgress = reconcileNodesWithClasse(mapped, classeAtual)
        setNodesState(decorateNodesWithPersonalization(nodesWithProgress, classeAtual.topicos, personalizedTopics))
        setUnlockedState(nodesWithProgress.filter((n) => n.locked === false).map((n) => n.id))
        setRemoteMapThemeState(incomingMapTheme)
      } else {
        console.log('[TrilhaContext] Usando fallback (buildGraphFromTopicos)')
        const { nodes, unlocked } = buildGraphFromTopicos(classeAtual)
        setNodesState(decorateNodesWithPersonalization(nodes, classeAtual.topicos, personalizedTopics))
        setUnlockedState(unlocked)
        setRemoteMapThemeState(incomingMapTheme)
      }
    } catch (e: any) {
      console.warn('[TrilhaContext] Erro ao buscar grafo, usando fallback:', e)
      const { nodes, unlocked } = buildGraphFromTopicos(classeAtual!)
      setNodesState(decorateNodesWithPersonalization(nodes, classeAtual.topicos, personalizedTopics))
      setUnlockedState(unlocked)
      setRemoteMapThemeState(null)
      setErro(e)
    } finally {
      setCarregando(false)
    }
  }, [classeAtual, perfil, personalizedTopics, usuario?.id, visual])

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
      onChange: () => {
        personalizationHydratedClassRef.current = null
        void hydratePersonalizedTopics()
      },
    })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [classeAtual, dominantProfileKey, hydratePersonalizedTopics, personalizacaoProvider, usuario?.id])

  const mapTheme = useMemo(() => {
    if (!classeAtual) return null

    const baseNodes = nodesState.length ? nodesState : buildGraphFromTopicos(classeAtual).nodes
    return (
      normalizeRemoteMapTheme(remoteMapThemeState, classeAtual, baseNodes) ??
      buildClassMapTheme(classeAtual, baseNodes)
    )
  }, [classeAtual, nodesState, remoteMapThemeState])

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    ;(async () => {
      const userId = usuario?.id
      if (!userId || !classeAtual) return

      channel = supabase
        .channel('rt_trilha')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'conteudo_aluno', filter: `aluno_id=eq.${userId}` },
          () => {
            if (rtDebounceRef.current) clearTimeout(rtDebounceRef.current)
            rtDebounceRef.current = setTimeout(() => void fetchGraphData(), 2000)
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'atividade_aluno', filter: `aluno_id=eq.${userId}` },
          () => {
            if (rtDebounceRef.current) clearTimeout(rtDebounceRef.current)
            rtDebounceRef.current = setTimeout(() => void fetchGraphData(), 2000)
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'topico_aluno', filter: `aluno_id=eq.${userId}` },
          () => {
            if (rtDebounceRef.current) clearTimeout(rtDebounceRef.current)
            rtDebounceRef.current = setTimeout(() => void fetchGraphData(), 2000)
          }
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
  }, [classeAtual, fetchGraphData, usuario?.id])

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
    if (!classeAtual) return;

    try {
      console.log('[TrilhaContext] Atualizando tópico:', topicoId);

      const topicoAtualizado = await Classe.loadDetalhado(
        classeAtual.aluno_id, 
        classeAtual.classe_id
      );

      const topicoLocal = classeAtual.topicos.find((t) => t.id === topicoId) ?? null
      const novoTopicoPersistido = topicoAtualizado.find((t: Topico) => t.id === topicoId);
      const novoTopico = novoTopicoPersistido
        ? mergeTopicoLocalState(novoTopicoPersistido, topicoLocal)
        : null
      if (!novoTopico) {
        console.warn('[TrilhaContext] Tópico não encontrado após reload:', topicoId);
        return;
      }

      const topicosAtualizados = classeAtual.topicos.map((t) => t.id === topicoId ? novoTopico : t)
      syncClasseLocally(cloneClasse(classeAtual, { topicos: topicosAtualizados }));

      console.log('[TrilhaContext] Tópico atualizado com sucesso');
    } catch (err) {
      console.warn('[TrilhaContext] Erro ao atualizar tópico:', err);
    }
  }, [classeAtual, syncClasseLocally]);

  const atualizarProgressoClasse = useCallback(async () => {
    if (!classeAtual) return;
    try {
      const metrics = buildClasseAcademicMetrics(classeAtual)
      const novoResumo = buildClasseResumoFallback(classeAtual, classeAtual.resumo)
      if (!novoResumo) return

      const { error } = await supabase
        .from('classe_aluno')
        .update({
          porcentagemConcluida: novoResumo.porcentagemConcluida ?? metrics.progressPct,
          isComplete: novoResumo.isComplete ?? metrics.isComplete,
          acertosPercentual: novoResumo.acertosPercentual ?? metrics.acertosPercentual,
          tempoGastoMin: novoResumo.tempoGastoMin ?? metrics.tempoTotalMin,
          tempoMedioPorAtividade:
            novoResumo.tempoMedioPorAtividade ?? metrics.tempoMedioPorAtividade,
          atividadesConcluidas:
            novoResumo.atividadesConcluidas ?? metrics.atividadesConcluidasIds,
          updated_at: new Date().toISOString(),
        })
        .eq('aluno_id', classeAtual.aluno_id)
        .eq('classe_id', classeAtual.classe_id);

      if (error) throw error;

      syncClasseLocally(cloneClasse(classeAtual, {
        topicos: [...classeAtual.topicos],
        resumo: novoResumo,
      }));
    } catch (err) {
      console.warn('[TrilhaContext] Erro ao atualizar progresso da classe:', err);
    }
  }, [classeAtual, syncClasseLocally]);

  // ✅ NOVOS MÉTODOS usando Models

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
      syncClasseLocally(cloneClasse(classeAtual, { topicos: [...classeAtual.topicos] }));
      await atualizarProgressoClasse();
      
      // Desbloqueia próximos tópicos
      const desbloqueados = await topico.desbloquearProximos(usuario.id, classeAtual.topicos);
      
      console.log('[TrilhaContext] Tópicos desbloqueados:', desbloqueados.map(t => t.nome));
      
    } catch (err) {
      console.error('[TrilhaContext] Erro ao marcar tópico concluído:', err);
      throw err;
    }
  }, [classeAtual, usuario, atualizarProgressoClasse, syncClasseLocally]);

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
      topico.percentual_concluido = topico.calcularPercentual();
      topico.status = topico.calcularStatus();
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

      // Atualiza estado local imediatamente
      atividade.status = 'concluido';
      atividade.percentual_concluido = 100;
      atividade.acertos_percentual = acertosPercentual;
      topico.percentual_concluido = topico.calcularPercentual();
      topico.status = topico.calcularStatus();
      syncClasseLocally(cloneClasse(classeAtual, { topicos: [...classeAtual.topicos] }));

      // Persiste no banco
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

      setTimeout(() => void refreshTopico(topicoId), 500);
    } catch (err) {
      console.error('[TrilhaContext] Erro ao registrar atividade:', err);
      throw err;
    }
  }, [classeAtual, usuario, atualizarProgressoClasse, refreshTopico, syncClasseLocally]);

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

      const tempoTotal = Number(conteudo.tempo_gasto_min ?? 0) + tempoNormalizado
      await conteudo.atualizarTempoGasto(usuario.id, tempoTotal)
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

      const tempoTotal = Number(atividade.tempo_gasto_min ?? 0) + tempoNormalizado
      await atividade.atualizarTempoGasto(usuario.id, tempoTotal)
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

    const tempoNormalizado = Math.max(0, Number(tempoGastoMin ?? 0))
    if (!Number.isFinite(tempoNormalizado) || tempoNormalizado <= 0) return

    try {
      const topico = classeAtual.topicos.find((t) => t.id === topicoId)
      if (!topico) throw new Error('Topico nao encontrado')

      const tempoAtual = Number(topico.tempo_gasto_min ?? 0)
      const tempoTotal = Math.max(tempoAtual + tempoNormalizado, tempoNormalizado)

      const { error } = await supabase
        .from('topico_aluno')
        .upsert(
          {
            aluno_id: usuario.id,
            topico_id: topicoId,
            status:
              String(topico.status ?? '').toLowerCase().includes('concl')
                ? 'concluido'
                : Number(topico.percentual_concluido ?? 0) > 0
                ? 'em andamento'
                : 'em andamento',
            percentual_concluido: Math.max(0, Math.min(100, Number(topico.percentual_concluido ?? 0))),
            ultima_atividade: topico.ultima_atividade ?? null,
            tempo_gasto_min: tempoTotal,
            ultima_visualizacao: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'aluno_id,topico_id',
          }
        )

      if (error) throw error
      topico.tempo_gasto_min = tempoTotal
      syncClasseLocally(cloneClasse(classeAtual, { topicos: [...classeAtual.topicos] }))
      await atualizarProgressoClasse()
    } catch (err) {
      console.warn('[TrilhaContext] Erro ao registrar tempo do topico:', err)
    }
  }, [atualizarProgressoClasse, classeAtual, syncClasseLocally, usuario])

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
    const personalizacaoId = Number(payload?.planMeta?.recordId ?? 0)
    if (!payload || !personalizacaoId) return

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
      item_key: itemKey,
      item_kind: itemKind,
      item_title: itemTitle,
      status,
      percentual_concluido: percentualNormalizado,
      acertos_percentual: acertosNormalizado,
      tempo_gasto_min: tempoNormalizado,
      pontuacao_obtida: pontuacaoObtidaNormalizada,
      pontuacao_maxima: pontuacaoMaximaNormalizada,
      metadata: metadata ?? {},
    }

    try {
      await personalizacaoProvider.salvarProgressoPersonalizadoDiretoSupabase({
        ...progressoPayload,
        aluno_id: usuario.id,
      })
      return
    } catch (directErr) {
      const warnKey = `${usuario.id}:${classeAtual.classe_id}:${topicoId}:${itemKey}`
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
      return
    }
  }, [classeAtual, personalizedTopics, personalizacaoProvider, usuario?.id])

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
    if (!classeAtual) return [];

    const topicosOrdenados = [...classeAtual.topicos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
    const atual = topicoId != null ? topicosOrdenados.find((t) => t.id === topicoId) : null;
    const ordemAtual = atual?.ordem ?? (atual ? topicosOrdenados.findIndex((t) => t.id === atual.id) : null);

    const restantes = topicosOrdenados.filter((t) => {
      if (topicoId != null && t.id === topicoId) return false;
      return isTopicoUnlockedLocal(t, topicosOrdenados);
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
  }, [classeAtual]);

  const value: TrilhaContextValue = useMemo(
    () => ({
      carregando,
      erro,
      classes,
      classeAtual,
      selecionarClasse,
      perfil,
      setPerfil,
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
      salvarProgressoItemPersonalizado,
      registrarRespostaQuestao,
      deveMostrarGabaritoAoErrar,
      getProximosTopicos,
      personalizedTopics,
      ensureTopicoPersonalizado,
      getNodePersonalizationHint,
      mapTheme,
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
      salvarProgressoItemPersonalizado,
      registrarRespostaQuestao,
      deveMostrarGabaritoAoErrar,
      getProximosTopicos,
      personalizedTopics,
      ensureTopicoPersonalizado,
      getNodePersonalizationHint,
      mapTheme,
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
