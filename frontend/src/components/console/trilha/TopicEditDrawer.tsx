import { useMemo, useState, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  FileText,
  LayoutList,
  BrainCircuit,
  CheckSquare,
  GripVertical,
  Calendar,
  AlignLeft,
  Loader2,
  Wand2,
  Upload,
} from "lucide-react";
import type {
  Atividade,
  AiSuggestion,
  CardItem,
  Classe,
  Conteudo,
  ConteudoFile,
  Materia,
  Questao,
  Topico,
} from "./types";
import { ContentFileUpload } from "./ContentFileUpload";
import { saveAiSuggestionsBatch, updateContent, updateContentMetadata } from "./topicsApi";
import { enqueueClassDeltaJob } from "./personalizacaoJobsApi";
import { normalizeOptionalPositiveScore, scoreToInputString } from "@/lib/question-score";
import { buildPersonalizacaoThemeGuide } from "@/lib/personalizacao-theme-guide";
import {
  QUESTION_MEDIA_ACCEPT,
  isProfessorUploadFileAllowed,
  isQuestionMediaFileAllowed,
} from "@/lib/upload-file-policy";

type TopicEditDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTopic: Topico | null;
  classes: Classe[];
  materias: Materia[];
  isSaving: boolean;
  formData: { nome: string; descricao: string; classe_id: string; ordem: string };
  setFormData: Dispatch<SetStateAction<{ nome: string; descricao: string; classe_id: string; ordem: string }>>;
  handleSubmit: () => void;
  handleEditClose: () => void;
  
  // Conteúdos
  contents: Conteudo[];
  selectedContentId: number | null;
  setSelectedContentId: (id: number | null) => void;
  contentForm: { titulo: string; tipo: string; conteudo: string };
  setContentForm: Dispatch<SetStateAction<{ titulo: string; tipo: string; conteudo: string }>>;
  isSavingContent: boolean;
  handleSaveContent: (overrideConteudo?: string) => Promise<Conteudo | null>;
  handleDeleteContent: (id: number) => void;
  onReorderContents: (newOrder: Conteudo[]) => void;

  // Carregamento
  loadContents: (topicId: number) => Promise<void>;
  loadCards: (topicId: number) => Promise<void>;
  loadActivities: (topicId: number) => Promise<void>;
  loadActivityLinks: (topicId: number) => Promise<void>;
  
  // Atividades
  activities: Atividade[];
  activityForm: { id: number; titulo: string; descricao: string; tipo: string; data_entrega: string };
  setActivityForm: Dispatch<SetStateAction<{ id: number; titulo: string; descricao: string; tipo: string; data_entrega: string }>>;
  handleSaveActivity: () => Promise<void>;
  selectedActivityId: string;
  setSelectedActivityId: Dispatch<SetStateAction<string>>;
  activityLinks: Record<number, number[]>;
  toggleActivityLink: (conteudoId: number, atividadeId: number, link: boolean) => void;
  activityLinkCount: (atividadeId: number) => number;
  
  // Criação Rápida
  newActivityForm: { titulo: string; descricao: string; tipo: string; data_entrega: string; questionEnunciado: string; questionTipo: string; questionResposta: string; questionNota: string; questionOptions: string[]; };
  setNewActivityForm: Dispatch<SetStateAction<{ titulo: string; descricao: string; tipo: string; data_entrega: string; questionEnunciado: string; questionTipo: string; questionResposta: string; questionNota: string; questionOptions: string[]; }>>;
  handleCreateActivityWithQuestion: () => void;
  
  // Questões
  questions: Questao[];
  questionForm: { id: number; atividade_id: string; enunciado: string; tipo: string; resposta_correta: string; nota_estabelecida: string; midia_url: string };
  setQuestionForm: Dispatch<SetStateAction<{ id: number; atividade_id: string; enunciado: string; tipo: string; resposta_correta: string; nota_estabelecida: string; midia_url: string }>>;
  questionOptions: string[];
  setQuestionOptions: Dispatch<SetStateAction<string[]>>;
  addNewActivityOption: () => void;
  updateNewActivityOption: (index: number, value: string) => void;
  removeNewActivityOption: (index: number) => void;
  addQuestionOption: () => void;
  updateQuestionOption: (index: number, value: string) => void;
  removeQuestionOption: (index: number) => void;
  handleSaveQuestion: () => void;
  handleDeleteQuestion: (id: number) => void;
  loadQuestions: (atividadeId: number) => void;
  
  // Cards
  cards: CardItem[];
  cardForm: { id: number; conteudo_id: string; conteudo_origem_id: string; titulo: string; descricao: string; imagem_url: string };
  setCardForm: Dispatch<SetStateAction<{ id: number; conteudo_id: string; conteudo_origem_id: string; titulo: string; descricao: string; imagem_url: string }>>;
  handleSaveCard: () => void;
  handleDeleteCard: (id: number) => Promise<boolean>;
};

function extractYouTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return m?.[1] ?? null;
}

const TEXT_REFERENCE_PATTERN = /\.(txt|md|markdown|csv|json|ya?ml|xml)$/i;
const FILE_REFERENCE_PATTERN = /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|txt|md|markdown|csv|json|ya?ml|xml|jpg|jpeg|png|gif|webp|svg|mp3|wav|ogg|mp4|webm|mov)$/i;

function isDirectUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isFileReference(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0 && FILE_REFERENCE_PATTERN.test(value);
}

function getReferenceName(pathOrUrl: string, fallback = "arquivo"): string {
  const normalized = pathOrUrl.split("?")[0] ?? pathOrUrl;
  const part = normalized.split("/").pop();
  return part && part.trim().length > 0 ? decodeURIComponent(part) : fallback;
}

