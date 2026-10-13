import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  Maximize2,
  Crosshair,
  Sparkles,
  Plus,
  RotateCcw,
  Workflow,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { TopicEditDrawer } from "./TopicEditDrawer";
import { CartaoDoTopico } from "./CartaoDoTopico";
import { GenerateTrailDialog } from "./GenerateTrailDialog";
import { ConfirmarDuplicarTopico, ConfirmarExcluirTopico } from "./ConfirmarTopico";
import { numeroNaSequencia, resumoDaTurma } from "./mapa";
import { ClassManagerDialog } from "./ClassManagerDialog";
import { TopicFormDialog } from "./TopicFormDialog";
import { useTopicGraph } from "./useTopicGraph";
import { useTopicDataLoaders } from "./useTopicDataLoaders";
import { useTopicCrud } from "./useTopicCrud";
import { PARAMETRO_DA_TURMA, turmaInicialDaTrilha } from "./turmaDaUrl";
import { updateContentOrder } from "./topicsApi";
import {
  enqueueManualRetryJob,
  isPersonalizacaoJobActive,
  listPersonalizacaoJobs,
  selectFailedJobTopicoIds,
  summarizePersonalizacaoJobs,
  type PersonalizacaoJobStatus,
} from "./personalizacaoJobsApi";
import { parseOptionalPositiveScore } from "@/lib/question-score";

