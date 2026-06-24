import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  createContent,
  deleteContent,
  saveActivity,
  deleteActivity,
  saveQuestion,
  deleteQuestion,
  toggleActivityLinkApi,
  saveCard,
  deleteCard,
  createClassWithMateria,
} from "./topicsApi";
import { parseOptionalPositiveScore } from "@/lib/question-score";
import type { Atividade, CardItem, Conteudo, Questao, Topico } from "./types";

type CrudDeps = {
  editingTopic: { id: number } | null;
  contents: Conteudo[];
  setContents: React.Dispatch<React.SetStateAction<Conteudo[]>>;
  setCards: React.Dispatch<React.SetStateAction<CardItem[]>>;
  setActivities: React.Dispatch<React.SetStateAction<Atividade[]>>;
  setQuestions: React.Dispatch<React.SetStateAction<Questao[]>>;
  setActivityLinks: React.Dispatch<React.SetStateAction<Record<number, number[]>>>;
  topicos?: Topico[];
  setTopicos?: React.Dispatch<React.SetStateAction<Topico[]>>;
  persistOrder?: (updates: { id: number; ordem: number }[]) => Promise<void>;
};

export function useTopicCrud({
  editingTopic,
  contents,
  setContents,
  setCards,
  setActivities,
  setQuestions,
  setActivityLinks,
  topicos,
  setTopicos,
  persistOrder,
}: CrudDeps) {
  const normalizeQuestionTipo = (tipo: string, alternativasCount: number) => {
    const raw = (tipo || "").trim().toLowerCase();
    if (raw === "multipla" || raw === "quiz") return "multipla";
    if (raw === "verdadeiro_falso" || raw === "true_false" || raw === "vf") return "verdadeiro_falso";
    if (raw === "fill_blank" || raw === "lacuna" || raw === "completar") return "fill_blank";
    if (raw === "dissertativa" || raw === "essay" || raw === "questao" || raw === "texto") return "dissertativa";
    return alternativasCount > 0 ? "multipla" : "dissertativa";
  };

  const normalizeQuestionPayload = (params: {
    tipo: string;
    alternativas: string[];
    resposta: string | null;
  }) => {
    const tipo = normalizeQuestionTipo(params.tipo, params.alternativas.length);

    if (tipo === "verdadeiro_falso") {
      const resposta = params.resposta === "Falso" ? "Falso" : "Verdadeiro";
      return {
        tipo,
        alternativas: ["Verdadeiro", "Falso"],
        resposta,
      };
    }

    if (tipo === "multipla") {
      const dedupAlternativas = Array.from(new Set(params.alternativas.filter(Boolean)));
      const resposta = params.resposta?.trim() || dedupAlternativas[0] || "";
      if (resposta && !dedupAlternativas.includes(resposta)) dedupAlternativas.unshift(resposta);
      while (dedupAlternativas.length < 2) dedupAlternativas.push(`Alternativa ${dedupAlternativas.length + 1}`);
      return {
        tipo,
        alternativas: dedupAlternativas.slice(0, 4),
        resposta: resposta || dedupAlternativas[0],
      };
    }

    return {
      tipo,
      alternativas: null,
      resposta: params.resposta?.trim() || "Resposta aberta",
    };
  };

  const recalcOrder = async (current: Topico[]) => {
    if (!setTopicos || current.length === 0) return;

    const byClass: Record<number, Topico[]> = {};
    current.forEach((t) => {
      byClass[t.classe_id] = byClass[t.classe_id] || [];
      byClass[t.classe_id].push(t);
    });

    let changed = false;
    const reordered: Topico[] = [];
    const updates: { id: number; ordem: number }[] = [];

    Object.values(byClass).forEach((list) => {
      // limpa auto-loops e próximos inversos diretos
      const cleaned = list.map((t) => {
        const cleanedDep = t.depende.filter((d) => d !== t.id && !t.next.includes(d));
        const cleanedNext = t.next.filter((n) => n !== t.id && !list.find((x) => x.id === n)?.next.includes(t.id));
        if (cleanedDep.length !== t.depende.length || cleanedNext.length !== t.next.length) changed = true;
        return { ...t, depende: cleanedDep, next: cleanedNext };
      });

      // constrói grafo (depende: dep -> t, next: t -> nxt)
      const adj = new Map<number, number[]>();
      const indegree = new Map<number, number>();
      cleaned.forEach((t) => {
        adj.set(t.id, []);
        indegree.set(t.id, 0);
      });
      cleaned.forEach((t) => {
        t.depende.forEach((d) => {
          if (adj.has(d)) adj.get(d)!.push(t.id);
          if (indegree.has(t.id)) indegree.set(t.id, (indegree.get(t.id) || 0) + 1);
        });
        t.next.forEach((n) => {
          if (adj.has(t.id)) adj.get(t.id)!.push(n);
          if (indegree.has(n)) indegree.set(n, (indegree.get(n) || 0) + 1);
        });
      });

      const queue: Topico[] = [];
      cleaned.forEach((t) => {
        if ((indegree.get(t.id) || 0) === 0) queue.push(t);
      });

      const result: Topico[] = [];
      while (queue.length) {
        const curr = queue.shift()!;
        result.push(curr);
        (adj.get(curr.id) || []).forEach((n) => {
          if (!indegree.has(n)) return;
          indegree.set(n, (indegree.get(n) || 0) - 1);
          if ((indegree.get(n) || 0) === 0) {
            const node = cleaned.find((t) => t.id === n);
            if (node) queue.push(node);
          }
        });
      }

      const ordered = result.length === cleaned.length ? result : cleaned;
      ordered.forEach((t, idx) => {
        const ord = idx + 1;
        if (t.ordem !== ord) {
          changed = true;
          updates.push({ id: t.id, ordem: ord });
        }
        reordered.push({ ...t, ordem: ord });
      });
    });

    if (changed) {
      setTopicos(reordered);
      if (updates.length > 0) {
        const tasks = updates.map((u) => supabase.from("topicos").update({ ordem: u.ordem }).eq("id", u.id));
        await Promise.all(tasks);
      }
    }
  };
  const handleCreateContent = async (contentForm: { titulo: string; tipo: string; conteudo: string }) => {
    const targetTopicId = editingTopic?.id;
    if (!targetTopicId) {
      toast.error("Selecione ou abra um topico para adicionar conteudo.");
      return null;
    }
    if (!contentForm.titulo) {
      toast.error("Informe um titulo para o conteudo");
      return null;
    }
    try {
      const ordem = contents.length + 1;
      const data = await createContent({ topico_id: targetTopicId, ...contentForm, ordem });
      setContents((prev) => [...prev, data]);
      toast.success("Conteúdo criado!");
      return data;
    } catch (error) {
      console.error("Erro ao criar conteúdo:", error);
      toast.error("Não foi possível criar o conteúdo.");
      return null;
    }
  };

  const handleDeleteContent = async (id: number) => {
    try {
      await deleteContent(id);
      setContents((prev) => prev.filter((c) => c.id !== id));
    } catch (error) {
      console.error("Erro ao remover conteúdo:", error);
      toast.error("Não foi possível remover o conteúdo.");
    }
  };

  const handleSaveActivity = async (activityForm: {
    id: number;
    titulo: string;
    descricao: string;
    tipo: string;
    data_entrega: string;
  }, topicoId?: number, selectedContentId?: number | null, activityLinks?: Record<number, number[]>) => {
    const topicId = topicoId ?? editingTopic?.id;
    if (!topicId) return;
    if (!activityForm.titulo) {
      toast.error("Informe o título da atividade");
      return;
    }
    try {
      const activityId = await saveActivity({
        id: activityForm.id || undefined,
        topico_id: topicId,
        titulo: activityForm.titulo,
        descricao: activityForm.descricao,
        tipo: activityForm.tipo || null,
        data_entrega: activityForm.data_entrega || null,
      });

      if (selectedContentId && activityLinks) {
        const alreadyLinked = activityLinks[selectedContentId]?.includes(activityId);
        if (!alreadyLinked) {
          await toggleActivityLinkApi(selectedContentId, activityId, true);
        }
      }
      return activityId;
    } catch (error) {
      console.error("Erro ao salvar atividade:", error);
      toast.error("Não foi possível salvar a atividade.");
      return;
    }
  };

  const handleDeleteActivityApi = async (id: number) => {
    try {
      await deleteActivity(id);
      toast.success("Atividade excluída.");
    } catch (error) {
      console.error("Erro ao excluir atividade:", error);
      toast.error("Não foi possível excluir atividade.");
    }
  };

  const handleSaveQuestion = async (questionForm: {
    id: number;
    atividade_id: string;
    enunciado: string;
    tipo: string;
    resposta_correta: string;
    nota_estabelecida?: number | string | null;
    midia_url?: string;
  }, questionOptions: string[]) => {
    if (!questionForm.enunciado || !questionForm.atividade_id) {
      toast.error("Informe enunciado e selecione a atividade.");
      return;
    }
    const alternativas = questionOptions.map((opt) => opt.trim()).filter(Boolean);
    const normalized = normalizeQuestionPayload({
      tipo: questionForm.tipo,
      alternativas,
      resposta: questionForm.resposta_correta || null,
    });
    const scoreParsed = parseOptionalPositiveScore(questionForm.nota_estabelecida);
    if (!scoreParsed.isValid) {
      toast.error("A nota da questao deve ser maior que 0 ou deixada em branco.");
      return;
    }
    try {
      const id = await saveQuestion({
        id: questionForm.id || undefined,
        atividade_id: Number(questionForm.atividade_id),
        enunciado: questionForm.enunciado,
        tipo: normalized.tipo,
        alternativas: normalized.alternativas,
        resposta_correta: normalized.resposta,
        nota_estabelecida: scoreParsed.value,
        midia_url: questionForm.midia_url || null,
      });
      toast.success("Questão salva!");
      return id;
    } catch (error) {
      console.error("Erro ao salvar questão:", error);
      toast.error("Não foi possível salvar a questão.");
      return;
    }
  };

  const handleDeleteQuestionApi = async (id: number) => {
    try {
      await deleteQuestion(id);
      toast.success("Questão removida.");
    } catch (error) {
      console.error("Erro ao excluir questão:", error);
      toast.error("Não foi possível excluir questão.");
    }
  };

  const toggleActivityLink = async (conteudoId: number, atividadeId: number, link: boolean) => {
    try {
      await toggleActivityLinkApi(conteudoId, atividadeId, link);
    } catch (error) {
      console.error("Erro ao vincular atividade:", error);
      toast.error("Não foi possível atualizar vinculo.");
      throw error;
    }
  };

  const handleSaveCard = async (cardForm: {
    id: number;
    conteudo_id: string;
    conteudo_origem_id?: string;
    titulo: string;
    descricao: string;
    imagem_url: string;
  }) => {
    try {
      const id = await saveCard({
        id: cardForm.id || undefined,
        conteudo_id: cardForm.conteudo_id,
        conteudo_origem_id: cardForm.conteudo_origem_id || null,
        titulo: cardForm.titulo,
        descricao: cardForm.descricao,
        imagem_url: cardForm.imagem_url,
      });
      toast.success("Card salvo!");
      return id;
    } catch (error) {
      console.error("Erro ao salvar card:", error);
      toast.error("Não foi possível salvar o card.");
      return;
    }
  };

  const handleDeleteCard = async (id: number) => {
    try {
      await deleteCard(id);
      toast.success("Card excluido.");
      return true;
    } catch (error) {
      console.error("Erro ao excluir card:", error);
      const message = error instanceof Error ? error.message : "Nao foi possivel excluir card.";
      toast.error(message);
      return false;
    }
  };

  const handleCreateActivityWithQuestion = async (params: {
    newActivityForm: {
      titulo: string;
      descricao: string;
      tipo: string;
      data_entrega: string;
      questionEnunciado: string;
      questionTipo: string;
      questionResposta: string;
      questionNota?: string;
      questionOptions: string[];
    };
    topicoId?: number;
    conteudoId?: number | null;
  }) => {
    const topicId = params.topicoId ?? editingTopic?.id;
    if (!topicId) {
      toast.error("Selecione um tópico.");
      return;
    }
    if (!params.newActivityForm.titulo) {
      toast.error("Informe título da atividade.");
      return;
    }
    try {
      const atividadeId = await saveActivity({
        topico_id: topicId,
        titulo: params.newActivityForm.titulo,
        descricao: params.newActivityForm.descricao,
        tipo: params.newActivityForm.tipo || null,
        data_entrega: params.newActivityForm.data_entrega || null,
      });

      if (params.conteudoId) {
        await toggleActivityLinkApi(params.conteudoId, atividadeId, true);
      }

      if (params.newActivityForm.questionEnunciado) {
        const scoreParsed = parseOptionalPositiveScore(params.newActivityForm.questionNota);
        if (!scoreParsed.isValid) {
          toast.error("A nota da questao deve ser maior que 0 ou deixada em branco.");
          return;
        }
        const alternativas = params.newActivityForm.questionOptions.map((o) => o.trim()).filter(Boolean);
        const normalized = normalizeQuestionPayload({
          tipo: params.newActivityForm.questionTipo || params.newActivityForm.tipo || "multipla",
          alternativas,
          resposta: params.newActivityForm.questionResposta || null,
        });
        await saveQuestion({
          atividade_id: atividadeId,
          enunciado: params.newActivityForm.questionEnunciado,
          tipo: normalized.tipo,
          alternativas: normalized.alternativas,
          resposta_correta: normalized.resposta,
          nota_estabelecida: scoreParsed.value,
        });
      }
      toast.success("Atividade criada!");
      return atividadeId;
    } catch (error) {
      console.error("Erro ao criar atividade/questão:", error);
      toast.error("Não foi possível criar atividade.");
      return;
    }
  };

  const handleCreateClass = async (params: {
    classForm: { descricao: string; materia_id: string };
    newMateria: { nome: string; descricao: string };
    professorId?: string;
  }) => {
    if (!params.classForm.descricao) {
      toast.error("Descreva a classe");
      return null;
    }
    try {
      const created = await createClassWithMateria({
        descricao: params.classForm.descricao,
        materia_id: params.classForm.materia_id,
        newMateria: params.newMateria.nome ? params.newMateria : undefined,
        professorId: params.professorId,
      });
      toast.success("Classe criada!");
      return created;
    } catch (error) {
      console.error("Erro ao criar classe:", error);
      toast.error("Não foi possível criar a classe.");
      return null;
    }
  };

  const handleDeleteTopic = async (id: number) => {
    const confirmDelete = window.confirm("Remover este tópico? Isso apagará dependências.");
    if (!confirmDelete) return false;

    // primeiro remove referencias de next/depende em outros topicos
    try {
      const { data: topics, error: fetchErr } = await supabase
        .from("topicos")
        .select("id, next, depende");
      if (fetchErr) throw fetchErr;

      const updates = (topics ?? []).map((t) => {
        const nextArr = Array.isArray(t.next)
          ? t.next
          : t.next
          ? JSON.parse(t.next as string)
          : [];
        const dependeArr = Array.isArray(t.depende)
          ? t.depende
          : t.depende
          ? JSON.parse(t.depende as string)
          : [];
        const newNext = nextArr.filter((n: number) => n !== id);
        const newDep = dependeArr.filter((n: number) => n !== id);
        const changed = newNext.length !== nextArr.length || newDep.length !== dependeArr.length;
        return changed
          ? supabase.from("topicos").update({ next: newNext, depende: newDep }).eq("id", t.id)
          : null;
      }).filter(Boolean);

      if (updates.length > 0) {
        const results = await Promise.all(updates);
        const err = results.find((r) => r?.error);
        if (err?.error) throw err.error;
      }

      const { error } = await supabase.from("topicos").delete().eq("id", id);
      if (error) throw error;

      if (setTopicos) {
        setTopicos((prev) =>
          prev
            .filter((t) => t.id !== id)
            .map((t) => ({
              ...t,
              next: t.next.filter((n) => n !== id),
              depende: t.depende.filter((n) => n !== id),
            }))
        );
      }
      if (persistOrder && topicos) {
        const remaining = topicos.filter((t) => t.id !== id);
        const byClass: Record<number, Topico[]> = {};
        remaining.forEach((t) => {
          byClass[t.classe_id] = byClass[t.classe_id] || [];
          byClass[t.classe_id].push(t);
        });
        const updates: { id: number; ordem: number }[] = [];
        Object.values(byClass).forEach((list) => {
          list
            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
            .forEach((t, idx) => {
              const ordem = idx + 1;
              if (t.ordem !== ordem) updates.push({ id: t.id, ordem });
            });
        });
        if (updates.length > 0) {
          await persistOrder(updates);
        }
      }

      toast.success("Tópico removido.");
      return true;
    } catch (error) {
      console.error("Erro ao excluir tópico:", error);
      toast.error("Não foi possível excluir tópico.");
      return false;
    }
  };

  return {
    handleCreateContent,
    handleDeleteContent,
    handleSaveActivity,
    handleDeleteActivityApi,
    handleSaveQuestion,
    handleDeleteQuestionApi,
    toggleActivityLink,
    handleSaveCard,
    handleDeleteCard,
    handleCreateActivityWithQuestion,
    handleCreateClass,
    handleDeleteTopic,
    recalcOrder,
  };
}