export function TopicEditDrawer(props: TopicEditDrawerProps) {
  const {
    open, onOpenChange, handleEditClose, handleSubmit, isSaving,
    formData, setFormData, classes, materias, editingTopic,
    contents, selectedContentId, setSelectedContentId,
    contentForm, setContentForm, isSavingContent, handleSaveContent, handleDeleteContent, onReorderContents,
    loadActivities, loadActivityLinks,
    activities, activityForm, setActivityForm, handleSaveActivity: handleSaveActivityProp, selectedActivityId, setSelectedActivityId,
    activityLinks, toggleActivityLink,
    newActivityForm, setNewActivityForm, handleCreateActivityWithQuestion: handleCreateActivityWithQuestionProp,
    questions, questionForm, setQuestionForm, questionOptions, setQuestionOptions, handleSaveQuestion: handleSaveQuestionProp,
    cards, cardForm, setCardForm, handleSaveCard: handleSaveCardProp, handleDeleteCard: handleDeleteCardProp
  } = props;

  const { user, session } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [extraFiles, setExtraFiles] = useState<ConteudoFile[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isGeneratingContentAi, setIsGeneratingContentAi] = useState(false);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion | null>(null);
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set());
  const [selectedAtividades, setSelectedAtividades] = useState<Set<number>>(new Set());
  const [isCreatingSuggestions, setIsCreatingSuggestions] = useState(false);
  const [isUploadingQuestionMedia, setIsUploadingQuestionMedia] = useState(false);
  const [isCardReuseEnabled, setIsCardReuseEnabled] = useState(false);
  const questionMediaInputRef = useRef<HTMLInputElement | null>(null);
  const selectedClasse = useMemo(() => {
    const classeId = Number(formData.classe_id || editingTopic?.classe_id || 0);
    if (!Number.isFinite(classeId) || classeId <= 0) return null;
    return classes.find((classe) => classe.id === classeId) ?? null;
  }, [classes, formData.classe_id, editingTopic?.classe_id]);
  const selectedMateria = useMemo(() => {
    if (!selectedClasse?.materia_id) return null;
    return materias.find((materia) => materia.id === selectedClasse.materia_id) ?? null;
  }, [materias, selectedClasse?.materia_id]);
  const contentTitleById = useMemo(
    () => new Map(contents.map((content) => [content.id, content.titulo || "Sem título"])),
    [contents]
  );
  const resolvedCardConteudoId =
    cardForm.conteudo_id || (selectedContentId ? selectedContentId.toString() : "");
  useEffect(() => {
    if (selectedContentId && !cardForm.conteudo_id && !cardForm.id) {
      setCardForm((prev) => ({ ...prev, conteudo_id: selectedContentId.toString() }));
    }
  }, [selectedContentId, cardForm.conteudo_id, cardForm.id, setCardForm]);

  useEffect(() => {
    if (!cardForm.id) return;
    const hasReuseOrigin =
      Boolean(cardForm.conteudo_origem_id) &&
      cardForm.conteudo_origem_id !== "" &&
      cardForm.conteudo_origem_id !== resolvedCardConteudoId;
    setIsCardReuseEnabled(hasReuseOrigin);
  }, [cardForm.id, cardForm.conteudo_origem_id, resolvedCardConteudoId]);

  const syncDeltaJob = async (payload: { topicoIds?: number[]; conteudoIds?: number[]; reason: string }) => {
    if (!session?.access_token || !editingTopic?.classe_id) return;
    await enqueueClassDeltaJob(session.access_token, {
      classe_id: editingTopic.classe_id,
      topico_ids: payload.topicoIds,
      conteudo_ids: payload.conteudoIds,
      reason: payload.reason,
    });
  };

  /** Lê conteúdo textual dos arquivos pendentes para enviar como material de referência ao AI */
  const readPendingFileContents = async (): Promise<{ fileContents: string; fileNames: string[] }> => {
    if (pendingFiles.length === 0) return { fileContents: "", fileNames: [] };
    const parts: string[] = [];
    for (const file of pendingFiles) {
      if (/\.(txt|md)$/i.test(file.name)) {
        try {
          const text = await file.text();
          parts.push(`=== ${file.name} ===\n${text.substring(0, 8000)}`);
        } catch { /* skip */ }
      } else {
        parts.push(`[Arquivo de referência: ${file.name}]`);
      }
    }
    return { fileContents: parts.join("\n\n"), fileNames: pendingFiles.map((f) => f.name) };
  };

  const readStoredFileContents = async (
    files: ConteudoFile[]
  ): Promise<{ fileContents: string; fileNames: string[] }> => {
    if (files.length === 0) return { fileContents: "", fileNames: [] };

    const parts: string[] = [];
    const fileNames: string[] = [];

    for (const file of files) {
      const path = file.path?.trim();
      if (!path) continue;

      const name = file.name?.trim() || getReferenceName(path);
      fileNames.push(name);

      if (!TEXT_REFERENCE_PATTERN.test(name)) {
        parts.push(`[Arquivo anexado: ${name}]`);
        continue;
      }

      try {
        let text = "";
        if (isDirectUrl(path)) {
          const response = await fetch(path);
          text = await response.text();
        } else {
          const { data, error } = await supabase.storage.from("conteudos").download(path);
          if (error) throw error;
          text = await data.text();
        }

        if (text.trim()) {
          parts.push(`=== ${name} ===\n${text.substring(0, 8000)}`);
        } else {
          parts.push(`[Arquivo anexado: ${name}]`);
        }
      } catch {
        parts.push(`[Arquivo anexado: ${name}]`);
      }
    }

    return { fileContents: parts.join("\n\n"), fileNames };
  };

  const buildAiContextPayload = () => {
    const materiaNome = selectedMateria?.nome?.trim() || "";
    const materiaDescricao = selectedMateria?.descricao?.trim() || "";
    const classeNome = selectedClasse?.descricao?.trim() || "";
    const topicoNome = formData.nome?.trim() || editingTopic?.nome?.trim() || "";
    const topicoDescricao = formData.descricao?.trim() || editingTopic?.descricao?.trim() || "";

    return {
      ...(materiaNome ? { materiaNome } : {}),
      ...(materiaDescricao ? { materiaDescricao } : {}),
      ...(classeNome ? { classeNome } : {}),
      ...(topicoNome ? { topicoNome } : {}),
      ...(topicoDescricao ? { topicoDescricao } : {}),
      personalizacaoThemeGuide: buildPersonalizacaoThemeGuide(),
    };
  };

  const buildCurrentContentAiPayload = async (): Promise<{
    topicName: string;
    contents: Array<{ titulo: string; tipo: string; conteudo: string | null }>;
    fileContents?: string;
    fileNames?: string[];
    materiaNome?: string;
    materiaDescricao?: string;
    classeNome?: string;
    topicoNome?: string;
    topicoDescricao?: string;
    personalizacaoThemeGuide?: unknown;
  }> => {
    const selectedContent = selectedContentId
      ? (contents.find((content) => content.id === selectedContentId) ?? null)
      : null;

    const titulo = contentForm.titulo?.trim() || selectedContent?.titulo?.trim() || "";
    const tipo = contentForm.tipo || selectedContent?.tipo || "texto";
    const textBody = contentForm.conteudo?.trim() || selectedContent?.conteudo?.trim() || "";

    const storedFilesMap = new Map<string, ConteudoFile>();
    const registerStoredFile = (file: ConteudoFile | null | undefined) => {
      if (!file?.path || storedFilesMap.has(file.path)) return;
      storedFilesMap.set(file.path, file);
    };

    for (const file of selectedContent?.metadata?.files ?? []) registerStoredFile(file);
    for (const file of extraFiles) registerStoredFile(file);

    const primaryReference = contentForm.conteudo || selectedContent?.conteudo || null;
    if (tipo === "arquivo" && isFileReference(primaryReference)) {
      const path = primaryReference.trim();
      registerStoredFile({ path, name: getReferenceName(path), size: 0 });
    }

    const [pending, stored] = await Promise.all([
      readPendingFileContents(),
      readStoredFileContents(Array.from(storedFilesMap.values())),
    ]);

    const mergedFileContents = [stored.fileContents, pending.fileContents].filter(Boolean).join("\n\n");
    const mergedFileNames = [...stored.fileNames, ...pending.fileNames];

    return {
      topicName: titulo,
      contents: [
        {
          titulo,
          tipo,
          conteudo: textBody || null,
        },
      ],
      ...buildAiContextPayload(),
      ...(mergedFileContents ? { fileContents: mergedFileContents, fileNames: mergedFileNames } : {}),
    };
  };

  const uploadFile = async (file: File, topicId: number, userId: string): Promise<string | null> => {
    if (!isProfessorUploadFileAllowed(file)) {
      toast.error("Formato de arquivo não permitido para conteúdo.");
      return null;
    }
    const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userId}/${topicId}/${Date.now()}_${sanitized}`;
    const { error } = await supabase.storage
      .from("conteudos")
      .upload(path, file, { upsert: true });
    if (error) {
      const raw = error.message ? String(error.message) : String(error);
      const friendly = (raw.includes("security policy") || raw.includes("violates") || raw.includes("403"))
        ? 'Permissão negada. Adicione uma política INSERT no bucket "conteudos" no painel Supabase → Storage → Policies.'
        : raw;
      toast.error(friendly, { duration: 8000 });
      return null;
    }
    return path;
  };

  const handleSaveWithUpload = async () => {
    if (contentForm.tipo === "arquivo" && pendingFiles.length > 0 && editingTopic?.id && user?.id) {
      setIsUploadingFile(true);
      try {
        const [primary, ...extras] = pendingFiles;
        const primaryPath = await uploadFile(primary, editingTopic.id, user.id);
        if (!primaryPath) return;

        const extraPaths: ConteudoFile[] = [];
        for (const f of extras) {
          const p = await uploadFile(f, editingTopic.id, user.id);
          if (p) extraPaths.push({ path: p, name: f.name, size: f.size });
        }

        setPendingFiles([]);
        // Aguarda criação/atualização para obter o ID (essencial para novos conteúdos)
        const created = await props.handleSaveContent(primaryPath);

        if (extraPaths.length > 0) {
          const existingExtra = extraFiles.filter((f) => !f.path.startsWith("http"));
          const allExtra = [...existingExtra, ...extraPaths];
          // Para conteúdo novo: usa o ID retornado; para existente: usa selectedContentId
          const contentId = created?.id ?? selectedContentId;
          if (contentId) {
            await updateContentMetadata(contentId, { files: allExtra }).catch(console.error);
            setExtraFiles(allExtra);
          }
        }
        await syncDeltaJob({
          conteudoIds: created?.id ? [created.id] : selectedContentId ? [selectedContentId] : undefined,
          topicoIds: [editingTopic.id],
          reason: "edicao_conteudo_console",
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro ao enviar arquivo.";
        toast.error(msg);
      } finally {
        setIsUploadingFile(false);
      }
      return;
    }
    // No pending files — also persist any extra-file removals for existing content
    if (selectedContentId && !isCreating) {
      await updateContent(selectedContentId, { metadata: { files: extraFiles } }).catch(console.error);
    }
    const saved = await props.handleSaveContent();
    await syncDeltaJob({
      conteudoIds: saved?.id ? [saved.id] : selectedContentId ? [selectedContentId] : undefined,
      topicoIds: editingTopic?.id ? [editingTopic.id] : undefined,
      reason: "edicao_conteudo_console",
    });
  };

  const handleUploadQuestionMedia = async (file: File) => {
    if (!isQuestionMediaFileAllowed(file)) {
      toast.error("Formato de mídia não permitido para questões.");
      return;
    }
    if (!editingTopic?.id || !user?.id) {
      toast.error("Selecione um tópico e faça login para enviar mídia.");
      return;
    }
    setIsUploadingQuestionMedia(true);
    try {
      const uploadedPath = await uploadFile(file, editingTopic.id, user.id);
      if (!uploadedPath) return;
      const { data } = supabase.storage.from("conteudos").getPublicUrl(uploadedPath);
      const resolvedUrl = data?.publicUrl || uploadedPath;
      setQuestionForm((prev) => ({ ...prev, midia_url: resolvedUrl }));
      toast.success("Mídia da questão enviada com sucesso.");
    } catch (error) {
      console.error("[TopicEditDrawer] Erro ao enviar mídia da questão:", error);
      toast.error("Não foi possível enviar a mídia da questão.");
    } finally {
      setIsUploadingQuestionMedia(false);
    }
  };

  const handleDeleteContentWithSync = async (contentId: number) => {
    handleDeleteContent(contentId);
    await syncDeltaJob({
      conteudoIds: [contentId],
      topicoIds: editingTopic?.id ? [editingTopic.id] : undefined,
      reason: "remocao_conteudo_console",
    });
  };

  const handleSaveActivityWithSync = async () => {
    await handleSaveActivityProp();
    await syncDeltaJob({
      topicoIds: editingTopic?.id ? [editingTopic.id] : undefined,
      conteudoIds: selectedContentId ? [selectedContentId] : undefined,
      reason: "edicao_atividade_console",
    });
  };

  const handleCreateActivityWithQuestionWithSync = async () => {
    await Promise.resolve(handleCreateActivityWithQuestionProp());
    await syncDeltaJob({
      topicoIds: editingTopic?.id ? [editingTopic.id] : undefined,
      conteudoIds: selectedContentId ? [selectedContentId] : undefined,
      reason: "criacao_atividade_questao_console",
    });
  };

  const handleSaveQuestionWithSync = async () => {
    await Promise.resolve(handleSaveQuestionProp());
    await syncDeltaJob({
      topicoIds: editingTopic?.id ? [editingTopic.id] : undefined,
      conteudoIds: selectedContentId ? [selectedContentId] : undefined,
      reason: "edicao_questao_console",
    });
  };

  const handleSaveCardWithSync = async () => {
    await Promise.resolve(handleSaveCardProp());
    setIsCardReuseEnabled(false);
    await syncDeltaJob({
      topicoIds: editingTopic?.id ? [editingTopic.id] : undefined,
      conteudoIds: resolvedCardConteudoId ? [Number(resolvedCardConteudoId)] : selectedContentId ? [selectedContentId] : undefined,
      reason: "edicao_card_console",
    });
  };

  const handleDeleteCardWithSync = async (cardId: number) => {
    const removed = await Promise.resolve(handleDeleteCardProp(cardId));
    if (!removed) return;
    if (cardForm.id === cardId) {
      resetCardEditor();
    }
    try {
      await syncDeltaJob({
        topicoIds: editingTopic?.id ? [editingTopic.id] : undefined,
        conteudoIds: selectedContentId ? [selectedContentId] : undefined,
        reason: "remocao_card_console",
      });
    } catch (error) {
      console.error("[TopicEditDrawer] Falha ao enfileirar class-delta apos excluir card:", error);
      toast.warning("Card excluido, mas o job de personalizacao nao foi enfileirado.");
    }
  };

  const openAiDialog = (suggestion: AiSuggestion) => {
    setAiSuggestions(suggestion);
    setSelectedCards(new Set(suggestion.cards.map((_, i) => i)));
    setSelectedAtividades(new Set(suggestion.atividades.map((_, i) => i)));
    setAiDialogOpen(true);
  };

  /** Botão no formulário de conteúdo — analisa apenas o conteúdo atual */
  const handleGenerateForCurrentContent = async () => {
    if (!editingTopic) return;
    setIsGeneratingContentAi(true);
    try {
      const payload = await buildCurrentContentAiPayload();
      if (!payload.topicName) {
        toast.error("Preencha ou selecione um conteúdo antes de gerar sugestões.");
        return;
      }
      const { data, error } = await supabase.functions.invoke("generate-content-ai", {
        body: {
          mode: "content",
          ...payload,
        },
      });
      if (error) throw error;
      openAiDialog(data as AiSuggestion);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar sugestões.");
    } finally {
      setIsGeneratingContentAi(false);
    }
  };

  /** Botão ao lado da descrição — gera apenas a descrição do tópico */
  const handleGenerateDescription = async () => {
    if (!formData.nome) return;
    setIsGeneratingDescription(true);
    try {
      const { fileContents, fileNames } = await readPendingFileContents();
      const { data, error } = await supabase.functions.invoke("generate-content-ai", {
        body: {
          mode: "description",
          topicName: formData.nome,
          contents: contents.map((c) => ({ titulo: c.titulo, tipo: c.tipo, conteudo: c.conteudo })),
          ...buildAiContextPayload(),
          ...(fileContents && { fileContents, fileNames }),
        },
      });
      if (error) throw error;
      const suggestion = data as AiSuggestion;
      if (suggestion.descricao) {
        setFormData({ ...formData, descricao: suggestion.descricao });
        toast.success("Descrição gerada com sucesso!");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar descrição.");
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const handleApplySuggestions = async () => {
    if (!aiSuggestions || !editingTopic?.id) return;
    if (!selectedContentId) {
      toast.error("Selecione um conteudo antes de aplicar sugestoes da IA.");
      return;
    }

    setIsCreatingSuggestions(true);
    try {
      const orderedCards = Array.from(selectedCards).sort((a, b) => a - b);
      const orderedAtividades = Array.from(selectedAtividades).sort((a, b) => a - b);

      const cardsBatch = orderedCards
        .map((idx) => aiSuggestions.cards[idx])
        .filter((card): card is AiSuggestion["cards"][number] => Boolean(card));
      const atividadesBatch = orderedAtividades
        .map((idx) => aiSuggestions.atividades[idx])
        .filter((atividade): atividade is AiSuggestion["atividades"][number] => Boolean(atividade));

      if (cardsBatch.length === 0 && atividadesBatch.length === 0) {
        toast.error("Selecione ao menos 1 card ou 1 atividade para aplicar.");
        return;
      }

      const result = await saveAiSuggestionsBatch({
        topico_id: editingTopic.id,
        conteudo_id: selectedContentId,
        cards: cardsBatch,
        atividades: atividadesBatch.map((atividade) => ({
          titulo: atividade.titulo,
          enunciado: atividade.enunciado,
          tipo: atividade.tipo,
          alternativas: atividade.alternativas ?? null,
          resposta_correta: atividade.resposta_correta,
          nota_estabelecida: normalizeOptionalPositiveScore(atividade.nota_estabelecida),
        })),
      });

      toast.success(
        `Sugestoes aplicadas: ${result.cardsCreated} cards, ${result.activitiesCreated} atividades e ${result.questionsCreated} questoes.`
      );
      setAiDialogOpen(false);
      await props.loadCards(editingTopic.id);
      await loadActivities(editingTopic.id);
      await loadActivityLinks(editingTopic.id);
      await syncDeltaJob({
        topicoIds: [editingTopic.id],
        conteudoIds: [selectedContentId],
        reason: "aplicar_sugestoes_ia_console",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao criar sugestoes.";
      toast.error(msg);
    } finally {
      setIsCreatingSuggestions(false);
    }
  };

  // Inicializa modo de criação se não houver conteúdos
  useEffect(() => {
    if (contents.length === 0) {
      setIsCreating(true);
      setContentForm({ titulo: "", tipo: "texto", conteudo: "" });
    }
  }, [contents.length, setIsCreating, setContentForm]);

  const normalizeQuestionTypeToActivityType = (tipo: string | null | undefined) => {
    const raw = (tipo || "").trim().toLowerCase();
    if (raw === "quiz" || raw === "multipla" || raw === "multipla_escolha") return "quiz";
    if (raw === "true_false" || raw === "verdadeiro_falso" || raw === "vf") return "true_false";
    if (raw === "fill_blank" || raw === "lacuna" || raw === "completar") return "fill_blank";
    if (raw === "essay" || raw === "dissertativa" || raw === "questao" || raw === "texto") return "essay";
    return "essay";
  };

  // Efeito para carregar questão existente ao selecionar atividade
  useEffect(() => {
    if (selectedActivityId) {
      if (questions.length > 0) {
        const q = questions[0];
        const resolvedType = normalizeQuestionTypeToActivityType(q.tipo || activityForm.tipo || "quiz");
        setQuestionForm({
          id: q.id,
          atividade_id: q.atividade_id.toString(),
          enunciado: q.enunciado,
          tipo: resolvedType,
          resposta_correta: q.resposta_correta || "",
          nota_estabelecida: scoreToInputString(q.nota_estabelecida),
          midia_url: q.midia_url || "",
        });
        
        let opts = [""];
        try {
          if (Array.isArray(q.alternativas)) opts = q.alternativas;
          else if (typeof q.alternativas === 'string') opts = JSON.parse(q.alternativas);
        } catch (e) { opts = [""]; }
        
        if (activityForm.tipo === 'true_false' && (!opts || opts.length === 0)) {
           opts = ["Verdadeiro", "Falso"];
        }
        setQuestionOptions(opts.length ? opts : [""]);
      } else {
        const defaultType = normalizeQuestionTypeToActivityType(activityForm.tipo || "quiz");
        setQuestionForm({
          id: 0,
          atividade_id: selectedActivityId,
          enunciado: "",
          tipo: defaultType,
          resposta_correta: "",
          nota_estabelecida: "",
          midia_url: "",
        });
        
        if (defaultType === 'true_false') setQuestionOptions(["Verdadeiro", "Falso"]);
        else setQuestionOptions([""]);
      }
    }
  }, [selectedActivityId, questions, activityForm.tipo, setQuestionForm, setQuestionOptions]);

  // Estilos Dark Theme
  const darkInputClass = "bg-[#111827] border-slate-700 text-slate-100 focus:border-violet-500 placeholder:text-slate-600 hover:border-slate-600 transition-colors";
  const darkLabelClass = "text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-2 block";
  const darkCardClass = "bg-[#1E293B] border border-slate-700/50";

  const startNewContent = () => {
    setSelectedContentId(null);
    setContentForm({ titulo: "", tipo: "texto", conteudo: "" });
    setPendingFiles([]);
    setExtraFiles([]);
    setIsCreating(true);
  };

  const handleSelectContent = (id: number, c: Conteudo) => {
    setIsCreating(false);
    setSelectedContentId(id);
    setContentForm({ titulo: c.titulo || "", tipo: c.tipo || "texto", conteudo: c.conteudo || "" });
    setPendingFiles([]);
    setExtraFiles(c.metadata?.files ?? []);
  };

  const resetCardEditor = () => {
    setIsCardReuseEnabled(false);
    setCardForm({
      id: 0,
      conteudo_id: selectedContentId ? selectedContentId.toString() : "",
      conteudo_origem_id: "",
      titulo: "",
      descricao: "",
      imagem_url: "",
    });
  };

  const selectCardForEdit = (card: CardItem) => {
    setCardForm({
      id: card.id,
      conteudo_id: card.conteudo_id?.toString() || "",
      conteudo_origem_id: card.conteudo_origem_id?.toString() || "",
      titulo: card.titulo || "",
      descricao: card.descricao || "",
      imagem_url: card.imagem_url || "",
    });
  };

  const selectedCard = cards.find((card) => card.id === cardForm.id) ?? null;

  // --- DRAG AND DROP HANDLERS ---
  const onDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = "move";
    // Hack para evitar ghost image feia no firefox/chrome
    const ghost = e.currentTarget.cloneNode(true) as HTMLElement;
    ghost.style.position = "absolute";
    ghost.style.top = "-1000px";
    ghost.style.opacity = "0.5";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 0, 0);
    setTimeout(() => document.body.removeChild(ghost), 0);
  };

  const onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItemIndex === null || draggedItemIndex === index) return;
    
    const newItems = [...contents];
    const draggedItem = newItems[draggedItemIndex];
    newItems.splice(draggedItemIndex, 1);
    newItems.splice(index, 0, draggedItem);
    
    setDraggedItemIndex(index);
    onReorderContents(newItems);
  };

  const onDragEnd = () => {
    setDraggedItemIndex(null);
  };

  // Função de renderização do formulário para evitar perda de foco
  const renderContentForm = (title: string) => (
    <div className={`p-6 rounded-xl space-y-6 shadow-xl ${darkCardClass}`}>
      <div className="flex items-center justify-between border-b border-slate-700 pb-4 mb-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          {isCreating ? <Plus className="text-emerald-400 w-5 h-5"/> : <Pencil className="text-violet-400 w-5 h-5"/>}
          {title}
        </h3>
        {isCreating && contents.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-white">
            <X size={16} className="mr-1"/> Cancelar
          </Button>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-5">
        <div className="flex-1">
          <Label className={darkLabelClass}>Título do Conteúdo</Label>
          <Input 
            value={contentForm.titulo || ""} 
            onChange={(e) => setContentForm({...contentForm, titulo: e.target.value})}
            className={`${darkInputClass} text-lg font-medium h-11`}
            placeholder="Ex: Introdução à Lógica"
            autoFocus={isCreating}
          />
        </div>
        <div className="w-full md:w-[220px]">
          <Label className={darkLabelClass}>Formato</Label>
          <Select value={contentForm.tipo || "texto"} onValueChange={(v) => setContentForm({...contentForm, tipo: v})}>
            <SelectTrigger className={`${darkInputClass} h-11`}><SelectValue/></SelectTrigger>
            <SelectContent className="bg-[#1E293B] border-slate-700 text-slate-200">
              <SelectItem value="texto">Texto / Artigo</SelectItem>
              <SelectItem value="video">Vídeo (YouTube / Embed)</SelectItem>
              <SelectItem value="link">Link Externo</SelectItem>
              <SelectItem value="arquivo">Arquivo / Upload</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {contentForm.tipo === "arquivo" ? (
        <div>
          <Label className={darkLabelClass}>Arquivos ou URL</Label>
          <ContentFileUpload
            topicId={editingTopic?.id}
            value={contentForm.conteudo || ""}
            onChange={(v) => setContentForm({ ...contentForm, conteudo: v })}
            extraFiles={extraFiles}
            onRemoveExtraFile={(path) => setExtraFiles((prev) => prev.filter((f) => f.path !== path))}
            pendingFiles={pendingFiles}
            onPendingFilesChange={setPendingFiles}
          />
        </div>
      ) : (
        <div>
          <Label className={darkLabelClass}>
            {contentForm.tipo === "texto"
              ? "Material (Markdown)"
              : contentForm.tipo === "video"
              ? "URL do YouTube ou Iframe"
              : "URL"}
          </Label>
          <div className="relative">
            <Textarea
              value={contentForm.conteudo || ""}
              onChange={(e) => setContentForm({ ...contentForm, conteudo: e.target.value })}
              className="bg-[#111827] border-slate-700 text-slate-300 min-h-[400px] font-mono text-sm leading-relaxed p-4 focus:ring-1 focus:ring-violet-500/50 resize-y rounded-md"
              placeholder={
                contentForm.tipo === "texto"
                  ? "# Digite seu conteúdo aqui..."
                  : contentForm.tipo === "video"
                  ? "https://www.youtube.com/watch?v=... ou <iframe ...>"
                  : "https://example.com/recurso"
              }
            />
            {contentForm.tipo === "texto" && (
              <div className="absolute bottom-3 right-3 text-[10px] text-slate-500 bg-[#1E293B] px-2 py-1 rounded border border-slate-700">
                Markdown Suportado
              </div>
            )}
            {contentForm.tipo === "video" && (() => {
              const ytId = extractYouTubeId(contentForm.conteudo || "");
              const alreadyEmbed =
                (contentForm.conteudo || "").includes("youtube.com/embed") ||
                (contentForm.conteudo || "").includes("<iframe");
              if (!ytId || alreadyEmbed) return null;
              return (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="absolute bottom-3 right-3 h-7 text-[11px] border-violet-500/30 text-violet-400 hover:text-violet-200 hover:bg-violet-900/20 bg-[#1E293B]"
                  onClick={() =>
                    setContentForm({
                      ...contentForm,
                      conteudo: `<iframe width="560" height="315" src="https://www.youtube.com/embed/${ytId}" frameborder="0" allowfullscreen></iframe>`,
                    })
                  }
                >
                  <Wand2 className="w-3 h-3 mr-1" />
                  Converter para Embed
                </Button>
              );
            })()}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-4 border-t border-slate-700 gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleGenerateForCurrentContent}
          disabled={isGeneratingContentAi || !contentForm.titulo}
          className="h-9 text-xs border-violet-500/30 text-violet-400 hover:text-violet-200 hover:bg-violet-900/20 hover:border-violet-500/50 shrink-0"
        >
          {isGeneratingContentAi ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Gerando...</>
          ) : (
            <><Wand2 className="w-3.5 h-3.5 mr-1.5" /> Sugerir Cards & Atividades</>
          )}
        </Button>
        <Button
          onClick={handleSaveWithUpload}
          disabled={isSavingContent || isUploadingFile}
          className={`
            text-white min-w-[170px] h-11 text-sm font-semibold shadow-lg transition-all shrink-0
            ${!isCreating
              ? "bg-violet-600 hover:bg-violet-700 shadow-violet-900/20"
              : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-900/20 hover:scale-105"
            }
          `}
        >
          {isSavingContent || isUploadingFile ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {isUploadingFile
                ? `Enviando${pendingFiles.length > 1 ? ` ${pendingFiles.length} arquivos` : " arquivo"}...`
                : "Salvando..."}
            </>
          ) : !isCreating ? (
            <><Save className="w-4 h-4 mr-2" /> Atualizar Conteúdo</>
          ) : (
            <><Plus className="w-4 h-4 mr-2" /> Criar Conteúdo</>
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <>
    <Dialog open={open} onOpenChange={(val) => (val ? onOpenChange(true) : handleEditClose())}>
      <DialogContent className="max-w-[95vw] w-full h-[95vh] p-0 gap-0 bg-[#0F172A] border-slate-800 flex flex-col overflow-hidden sm:rounded-xl shadow-2xl shadow-black/80">
        
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#1E293B] border-b border-slate-800 shrink-0 z-10 shadow-md">
          <div>
            <DialogTitle className="text-xl font-bold text-white flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-violet-600/20 flex items-center justify-center text-violet-400">
                <BrainCircuit size={18} />
              </div>
              {editingTopic ? "Editar Trilha de Conhecimento" : "Nova Trilha"}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs mt-1 pl-11">
              Gerenciamento avançado de nós de conteúdo e avaliações.
            </DialogDescription>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={handleEditClose} className="text-slate-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-slate-700">
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving || !editingTopic} className="bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-900/20 px-6 font-semibold">
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? "Salvando..." : "Salvar Trilha"}
            </Button>
          </div>
        </div>

        {/* LAYOUT PRINCIPAL */}
        <div className="flex flex-1 overflow-hidden text-slate-200 h-full">
          
          {/* SIDEBAR (Esquerda) */}
          <aside className="w-[340px] lg:w-[400px] border-r border-slate-800 bg-[#0F172A] flex flex-col shrink-0 h-full overflow-hidden">
            <ScrollArea className="h-full w-full">
              <div className="p-5 space-y-8 pb-32"> 
                <div className="space-y-4">
                  <div className="grid gap-4">
                    <div>
                      <Label className={darkLabelClass}>Título do Tópico</Label>
                      <Input value={formData.nome || ""} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} className={`${darkInputClass} font-medium`} placeholder="Ex: Introdução" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className={darkLabelClass}>Classe</Label>
                        <Select value={formData.classe_id || ""} onValueChange={(v) => setFormData({ ...formData, classe_id: v })}>
                          <SelectTrigger className={darkInputClass}><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent className="bg-[#1E293B] border-slate-700 text-slate-200">
                            {classes.map((c) => (<SelectItem key={c.id} value={c.id.toString()} className="focus:bg-violet-600 focus:text-white">{c.descricao}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className={darkLabelClass}>Ordem</Label>
                        <Input type="number" value={formData.ordem || ""} onChange={(e) => setFormData({ ...formData, ordem: e.target.value })} className={darkInputClass} />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className={darkLabelClass} style={{ marginBottom: 0 }}>Descrição Rápida</Label>
                        <button
                          type="button"
                          onClick={handleGenerateDescription}
                          disabled={isGeneratingDescription || !formData.nome}
                          className="flex items-center gap-1 text-[10px] text-violet-400/70 hover:text-violet-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {isGeneratingDescription ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> Gerando...</>
                          ) : (
                            <><Wand2 className="w-3 h-3" /> Gerar com IA</>
                          )}
                        </button>
                      </div>
                      <Textarea value={formData.descricao || ""} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} className={`${darkInputClass} min-h-[60px] resize-none`} placeholder="Objetivos..." />
                    </div>
                  </div>
                </div>
                <Separator className="bg-slate-800" />
                <div className="space-y-4">
                  <div className="flex items-center justify-between sticky top-0 bg-[#0F172A] z-10 py-2">
                    <h3 className={darkLabelClass}>Nós de Conteúdo</h3>
                    <Badge variant="outline" className="border-slate-700 text-slate-400 bg-slate-900">{contents.length}</Badge>
                  </div>
                  <Button variant="outline" onClick={startNewContent} className={`w-full border-dashed border-slate-700 bg-slate-900/30 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-950/10 h-11 text-xs uppercase tracking-wide transition-all mb-2 ${isCreating ? "border-emerald-500/50 bg-emerald-950/20 text-emerald-400 ring-1 ring-emerald-500/20" : ""}`}>
                    <Plus className="w-4 h-4 mr-2" /> {isCreating ? "Preenchendo Novo..." : "Adicionar Novo Conteúdo"}
                  </Button>
                  
                  {/* LISTA DRAGGABLE */}
                  <div className="space-y-2">
                    {contents.map((c, idx) => (
                      <div 
                        key={c.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, idx)}
                        onDragOver={(e) => onDragOver(e, idx)}
                        onDragEnd={onDragEnd}
                        onClick={() => handleSelectContent(c.id, c)} 
                        className={`
                          group flex items-center p-3 rounded-lg border cursor-move transition-all relative overflow-hidden 
                          ${selectedContentId === c.id ? "bg-violet-600/10 border-violet-500/50 shadow-[inset_4px_0_0_0_#8b5cf6]" : "bg-[#1E293B] border-slate-700/50 hover:border-slate-600 hover:bg-[#26334d]"}
                          ${draggedItemIndex === idx ? "opacity-50 border-dashed" : "opacity-100"}
                        `}
                      >
                        <div className="mr-3 text-slate-600 group-hover:text-slate-400 flex flex-col items-center justify-center w-6"><span className="text-[9px] text-slate-600 font-mono mb-1">{idx + 1}</span><GripVertical size={14}/></div>
                        <div className="flex-1 min-w-0 py-1">
                          <p className={`text-sm font-medium truncate ${selectedContentId === c.id ? "text-violet-200" : "text-slate-300"}`}>{c.titulo || "(Sem título)"}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-[#0F172A] px-1.5 py-0.5 rounded border border-slate-800">{c.tipo}</span>
                            {activityLinks[c.id]?.length > 0 && (<span className="text-[10px] text-emerald-400 flex items-center gap-1 bg-emerald-950/30 px-1.5 py-0.5 rounded border border-emerald-900/50"><CheckSquare size={10} /> {activityLinks[c.id].length}</span>)}
                          </div>
                        </div>
                        {selectedContentId === c.id && (<div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-violet-500 to-fuchsia-500"></div>)}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-950/30 transition-opacity absolute right-2" onClick={(e) => { e.stopPropagation(); void handleDeleteContentWithSync(c.id); }}><Trash2 size={14} /></Button>
                      </div>
                    ))}
                    {contents.length === 0 && (<div className="text-center py-10 px-4 border border-dashed border-slate-800 rounded-lg"><p className="text-sm text-slate-500">Nenhum conteúdo criado.</p></div>)}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </aside>

          <main className="flex-1 bg-[#0b1120] flex flex-col min-w-0 h-full overflow-hidden relative">
            <ScrollArea className="h-full w-full">
              <div className="p-6 max-w-5xl mx-auto space-y-6 pb-40">
                
                {isCreating && renderContentForm("Novo Conteúdo")}

                {!isCreating && selectedContentId && (
                  <Tabs defaultValue="conteudo" className="w-full">
                    <TabsList className="bg-[#1E293B] border border-slate-700/50 p-1 mb-6 h-auto w-full justify-start rounded-lg">
                      <TabsTrigger value="conteudo" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white flex-1 h-9"><FileText className="w-4 h-4 mr-2"/> Conteúdo</TabsTrigger>
                      <TabsTrigger value="atividades" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white flex-1 h-9"><LayoutList className="w-4 h-4 mr-2"/> Atividades</TabsTrigger>
                      <TabsTrigger value="cards" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white flex-1 h-9"><BrainCircuit className="w-4 h-4 mr-2"/> Cards</TabsTrigger>
                    </TabsList>

                    <TabsContent value="conteudo" className="mt-0 outline-none">{renderContentForm("Editar Conteúdo")}</TabsContent>

                    <TabsContent value="atividades" className="mt-0 outline-none">
                      <div className={`p-6 rounded-xl border space-y-6 shadow-lg ${darkCardClass}`}>
                        <div className="flex justify-between items-center mb-4">
                          <h4 className="text-lg font-bold text-white flex items-center gap-2"><CheckSquare className="text-violet-400"/> Atividades Vinculadas</h4>
                          <Badge variant="outline" className="border-violet-500 text-violet-400">{(activityLinks[selectedContentId] || []).length} Total</Badge>
                        </div>
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                          {(activityLinks[selectedContentId] || []).map((aid) => {
                            const a = activities.find(act => act.id === aid);
                            if(!a) return null;
                            return (
                              <div key={aid} className="flex items-center justify-between p-3 bg-[#111827] border border-slate-700 rounded-lg">
                                <div className="flex items-center gap-3 overflow-hidden">
                                  <div className="w-8 h-8 rounded bg-violet-900/30 text-violet-400 flex items-center justify-center font-bold border border-violet-500/20">{a.tipo?.slice(0,1).toUpperCase()}</div>
                                  <div className="truncate"><p className="font-medium text-slate-200 truncate">{a.titulo}</p></div>
                                </div>
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-white" onClick={() => { setActivityForm({ ...a, id: a.id, descricao: a.descricao || "", tipo: a.tipo || "quiz", data_entrega: a.data_entrega || "" }); setSelectedActivityId(a.id.toString()); props.loadQuestions(a.id); }}><Pencil size={14} /></Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-red-400" onClick={() => toggleActivityLink(selectedContentId!, aid, false)}><X size={14} /></Button>
                                </div>
                              </div>
                            )
                          })}
                          {(activityLinks[selectedContentId] || []).length === 0 && <div className="col-span-full py-8 text-center border border-dashed border-slate-700 rounded-lg text-slate-500 text-sm">Nenhuma atividade vinculada.</div>}
                        </div>
                        
                        <Separator className="bg-slate-700"/>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <Label className={darkLabelClass}>Vincular Existente</Label>
                            <div className="bg-[#111827] p-3 rounded-lg border border-slate-700 h-[180px] overflow-y-auto">
                              <div className="flex flex-wrap gap-2">
                                {activities.map(a => {
                                  if((activityLinks[selectedContentId] || []).includes(a.id)) return null;
                                  return <button key={a.id} onClick={() => toggleActivityLink(selectedContentId, a.id, true)} className="px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-slate-300 hover:border-violet-500 transition-colors">+ {a.titulo}</button>
                                })}
                              </div>
                            </div>
                          </div>
                          
                          <div className="space-y-3 bg-[#111827] p-4 rounded-lg border border-slate-700">
                            <Label className={darkLabelClass}>Criar Nova Atividade</Label>
                            <Input placeholder="Título..." value={newActivityForm.titulo || ""} onChange={(e) => setNewActivityForm({...newActivityForm, titulo: e.target.value})} className={darkInputClass}/>
                            <div className="grid grid-cols-3 gap-2">
                                <Select value={newActivityForm.tipo || "quiz"} onValueChange={(v) => setNewActivityForm({...newActivityForm, tipo: v})}>
                                    <SelectTrigger className={darkInputClass}><SelectValue placeholder="Tipo"/></SelectTrigger>
                                    <SelectContent className="bg-[#1E293B] border-slate-700 text-slate-200">
                                        <SelectItem value="quiz">Quiz (Múltipla)</SelectItem>
                                        <SelectItem value="fill_blank">Completar</SelectItem>
                                        <SelectItem value="true_false">V/F</SelectItem>
                                        <SelectItem value="essay">Dissertação</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Input
                                  type="number"
                                  min="0.1"
                                  step="0.01"
                                  className={darkInputClass}
                                  value={newActivityForm.questionNota ?? ""}
                                  onChange={(e) => setNewActivityForm({ ...newActivityForm, questionNota: e.target.value })}
                                  placeholder="Nota (opcional)"
                                />
                                <Input type="datetime-local" className={darkInputClass} value={newActivityForm.data_entrega || ""} onChange={(e) => setNewActivityForm({...newActivityForm, data_entrega: e.target.value})} />
                            </div>
                            <Button onClick={handleCreateActivityWithQuestionWithSync} className="bg-white text-slate-900 hover:bg-slate-200 w-full mt-2"><Plus size={16} className="mr-2"/> Criar</Button>
                          </div>
                        </div>

                        {/* EDITOR DE ATIVIDADE */}
                        {selectedActivityId && (
                          <div className="bg-[#111827] p-5 rounded-lg border border-violet-500/30 animate-in fade-in slide-in-from-bottom-4 scroll-mt-20">
                            <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-3">
                              <h4 className="text-violet-400 font-bold">Editando Atividade</h4>
                              <Button variant="ghost" size="sm" onClick={() => setSelectedActivityId("")} className="h-6 text-xs">Fechar</Button>
                            </div>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                              <div className="space-y-1">
                                <Label className={darkLabelClass}>Título</Label>
                                <Input value={activityForm.titulo || ""} onChange={e => setActivityForm({...activityForm, titulo: e.target.value})} className={darkInputClass} />
                              </div>
                              <div className="space-y-1">
                                <Label className={darkLabelClass}>Tipo de Questão</Label>
                                <Select value={activityForm.tipo || "quiz"} onValueChange={(v) => setActivityForm({...activityForm, tipo: v})}>
                                    <SelectTrigger className={darkInputClass}><SelectValue/></SelectTrigger>
                                    <SelectContent className="bg-[#1E293B] border-slate-700 text-slate-200">
                                        <SelectItem value="quiz">Quiz (Múltipla)</SelectItem>
                                        <SelectItem value="fill_blank">Completar</SelectItem>
                                        <SelectItem value="true_false">Verdadeiro/Falso</SelectItem>
                                        <SelectItem value="essay">Dissertação</SelectItem>
                                    </SelectContent>
                                </Select>
                              </div>
                              <div className="col-span-2 space-y-1">
                                <Label className={darkLabelClass}>Instruções / Descrição</Label>
                                <Textarea value={activityForm.descricao || ""} onChange={e => setActivityForm({...activityForm, descricao: e.target.value})} className={`${darkInputClass} col-span-2`} placeholder="Descrição" rows={2}/>
                              </div>
                            </div>
                            <Button size="sm" onClick={handleSaveActivityWithSync} className="w-full bg-slate-700 hover:bg-slate-600 mb-4">Salvar Detalhes</Button>
                            
                            {/* --- RENDERIZAÇÃO CONDICIONAL DA QUESTÃO --- */}
                            <div className="space-y-3 pt-4 border-t border-slate-700">
                              <h5 className="text-slate-300 font-semibold text-sm flex items-center gap-2">
                                <BrainCircuit size={16}/> Configurar Questão ({activityForm.tipo?.toUpperCase()})
                              </h5>
                              
                              <div className="mt-2 space-y-3 bg-[#1E293B]/50 p-4 rounded border border-dashed border-slate-700">
                                <div>
                                    <Label className={darkLabelClass}>
                                        {activityForm.tipo === 'fill_blank' ? "Frase com Lacuna (Use _ para a lacuna)" : "Enunciado / Pergunta"}
                                    </Label>
                                    <Textarea value={questionForm.enunciado || ""} onChange={e => setQuestionForm({...questionForm, enunciado: e.target.value})} className={`${darkInputClass} text-sm min-h-[60px]`} placeholder="Digite a pergunta..."/>
                                </div>
                                
                                {/* 1. QUIZ (Multipla Escolha) */}
                                {activityForm.tipo === 'quiz' && (
                                    <div className="space-y-2">
                                        <Label className={darkLabelClass}>Alternativas</Label>
                                        {questionOptions.map((opt, i) => (
                                        <div key={i} className="flex gap-2 items-center">
                                            <Input value={opt || ""} onChange={e => props.updateQuestionOption(i, e.target.value)} className={`${darkInputClass} h-8 text-xs`} placeholder={`Opção ${i+1}`}/>
                                            <button onClick={() => setQuestionForm({...questionForm, resposta_correta: opt})} className={`w-5 h-5 flex items-center justify-center rounded-full border ${questionForm.resposta_correta === opt && opt !== "" ? "bg-green-500 border-green-500 text-white" : "border-slate-600 text-transparent hover:border-slate-400"}`} title="Marcar Correta">
                                                <CheckSquare size={12} fill="currentColor" />
                                            </button>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-600 hover:text-red-400" onClick={() => props.removeQuestionOption(i)}><X size={12}/></Button>
                                        </div>
                                        ))}
                                        <Button variant="ghost" size="sm" onClick={props.addQuestionOption} className="text-xs h-7 text-slate-400 hover:text-white w-full mt-1 border border-dashed border-slate-700">+ Adicionar Opção</Button>
                                    </div>
                                )}

                                {/* 2. TRUE / FALSE */}
                                {activityForm.tipo === 'true_false' && (
                                    <div className="flex gap-4">
                                        {["Verdadeiro", "Falso"].map(opt => (
                                            <button 
                                                key={opt}
                                                onClick={() => setQuestionForm({...questionForm, resposta_correta: opt})}
                                                className={`flex-1 py-3 rounded-lg border text-sm font-semibold transition-all ${questionForm.resposta_correta === opt ? "bg-green-600 border-green-500 text-white" : "bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700"}`}
                                            >
                                                {opt}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* 3. FILL BLANK */}
                                {activityForm.tipo === 'fill_blank' && (
                                    <div>
                                        <Label className={darkLabelClass}>Palavra/Resposta Correta</Label>
                                        <Input 
                                            value={questionForm.resposta_correta || ""} 
                                            onChange={e => setQuestionForm({...questionForm, resposta_correta: e.target.value})} 
                                            className={darkInputClass}
                                            placeholder="A resposta exata..."
                                        />
                                    </div>
                                )}

                                {/* 4. ESSAY */}
                                {activityForm.tipo === 'essay' && (
                                    <div className="p-3 bg-slate-800/50 rounded border border-slate-700 text-xs text-slate-400">
                                        <p>Em atividades dissertativas, o aluno escreverá um texto livre. Você pode usar o campo abaixo para salvar um gabarito ou guia de correção (opcional, não visível ao aluno).</p>
                                        <Textarea 
                                            value={questionForm.resposta_correta || ""} 
                                            onChange={e => setQuestionForm({...questionForm, resposta_correta: e.target.value})} 
                                            className={`${darkInputClass} mt-2`} 
                                            placeholder="Gabarito ou palavras-chave esperadas..."
                                        />
                                    </div>
                                )}

                                <div>
                                  <Label className={darkLabelClass}>Nota da Questão</Label>
                                  <Input
                                    type="number"
                                    min="0.1"
                                    step="0.01"
                                    value={questionForm.nota_estabelecida ?? ""}
                                    onChange={e => setQuestionForm({ ...questionForm, nota_estabelecida: e.target.value })}
                                    className={darkInputClass}
                                    placeholder="Opcional (ex: 2.5)"
                                  />
                                </div>

                                {/* Midia vinculada a questao */}
                                <div>
                                  <Label className={darkLabelClass}>Midia vinculada <span className="normal-case font-normal text-slate-500">(URL de imagem, video ou audio - opcional)</span></Label>
                                  <Input
                                    value={questionForm.midia_url || ""}
                                    onChange={e => setQuestionForm({...questionForm, midia_url: e.target.value})}
                                    className={`${darkInputClass} text-sm`}
                                    placeholder="https://... ou caminho no Storage"
                                  />
                                  <div className="mt-2">
                                    <input
                                      ref={questionMediaInputRef}
                                      type="file"
                                      accept={QUESTION_MEDIA_ACCEPT}
                                      className="hidden"
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file) await handleUploadQuestionMedia(file);
                                        e.currentTarget.value = "";
                                      }}
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={isUploadingQuestionMedia}
                                      onClick={() => questionMediaInputRef.current?.click()}
                                      className="h-8 text-xs"
                                    >
                                      {isUploadingQuestionMedia ? (
                                        <><Loader2 size={13} className="mr-1.5 animate-spin" /> Enviando...</>
                                      ) : (
                                        <><Upload size={13} className="mr-1.5" /> Enviar arquivo</>
                                      )}
                                    </Button>
                                  </div>
                                  {questionForm.midia_url && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(questionForm.midia_url) && (
                                    <img src={questionForm.midia_url} alt="preview" className="mt-2 max-h-28 rounded border border-slate-700 object-contain" />
                                  )}
                                </div>

                                <div className="flex justify-end pt-2">
                                  <Button size="sm" onClick={handleSaveQuestionWithSync} className="bg-violet-600 h-8 text-xs px-4">
                                    {questionForm.id ? "Atualizar Questão" : "Salvar Questão"}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="cards" className="mt-0 outline-none">
                      <div className={`p-6 rounded-xl border shadow-lg ${darkCardClass}`}>
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className={darkLabelClass}>Cards Existentes</Label>
                              <Badge variant="outline" className="border-violet-500/40 text-violet-300">
                                {cards.length}
                              </Badge>
                            </div>
                            <ScrollArea className="h-[420px] pr-2">
                              <div className="space-y-2">
                                {cards.map((c) => {
                                  const isSelected = cardForm.id === c.id;
                                  const linkedLabel = c.conteudo_id
                                    ? `Vinculado a ${contentTitleById.get(c.conteudo_id) ?? `Conteudo ${c.conteudo_id}`}`
                                    : "Reutilizável do tópico";
                                  const originLabel =
                                    c.conteudo_origem_id && c.conteudo_origem_id !== c.conteudo_id
                                      ? `Origem: ${contentTitleById.get(c.conteudo_origem_id) ?? `Conteudo ${c.conteudo_origem_id}`}`
                                      : null;

                                  return (
                                    <div
                                      key={c.id}
                                      onClick={() => selectCardForEdit(c)}
                                      className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                                        isSelected
                                          ? "bg-violet-900/20 border-violet-500/40"
                                          : "bg-[#111827] border-slate-700 hover:border-slate-600"
                                      }`}
                                    >
                                      <div className="flex items-start gap-2 justify-between">
                                        <div className="min-w-0">
                                          <p className="font-semibold text-sm text-slate-200 truncate">{c.titulo || "(Sem título)"}</p>
                                          <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                                            {c.descricao || "Sem descrição."}
                                          </p>
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-slate-500 hover:text-white"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              selectCardForEdit(c);
                                            }}
                                          >
                                            <Pencil size={12} />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-slate-500 hover:text-red-400"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              void handleDeleteCardWithSync(c.id);
                                            }}
                                          >
                                            <Trash2 size={12} />
                                          </Button>
                                        </div>
                                      </div>
                                      <div className="flex flex-wrap gap-1.5 mt-2">
                                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px] py-0">
                                          {linkedLabel}
                                        </Badge>
                                        {originLabel && (
                                          <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-[10px] py-0">
                                            {originLabel}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                                {cards.length === 0 && (
                                  <div className="text-center text-xs text-slate-600 py-10">
                                    Nenhum card para este tópico.
                                  </div>
                                )}
                              </div>
                            </ScrollArea>
                          </div>

                          <div className="space-y-4 bg-[#111827] p-4 rounded-lg border border-slate-700">
                            <div className="flex items-center justify-between">
                              <Label className={darkLabelClass} style={{ marginBottom: 0 }}>
                                {cardForm.id ? "Editar Card" : "Novo Card"}
                              </Label>
                              {cardForm.id ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-slate-400 hover:text-white"
                                  onClick={resetCardEditor}
                                >
                                  <Plus size={12} className="mr-1" />
                                  Novo
                                </Button>
                              ) : null}
                            </div>

                            {selectedCard && (
                              <div className="flex flex-wrap gap-1.5">
                                <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px] py-0">
                                  {selectedCard.conteudo_id
                                    ? `Vinculado a ${contentTitleById.get(selectedCard.conteudo_id) ?? `Conteudo ${selectedCard.conteudo_id}`}`
                                    : "Reutilizável do tópico"}
                                </Badge>
                                {selectedCard.conteudo_origem_id &&
                                  selectedCard.conteudo_origem_id !== selectedCard.conteudo_id && (
                                    <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-[10px] py-0">
                                      {`Origem: ${
                                        contentTitleById.get(selectedCard.conteudo_origem_id) ??
                                        `Conteudo ${selectedCard.conteudo_origem_id}`
                                      }`}
                                    </Badge>
                                  )}
                              </div>
                            )}

                            <div className="space-y-2">
                              <Label className="text-[11px] uppercase tracking-wider text-slate-400">Conteúdo vinculado</Label>
                              <select
                                className={`${darkInputClass} h-9`}
                                value={resolvedCardConteudoId}
                                onChange={(e) => {
                                  const nextConteudoId = e.target.value;
                                  const fallbackReuseOriginId =
                                    contents.find((content) => content.id.toString() !== nextConteudoId)?.id?.toString() || "";
                                  setCardForm((prev) => ({
                                    ...prev,
                                    conteudo_id: nextConteudoId,
                                    conteudo_origem_id: isCardReuseEnabled
                                      ? (prev.conteudo_origem_id && prev.conteudo_origem_id !== nextConteudoId
                                        ? prev.conteudo_origem_id
                                        : fallbackReuseOriginId)
                                      : "",
                                  }));
                                }}
                              >
                                <option value="">Selecione um conteúdo</option>
                                {contents.map((content) => (
                                  <option key={content.id} value={content.id}>
                                    {content.titulo || `Conteúdo ${content.id}`}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="space-y-2">
                              <label className="flex items-center gap-2 text-xs text-slate-400">
                                <input
                                  type="checkbox"
                                  checked={isCardReuseEnabled}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    if (!checked) {
                                      setIsCardReuseEnabled(false);
                                      setCardForm((prev) => ({ ...prev, conteudo_origem_id: "" }));
                                      return;
                                    }

                                    if (!resolvedCardConteudoId) {
                                      toast.error("Selecione um conteúdo para vincular o card antes de reaproveitar.");
                                      return;
                                    }

                                    const availableOrigins = contents
                                      .filter((content) => content.id.toString() !== resolvedCardConteudoId)
                                      .map((content) => content.id.toString());
                                    if (availableOrigins.length === 0) {
                                      toast.error("Não há outro conteúdo neste tópico para reaproveitamento.");
                                      return;
                                    }

                                    setIsCardReuseEnabled(true);
                                    setCardForm((prev) => ({
                                      ...prev,
                                      conteudo_origem_id:
                                        prev.conteudo_origem_id && prev.conteudo_origem_id !== resolvedCardConteudoId
                                          ? prev.conteudo_origem_id
                                          : availableOrigins[0],
                                    }));
                                  }}
                                />
                                Reaproveitar card de outro conteúdo
                              </label>
                              {isCardReuseEnabled && (
                                <select
                                  className={`${darkInputClass} h-9`}
                                  value={cardForm.conteudo_origem_id || ""}
                                  onChange={(e) =>
                                    setCardForm((prev) => ({ ...prev, conteudo_origem_id: e.target.value }))
                                  }
                                >
                                  <option value="">Selecione o conteúdo de origem</option>
                                  {contents
                                    .filter((content) => content.id.toString() !== resolvedCardConteudoId)
                                    .map((content) => (
                                      <option key={content.id} value={content.id}>
                                        {content.titulo || `Conteúdo ${content.id}`}
                                      </option>
                                    ))}
                                </select>
                              )}
                            </div>

                            <Input
                              className={darkInputClass}
                              placeholder="Frente (Título)"
                              value={cardForm.titulo || ""}
                              onChange={(e) => setCardForm({ ...cardForm, titulo: e.target.value })}
                            />
                            <Textarea
                              className={darkInputClass}
                              placeholder="Verso (Resposta)"
                              value={cardForm.descricao || ""}
                              onChange={(e) => setCardForm({ ...cardForm, descricao: e.target.value })}
                              rows={4}
                            />
                            <Input
                              className={darkInputClass}
                              placeholder="URL Imagem"
                              value={cardForm.imagem_url || ""}
                              onChange={(e) => setCardForm({ ...cardForm, imagem_url: e.target.value })}
                            />

                            <div className="flex items-center gap-2">
                              <Button className="flex-1 bg-violet-600 hover:bg-violet-700" onClick={handleSaveCardWithSync}>
                                {cardForm.id ? "Atualizar Card" : "Salvar Card"}
                              </Button>
                              {cardForm.id ? (
                                <Button
                                  variant="outline"
                                  className="border-slate-600 text-slate-300 hover:text-white"
                                  onClick={resetCardEditor}
                                >
                                  Cancelar
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                )}

                {!isCreating && !selectedContentId && (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 opacity-60">
                    <div className="w-24 h-24 bg-slate-800/50 rounded-full flex items-center justify-center mb-6 animate-pulse">
                      <FileText className="w-12 h-12 text-slate-600" />
                    </div>
                    <h3 className="text-xl font-semibold text-slate-300">Nenhum conteudo selecionado</h3>
                    <p className="text-sm mt-2">Selecione um item a esquerda ou crie um novo.</p>
                  </div>
                )}

              </div>
            </ScrollArea>
          </main>
        </div>
      </DialogContent>
    </Dialog>

    {/* -- AI Suggestions Dialog -- */}
    <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
      <DialogContent className="max-w-2xl w-full bg-[#0F172A] border-slate-800 text-slate-200 max-h-[90vh] flex flex-col overflow-hidden">
        <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-violet-400" />
          Cards e Atividades Sugeridas
        </DialogTitle>
        <DialogDescription className="text-slate-400 text-sm">
          Sugestões para o conteúdo selecionado. Selecione em lote o que deseja criar.
        </DialogDescription>

        <ScrollArea className="flex-1 pr-2 overflow-y-auto">
          {aiSuggestions && (
            <div className="space-y-6 py-2">
              {/* Cards */}
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Cards Sugeridos ({aiSuggestions.cards.length})
                </p>
                <div className="space-y-2">
                  {aiSuggestions.cards.map((card, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedCards.has(idx)
                          ? "bg-violet-900/20 border-violet-500/40"
                          : "bg-[#1E293B] border-slate-700 hover:border-slate-600"
                      }`}
                      onClick={() => {
                        const next = new Set(selectedCards);
                        if (next.has(idx)) next.delete(idx);
                        else next.add(idx);
                        setSelectedCards(next);
                      }}
                    >
                      <div className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 ${selectedCards.has(idx) ? "bg-violet-600 border-violet-600" : "border-slate-600"}`}>
                        {selectedCards.has(idx) && <CheckSquare className="w-3 h-3 text-white" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-200">{card.titulo}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{card.descricao}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Atividades */}
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Atividades Sugeridas ({aiSuggestions.atividades.length})
                </p>
                <div className="space-y-2">
                  {aiSuggestions.atividades.map((at, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedAtividades.has(idx)
                          ? "bg-emerald-900/20 border-emerald-500/40"
                          : "bg-[#1E293B] border-slate-700 hover:border-slate-600"
                      }`}
                      onClick={() => {
                        const next = new Set(selectedAtividades);
                        if (next.has(idx)) next.delete(idx);
                        else next.add(idx);
                        setSelectedAtividades(next);
                      }}
                    >
                      <div className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 ${selectedAtividades.has(idx) ? "bg-emerald-600 border-emerald-600" : "border-slate-600"}`}>
                        {selectedAtividades.has(idx) && <CheckSquare className="w-3 h-3 text-white" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-200">{at.titulo}</p>
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-[#0F172A] px-1.5 py-0.5 rounded border border-slate-800">
                            {at.tipo}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{at.enunciado}</p>
                        {at.alternativas && at.alternativas.length > 0 && (
                          <p className="text-[10px] text-slate-500 mt-1">
                            Alternativas: {at.alternativas.join(" · ")}{" -> "}<span className="text-emerald-400">{at.resposta_correta}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </ScrollArea>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-800 shrink-0">
          <Button variant="ghost" onClick={() => setAiDialogOpen(false)} className="text-slate-400 hover:text-white">
            Cancelar
          </Button>
          <Button
            onClick={handleApplySuggestions}
            disabled={isCreatingSuggestions || (selectedCards.size === 0 && selectedAtividades.size === 0)}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {isCreatingSuggestions ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Criando...</>
            ) : (
              `Criar ${selectedCards.size + selectedAtividades.size} selecionado${selectedCards.size + selectedAtividades.size !== 1 ? "s" : ""}`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
