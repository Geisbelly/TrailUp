import { useEffect, useMemo, useState } from "react";
import type {
  Atividade,
  CardItem,
  Classe,
  Conteudo,
  Materia,
  Questao,
  Topico,
} from "./types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, FileText, Workflow, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TopicEditDrawer } from "./TopicEditDrawer";
import { ClassManagerDialog } from "./ClassManagerDialog";
import { TopicFormDialog } from "./TopicFormDialog";
import { useTopicGraph } from "./useTopicGraph";
import { useTopicDataLoaders } from "./useTopicDataLoaders";
import { useTopicCrud } from "./useTopicCrud";
import { updateContentOrder } from "./topicsApi";
import { enqueueClassDeltaJob, listPersonalizacaoJobs, type PersonalizacaoJobStatus } from "./personalizacaoJobsApi";
import { parseOptionalPositiveScore } from "@/lib/question-score";

export default function TopicsManager() {
  const { user, session } = useAuth();
  const professorId = user?.id;

  const [topicos, setTopicos] = useState<Topico[]>([]);
  const [classes, setClasses] = useState<Classe[]>([]);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topico | null>(null);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClassDialogOpen, setIsClassDialogOpen] = useState(false);
  const [recentJobs, setRecentJobs] = useState<PersonalizacaoJobStatus[]>([]);
  const [formData, setFormData] = useState({
    nome: "",
    descricao: "",
    classe_id: "",
    ordem: "1",
  });
  const [classForm, setClassForm] = useState({ descricao: "", materia_id: "" });
  const [newMateria, setNewMateria] = useState({ nome: "", descricao: "" });
  const [contents, setContents] = useState<Conteudo[]>([]);
  const [selectedContentId, setSelectedContentId] = useState<number | null>(null);
  const [contentForm, setContentForm] = useState({ titulo: "", tipo: "texto", conteudo: "" });
  const [isSavingContent, setIsSavingContent] = useState(false);
  const [activities, setActivities] = useState<Atividade[]>([]);
  const [activityForm, setActivityForm] = useState({
    id: 0,
    titulo: "",
    descricao: "",
    tipo: "",
    data_entrega: "",
  });
  const [cards, setCards] = useState<CardItem[]>([]);
  const [cardForm, setCardForm] = useState({
    id: 0,
    conteudo_id: "",
    conteudo_origem_id: "",
    titulo: "",
    descricao: "",
    imagem_url: "",
  });
  const [questions, setQuestions] = useState<Questao[]>([]);
  const [questionForm, setQuestionForm] = useState({
    id: 0,
    atividade_id: "",
    enunciado: "",
    tipo: "multipla",
    resposta_correta: "",
    nota_estabelecida: "",
    midia_url: "",
  });
  const [questionOptions, setQuestionOptions] = useState<string[]>([""]);
  const [selectedActivityId, setSelectedActivityId] = useState<string>("");
  const [activityLinks, setActivityLinks] = useState<Record<number, number[]>>({});
  const [newActivityForm, setNewActivityForm] = useState({
    titulo: "",
    descricao: "",
    tipo: "",
    data_entrega: "",
    questionEnunciado: "",
    questionTipo: "multipla",
    questionResposta: "",
    questionNota: "",
    questionOptions: [""],
  });
  const fetchClassContextIds = async (classeId: number) => {
    const { data: topicoRows, error: topicoError } = await supabase
      .from("topicos")
      .select("id")
      .eq("classe_id", classeId);
    if (topicoError) throw topicoError;

    const topico_ids = (topicoRows ?? []).map((row) => row.id);
    if (topico_ids.length === 0) return { topico_ids, conteudo_ids: [] as number[] };

    const { data: conteudoRows, error: conteudoError } = await supabase
      .from("conteudos")
      .select("id")
      .in("topico_id", topico_ids);
    if (conteudoError) throw conteudoError;

    const conteudo_ids = (conteudoRows ?? []).map((row) => row.id);
    return { topico_ids, conteudo_ids };
  };
  const updateQuestionOption = (index: number, value: string) => {
    setQuestionOptions((prev) => prev.map((opt, idx) => (idx === index ? value : opt)));
  };
  const addQuestionOption = () => setQuestionOptions((prev) => [...prev, ""]);
  const removeQuestionOption = (index: number) =>
    setQuestionOptions((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== index) : prev));
  const updateNewActivityOption = (index: number, value: string) => {
    setNewActivityForm((prev) => ({
      ...prev,
      questionOptions: prev.questionOptions.map((opt, idx) => (idx === index ? value : opt)),
    }));
  };
  const addNewActivityOption = () =>
    setNewActivityForm((prev) => ({ ...prev, questionOptions: [...prev.questionOptions, ""] }));
  const removeNewActivityOption = (index: number) =>
    setNewActivityForm((prev) => ({
      ...prev,
      questionOptions: prev.questionOptions.length > 1 ? prev.questionOptions.filter((_, idx) => idx !== index) : prev.questionOptions,
    }));
  const {
    canvasRef,
    positions,
    setPositions,
    canvasOffset,
    zoom,
    zoomIn,
    zoomOut,
    resetView,
    handleCanvasWheel,
    selectedEdge,
    setSelectedEdge,
    draggingConnector,
    connectorPos,
    NODE_WIDTH,
    NODE_HEIGHT,
    removeLink,
    handleNodePointerDown,
    handleNodePointerMove,
    handleNodePointerUp,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
    getDynamicAnchors,
    buildPath,
    startConnector,
    handleNodeMouseUp,
  } = useTopicGraph(topicos, setTopicos, () =>
    toast.error("Não é possível vincular tópicos de turmas diferentes.")
  );

  const { loadData, loadContents, loadActivities, loadActivityLinks, loadCards, loadQuestions } = useTopicDataLoaders({
    professorId,
    setIsLoading,
    setTopicos,
    setClasses,
    setMaterias,
    setContents,
    setActivities,
    setActivityLinks,
    setCards,
    setQuestions,
  });

  const {
    handleCreateContent: createContentHandler,
    handleDeleteContent: deleteContentHandler,
    handleSaveActivity: saveActivityHandler,
    handleDeleteActivityApi,
    handleSaveQuestion: saveQuestionHandler,
    handleDeleteQuestionApi,
    toggleActivityLink: toggleActivityLinkApi,
    handleSaveCard: saveCardHandler,
    handleDeleteCard: deleteCardHandler,
    handleCreateActivityWithQuestion: createActivityWithQuestionHandler,
    handleCreateClass: createClassHandler,
    handleDeleteTopic,
    recalcOrder,
  } = useTopicCrud({
    editingTopic,
    contents,
    setContents,
    setCards,
    setActivities,
    setQuestions,
    setActivityLinks,
    topicos,
    setTopicos,
    persistOrder: async (updates) => {
      await Promise.all(updates.map((u) => supabase.from("topicos").update({ ordem: u.ordem }).eq("id", u.id)));
      if (session?.access_token && selectedClassFilter && updates.length < 0) {
        try {
          const { topico_ids, conteudo_ids } = await fetchClassContextIds(Number(selectedClassFilter));
          await enqueueClassDeltaJob(session.access_token, {
            classe_id: Number(selectedClassFilter),
            topico_ids,
            conteudo_ids,
            reason: "reordenacao_topicos_console",
          });
        } catch (error) {
          console.error("[TopicsManager] Falha ao enfileirar class-delta apos salvar ordem:", error);
          toast.warning("Ordem salva, mas o job de personalização não foi enfileirado.");
        }
      }
      if (session?.access_token && selectedClassFilter) {
        try {
          const { topico_ids, conteudo_ids } = await fetchClassContextIds(Number(selectedClassFilter));
          await enqueueClassDeltaJob(session.access_token, {
            classe_id: Number(selectedClassFilter),
            topico_ids,
            conteudo_ids,
            reason: "reordenacao_topicos_console",
          });
        } catch (error) {
          console.error("[TopicsManager] Falha ao enfileirar class-delta apos reordenacao:", error);
          toast.warning("Ordem atualizada, mas o job de personalização não foi enfileirado.");
        }
      }
    },
  });

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const loadJobs = async () => {
      if (!session?.access_token || !selectedClassFilter) {
        setRecentJobs([]);
        return;
      }
      try {
        const response = await listPersonalizacaoJobs(session.access_token, {
          classeId: Number(selectedClassFilter),
          limit: 6,
        });
        setRecentJobs(response.itens ?? []);
      } catch {
        setRecentJobs([]);
      }
    };
    void loadJobs();
  }, [selectedClassFilter, session?.access_token]);

  // Reordena automaticamente os topicos de cada classe com base nas dependencias (depende -> prerequisito)
  useEffect(() => {
    recalcOrder(topicos).catch((err) => {
      console.error("Erro ao recalcular ordem:", err);
      toast.error("Não foi possivel recalcular a ordem automaticamente.");
    });
    // recalcOrder vem do hook e nã̃o muda durante o ciclo; dependemos apenas de topicos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicos]);

  // Recalcula posições iniciais ao trocar de classe (ou quando ainda não há layout)
  useEffect(() => {
    const classTopics = selectedClassFilter
      ? topicos.filter((t) => t.classe_id.toString() === selectedClassFilter)
      : [];
    if (classTopics.length === 0) return;
    const missingAny = classTopics.some((t) => !positions[t.id]);
    if (!missingAny) return;
    const COLS = 4;
    const HGAP = 260; // NODE_WIDTH(220) + 40 margin
    const VGAP = 160; // NODE_HEIGHT(120) + 40 margin
    const newPositions: Record<number, { x: number; y: number }> = { ...positions };
    classTopics.forEach((t, index) => {
      if (!newPositions[t.id]) {
        const col = index % COLS;
        const row = Math.floor(index / COLS);
        newPositions[t.id] = { x: 20 + col * HGAP, y: 20 + row * VGAP };
      }
    });
    setPositions(newPositions);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicos, selectedClassFilter]);

  const topicsForSelected = useMemo(() => {
    if (!selectedClassFilter) return [];
    return topicos.filter((t) => t.classe_id.toString() === selectedClassFilter);
  }, [selectedClassFilter, topicos]);

  const edges = useMemo(() => {
    const list: { from: number; to: number; type: "next" | "depende" }[] = [];
    topicsForSelected.forEach((t) => {
      t.next.forEach((nextId) => {
        const target = topicos.find((p) => p.id === nextId);
        if (target && target.classe_id === t.classe_id) {
          list.push({ from: t.id, to: nextId, type: "next" });
        }
      });
      t.depende.forEach((depId) => {
        const source = topicos.find((p) => p.id === depId);
        if (source && source.classe_id === t.classe_id) {
          list.push({ from: depId, to: t.id, type: "depende" });
        }
      });
    });
    return list;
  }, [topicsForSelected, topicos]);

  useEffect(() => {
    if (!selectedClassFilter && classes.length > 0) {
      setSelectedClassFilter(classes[0].id.toString());
    }
  }, [classes, selectedClassFilter]);

  const handleSubmit = async () => {
    const targetClasseId =
      formData.classe_id ||
      selectedClassFilter ||
      classes[0]?.id?.toString() ||
      (editingTopic ? editingTopic.classe_id.toString() : "");
    if (!formData.nome || !targetClasseId) {
      toast.error("Preencha o nome (e selecione uma classe no topo, se necessário)");
      return;
    }
    setIsSaving(true);
    try {
      if (editingTopic) {
        const { error } = await supabase
          .from("topicos")
          .update({
            nome: formData.nome,
            descricao: formData.descricao,
            classe_id: parseInt(targetClasseId, 10),
            ordem: parseInt(formData.ordem, 10),
            next: editingTopic.next,
            depende: editingTopic.depende,
          })
          .eq("id", editingTopic.id);
        if (error) throw error;
        toast.success("Tópico atualizado!");
      } else {
        const { data, error } = await supabase
          .from("topicos")
          .insert({
            nome: formData.nome,
            descricao: formData.descricao,
            classe_id: parseInt(targetClasseId, 10),
            ordem: parseInt(formData.ordem, 10),
            next: [],
            depende: [],
          })
          .select("id, classe_id, nome, descricao, ordem, next, depende, created_at")
          .single();
        if (error) throw error;
        setTopicos((prev) => [...prev, { ...(data as Topico), next: [], depende: [] }]);
        toast.success("Tópico criado!");
      }
      if (session?.access_token) {
        try {
          const { topico_ids, conteudo_ids } = await fetchClassContextIds(parseInt(targetClasseId, 10));
          await enqueueClassDeltaJob(session.access_token, {
            classe_id: parseInt(targetClasseId, 10),
            topico_ids,
            conteudo_ids,
            reason: editingTopic ? "edicao_topico_console" : "novo_topico_console",
          });
        } catch (error) {
          console.error("[TopicsManager] Falha ao enfileirar class-delta apos salvar topico:", error);
          toast.warning("Topico salvo, mas o job de personalização não foi enfileirado.");
        }
      }
      await loadData();
      if (editingTopic) {
        setEditDrawerOpen(false);
      } else {
        setIsDialogOpen(false);
      }
      setEditingTopic(null);
      setFormData({ nome: "", descricao: "", classe_id: "", ordem: "1" });
    } catch (error) {
      console.error("Erro ao salvar tópico:", error);
      toast.error("Não foi possível salvar o tópico.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (topic: Topico) => {
    const removed = await handleDeleteTopic(topic.id);
    if (removed) {
      setTopicos((prev) => prev.filter((t) => t.id !== topic.id));
      if (session?.access_token) {
        try {
          const { topico_ids, conteudo_ids } = await fetchClassContextIds(topic.classe_id);
          await enqueueClassDeltaJob(session.access_token, {
            classe_id: topic.classe_id,
            topico_ids,
            conteudo_ids,
            reason: "remocao_topico_console",
          });
        } catch (error) {
          console.error("[TopicsManager] Falha ao enfileirar class-delta apos remover topico:", error);
          toast.warning("Tópico removido, mas o job de personalização não foi enfileirado.");
        }
      }
    }
  };

  const handleDeleteWithConfirm = async (topic: Topico) => {
    const confirmation = window.prompt(
      `Para excluir o tópico "${topic.nome}", digite exatamente o nome do tópico. Esta ação não pode ser desfeita.`
    );
    if (!confirmation) return;
    if (confirmation !== topic.nome) {
      toast.error("O nome digitado não confere. O tópico não foi removido.");
      return;
    }
    await handleDelete(topic);
  };

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!selectedEdge) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        removeLink(selectedEdge.from, selectedEdge.to, selectedEdge.type);
        setSelectedEdge(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedEdge, removeLink, setSelectedEdge]);

  const saveGraph = async () => {
    setIsSaving(true);
    try {
      await Promise.all(
        topicos.map((t) =>
          supabase.from("topicos").update({ next: t.next, depende: t.depende, ordem: t.ordem }).eq("id", t.id)
        )
      );
      if (session?.access_token && selectedClassFilter) {
        try {
          const { topico_ids, conteudo_ids } = await fetchClassContextIds(Number(selectedClassFilter));
          await enqueueClassDeltaJob(session.access_token, {
            classe_id: Number(selectedClassFilter),
            topico_ids,
            conteudo_ids,
            reason: "edicao_dependencias_topicos_console",
          });
        } catch (error) {
          console.error("[TopicsManager] Falha ao enfileirar class-delta apos salvar dependencias:", error);
          toast.warning("Dependências salvas, mas o job de personalização não foi enfileirado.");
        }
      }
      toast.success("Mapa de dependencias salvo!");
    } catch (error) {
      console.error("Erro ao salvar grafo:", error);
      toast.error("Não foi possivel salvar as dependências.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveOrder = async () => {
    setIsSaving(true);
    try {
      const updates = topicsForSelected.map((t, idx) => ({ id: t.id, ordem: idx + 1 }));
      await Promise.all(updates.map((u) => supabase.from("topicos").update({ ordem: u.ordem }).eq("id", u.id)));
      if (session?.access_token && selectedClassFilter) {
        try {
          const { topico_ids, conteudo_ids } = await fetchClassContextIds(Number(selectedClassFilter));
          await enqueueClassDeltaJob(session.access_token, {
            classe_id: Number(selectedClassFilter),
            topico_ids,
            conteudo_ids,
            reason: "reordenacao_topicos_console",
          });
        } catch (error) {
          console.error("[TopicsManager] Falha ao enfileirar class-delta apos salvar ordem:", error);
          toast.warning("Ordem salva, mas o job de personalizacao nao foi enfileirado.");
        }
      }
      toast.success("Ordem dos tópicos salva!");
    } catch (error) {
      console.error("Erro ao salvar ordem:", error);
      toast.error("Não foi possivel salvar a ordem.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateClass = async () => {
    setIsSaving(true);
    try {
      const created = await createClassHandler({
        classForm,
        newMateria,
        professorId,
      });
      if (created?.id) setSelectedClassFilter(created.id.toString());
      await loadData();
      setClassForm({ descricao: "", materia_id: "" });
      setNewMateria({ nome: "", descricao: "" });
      setIsClassDialogOpen(false);
      return created ?? null;
    } finally {
      setIsSaving(false);
    }
    return null;
  };

  const handleCreateContent = async (overrideConteudo?: string) => {
    setIsSavingContent(true);
    try {
      const form =
        overrideConteudo !== undefined
          ? { ...contentForm, conteudo: overrideConteudo }
          : contentForm;
      const created = await createContentHandler(form);
      if (created) {
        setContentForm({ titulo: "", tipo: "texto", conteudo: "" });
      }
      return created ?? null;
    } finally {
      setIsSavingContent(false);
    }
    return null;
  };

  const handleReorderContents = async (newOrder: Conteudo[]) => {
    setContents(newOrder); // optimistic
    try {
      const updates = newOrder.map((c, idx) => ({ id: c.id, ordem: idx + 1 }));
      await updateContentOrder(updates);
    } catch {
      toast.error("Erro ao salvar nova ordem dos conteúdos.");
      if (editingTopic) loadContents(editingTopic.id); // revert
    }
  };

  const handleSaveActivity = async () => {
    if (!editingTopic) return;
    const activityId = await saveActivityHandler(
      activityForm,
      editingTopic.id,
      selectedContentId,
      activityLinks
    );
    if (activityId) {
      await loadActivities(editingTopic.id);
      await loadActivityLinks(editingTopic.id);
      setActivityForm({ id: 0, titulo: "", descricao: "", tipo: "", data_entrega: "" });
    }
  };

  const handleDeleteActivity = async (id: number) => {
    if (!editingTopic) return;
    const confirmDelete = window.confirm("Remover esta atividade? Isso removera questões vinculadas.");
    if (!confirmDelete) return;
    await handleDeleteActivityApi(id);
    await loadActivities(editingTopic.id);
  };

  const handleSaveQuestion = async () => {
    if (!questionForm.atividade_id || !questionForm.enunciado) {
      toast.error("Selecione uma atividade e preencha o enunciado");
      return;
    }
    const atividadeId = parseInt(questionForm.atividade_id, 10);
    const alternativas = questionOptions.map((opt) => opt.trim()).filter(Boolean);
    const scoreParsed = parseOptionalPositiveScore(questionForm.nota_estabelecida);
    if (!scoreParsed.isValid) {
      toast.error("A nota da questao deve ser maior que 0 ou deixada em branco.");
      return;
    }

    const id = await saveQuestionHandler(
      {
        ...questionForm,
        resposta_correta: questionForm.resposta_correta || "",
        nota_estabelecida: scoreParsed.value,
      },
      alternativas
    );
    if (id) {
      await loadQuestions(atividadeId);
      setQuestionForm({
        id: 0,
        atividade_id: questionForm.atividade_id,
        enunciado: "",
        tipo: activityForm.tipo || "quiz",
        resposta_correta: "",
        nota_estabelecida: "",
        midia_url: "",
      });
      setQuestionOptions([""]);
    }
  };

  const handleDeleteQuestion = async (id: number) => {
    if (!questionForm.atividade_id) return;
    const confirmDelete = window.confirm("Remover esta questao?");
    if (!confirmDelete) return;
    await handleDeleteQuestionApi(id);
    await loadQuestions(parseInt(questionForm.atividade_id, 10));
  };

  const toggleActivityLink = async (conteudoId: number, atividadeId: number, link: boolean) => {
    await toggleActivityLinkApi(conteudoId, atividadeId, link);
    await loadActivityLinks(editingTopic?.id ?? 0);
    toast.success("Vinculo atualizado");
  };

  const activityLinkCount = (atividadeId: number) => {
    let count = 0;
    Object.values(activityLinks).forEach((arr) => {
      if (arr.includes(atividadeId)) count += 1;
    });
    return count;
  };

  const handleCreateActivityWithQuestion = async () => {
    if (!editingTopic || !selectedContentId) {
      toast.error("Selecione um conteudo para vincular a atividade.");
      return;
    }
    if (!newActivityForm.titulo) {
      toast.error("Informe o titulo da atividade");
      return;
    }
    const activityId = await createActivityWithQuestionHandler({
      newActivityForm,
      topicoId: editingTopic.id,
      conteudoId: selectedContentId,
    });

    if (activityId) {
      await loadActivities(editingTopic.id);
      await loadActivityLinks(editingTopic.id);
      if (selectedActivityId === "") setSelectedActivityId(activityId.toString());
      setNewActivityForm({
        titulo: "",
        descricao: "",
        tipo: "",
        data_entrega: "",
        questionEnunciado: "",
        questionTipo: "multipla",
        questionResposta: "",
        questionNota: "",
        questionOptions: [""],
      });
    }
  };

  const handleSaveCard = async () => {
    const fallbackContentId = selectedContentId ? selectedContentId.toString() : "";
    const resolvedConteudoId = cardForm.conteudo_id || fallbackContentId;
    if (!resolvedConteudoId) {
      toast.error("Selecione um conteudo para vincular o card.");
      return;
    }
    const conteudoId = resolvedConteudoId === "none" ? null : parseInt(resolvedConteudoId, 10);
    const origemRaw = cardForm.conteudo_origem_id || "";
    const conteudoOrigemId =
      origemRaw && origemRaw !== "none" && origemRaw !== resolvedConteudoId
        ? parseInt(origemRaw, 10)
        : null;
    const id = await saveCardHandler({
      ...cardForm,
      conteudo_id: conteudoId?.toString() ?? "",
      conteudo_origem_id: conteudoOrigemId?.toString() ?? "",
    });
    if (id) {
      await loadCards(editingTopic?.id ?? 0);
      setCardForm({
        id: 0,
        conteudo_id: "",
        conteudo_origem_id: "",
        titulo: "",
        descricao: "",
        imagem_url: "",
      });
    }
  };

  const handleDeleteCard = async (id: number) => {
    const confirmDelete = window.confirm("Remover este card?");
    if (!confirmDelete) return false;
    const removed = await deleteCardHandler(id);
    if (!removed) return false;
    await loadCards(editingTopic?.id ?? 0);
    return true;
  };

  const hasData = useMemo(() => topicos.length > 0, [topicos.length]);
  const runningJobs = useMemo(
    () => recentJobs.filter((job) => ["pending", "processing", "partial"].includes(job.status)),
    [recentJobs]
  );

  const activeConnectorStart = useMemo(() => {
    if (!draggingConnector.fromId || !draggingConnector.type) return null;
    const pos = positions[draggingConnector.fromId];
    if (!pos) return null;
    const y = pos.y + NODE_HEIGHT / 2;
    const x = draggingConnector.type === "next" ? pos.x + NODE_WIDTH : pos.x;
    return { x, y };
  }, [draggingConnector, positions, NODE_HEIGHT, NODE_WIDTH]);

  const handleNodeClick = (topic: Topico) => {
    window.open(`/topico/${topic.id}`, "_blank");
  };

  const handleEditOpen = async (topic: Topico) => {
    setEditingTopic(topic);
    setFormData({
      nome: topic.nome,
      descricao: topic.descricao || "",
      classe_id: topic.classe_id.toString(),
      ordem: (topic.ordem ?? 1).toString(),
    });
    await loadContents(topic.id);
    await loadActivities(topic.id);
    await loadCards(topic.id);
    await loadActivityLinks(topic.id);
    setEditDrawerOpen(true);
  };

  const handleEditClose = () => {
    setEditDrawerOpen(false);
    setEditingTopic(null);
    setFormData({ nome: "", descricao: "", classe_id: "", ordem: "1" });
    setContents([]);
    setCards([]);
    setActivities([]);
    setQuestions([]);
    setSelectedContentId(null);
    setActivityLinks({});
    setNewActivityForm({
      titulo: "",
      descricao: "",
      tipo: "",
      data_entrega: "",
      questionEnunciado: "",
      questionTipo: "multipla",
      questionResposta: "",
      questionNota: "",
      questionOptions: [""],
    });
  };

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Trilha de Tópicos</h3>
          <p className="text-sm text-muted-foreground">
            Escolha a classe, cadastre tópicos e defina dependências/pré-requisitos visualmente.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {runningJobs.length > 0 && (
            <div className="px-2.5 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-[11px] font-semibold text-amber-300">
              {runningJobs.length} job{runningJobs.length > 1 ? "s" : ""} de personalização em andamento
            </div>
          )}
          <Select
            value={selectedClassFilter}
            onValueChange={(v) => {
              if (v === "__new__") {
                setIsClassDialogOpen(true);
                return;
              }
              setSelectedClassFilter(v);
            }}
          >
            <SelectTrigger className="w-56" size="sm">
              <SelectValue placeholder="Selecione a classe" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.descricao}
                </SelectItem>
              ))}
              <SelectItem value="__new__">+ Nova classe</SelectItem>
            </SelectContent>
          </Select>

          <TopicFormDialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                setEditingTopic(null);
                setFormData({ nome: "", descricao: "", classe_id: "", ordem: "1" });
              } else {
                const preClass = selectedClassFilter || classes[0]?.id?.toString() || "";
                setFormData((prev) => ({
                  ...prev,
                  classe_id: preClass,
                }));
              }
            }}
            formData={formData}
            setFormData={setFormData}
            isSaving={isSaving}
            handleSubmit={handleSubmit}
            editingTopic={editingTopic}
            classes={classes}
            selectedClassFilter={selectedClassFilter}
          />
          <Button variant="secondary" size="sm" onClick={saveGraph} disabled={isSaving}>
            Salvar dependências
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando tópicos...</div>
      ) : !selectedClassFilter ? (
        <div className="text-sm text-muted-foreground">Selecione uma classe para visualizar o canvas.</div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-2">
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 px-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Workflow className="h-3.5 w-3.5" />
              <span>Arraste o fundo para navegar · arraste o nó para reposicionar</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-info shrink-0" />
              <span>Conector esquerdo (D) → Pré-requisito</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-success shrink-0" />
              <span>Conector direito (N) → Próximo</span>
            </div>
            <span className="opacity-50">Clique numa seta para removê-la</span>
          </div>

          {/* Canvas viewport */}
          <div
            ref={canvasRef}
            className="relative flex-1 min-h-0 rounded-xl border border-border bg-background overflow-hidden"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, hsl(263 70% 65% / 0.07) 1px, transparent 0)`,
              backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
              backgroundPosition: `${canvasOffset.x % (24 * zoom)}px ${canvasOffset.y % (24 * zoom)}px`,
              cursor: draggingConnector.fromId ? "crosshair" : "grab",
              userSelect: "none",
            }}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerLeave={handleCanvasPointerUp}
            onWheel={handleCanvasWheel}
          >
            {/* Zoom controls */}
            <div className="absolute bottom-3 right-3 z-50 flex items-center gap-1 bg-card/95 border border-border rounded-lg px-1.5 py-1 shadow-xl backdrop-blur-sm pointer-events-auto">
              <button
                className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Diminuir zoom"
                onClick={zoomOut}
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono text-muted-foreground w-10 text-center select-none">
                {Math.round(zoom * 100)}%
              </span>
              <button
                className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Aumentar zoom"
                onClick={zoomIn}
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4 bg-border mx-0.5" />
              <button
                className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Resetar visualização"
                onClick={resetView}
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Inner world */}
            <div
              className="absolute top-0 left-0 origin-top-left"
              style={{ transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${zoom})`, width: 4000, height: 4000 }}
            >
              {/* SVG edges */}
              <svg className="absolute top-0 left-0 overflow-visible pointer-events-none" width="4000" height="4000">
                <defs>
                  <marker id="arrow-next" markerWidth="10" markerHeight="10" refX="7" refY="5" orient="auto">
                    <path d="M0,0 L10,5 L0,10 z" fill="hsl(142 70% 55%)" />
                  </marker>
                  <marker id="arrow-depende" markerWidth="10" markerHeight="10" refX="7" refY="5" orient="auto">
                    <path d="M0,0 L10,5 L0,10 z" fill="hsl(200 70% 60%)" />
                  </marker>
                  <marker id="arrow-warning" markerWidth="10" markerHeight="10" refX="7" refY="5" orient="auto">
                    <path d="M0,0 L10,5 L0,10 z" fill="hsl(45 90% 60%)" />
                  </marker>
                </defs>

                {edges.map((edge, idx) => {
                  const { start, end } = getDynamicAnchors(edge.from, edge.to);
                  const isNext = edge.type === "next";
                  const isSelected = selectedEdge?.from === edge.from && selectedEdge?.to === edge.to && selectedEdge?.type === edge.type;
                  const color = isSelected ? "hsl(45 90% 60%)" : isNext ? "hsl(142 70% 55%)" : "hsl(200 70% 60%)";
                  const marker = isSelected ? "url(#arrow-warning)" : isNext ? "url(#arrow-next)" : "url(#arrow-depende)";
                  return (
                    <g key={`${edge.from}-${edge.to}-${idx}`} style={{ pointerEvents: "auto" }}>
                      <path
                        d={buildPath(start, end)}
                        stroke="transparent"
                        strokeWidth={16}
                        fill="none"
                        style={{ cursor: "pointer" }}
                        onClick={(e) => { e.stopPropagation(); removeLink(edge.from, edge.to, edge.type); setSelectedEdge(null); }}
                      />
                      <path
                        d={buildPath(start, end)}
                        stroke={color}
                        strokeWidth={isSelected ? 3 : 2}
                        fill="none"
                        markerEnd={marker}
                        opacity={0.85}
                        style={{ pointerEvents: "none" }}
                      />
                    </g>
                  );
                })}

                {draggingConnector.fromId && draggingConnector.type && activeConnectorStart && (
                  <path
                    d={buildPath(activeConnectorStart, connectorPos)}
                    stroke={draggingConnector.type === "next" ? "hsl(142 70% 55%)" : "hsl(200 70% 60%)"}
                    strokeWidth={2}
                    fill="none"
                    strokeDasharray="7 4"
                    opacity={0.6}
                  />
                )}
              </svg>

              {/* Nodes */}
              {topicsForSelected.map((topic) => {
                const pos = positions[topic.id] ?? { x: 20, y: 20 };
                const depNames = topic.depende.map((id) => topicos.find((t) => t.id === id)?.nome).filter(Boolean) as string[];
                const nextNames = topic.next.map((id) => topicos.find((t) => t.id === id)?.nome).filter(Boolean) as string[];
                const hasLinks = depNames.length > 0 || nextNames.length > 0;
                return (
                  <div
                    key={topic.id}
                    data-node
                    className="absolute select-none"
                    style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, width: NODE_WIDTH, zIndex: 10 }}
                    onPointerDown={handleNodePointerDown(topic.id)}
                    onPointerMove={handleNodePointerMove}
                    onPointerUp={handleNodePointerUp(topic.id)}
                    onMouseUp={handleNodeMouseUp(topic.id)}
                  >
                    {/* Left connector — depende */}
                    <button
                      className="absolute -left-2.5 top-[48px] w-5 h-5 rounded-full bg-info border-2 border-background shadow-lg hover:scale-125 transition-transform z-20 cursor-crosshair flex items-center justify-center"
                      title="Arraste para definir pré-requisito"
                      onMouseDown={startConnector(topic.id, "depende")}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <span className="text-[7px] text-white font-bold leading-none">D</span>
                    </button>

                    {/* Node card */}
                    <div
                      className={`rounded-xl border shadow-lg overflow-hidden transition-colors ${
                        hasLinks
                          ? "border-primary/40 bg-card"
                          : "border-border bg-card"
                      }`}
                      style={{ cursor: "grab" }}
                    >
                      {/* Accent bar top */}
                      {hasLinks && (
                        <div className="h-0.5 bg-gradient-to-r from-primary/60 via-accent/40 to-transparent" />
                      )}

                      {/* Header */}
                      <div className="px-3 pt-2.5 pb-2 flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center text-primary shrink-0 mt-0.5">
                          <FileText className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground leading-tight line-clamp-2">{topic.nome}</p>
                          {topic.descricao && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{topic.descricao}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            title="Editar tópico"
                            onClick={(e) => { e.stopPropagation(); handleEditOpen(topic); }}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Excluir tópico"
                            onClick={(e) => { e.stopPropagation(); handleDeleteWithConfirm(topic); }}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Dep/Next chips */}
                      {(depNames.length > 0 || nextNames.length > 0) && (
                        <div className="px-3 pb-2.5 space-y-1.5 border-t border-border/50 pt-2">
                          {depNames.length > 0 && (
                            <div className="flex flex-wrap gap-1 items-start">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-info/70 mt-0.5 shrink-0 leading-tight">? Dep</span>
                              {depNames.map((name) => (
                                <span
                                  key={name}
                                  className="text-[10px] bg-info/10 text-info border border-info/25 rounded px-1.5 py-0.5 leading-tight max-w-[110px] truncate"
                                  title={name}
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          )}
                          {nextNames.length > 0 && (
                            <div className="flex flex-wrap gap-1 items-start">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-success/70 mt-0.5 shrink-0 leading-tight">? Next</span>
                              {nextNames.map((name) => (
                                <span
                                  key={name}
                                  className="text-[10px] bg-success/10 text-success border border-success/25 rounded px-1.5 py-0.5 leading-tight max-w-[110px] truncate"
                                  title={name}
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Footer */}
                      <div className="px-3 py-1.5 border-t border-border/40 flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground/50 font-mono">#{topic.ordem ?? "-"}</span>
                        <span className="text-[9px] text-muted-foreground/30 font-mono">id:{topic.id}</span>
                      </div>
                    </div>

                    {/* Right connector — next */}
                    <button
                      className="absolute -right-2.5 top-[48px] w-5 h-5 rounded-full bg-success border-2 border-background shadow-lg hover:scale-125 transition-transform z-20 cursor-crosshair flex items-center justify-center"
                      title="Arraste para definir próximo tópico"
                      onMouseDown={startConnector(topic.id, "next")}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <span className="text-[7px] text-white font-bold leading-none">N</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      <ClassManagerDialog
        open={isClassDialogOpen}
        onOpenChange={setIsClassDialogOpen}
        classForm={classForm}
        setClassForm={setClassForm}
        newMateria={newMateria}
        setNewMateria={setNewMateria}
        materias={materias}
        isSaving={isSaving}
        handleCreateClass={handleCreateClass}
      />

      <TopicEditDrawer
        open={editDrawerOpen}
        onOpenChange={setEditDrawerOpen}
        editingTopic={editingTopic}
        classes={classes}
        materias={materias}
        isSaving={isSaving}
        formData={formData}
        setFormData={setFormData}
        handleSubmit={handleSubmit}
        handleEditClose={handleEditClose}
        contents={contents}
        selectedContentId={selectedContentId}
        setSelectedContentId={setSelectedContentId}
        contentForm={contentForm}
        setContentForm={setContentForm}
        isSavingContent={isSavingContent}
        handleSaveContent={handleCreateContent}
        handleDeleteContent={deleteContentHandler}
        onReorderContents={handleReorderContents}
        loadContents={loadContents}
        loadCards={loadCards}
        loadActivities={loadActivities}
        loadActivityLinks={loadActivityLinks}
        activities={activities}
        activityForm={activityForm}
        setActivityForm={setActivityForm}
        handleSaveActivity={handleSaveActivity}
        selectedActivityId={selectedActivityId}
        setSelectedActivityId={setSelectedActivityId}
        activityLinks={activityLinks}
        toggleActivityLink={toggleActivityLink}
        activityLinkCount={activityLinkCount}
        newActivityForm={newActivityForm}
        setNewActivityForm={setNewActivityForm}
        addNewActivityOption={addNewActivityOption}
        updateNewActivityOption={updateNewActivityOption}
        removeNewActivityOption={removeNewActivityOption}
        handleCreateActivityWithQuestion={handleCreateActivityWithQuestion}
        questions={questions}
        questionForm={questionForm}
        setQuestionForm={setQuestionForm}
        questionOptions={questionOptions}
        setQuestionOptions={setQuestionOptions}
        addQuestionOption={addQuestionOption}
        updateQuestionOption={updateQuestionOption}
        removeQuestionOption={removeQuestionOption}
        handleSaveQuestion={handleSaveQuestion}
        handleDeleteQuestion={handleDeleteQuestion}
        loadQuestions={loadQuestions}
        cards={cards}
        cardForm={cardForm}
        setCardForm={setCardForm}
        handleSaveCard={handleSaveCard}
        handleDeleteCard={handleDeleteCard}
      />

    </div>
  );
}

