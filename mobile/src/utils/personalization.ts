import {
  ContentBlock,
  ContentBlockType,
} from "@/interfaces/componentes_simples/IContentBlock";
import { normalizeIAPersonalizationPatch } from "@/interfaces/personalizacao/IAContracts";
import {
  PersonalizedActivity,
  PersonalizedHeroFormat,
  PersonalizedNodeHint,
  PersonalizedQuestion,
  PersonalizedStudyCard,
  PersonalizedTopicStep,
  PersonalizedTopicPayload,
  PersonalizedUiConfig,
} from "@/interfaces/personalizacao/IPersonalizedTopic";
import {
  ModoApresentacao,
  orderContentBlocksByMode,
} from "@/utils/presentationOrder";
import {
  buildContentBlocks,
  isUrl,
  isAudioUrl,
  isPdfUrl,
  isDocumentUrl,
  isImageUrl,
  isMarkdownUrl,
  isPresentationUrl,
  isVideoUrl,
  normalizeContentBlock,
} from "@/utils/contentBlocks";
import { buildSupabasePublicStorageUrl } from "@/utils/supabaseStorage";

const DEFAULT_REPERSONALIZATION_ACTIONS = [
  "simplificar_conteudo",
  "mostrar_exemplos",
  "aumentar_dificuldade",
];

type LooseRecord = Record<string, any>;

type NormalizeInput = {
  record: LooseRecord;
  classeId: number;
  topicoId: number;
  fallbackBlocks: ContentBlock[];
  fallbackActivities: any[];
  presentationMode?: ModoApresentacao;
  source?: "cache" | "remote" | "fallback";
};

function normalizeDisplayText(value: unknown) {
  return String(value ?? "").trim();
}

function parseJsonIfString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function asLooseRecord(value: unknown): LooseRecord {
  const parsed = parseJsonIfString(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as LooseRecord)
    : {};
}

function normalizeKey(value: unknown) {
  return normalizeDisplayText(value).toLowerCase();
}