export default function TopicsManager() {
  const { user, session } = useAuth();
  const professorId = user?.id;
  const navigate = useNavigate();
  const { topicoId: topicoIdParam } = useParams<{ topicoId?: string }>();

  const [topicos, setTopicos] = useState<Topico[]>([]);
  const [classes, setClasses] = useState<Classe[]>([]);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topico | null>(null);
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>("");
  // ?turma=<id> escolhe a turma (atalho "Abrir trilha" do card em Turmas).
  const [searchParams, setSearchParams] = useSearchParams();
  const turmaNaUrl = searchParams.get(PARAMETRO_DA_TURMA);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClassDialogOpen, setIsClassDialogOpen] = useState(false);
  const [recentJobs, setRecentJobs] = useState<PersonalizacaoJobStatus[]>([]);
  const [jobsRefreshRevision, setJobsRefreshRevision] = useState(0);
  const [jobsStatusError, setJobsStatusError] = useState<string | null>(null);
  const [isRetryingJobs, setIsRetryingJobs] = useState(false);
  const hasActiveJobsRef = useRef(false);
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
  const [contentForm, setContentForm] = useState<{ titulo: string; tipo: string; conteudo: string; boss_visual?: string | null }>({ titulo: "", tipo: "texto", conteudo: "" });
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
    fitToScreen,
    centerCanvas,
    handleCanvasWheel,
    selectedEdge,
    setSelectedEdge,
    hasPendingChanges,
    resetPendingChanges,
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

  // O console nao enfileira mais class-delta: salvar topico/conteudo ja e' o
  // disparo, feito por trigger no Postgres (migration 20260827_03). O que
  // sobra aqui e' nao deixar o painel de status esperar ate 15s pelo proximo
  // ciclo do polling — refazemos a leitura da fila logo apos o save.
  const refreshJobsSoon = useCallback(() => {
    setJobsStatusError(null);
    setJobsRefreshRevision((revision) => revision + 1);
  }, []);

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
      // Cada UPDATE dispara o trigger, mas eles coalescem no MESMO job
      // pending da classe (FOR UPDATE em fn_enqueue_class_delta_job) — a
      // reordenacao inteira sai como um job so, nao um por topico.
      await Promise.all(updates.map((u) => supabase.from("topicos").update({ ordem: u.ordem }).eq("id", u.id)));
      if (updates.length > 0) refreshJobsSoon();
    },
  });

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Contagem de alunos da turma para o cartão do seletor (só head: nenhuma linha trafega).
  const [alunosDaTurma, setAlunosDaTurma] = useState<number | null>(null);
  useEffect(() => {
    const cid = Number(selectedClassFilter);
    if (!cid) {
      setAlunosDaTurma(null);
      return;
    }
    let ativo = true;
    supabase
      .from("classe_aluno")
      .select("*", { count: "exact", head: true })
      .eq("classe_id", cid)
      .then(({ count, error }) => {
        if (ativo) setAlunosDaTurma(error ? null : count ?? 0);
      });
    return () => {
      ativo = false;
    };
  }, [selectedClassFilter]);

  const [topicoParaDuplicar, setTopicoParaDuplicar] = useState<Topico | null>(null);
  const [topicoParaExcluir, setTopicoParaExcluir] = useState<Topico | null>(null);
  const [iaAberta, setIaAberta] = useState(false);
  const [duplicando, setDuplicando] = useState(false);
  const [excluindoTopico, setExcluindoTopico] = useState(false);

  const handleDuplicarTopico = async () => {
    if (!topicoParaDuplicar) return;
    setDuplicando(true);
    // Transação única no banco (duplicar_topico): falha no meio não deixa cópia pela metade.
    const { error } = await supabase.rpc("duplicar_topico" as never, { p_topico_id: topicoParaDuplicar.id } as never);
    setDuplicando(false);
    if (error) {
      toast.error("Não foi possível duplicar o tópico.");
      return;
    }
    toast.success("Tópico duplicado.");
    setTopicoParaDuplicar(null);
    await loadData();
    refreshJobsSoon();
  };

  const handleConfirmarExclusao = async () => {
    if (!topicoParaExcluir) return;
    setExcluindoTopico(true);
    await handleDelete(topicoParaExcluir);
    setExcluindoTopico(false);
    setTopicoParaExcluir(null);
  };

  // topicos acabou de vir do banco (loadData terminou) — nao ha mais nada
  // pendente pra salvar no grafo de dependencias ate a proxima edicao.
  useEffect(() => {
    if (!isLoading) resetPendingChanges();
  }, [isLoading, resetPendingChanges]);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | undefined;

    const scheduleNextLoad = (delayMs: number) => {
      if (cancelled) return;
      const hiddenTabDelay =
        typeof document !== "undefined" && document.visibilityState === "hidden"
          ? Math.max(delayMs, 30_000)
          : delayMs;
      pollTimer = window.setTimeout(() => {
        void loadJobs();
      }, hiddenTabDelay);
    };

    const loadJobs = async () => {
      if (!session?.access_token || !selectedClassFilter) {
        hasActiveJobsRef.current = false;
        setRecentJobs([]);
        setJobsStatusError(null);
        return;
      }

      let requestFailed = false;
      try {
        const response = await listPersonalizacaoJobs({
          classeId: Number(selectedClassFilter),
          limit: 6,
        });
        if (cancelled) return;
        const jobs = response.itens ?? [];
        hasActiveJobsRef.current = jobs.some(isPersonalizacaoJobActive);
        setRecentJobs(jobs);
        setJobsStatusError(null);
      } catch (error) {
        if (cancelled) return;
        requestFailed = true;
        setJobsStatusError(
          error instanceof Error ? error.message : "Não foi possível atualizar o status."
        );
      }

      if (cancelled) return;
      if (requestFailed) {
        scheduleNextLoad(hasActiveJobsRef.current ? 10_000 : 30_000);
      } else {
        // Jobs em execucao mudam rapido; o polling ocioso descobre geracoes
        // disparadas pelo editor de conteudos sem manter uma consulta agressiva.
        scheduleNextLoad(hasActiveJobsRef.current ? 3_000 : 15_000);
      }
    };

    void loadJobs();

    return () => {
      cancelled = true;
      if (pollTimer != null) window.clearTimeout(pollTimer);
    };
  }, [jobsRefreshRevision, selectedClassFilter, session?.access_token]);

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

  // Escolha inicial pela URL; turma alheia ou inválida cai na primeira, como
  // antes. Se o ?turma= mudar com a tela aberta (link de outra aba do console),
  // a trilha segue a URL.
  // Só segue a URL quando ELA mudou: ao trocar no seletor, a URL ainda tem a
  // turma antiga no mesmo render e desfaria a troca.
  const ultimaTurmaDaUrl = useRef<string | null>(null);
  useEffect(() => {
    if (classes.length === 0) return;
    const urlMudou = turmaNaUrl !== ultimaTurmaDaUrl.current;
    ultimaTurmaDaUrl.current = turmaNaUrl;
    if (!selectedClassFilter || urlMudou) {
      const pedida = turmaInicialDaTrilha(turmaNaUrl, classes);
      if (pedida && pedida !== selectedClassFilter && (!selectedClassFilter || pedida === turmaNaUrl)) setSelectedClassFilter(pedida);
    }
  }, [classes, selectedClassFilter, turmaNaUrl]);

  // E o caminho de volta: a turma escolhida vai para a URL (replace, sem empilhar
  // histórico), para refresh e link compartilhado abrirem na mesma turma.
  useEffect(() => {
    if (!selectedClassFilter || turmaNaUrl === selectedClassFilter) return;
    setSearchParams(
      (atual) => {
        const proximo = new URLSearchParams(atual);
        proximo.set(PARAMETRO_DA_TURMA, selectedClassFilter);
        return proximo;
      },
      { replace: true },
    );
  }, [selectedClassFilter, turmaNaUrl, setSearchParams]);

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
      let savedTopicoId: number;
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
        savedTopicoId = editingTopic.id;
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
        savedTopicoId = (data as Topico).id;
        toast.success("Tópico criado!");
      }
      // O trigger no banco ja enfileirou o class-delta escopado neste topico
      // (novo_topico_db / edicao_topico_db). Nada a chamar aqui.
      refreshJobsSoon();
      await loadData();
      if (editingTopic) {
        setEditDrawerOpen(false);
        navigate("/console/trilha");
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
      // remocao_topico_db: o trigger registra a remocao no payload sem criar
      // target para o topico que acabou de deixar de existir.
      refreshJobsSoon();
    }
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
      // Um UPDATE por topico, todos coalescidos no mesmo job pending da
      // classe — o escopo final e' o grafo inteiro, como antes.
      refreshJobsSoon();
      resetPendingChanges();
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
      refreshJobsSoon();
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

  const handleCreateContent = async (overrideConteudo?: string, targetId?: number | null) => {
    setIsSavingContent(true);
    try {
      const form =
        overrideConteudo !== undefined
          ? { ...contentForm, conteudo: overrideConteudo }
          : contentForm;
      const saved = await createContentHandler(form, targetId);
      if (saved) {
        setContentForm(targetId ? { titulo: saved.titulo, tipo: saved.tipo, conteudo: saved.conteudo ?? "", boss_visual: saved.metadata?.boss_visual ?? null } : { titulo: "", tipo: "texto", conteudo: "" });
      }
      return saved ?? null;
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
  const jobsSummary = useMemo(() => summarizePersonalizacaoJobs(recentJobs), [recentJobs]);
  const latestJobStatus = recentJobs[0]?.status?.trim().toLowerCase() ?? "";
  const failedJobTopicoIds = useMemo(
    () => selectFailedJobTopicoIds(recentJobs),
    [recentJobs]
  );
  const canRetryFailedJobs =
    jobsSummary.activeCount === 0 && failedJobTopicoIds.length > 0;

  const handleRetryFailedJobs = async () => {
    if (!session?.access_token || !selectedClassFilter || isRetryingJobs) return;
    setIsRetryingJobs(true);
    try {
      await enqueueManualRetryJob(session.access_token, {
        classe_id: Number(selectedClassFilter),
        topico_ids: failedJobTopicoIds,
        reason: "retry_manual_console",
      });
      toast.success("Nova tentativa de personalização enfileirada.");
      setJobsRefreshRevision((rev) => rev + 1);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Falha ao tentar novamente a personalização."
      );
    } finally {
      setIsRetryingJobs(false);
    }
  };
  const jobsStatusTitle = [jobsSummary.lastError, jobsStatusError].filter(Boolean).join("\n");
  const jobsStatusLabel =
    jobsSummary.activeCount > 0
      ? `${jobsSummary.activeCount} ${
          jobsSummary.activeCount === 1 ? "geração" : "gerações"
        } em andamento`
      : latestJobStatus === "completed"
        ? "Personalização concluída"
        : latestJobStatus === "failed"
          ? "Personalização com falha"
          : latestJobStatus === "cancelled"
            ? "Personalização cancelada"
            : recentJobs.length > 0
              ? `Personalização: ${latestJobStatus || "aguardando"}`
              : "Status temporariamente indisponível";
  const jobsStatusTone =
    jobsSummary.activeCount > 0
      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
      : latestJobStatus === "completed" && jobsSummary.errorCount === 0
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
        : "border-destructive/30 bg-destructive/10 text-destructive";

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
    navigate("/console/trilha");
  };

  // O editor de topico agora e uma pagina propria (/console/trilha/:topicoId/editar):
  // a URL e a fonte da verdade sobre qual topico esta aberto. Isso cobre link
  // direto, refresh e botao voltar do navegador, alem do clique em "Editar".
  useEffect(() => {
    if (!topicoIdParam) return;
    const numericId = Number(topicoIdParam);
    if (!Number.isFinite(numericId)) return;
    if (editingTopic?.id === numericId) return;
    if (topicos.length === 0) return; // ainda carregando a lista de topicos
    const topic = topicos.find((t) => t.id === numericId);
    if (topic) {
      void handleEditOpen(topic);
    } else {
      toast.error("Tópico não encontrado.");
      navigate("/console/trilha", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicoIdParam, topicos]);

  const turmaSelecionada = classes.find((c) => c.id.toString() === selectedClassFilter) ?? null;
  const nomeDaTurma = turmaSelecionada?.descricao || (turmaSelecionada ? `Turma ${turmaSelecionada.id}` : "");
  const abrirNovoTopico = () => {
    setIsDialogOpen(true);
    const preClass = selectedClassFilter || classes[0]?.id?.toString() || "";
    setFormData((prev) => ({ ...prev, classe_id: preClass }));
  };
  const idsDoMapa = topicsForSelected.map((t) => t.id);
  const statusGeracoes = (
    <>
          {(recentJobs.length > 0 || jobsStatusError) && (
            <div
              role="status"
              aria-live="polite"
              title={jobsStatusTitle || undefined}
              className={`flex max-w-full flex-wrap items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${jobsStatusTone}`}
            >
              {jobsSummary.activeCount > 0 ? (
                <LoaderCircle className="h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />
              ) : latestJobStatus === "completed" && jobsSummary.errorCount === 0 ? (
                <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
              )}
              <span>{jobsStatusLabel}</span>
              {jobsSummary.totalTargets > 0 && (
                <>
                  <span aria-hidden="true">•</span>
                  <span>
                    {jobsSummary.processedTargets}/{jobsSummary.totalTargets} alvos
                  </span>
                </>
              )}
              {jobsSummary.contentIds.length > 0 && (
                <>
                  <span aria-hidden="true">•</span>
                  <span>
                    {jobsSummary.contentIds.length}{" "}
                    {jobsSummary.contentIds.length === 1 ? "conteúdo" : "conteúdos"}
                  </span>
                </>
              )}
              {jobsSummary.errorCount > 0 && (
                <>
                  <span aria-hidden="true">•</span>
                  <span>
                    {jobsSummary.errorCount}{" "}
                    {jobsSummary.errorCount === 1 ? "erro" : "erros"}
                  </span>
                </>
              )}
              {jobsStatusError && recentJobs.length > 0 && (
                <>
                  <span aria-hidden="true">•</span>
                  <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>atualização pendente</span>
                </>
              )}
            </div>
          )}
          {canRetryFailedJobs && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 rounded-full px-2.5 text-[11px]"
              onClick={handleRetryFailedJobs}
              disabled={isRetryingJobs}
            >
              {isRetryingJobs ? (
                <LoaderCircle className="h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw className="h-3 w-3 shrink-0" aria-hidden="true" />
              )}
              Tentar novamente
            </Button>
          )}
    </>
  );

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Editor de trilha</p>
          <div className="mt-2">
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
              <SelectTrigger className="h-auto min-w-[280px] gap-3 rounded-2xl bg-card px-4 py-2.5" aria-label="Turma">
                <SelectValue placeholder="Selecione a turma">
                  {turmaSelecionada && (
                    <span className="flex items-center gap-3 text-left">
                      <span aria-hidden="true" className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
                        {nomeDaTurma.trim().slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">{nomeDaTurma}</span>
                        <span className="block text-[11.5px] text-muted-foreground">{resumoDaTurma(topicsForSelected.length, alunosDaTurma)}</span>
                      </span>
                    </span>
                  )}
                </SelectValue>
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
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          <Button className="rounded-full font-bold" onClick={() => setIaAberta(true)} disabled={!selectedClassFilter}>
            <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
            Gerar trilha com IA
          </Button>
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
          <Button variant="outline" className="rounded-full font-semibold" onClick={saveGraph} disabled={isSaving || !hasPendingChanges}>
            {hasPendingChanges && <span className="mr-2 h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />}
            Salvar dependências
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando tópicos...</div>
      ) : !selectedClassFilter ? (
        <div className="flex flex-col items-center rounded-[20px] border bg-card px-6 py-20 text-center">
          <Workflow className="h-12 w-12 text-muted-foreground/60" aria-hidden="true" />
          <h3 className="mt-4 text-xl font-bold">Escolha uma turma para abrir o canvas</h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Cada turma tem a sua própria trilha de tópicos. Selecione a turma acima para ver e editar o mapa.
          </p>
          <Button
            className="mt-5 rounded-full font-bold"
            onClick={() => (classes.length > 0 ? setSelectedClassFilter(classes[0].id.toString()) : setIsClassDialogOpen(true))}
          >
            {classes.length > 0 ? "Selecionar turma" : "Criar a primeira turma"}
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">Ou escolha uma turma e deixe a IA propor uma trilha inicial a partir do seu plano de ensino.</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border bg-card">
          <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3.5">
            <h3 className="text-[17px] font-bold">Trilha de Tópicos</h3>
            <span
              role="img"
              tabIndex={0}
              aria-label="Ajuda do mapa"
              title="Arraste o fundo para navegar. Arraste um cartão para reposicionar o tópico. Arraste de uma bolinha D ou N para ligar tópicos. Clique numa seta para removê-la."
              className="flex h-5 w-5 cursor-help items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground"
            >
              ?
            </span>
            {statusGeracoes}
            <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="h-0 w-6 border-t-2 border-primary" />
                Sequência
              </span>
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="h-0 w-6 border-t-2 border-dashed border-info" />
                Pré-requisito
              </span>
            </div>
          </div>

          {/* Canvas viewport */}
          <div
            ref={canvasRef}
            className="relative min-h-0 flex-1 overflow-hidden bg-background"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--primary) / 0.07) 1px, transparent 0)`,
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
            <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={abrirNovoTopico}
            className="absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-full border-2 border-dashed border-border bg-card/90 px-4 py-2 text-xs font-semibold text-muted-foreground backdrop-blur-sm hover:border-primary hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Adicionar tópico ao final
          </button>

          {/* Zoom controls */}
          <div className="pointer-events-auto absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-full border bg-card/95 px-2 py-1 shadow-xl backdrop-blur-sm" onPointerDown={(e) => e.stopPropagation()}>
            <button className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Diminuir zoom" aria-label="Diminuir zoom" onClick={zoomOut}>
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="w-11 select-none text-center font-mono text-[11px] text-muted-foreground" aria-live="polite">
              {Math.round(zoom * 100)}%
            </span>
            <button className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Aumentar zoom" aria-label="Aumentar zoom" onClick={zoomIn}>
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <div className="mx-0.5 h-4 w-px bg-border" />
            <button className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Ajustar à tela" aria-label="Ajustar à tela" onClick={() => fitToScreen(idsDoMapa)}>
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Centralizar" aria-label="Centralizar" onClick={() => centerCanvas(idsDoMapa)}>
              <Crosshair className="h-3.5 w-3.5" />
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
                    <path d="M0,0 L10,5 L0,10 z" fill="hsl(var(--primary))" />
                  </marker>
                  <marker id="arrow-depende" markerWidth="10" markerHeight="10" refX="7" refY="5" orient="auto">
                    <path d="M0,0 L10,5 L0,10 z" fill="hsl(var(--info))" />
                  </marker>
                  <marker id="arrow-warning" markerWidth="10" markerHeight="10" refX="7" refY="5" orient="auto">
                    <path d="M0,0 L10,5 L0,10 z" fill="hsl(45 90% 60%)" />
                  </marker>
                </defs>

                {edges.map((edge, idx) => {
                  const { start, end } = getDynamicAnchors(edge.from, edge.to);
                  const isNext = edge.type === "next";
                  const isSelected = selectedEdge?.from === edge.from && selectedEdge?.to === edge.to && selectedEdge?.type === edge.type;
                  const color = isSelected ? "hsl(45 90% 60%)" : isNext ? "hsl(var(--primary))" : "hsl(var(--info))";
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
                        strokeWidth={isSelected ? 3 : 2.5}
                        strokeDasharray={isNext ? undefined : "7 5"}
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
                    stroke={draggingConnector.type === "next" ? "hsl(var(--primary))" : "hsl(var(--info))"}
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
                    <CartaoDoTopico
                      numero={numeroNaSequencia(topic.ordem, topicsForSelected.indexOf(topic))}
                      nome={topic.nome}
                      descricao={topic.descricao}
                      dependeDe={depNames}
                      proximos={nextNames}
                      onEditar={() => navigate(`/console/trilha/${topic.id}/editar`)}
                      onDuplicar={() => setTopicoParaDuplicar(topic)}
                      onExcluir={() => setTopicoParaExcluir(topic)}
                    />

                    {/* Right connector — next */}
                    <button
                      className="absolute -right-2.5 top-[48px] w-5 h-5 rounded-full bg-primary border-2 border-background shadow-lg hover:scale-125 transition-transform z-20 cursor-crosshair flex items-center justify-center"
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

      {selectedClassFilter && (
        <GenerateTrailDialog
          open={iaAberta}
          onOpenChange={setIaAberta}
          classeId={Number(selectedClassFilter)}
          onCreated={() => {
            void loadData();
            refreshJobsSoon();
          }}
        />
      )}
      <ConfirmarDuplicarTopico
        nome={topicoParaDuplicar?.nome ?? ""}
        aberto={topicoParaDuplicar !== null}
        duplicando={duplicando}
        onConfirmar={handleDuplicarTopico}
        onCancelar={() => setTopicoParaDuplicar(null)}
      />
      <ConfirmarExcluirTopico
        nome={topicoParaExcluir?.nome ?? ""}
        aberto={topicoParaExcluir !== null}
        excluindo={excluindoTopico}
        onConfirmar={handleConfirmarExclusao}
        onCancelar={() => setTopicoParaExcluir(null)}
      />

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