function stableNegativeId(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return -Math.max(1, Math.abs(hash));
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function pickPositiveInt(...values: unknown[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function normalizeQuestionType(value: unknown, fallback: "quiz" | "true_false" | "fill_blank" | "essay" = "quiz") {
  const normalized = normalizeKey(value);
  if (!normalized) return fallback;

  if (
    [
      "true_false",
      "true or false",
      "true_or_false",
      "truefalse",
      "verdadeiro_falso",
      "verdadeiro ou falso",
      "verdadeiro/falso",
      "booleano",
    ].includes(normalized)
  ) {
    return "true_false";
  }

  if (
    [
      "fill_blank",
      "fili_blank",
      "fill in the blank",
      "fill-in-the-blank",
      "fillblank",
      "completar_lacuna",
      "completar lacuna",
      "lacuna",
    ].includes(normalized)
  ) {
    return "fill_blank";
  }

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
    ].includes(normalized)
  ) {
    return "essay";
  }

  if (
    [
      "quiz",
      "questao",
      "pergunta",
      "multipla_escolha",
      "multipla escolha",
      "multiple_choice",
      "multi_select",
      "multiselect",
      "checkbox",
      "escolha",
      "questao_objetiva",
      "questao objetiva",
      "objetiva",
    ].includes(normalized)
  ) {
    return "quiz";
  }

  return fallback;
}

function asArray<T = any>(value: unknown): T[] {
  const parsed = parseJsonIfString(value);
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

function inferHeroFormat(value: unknown): PersonalizedHeroFormat {
  const normalized = normalizeKey(value);
  if (normalized === "cards") return "cards";
  if (normalized === "quiz") return "quiz";
  if (normalized === "pdf") return "pdf";
  if (
    normalized === "documento" ||
    normalized === "document" ||
    normalized === "doc" ||
    normalized === "docx" ||
    normalized === "docs"
  ) {
    return "documento";
  }
  if (
    normalized === "apresentacao" ||
    normalized === "apresentação" ||
    normalized === "presentation" ||
    normalized === "slides" ||
    normalized === "slide" ||
    normalized === "ppt" ||
    normalized === "pptx"
  ) {
    return "apresentacao";
  }
  if (normalized === "imagem" || normalized === "image" || normalized === "img") {
    return "imagem";
  }
  if (normalized === "audio") return "audio";
  if (normalized === "video") return "video";
  if (normalized === "markdown") return "markdown";
  if (normalized === "texto" || normalized === "text") return "texto";
  return null;
}

function normalizeBrainhexProfileKey(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_");

  if (!normalized) return "mastermind";

  const aliases: Record<string, string> = {
    seeker: "seeker",
    explorador: "seeker",
    buscador: "seeker",
    survivor: "survivor",
    sobrevivente: "survivor",
    daredevil: "daredevil",
    aventureiro: "daredevil",
    ousado: "daredevil",
    mastermind: "mastermind",
    estrategista: "mastermind",
    mestre: "mastermind",
    conqueror: "conqueror",
    conquistador: "conqueror",
    socializer: "socializer",
    socialiser: "socializer",
    socializador: "socializer",
    achiever: "achiever",
    realizador: "achiever",
  };

  return aliases[normalized] ?? normalized;
}

function extractProfileFromStoragePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();

  const match = decoded.match(/brainhex\/([^\/?#]+)/i);
  if (!match?.[1]) return null;
  return normalizeBrainhexProfileKey(match[1]);
}

function findProfileInNestedValue(value: unknown, depth = 0): string | null {
  if (depth > 6 || value == null) return null;

  const fromPath = extractProfileFromStoragePath(value);
  if (fromPath) return fromPath;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findProfileInNestedValue(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      const found = findProfileInNestedValue(nested, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

function looksLikeFileReference(value: unknown) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("\n")) return false;
  if (trimmed.startsWith("{") || trimmed.startsWith("<")) return false;
  if (isUrl(trimmed)) return true;
  return /(^|[\\/]).+\.[a-z0-9]{2,8}($|\?)/i.test(trimmed);
}

function resolveStorageDefaults(
  record: LooseRecord,
  materiais: LooseRecord,
  classeId: number,
  topicoId: number
) {
  const plano = asLooseRecord(record.plano);
  const profileKey = normalizeBrainhexProfileKey(
    pickString(
      record.brainhex_profile_key,
      plano.brainhex_profile_key,
      plano.perfil_dominante,
      (plano.editorial_metadata as any)?.perfil_editorial?.perfil_dominante,
      (plano.editorial_metadata as any)?.modelo_editorial?.personalizacao_brainhex
        ?.perfil_dominante,
      findProfileInNestedValue(materiais),
      findProfileInNestedValue(record.materiais),
      "mastermind"
    )
  );

  return {
    bucket: "conteudo_aluno",
    bucketName: "conteudo_aluno",
    storageBucket: "conteudo_aluno",
    storage_bucket: "conteudo_aluno",
    brainhex_profile_key: profileKey,
    profile_key: profileKey,
    perfil_dominante: profileKey,
    classe_id: classeId,
    topico_id: topicoId,
    storage_base_path: `brainhex/${profileKey}/classe-${classeId}/topico-${topicoId}`,
  } satisfies LooseRecord;
}

function extractRefreshPolicy(record: LooseRecord, aiPatch: ReturnType<typeof extractAIPatch>) {
  const plano = asLooseRecord(record.plano);
  const policyCandidate =
    plano.refreshPolicy ??
    plano.refresh_policy ??
    plano.repersonalizacao ??
    record.refreshPolicy ??
    record.refresh_policy;
  const rawPolicy =
    policyCandidate && typeof policyCandidate === "object"
      ? (policyCandidate as LooseRecord)
      : null;

  const rawMode = normalizeKey(rawPolicy?.mode ?? rawPolicy?.modo);
  const mode =
    rawMode === "once" || rawMode === "analysis" ? rawMode : "once";

  const triggerActions = asArray<string>(
    rawPolicy?.triggerActions ??
      rawPolicy?.trigger_actions ??
      rawPolicy?.actions ??
      rawPolicy?.acoes
  )
    .map((action) => normalizeDisplayText(action))
    .filter(Boolean);

  return {
    mode,
    triggerActions:
      triggerActions.length > 0
        ? triggerActions
        : mode === "analysis" && aiPatch?.triggers?.length
        ? DEFAULT_REPERSONALIZATION_ACTIONS
        : [],
  } as const;
}

function summarizePlan(record: LooseRecord) {
  const plano = asLooseRecord(record.plano);
  const justification =
    pickString(plano.justificativa, plano.justification, plano.razao) ?? null;

  const baseUiConfig = (plano.ui_config && typeof plano.ui_config === "object"
    ? plano.ui_config
    : null) as PersonalizedUiConfig | null;

  const heroFormat = inferHeroFormat(record.formato_prioritario) ??
    inferHeroFormat(plano.formato_prioritario) ??
    inferHeroFormat(asArray<string>(record.formatos_gerados)[0]) ??
    "pdf";

  const uiConfig: PersonalizedUiConfig = {
    tema: baseUiConfig?.tema ?? "focus",
    ritmo_conteudo: baseUiConfig?.ritmo_conteudo ?? "normal",
    complexidade_visual:
      baseUiConfig?.complexidade_visual ??
      (heroFormat === "audio" || heroFormat === "video" ? "minima" : "normal"),
    elementos_gamificacao: baseUiConfig?.elementos_gamificacao ?? "sutis",
    tom_feedbacks: baseUiConfig?.tom_feedbacks ?? "neutro",
    precisa_texto: baseUiConfig?.precisa_texto ?? heroFormat !== "pdf",
    tipo_modal: baseUiConfig?.tipo_modal ?? "dica",
    contexto_texto:
      (baseUiConfig?.contexto_texto as Record<string, unknown> | null) ?? null,
  };

  return {
    heroFormat,
    justification,
    level: pickString(plano.nivel),
    tone: pickString(plano.tom),
    style: pickString(plano.estilo),
    uiConfig,
  };
}

function buildMarkdownSummary(title: string, lines: string[]) {
  const cleanLines = lines.map((line) => normalizeDisplayText(line)).filter(Boolean);
  if (!cleanLines.length) return null;
  return [`## ${title}`, ...cleanLines].join("\n\n");
}

function buildMarkdownContentBlock(params: {
  id: string;
  title: string;
  lines: string[];
  metadata?: LooseRecord | null;
}) {
  const markdown = buildMarkdownSummary(params.title, params.lines);
  if (!markdown) return null;

  return normalizeContentBlock(
    {
      id: params.id,
      tipo: "markdown",
      markdown,
      title: params.title,
      metadata: params.metadata ?? undefined,
    },
    params.id
  );
}

function normalizeTextList(value: unknown) {
  return asArray<any>(value)
    .map((entry) => normalizeDisplayText(entry))
    .filter(Boolean);
}

function normalizePresentationSlides(value: unknown) {
  return asArray<any>(value)
    .map((slide, index) => {
      if (typeof slide === "string" && slide.trim()) {
        return {
          title: `Slide ${index + 1}`,
          points: [slide.trim()],
        };
      }

      if (!slide || typeof slide !== "object") return null;

      const title = pickString(slide.titulo, slide.title, `Slide ${index + 1}`);
      const points = normalizeTextList(slide.pontos ?? slide.points ?? slide.bullets ?? slide.topics);
      return title || points.length
        ? {
            title: title ?? `Slide ${index + 1}`,
            points,
          }
        : null;
    })
    .filter(
      (slide): slide is { title: string; points: string[] } =>
        Boolean(slide)
    );
}

function normalizeStudyCards(rawCards: unknown, prefix: string) {
  return asArray<any>(rawCards)
    .map((card, index): PersonalizedStudyCard | null => {
      if (!card) return null;

      const titulo = pickString(card.titulo, card.title, card.frente, card.pergunta);
      const frente = pickString(card.frente, card.titulo, card.title, card.pergunta);
      const verso = pickString(
        card.verso,
        card.descricao,
        card.description,
        card.resposta,
        card.explicacao
      );

      if (!frente || !verso) return null;

      return {
        id: `${prefix}-${index}`,
        titulo: titulo ?? null,
        frente,
        verso,
        descricao: pickString(card.descricao, card.description),
        imagemUrl: pickString(card.imagem_url, card.imagemUrl, card.image_url),
      };
    })
    .filter((card): card is PersonalizedStudyCard => Boolean(card));
}

function createCardsBlock(cards: PersonalizedStudyCard[], key: string): ContentBlock | null {
  if (!cards.length) return null;

  return {
    id: key,
    tipo: "cards",
    payload: {
      title: "Cards de estudo",
      texto: "Revise os conceitos principais neste deck personalizado.",
      cards: cards.map((card) => ({
        id: card.id,
        titulo: card.titulo,
        frente: card.frente,
        verso: card.verso,
        descricao: card.descricao,
        imagemUrl: card.imagemUrl,
      })),
    },
  };
}

function normalizeQuizActivity(rawQuiz: unknown, topicoId: number, prefix: string) {
  const parsedRawQuiz = parseJsonIfString(rawQuiz);
  const quizObject =
    parsedRawQuiz && typeof parsedRawQuiz === "object" && !Array.isArray(parsedRawQuiz)
      ? (parsedRawQuiz as LooseRecord)
      : null;
  const activityCandidates = asArray<any>(
    quizObject?.atividades ?? quizObject?.activities
  );
  const baseActivity =
    activityCandidates.find((item) => item && typeof item === "object") ?? quizObject;
  const questionSource =
    asArray<any>(baseActivity?.questoes).length > 0
      ? asArray<any>(baseActivity?.questoes)
      : activityCandidates.length > 0
      ? activityCandidates
      : asArray<any>(parsedRawQuiz);
  const questions = questionSource
    .map((item, index): PersonalizedQuestion | null => {
      if (!item) return null;

      const alternativas = asArray<string>(
        Array.isArray(item.alternativas)
          ? item.alternativas
          : typeof item.alternativas === "string"
          ? item.alternativas
              .split("|")
              .map((entry: string) => entry.trim())
              .filter(Boolean)
          : []
      );

      const enunciado = pickString(item.pergunta, item.enunciado, item.title, item.titulo);
      if (!enunciado) return null;

      return {
        id:
          pickPositiveInt(item.id, item.questao_id, item.question_id) ??
          stableNegativeId(`${prefix}-questao-${index}`),
        enunciado,
        tipo: normalizeQuestionType(item.tipo, "quiz"),
        alternativas: alternativas.length ? alternativas : null,
        resposta_correta: pickString(item.resposta_correta, item.resposta, item.correta),
        explicacao: pickString(item.explicacao, item.feedback, item.comentario),
        midia_url: pickString(item.midia_url, item.imagem_url, item.video_url, item.audio_url),
        anexos: asArray<any>(item.anexos),
        arquivos: asArray<any>(item.arquivos),
        midias: asArray<any>(item.midias),
        pdf_url: pickString(item.pdf_url, item.pdfUrl),
        documento_url: pickString(item.documento_url, item.documentoUrl, item.file_url, item.arquivo_url),
        apresentacao_url: pickString(item.apresentacao_url, item.apresentacaoUrl),
        audio_url: pickString(item.audio_url, item.audioUrl),
        video_url: pickString(item.video_url, item.videoUrl),
        imagem_url: pickString(item.imagem_url, item.image_url, item.imageUrl),
        isPersonalizedLocal: true,
      };
    })
    .filter((question): question is PersonalizedQuestion => Boolean(question));

  if (!questions.length) return null;

  const activity: PersonalizedActivity = {
    id:
      pickPositiveInt(baseActivity?.id, baseActivity?.atividade_id, baseActivity?.activity_id) ??
      stableNegativeId(`${prefix}-atividade`),
    titulo:
      pickString(
        baseActivity?.titulo,
        baseActivity?.title,
        baseActivity?.nome
      ) ?? "Quiz personalizado",
    descricao:
      pickString(
        baseActivity?.descricao,
        baseActivity?.description,
        baseActivity?.conteudo,
        baseActivity?.texto
      ) ?? "Atividade gerada para o seu perfil de aprendizagem.",
    tipo: normalizeQuestionType(baseActivity?.tipo, "quiz"),
    status: null,
    pontuacao_maxima: Number(baseActivity?.pontuacao_maxima ?? 100) || 100,
    data_entrega: null,
    topico_id:
      pickPositiveInt(baseActivity?.topico_id, baseActivity?.topicoId, quizObject?.topico_id, quizObject?.topicoId) ??
      topicoId,
    questoes: questions,
    conteudo_ids: [],
    anexos: asArray<any>(baseActivity?.anexos ?? quizObject?.anexos),
    arquivos: asArray<any>(baseActivity?.arquivos ?? quizObject?.arquivos),
    midias: asArray<any>(baseActivity?.midias ?? quizObject?.midias),
    pdf_url: pickString(baseActivity?.pdf_url, baseActivity?.pdfUrl, quizObject?.pdf_url, quizObject?.pdfUrl),
    documento_url: pickString(
      baseActivity?.documento_url,
      baseActivity?.documentoUrl,
      baseActivity?.file_url,
      baseActivity?.arquivo_url,
      quizObject?.documento_url,
      quizObject?.documentoUrl,
      quizObject?.file_url,
      quizObject?.arquivo_url
    ),
    apresentacao_url: pickString(
      baseActivity?.apresentacao_url,
      baseActivity?.apresentacaoUrl,
      quizObject?.apresentacao_url,
      quizObject?.apresentacaoUrl
    ),
    audio_url: pickString(baseActivity?.audio_url, baseActivity?.audioUrl, quizObject?.audio_url, quizObject?.audioUrl),
    video_url: pickString(baseActivity?.video_url, baseActivity?.videoUrl, quizObject?.video_url, quizObject?.videoUrl),
    imagem_url: pickString(
      baseActivity?.imagem_url,
      baseActivity?.image_url,
      baseActivity?.imageUrl,
      quizObject?.imagem_url,
      quizObject?.image_url,
      quizObject?.imageUrl
    ),
    isPersonalizedLocal: true,
    personalizationKey: prefix,
  };

  return activity;
}

function normalizeMediaBlocks(
  tipo: ContentBlockType,
  raw: unknown,
  key: string,
  inheritedMetadata: LooseRecord = {}
) {
  const rawObject = asLooseRecord(raw);
  const rawText = typeof raw === "string" ? raw.trim() : "";
  const title = pickString(rawObject.titulo, rawObject.title, rawObject.nome);
  const payload = asLooseRecord(rawObject.payload);
  const metadataFromRaw = asLooseRecord(rawObject.metadata);
  const metadataFromPayload =
    payload.metadata && typeof payload.metadata === "object"
      ? (payload.metadata as LooseRecord)
      : {};
  const rawTextAsFileRef = looksLikeFileReference(rawText) ? rawText : null;
  const urlFromMetadata = pickString(
    metadataFromRaw.arquivo_url,
    metadataFromRaw.storage_path,
    metadataFromRaw.path,
    metadataFromRaw.object_path,
    metadataFromRaw.storagePath,
    metadataFromRaw.objectPath,
    metadataFromRaw.url,
    metadataFromRaw.uri,
    metadataFromRaw.src,
    metadataFromPayload.arquivo_url,
    metadataFromPayload.storage_path,
    metadataFromPayload.path,
    metadataFromPayload.object_path,
    metadataFromPayload.storagePath,
    metadataFromPayload.objectPath,
    metadataFromPayload.url,
    metadataFromPayload.uri,
    metadataFromPayload.src
  );
  const url = pickString(
    rawObject.arquivo_url,
    rawObject.storage_path,
    rawObject.path,
    rawObject.object_path,
    rawObject.storagePath,
    rawObject.objectPath,
    payload.arquivo_url,
    payload.storage_path,
    payload.path,
    payload.object_path,
    payload.storagePath,
    payload.objectPath,
    rawObject.url,
    rawObject.uri,
    rawObject.src,
    payload.url,
    payload.uri,
    payload.src,
    urlFromMetadata,
    rawTextAsFileRef
  );
  const bucketValue =
    pickString(
      rawObject.bucket,
      payload.bucket,
      metadataFromRaw.bucket,
      metadataFromRaw.bucketName,
      metadataFromRaw.storageBucket,
      metadataFromRaw.storage_bucket,
      metadataFromPayload.bucket,
      metadataFromPayload.bucketName,
      metadataFromPayload.storageBucket,
      metadataFromPayload.storage_bucket
    ) ?? inheritedMetadata.bucket ?? "conteudo_aluno";
  const metadata = {
    ...inheritedMetadata,
    ...metadataFromRaw,
    ...metadataFromPayload,
    itemKey:
      pickString(rawObject.itemKey, rawObject.item_key, payload.itemKey, payload.item_key) ?? undefined,
    sourceItemKey:
      pickString(
        rawObject.sourceItemKey,
        rawObject.source_item_key,
        payload.sourceItemKey,
        payload.source_item_key
      ) ?? undefined,
    contentId:
      Number(
        rawObject.contentId ??
          rawObject.content_id ??
          payload.contentId ??
          payload.content_id ??
          Number.NaN
      ) || undefined,
    contentIdRef:
      Number(
        rawObject.contentIdRef ??
          rawObject.content_id_ref ??
          payload.contentIdRef ??
          payload.content_id_ref ??
          Number.NaN
      ) || undefined,
    bucket: bucketValue,
    bucketName: bucketValue,
    storageBucket: bucketValue,
    storage_bucket: bucketValue,
    fonte: "personalizado",
  };

  const inferFileTypeFromUrl = (candidateUrl: string): ContentBlockType | null => {
    if (isPdfUrl(candidateUrl)) return "pdf";
    if (isPresentationUrl(candidateUrl)) return "apresentacao";
    if (isDocumentUrl(candidateUrl)) return "documento";
    if (isAudioUrl(candidateUrl)) return "audio";
    if (isVideoUrl(candidateUrl)) return "video";
    if (isImageUrl(candidateUrl)) return "imagem";
    if (isMarkdownUrl(candidateUrl)) return "markdown";
    return null;
  };

  if (tipo === "markdown") {
    const markdownUrlRaw = pickString(
      url,
      payload.markdown_url,
      payload.markdownUrl,
      rawObject.markdown_url,
      rawObject.markdownUrl
    );
    if (!markdownUrlRaw) return [];

    const markdownUrl = buildSupabasePublicStorageUrl(markdownUrlRaw, {
      bucket: String(bucketValue ?? "conteudo_aluno"),
    });

    const inferredType = inferFileTypeFromUrl(markdownUrl);
    if (inferredType && inferredType !== "markdown") {
      const block = normalizeContentBlock(
        {
          id: key,
          tipo: inferredType,
          url: markdownUrl,
          title,
          metadata:
            inferredType === "pdf" || inferredType === "documento" || inferredType === "apresentacao"
              ? {
                  ...metadata,
                  defaultDisplayMode: "pagina",
                }
              : metadata,
        },
        key
      );
      return block ? [block] : [];
    }

    const block = normalizeContentBlock(
      {
        id: key,
        tipo: "markdown",
        markdown: null,
        url: markdownUrl,
        title,
        metadata,
      },
      key
    );
    return block ? [block] : [];
  }

  if (tipo === "imagem") {
    const imageUrl =
      pickString(
        url,
        payload.url,
        payload.uri,
        payload.src,
        payload.image_url,
        payload.imageUrl,
        payload.imagem_url
      ) ?? null;

    if (imageUrl && isImageUrl(imageUrl)) {
      const block = normalizeContentBlock(
        {
          id: key,
          tipo,
          url: imageUrl,
          title,
          legenda: pickString(payload.legenda, rawObject.legenda),
          metadata,
        },
        key
      );
      return block ? [block] : [];
    }

    const promptImagem = pickString(
      payload.prompt_imagem,
      payload.image_prompt,
      payload.prompt,
      rawObject.prompt_imagem,
      rawObject.image_prompt
    );
    const legenda = pickString(payload.legenda, rawObject.legenda);

    const briefingBlock = buildMarkdownContentBlock({
      id: `${key}-briefing`,
      title: title ?? "Imagem personalizada",
      lines: [legenda ?? "", promptImagem ? `Briefing visual: ${promptImagem}` : ""],
      metadata,
    });
    return briefingBlock ? [briefingBlock] : [];
  }

  if (tipo === "audio") {
    if (url && isAudioUrl(url)) {
      const block = normalizeContentBlock(
        {
          id: key,
          tipo,
          url,
          title,
          metadata,
        },
        key
      );
      return block ? [block] : [];
    }

    const roteiro = pickString(payload.roteiro, rawObject.roteiro);
    return [
      buildMarkdownContentBlock({
        id: `${key}-intro`,
        title: title ?? "Audio personalizado",
        lines: [
          payload.duracao_estimada_seg
            ? `Duracao estimada: ${payload.duracao_estimada_seg}s`
            : "",
        ],
        metadata,
      }),
      buildMarkdownContentBlock({
        id: `${key}-roteiro`,
        title: "Roteiro guiado",
        lines: [roteiro ?? ""],
        metadata,
      }),
    ].filter((block): block is ContentBlock => Boolean(block));
  }

  if (tipo === "video") {
    if (url && isVideoUrl(url)) {
      const block = normalizeContentBlock(
        {
          id: key,
          tipo,
          url,
          title,
          metadata,
        },
        key
      );
      return block ? [block] : [];
    }

    const roteiro = pickString(payload.roteiro, rawObject.roteiro);
    const cenas = asArray<string>(payload.cenas).filter(Boolean);
    const blocks: ContentBlock[] = [];

    const roteiroBlock = buildMarkdownContentBlock({
      id: `${key}-roteiro`,
      title: title ?? "Video personalizado",
      lines: [roteiro ?? ""],
      metadata,
    });
    if (roteiroBlock) blocks.push(roteiroBlock);

    cenas.forEach((cena, index) => {
      const sceneBlock = buildMarkdownContentBlock({
        id: `${key}-scene-${index + 1}`,
        title: `Cena ${index + 1}`,
        lines: [cena],
        metadata: {
          ...metadata,
          sequence: index + 1,
        },
      });
      if (sceneBlock) blocks.push(sceneBlock);
    });

    return blocks;
  }

  if (tipo === "documento") {
    if (url && isPdfUrl(url)) {
      const block = normalizeContentBlock(
        {
          id: key,
          tipo: "pdf",
          url,
          title,
          metadata: {
            ...metadata,
            defaultDisplayMode: "pagina",
          },
        },
        key
      );
      return block ? [block] : [];
    }

    if (url && isDocumentUrl(url)) {
      const block = normalizeContentBlock(
        {
          id: key,
          tipo,
          url,
          title,
          metadata: {
            ...metadata,
            defaultDisplayMode: "pagina",
          },
        },
        key
      );
      return block ? [block] : [];
    }

    const documentTitle =
      pickString(payload.titulo, title, "Documento personalizado") ?? "Documento personalizado";
    const sections = normalizeTextList(
      payload.secoes ?? payload.blocos ?? rawObject.secoes ?? rawObject.blocos
    );
    const blocks: ContentBlock[] = [];

    const resumoBlock = buildMarkdownContentBlock({
      id: `${key}-resumo`,
      title: documentTitle,
      lines: [pickString(payload.resumo, rawObject.resumo) ?? ""],
      metadata,
    });
    if (resumoBlock) blocks.push(resumoBlock);

    sections.forEach((section, index) => {
      const sectionBlock = buildMarkdownContentBlock({
        id: `${key}-section-${index + 1}`,
        title: `Etapa ${index + 1}`,
        lines: [section],
        metadata: {
          ...metadata,
          sequence: index + 1,
        },
      });
      if (sectionBlock) blocks.push(sectionBlock);
    });

    return blocks;
  }

  if (tipo === "apresentacao") {
    if (url && isPdfUrl(url)) {
      const block = normalizeContentBlock(
        {
          id: key,
          tipo: "pdf",
          url,
          title,
          metadata: {
            ...metadata,
            defaultDisplayMode: "pagina",
          },
        },
        key
      );
      return block ? [block] : [];
    }

    if (url && isDocumentUrl(url)) {
      const block = normalizeContentBlock(
        {
          id: key,
          tipo: "documento",
          url,
          title,
          metadata: {
            ...metadata,
            defaultDisplayMode: "pagina",
          },
        },
        key
      );
      return block ? [block] : [];
    }

    if (url && isPresentationUrl(url)) {
      const block = normalizeContentBlock(
        {
          id: key,
          tipo,
          url,
          title,
          metadata: {
            ...metadata,
            defaultDisplayMode: "pagina",
          },
        },
        key
      );
      return block ? [block] : [];
    }

    const presentationTitle =
      pickString(payload.titulo, title, "Apresentacao personalizada") ??
      "Apresentacao personalizada";
    const slides = normalizePresentationSlides(payload.slides ?? rawObject.slides);
    const blocks: ContentBlock[] = [];

    const aberturaBlock = buildMarkdownContentBlock({
      id: `${key}-abertura`,
      title: presentationTitle,
      lines: [
        pickString(payload.abertura, rawObject.abertura, payload.resumo, rawObject.resumo) ?? "",
      ],
      metadata,
    });
    if (aberturaBlock) blocks.push(aberturaBlock);

    slides.forEach((slide, index) => {
      const slideBlock = buildMarkdownContentBlock({
        id: `${key}-slide-${index + 1}`,
        title: slide.title,
        lines: slide.points,
        metadata: {
          ...metadata,
          sequence: index + 1,
          slideTitle: slide.title,
        },
      });
      if (slideBlock) blocks.push(slideBlock);
    });

    return blocks;
  }

  if (tipo === "pdf") {
    if (url) {
      const block = normalizeContentBlock(
        {
          id: key,
          tipo,
          url,
          title,
          metadata: {
            ...metadata,
            defaultDisplayMode: "pagina",
          },
        },
        key
      );
      return block ? [block] : [];
    }

    const pdfTitle =
      pickString(payload.titulo, title, "Resumo personalizado") ?? "Resumo personalizado";
    const sections = asArray<string>(payload.secoes).filter(Boolean);
    const blocks: ContentBlock[] = [];

    const resumoBlock = buildMarkdownContentBlock({
      id: `${key}-resumo`,
      title: pdfTitle,
      lines: [pickString(payload.resumo) ?? ""],
      metadata,
    });
    if (resumoBlock) blocks.push(resumoBlock);

    sections.forEach((section, index) => {
      const sectionBlock = buildMarkdownContentBlock({
        id: `${key}-section-${index + 1}`,
        title: `Passo ${index + 1}`,
        lines: [section],
        metadata: {
          ...metadata,
          sequence: index + 1,
        },
      });
      if (sectionBlock) blocks.push(sectionBlock);
    });

    return blocks;
  }

  return [];
}

function buildNodeHint(params: {
  topicoId: number;
  heroFormat: PersonalizedHeroFormat;
  record: LooseRecord;
  summary: string | null;
}) {
  const plano = asLooseRecord(params.record.plano);

  const formatos = asArray<string>(params.record.formatos_gerados).filter(Boolean);

  const hint: PersonalizedNodeHint = {
    topicoId: params.topicoId,
    hasPersonalizedContent: formatos.length > 0,
    heroFormat: params.heroFormat,
    recommended: Boolean(plano.formato_prioritario || params.record.formato_prioritario),
    isFocus: false,
    summary: params.summary,
    title: pickString(plano.titulo, plano.nome),
    formatos,
  };

  return hint;
}

function extractAIPatch(record: LooseRecord) {
  const plano = asLooseRecord(record.plano);

  return normalizeIAPersonalizationPatch(
    parseJsonIfString(
      record.aiPatch ??
        record.ai_patch ??
        plano.aiPatch ??
        plano.ai_patch ??
        plano.iaPatch ??
        plano.ia_patch ??
        null
    )
  );
}

function normalizeServerQuestions(rawQuestions: unknown, prefix: string) {
  return asArray<any>(rawQuestions)
    .map((item, index): PersonalizedQuestion | null => {
      if (!item || typeof item !== "object") return null;

      const alternativas = asArray<string>(
        Array.isArray(item.alternativas)
          ? item.alternativas
          : typeof item.alternativas === "string"
          ? item.alternativas
              .split("|")
              .map((entry: string) => entry.trim())
              .filter(Boolean)
          : []
      );

      const enunciado = pickString(item.enunciado, item.pergunta, item.titulo, item.title);
      if (!enunciado) return null;

      return {
        id:
          pickPositiveInt(item.id, item.questao_id, item.question_id) ??
          stableNegativeId(`${prefix}-questao-${index}`),
        enunciado,
        tipo: normalizeQuestionType(item.tipo ?? item.kind ?? item.type, "quiz"),
        alternativas: alternativas.length ? alternativas : null,
        resposta_correta: pickString(
          item.resposta_correta,
          item.resposta,
          item.correta,
          item.correct_answer
        ),
        explicacao: pickString(item.explicacao, item.feedback, item.description),
        midia_url: pickString(item.midia_url, item.imagem_url, item.video_url, item.audio_url),
        anexos: asArray<any>(item.anexos),
        arquivos: asArray<any>(item.arquivos),
        midias: asArray<any>(item.midias),
        pdf_url: pickString(item.pdf_url, item.pdfUrl),
        documento_url: pickString(
          item.documento_url,
          item.documentoUrl,
          item.file_url,
          item.arquivo_url
        ),
        apresentacao_url: pickString(item.apresentacao_url, item.apresentacaoUrl),
        audio_url: pickString(item.audio_url, item.audioUrl),
        video_url: pickString(item.video_url, item.videoUrl),
        imagem_url: pickString(item.imagem_url, item.image_url, item.imageUrl),
        isPersonalizedLocal: true,
      };
    })
    .filter((question): question is PersonalizedQuestion => Boolean(question));
}

function normalizeServerActivity(
  rawActivity: unknown,
  topicoId: number,
  itemKey: string,
  fallbackIndex: number,
  fallbackTitle: string,
  fallbackDescription: string | null,
  fallbackScore: number | null
) {
  const activity = rawActivity && typeof rawActivity === "object" ? (rawActivity as LooseRecord) : {};
  const questoes = normalizeServerQuestions(
    activity.questoes ?? activity.questions ?? activity.itens,
    itemKey
  );

  const normalizedActivity: PersonalizedActivity = {
    id:
      pickPositiveInt(activity.id, activity.atividade_id, activity.activity_id) ??
      stableNegativeId(`${itemKey}-atividade-${fallbackIndex}`),
    titulo: pickString(activity.titulo, activity.title, fallbackTitle) ?? fallbackTitle,
    descricao:
      pickString(activity.descricao, activity.description, fallbackDescription) ?? fallbackDescription,
    conteudo: pickString(activity.conteudo, activity.texto, activity.content) ?? null,
    tipo: normalizeQuestionType(activity.tipo ?? activity.kind ?? activity.type, "quiz"),
    status: pickString(activity.status) ?? null,
    pontuacao_maxima:
      Number(
        activity.pontuacao_maxima ??
          activity.pontuacaoMaxima ??
          activity.score_max ??
          fallbackScore ??
          Number.NaN
      ) || null,
    data_entrega: pickString(activity.data_entrega, activity.dataEntrega, activity.deadline) ?? null,
    topico_id: pickPositiveInt(activity.topico_id, activity.topicoId, topicoId) ?? topicoId,
    questoes,
    conteudo_ids: asArray<any>(activity.conteudo_ids ?? activity.content_ids ?? activity.conteudos)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value)),
    anexos: asArray<any>(activity.anexos),
    arquivos: asArray<any>(activity.arquivos),
    midias: asArray<any>(activity.midias),
    pdf_url: pickString(activity.pdf_url, activity.pdfUrl),
    documento_url: pickString(
      activity.documento_url,
      activity.documentoUrl,
      activity.file_url,
      activity.arquivo_url
    ),
    apresentacao_url: pickString(activity.apresentacao_url, activity.apresentacaoUrl),
    audio_url: pickString(activity.audio_url, activity.audioUrl),
    video_url: pickString(activity.video_url, activity.videoUrl),
    imagem_url: pickString(activity.imagem_url, activity.image_url, activity.imageUrl),
    isPersonalizedLocal: true,
    personalizationKey: itemKey,
  };

  return normalizedActivity;
}

function normalizeRemotePersonalizedSteps(
  rawSteps: unknown,
  topicoId: number,
  recordId: number
): PersonalizedTopicStep[] {
  return asArray<any>(rawSteps)
    .map((rawStep, index): PersonalizedTopicStep | null => {
      if (!rawStep || typeof rawStep !== "object") return null;

      const kind = normalizeKey(rawStep.kind) === "activity" ? "activity" : "content";
      const title =
        pickString(rawStep.title, rawStep.titulo, `Etapa personalizada ${index + 1}`) ??
        `Etapa personalizada ${index + 1}`;
      const description = pickString(
        rawStep.description,
        rawStep.descricao,
        rawStep.resumo,
        rawStep.texto
      );
      const itemKey =
        pickString(
          rawStep.item_key,
          rawStep.itemKey,
          rawStep.metadata?.item_key,
          rawStep.metadata?.itemKey
        ) ?? `personalized:${topicoId}:${kind}:${index + 1}`;
      const metadata = {
        ...((rawStep.metadata && typeof rawStep.metadata === "object"
          ? rawStep.metadata
          : {}) as LooseRecord),
        itemKey,
      };
      const ordem =
        Number(rawStep.ordem ?? rawStep.order ?? rawStep.index ?? Number.NaN) || index;
      const pontuacaoMaxima =
        Number(
          rawStep.pontuacao_maxima ??
            rawStep.pontuacaoMaxima ??
            rawStep.score_max ??
            Number.NaN
        ) || null;

      if (kind === "activity") {
        const activity = normalizeServerActivity(
          rawStep.activity ?? rawStep.atividade ?? rawStep,
          topicoId,
          itemKey,
          index,
          title,
          description,
          pontuacaoMaxima
        );

        return {
          item_key: itemKey,
          ordem,
          kind,
          title,
          description,
          required: rawStep.required !== false,
          pontuacao_maxima: pontuacaoMaxima ?? activity.pontuacao_maxima ?? null,
          blocks: [],
          activity,
          metadata,
        };
      }

      const blocks = asArray<any>(rawStep.blocks)
        .map((block, blockIndex) => {
          if (!block || typeof block !== "object") {
            return normalizeContentBlock(block, `${itemKey}-block-${blockIndex + 1}`);
          }

          const blockPayload =
            block.payload && typeof block.payload === "object"
              ? {
                  ...block.payload,
                  metadata: {
                    ...(metadata ?? {}),
                    ...((block.payload.metadata && typeof block.payload.metadata === "object"
                      ? block.payload.metadata
                      : {}) as LooseRecord),
                  },
                }
              : block.payload;

          return normalizeContentBlock(
            {
              ...block,
              payload: blockPayload,
              metadata: {
                ...(metadata ?? {}),
                ...((block.metadata && typeof block.metadata === "object"
                  ? block.metadata
                  : {}) as LooseRecord),
              },
            },
            `${itemKey}-block-${blockIndex + 1}`
          );
        })
        .filter((block): block is ContentBlock => Boolean(block));

      if (!blocks.length) {
        const inferredSources = [
          rawStep.conteudo,
          rawStep.content,
          rawStep.material,
          rawStep.materiais,
        ];

        const inferredBlocks = inferredSources.flatMap((source, sourceIndex) =>
          buildContentBlocks(source).map((block, blockIndex) => {
            const normalized = normalizeContentBlock(
              {
                ...block,
                payload:
                  typeof block.payload === "object" && block.payload
                    ? {
                        ...block.payload,
                        metadata: {
                          ...(metadata ?? {}),
                          ...((block.payload.metadata &&
                          typeof block.payload.metadata === "object"
                            ? block.payload.metadata
                            : {}) as LooseRecord),
                        },
                      }
                    : block.payload,
                metadata: {
                  ...(metadata ?? {}),
                },
              },
              `${itemKey}-inferred-${sourceIndex + 1}-${blockIndex + 1}`
            );

            return normalized;
          })
        );

        blocks.push(
          ...inferredBlocks.filter((block): block is ContentBlock => Boolean(block))
        );
      }

      const fallbackBlock =
        blocks.length > 0
          ? null
          : buildMarkdownContentBlock({
              id: `${itemKey}-intro-${recordId}`,
              title,
              lines: [description ?? ""],
              metadata,
            });

      return {
        item_key: itemKey,
        ordem,
        kind,
        title,
        description,
        required: rawStep.required !== false,
        pontuacao_maxima: pontuacaoMaxima,
        blocks: fallbackBlock ? [fallbackBlock] : blocks,
        activity: null,
        metadata,
      };
    })
    .filter((step): step is PersonalizedTopicStep => Boolean(step))
    .sort((left, right) => left.ordem - right.ordem);
}

export function normalizePersonalizedTopicPayload({
  record,
  classeId,
  topicoId,
  fallbackBlocks,
  fallbackActivities,
  presentationMode = "conteudo_primeiro",
  source = "remote",
}: NormalizeInput): PersonalizedTopicPayload {
  const materiais = asLooseRecord(record.materiais);
  const storageDefaults = resolveStorageDefaults(record, materiais, classeId, topicoId);
  const plano = asLooseRecord(record.plano);
  const remoteSteps = normalizeRemotePersonalizedSteps(
    parseJsonIfString(record.steps),
    topicoId,
    Number(record.id ?? 0)
  );
  const planSummary = summarizePlan(record);
  const aiPatch = extractAIPatch(record);
  const refreshPolicy = extractRefreshPolicy(record, aiPatch);
  const studyCards = normalizeStudyCards(materiais.cards?.payload, `cards-${topicoId}-${record.id}`);
  const cardsBlock = createCardsBlock(studyCards, `cards-block-${topicoId}-${record.id}`);
  const quizActivity = normalizeQuizActivity(
    materiais.quiz?.payload,
    topicoId,
    `quiz-${topicoId}-${record.id}`
  );
  const markdownBlocks = normalizeMediaBlocks(
    "markdown",
    materiais.markdown ?? materiais.md ?? materiais.texto ?? {},
    `markdown-${topicoId}-${record.id}`,
    storageDefaults
  );
  const pdfBlocks = normalizeMediaBlocks(
    "pdf",
    materiais.pdf ?? {},
    `pdf-${topicoId}-${record.id}`,
    storageDefaults
  );
  const documentBlocks = normalizeMediaBlocks(
    "documento",
    materiais.documento ?? {},
    `documento-${topicoId}-${record.id}`,
    storageDefaults
  );
  const presentationBlocks = normalizeMediaBlocks(
    "apresentacao",
    materiais.apresentacao ?? {},
    `apresentacao-${topicoId}-${record.id}`,
    storageDefaults
  );
  const imageBlocks = normalizeMediaBlocks(
    "imagem",
    materiais.imagem ?? {},
    `imagem-${topicoId}-${record.id}`,
    storageDefaults
  );
  const audioBlocks = normalizeMediaBlocks(
    "audio",
    materiais.audio ?? {},
    `audio-${topicoId}-${record.id}`,
    storageDefaults
  );
  const videoBlocks = normalizeMediaBlocks(
    "video",
    materiais.video ?? {},
    `video-${topicoId}-${record.id}`,
    storageDefaults
  );

  const summaryText =
    pickString(
      plano.justificativa,
      materiais.pdf?.payload?.resumo,
      materiais.documento?.payload?.resumo,
      materiais.apresentacao?.payload?.abertura,
      materiais.imagem?.payload?.legenda
    ) ?? null;

  const introBlock =
    planSummary.uiConfig.precisa_texto && summaryText
      ? normalizeContentBlock(
          {
            id: `intro-${topicoId}-${record.id}`,
            tipo: "markdown",
            markdown: buildMarkdownSummary("Por que este formato?", [summaryText]) ?? summaryText,
          },
          `intro-${topicoId}-${record.id}`
        )
      : null;

  const derivedPrimaryBlocks = orderContentBlocksByMode(
    [
      introBlock,
      ...markdownBlocks,
      ...pdfBlocks,
      ...documentBlocks,
      ...presentationBlocks,
      ...imageBlocks,
      ...audioBlocks,
      ...videoBlocks,
      cardsBlock,
    ].filter(
      (block): block is ContentBlock => Boolean(block)
    ),
    {
      modo: presentationMode,
      heroFormat: planSummary.heroFormat,
      uiConfig: planSummary.uiConfig,
    }
  );
  const derivedSteps: PersonalizedTopicStep[] = [
    ...derivedPrimaryBlocks.map((block, index) => ({
      item_key:
        (typeof block.payload === "object" &&
          block.payload &&
          typeof block.payload.metadata === "object" &&
          block.payload.metadata &&
          typeof (block.payload.metadata as any).itemKey === "string" &&
          (block.payload.metadata as any).itemKey.trim()) ||
        `personalized:${topicoId}:content:${index + 1}`,
      ordem: index,
      kind: "content" as const,
      title:
        (typeof block.payload === "object" &&
          (pickString((block.payload as any).title, (block.payload as any).titulo) ?? null)) ||
        `Etapa personalizada ${index + 1}`,
      description:
        typeof block.payload === "object"
          ? pickString(
              (block.payload as any).descricao,
              (block.payload as any).description,
              (block.payload as any).resumo,
              (block.payload as any).texto
            )
          : null,
      required: true,
      pontuacao_maxima: block.tipo === "cards" ? 40 : 20,
      blocks: [block],
      activity: null,
      metadata:
        typeof block.payload === "object" && typeof (block.payload as any).metadata === "object"
          ? ((block.payload as any).metadata as Record<string, unknown>)
          : null,
    })),
    ...(quizActivity
      ? [
          {
            item_key: quizActivity.personalizationKey ?? `personalized:${topicoId}:activity:1`,
            ordem: derivedPrimaryBlocks.length,
            kind: "activity" as const,
            title: quizActivity.titulo,
            description: quizActivity.descricao,
            required: true,
            pontuacao_maxima: quizActivity.pontuacao_maxima,
            blocks: [],
            activity: quizActivity,
            metadata: null,
          },
        ]
      : []),
  ];
  const primaryBlocks =
    remoteSteps.length > 0
      ? remoteSteps.flatMap((step) => (step.kind === "content" ? step.blocks ?? [] : []))
      : derivedPrimaryBlocks;
  const primaryActivities =
    remoteSteps.length > 0
      ? remoteSteps.flatMap((step) =>
          step.kind === "activity" && step.activity ? [step.activity] : []
        )
      : quizActivity
      ? [quizActivity]
      : [];
  const steps = remoteSteps.length > 0 ? remoteSteps : derivedSteps;

  return {
    topicoId,
    classeId,
    heroFormat: planSummary.heroFormat,
    steps,
    primaryBlocks,
    primaryActivities,
    studyCards,
    fallbackBlocks,
    fallbackActivities,
    materialSummaries: [
      markdownBlocks[0]
        ? {
            id: markdownBlocks[0].id.toString(),
            tipo: "markdown",
            title:
              typeof markdownBlocks[0].payload === "object"
                ? markdownBlocks[0].payload.title ?? null
                : null,
            description: "Texto em markdown personalizado",
            hasArquivoUrl: Boolean(
              materiais.markdown?.arquivo_url ??
                materiais.markdown?.storage_path ??
                materiais.md?.arquivo_url ??
                materiais.md?.storage_path
            ),
            source: "personalizado" as const,
          }
        : null,
      pdfBlocks[0]
        ? {
            id: pdfBlocks[0].id.toString(),
            tipo: "pdf",
            title:
              typeof pdfBlocks[0].payload === "object"
                ? pdfBlocks[0].payload.title ?? null
                : null,
            description: "Resumo em PDF personalizado",
            hasArquivoUrl: Boolean(materiais.pdf?.arquivo_url),
            source: "personalizado" as const,
          }
        : null,
      documentBlocks[0]
        ? {
            id: documentBlocks[0].id.toString(),
            tipo: "documento",
            title:
              typeof documentBlocks[0].payload === "object"
                ? documentBlocks[0].payload.title ?? null
                : null,
            description: "Documento guiado personalizado",
            hasArquivoUrl: Boolean(materiais.documento?.arquivo_url),
            source: "personalizado" as const,
          }
        : null,
      presentationBlocks[0]
        ? {
            id: presentationBlocks[0].id.toString(),
            tipo: "apresentacao",
            title:
              typeof presentationBlocks[0].payload === "object"
                ? presentationBlocks[0].payload.title ?? null
                : null,
            description: "Apresentacao personalizada em etapas",
            hasArquivoUrl: Boolean(materiais.apresentacao?.arquivo_url),
            source: "personalizado" as const,
          }
        : null,
      imageBlocks[0]
        ? {
            id: imageBlocks[0].id.toString(),
            tipo: "imagem",
            title:
              typeof imageBlocks[0].payload === "object"
                ? imageBlocks[0].payload.title ?? null
                : null,
            description: "Arte ou briefing visual personalizado",
            hasArquivoUrl: Boolean(materiais.imagem?.arquivo_url),
            source: "personalizado" as const,
          }
        : null,
      audioBlocks[0]
        ? {
            id: audioBlocks[0].id.toString(),
            tipo: "audio",
            title:
              typeof audioBlocks[0].payload === "object"
                ? audioBlocks[0].payload.title ?? null
                : null,
            description: "Audio gerado para o seu perfil",
            hasArquivoUrl: Boolean(materiais.audio?.arquivo_url),
            source: "personalizado" as const,
          }
        : null,
      videoBlocks[0]
        ? {
            id: videoBlocks[0].id.toString(),
            tipo: "video",
            title:
              typeof videoBlocks[0].payload === "object"
                ? videoBlocks[0].payload.title ?? null
                : null,
            description: "Video ou roteiro personalizado",
            hasArquivoUrl: Boolean(materiais.video?.arquivo_url),
            source: "personalizado" as const,
          }
        : null,
      cardsBlock
        ? {
            id: cardsBlock.id.toString(),
            tipo: "cards",
            title: "Cards de estudo",
            description: "Deck de revisão personalizado",
            hasArquivoUrl: Boolean(materiais.cards?.arquivo_url),
            source: "personalizado" as const,
          }
        : null,
      quizActivity
        ? {
            id: String(quizActivity.id),
            tipo: "quiz",
            title: quizActivity.titulo,
            description: quizActivity.descricao,
            hasArquivoUrl: Boolean(materiais.quiz?.arquivo_url),
            source: "personalizado" as const,
          }
        : null,
    ].filter(Boolean) as any[],
    planMeta: {
      recordId: Number(record.id ?? 0) || null,
      cycleId: pickString(record.ciclo_id) ?? null,
      heroFormat: planSummary.heroFormat,
      presentationMode,
      formatosGerados: asArray<string>(record.formatos_gerados).filter(Boolean),
      justification: planSummary.justification,
      level: planSummary.level,
      tone: planSummary.tone,
      style: planSummary.style,
      source,
      uiConfig: planSummary.uiConfig,
      refreshPolicy,
    },
    nodeHint: buildNodeHint({
      topicoId,
      heroFormat: planSummary.heroFormat,
      record,
      summary: summaryText,
    }),
    aiPatch,
  };
}
