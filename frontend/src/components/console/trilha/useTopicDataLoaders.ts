import { useCallback } from "react";
import { toast } from "sonner";
import {
  fetchActivities,
  fetchActivityLinks,
  fetchCards,
  fetchClassesAndMaterias,
  fetchContents,
  fetchQuestions,
  fetchTopicsByClasses,
} from "./topicsApi";
import type { Atividade, CardItem, Classe, Conteudo, Materia, Questao, Topico } from "./types";

type LoaderDeps = {
  professorId?: string;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setTopicos: React.Dispatch<React.SetStateAction<Topico[]>>;
  setClasses: React.Dispatch<React.SetStateAction<Classe[]>>;
  setMaterias: React.Dispatch<React.SetStateAction<Materia[]>>;
  setContents: React.Dispatch<React.SetStateAction<Conteudo[]>>;
  setActivities: React.Dispatch<React.SetStateAction<Atividade[]>>;
  setActivityLinks: React.Dispatch<React.SetStateAction<Record<number, number[]>>>;
  setCards: React.Dispatch<React.SetStateAction<CardItem[]>>;
  setQuestions: React.Dispatch<React.SetStateAction<Questao[]>>;
};

export function useTopicDataLoaders({
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
}: LoaderDeps) {
  const loadData = useCallback(async () => {
    if (!professorId) return;
    setIsLoading(true);
    try {
      const { classes: fetchedClasses, materias: fetchedMaterias } = await fetchClassesAndMaterias(professorId);
      const classIds = fetchedClasses.map((c) => c.id);
      const topicsData = await fetchTopicsByClasses(classIds);

      const parsedTopics =
        ((topicsData as Topico[] | null) ?? []).map((t) => ({
          ...t,
          next: Array.isArray(t.next)
            ? (t.next as unknown[]).map((n) => Number(n))
            : t.next
            ? JSON.parse(t.next as unknown as string)
            : [],
          depende: Array.isArray(t.depende)
            ? (t.depende as unknown[]).map((n) => Number(n))
            : t.depende
            ? JSON.parse(t.depende as unknown as string)
            : [],
        }));

      setClasses(fetchedClasses);
      setMaterias(fetchedMaterias);
      setTopicos(parsedTopics);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Não foi possível carregar dados.");
    } finally {
      setIsLoading(false);
    }
  }, [professorId, setIsLoading, setClasses, setMaterias, setTopicos]);

  const loadContents = async (topicId: number) => {
    try {
      const data = await fetchContents(topicId);
      setContents(data);
    } catch (error) {
      console.error("Erro ao carregar conteudos:", error);
      toast.error("Não foi possível carregar conteudos do topico.");
    }
  };

  const loadActivities = async (topicId: number) => {
    try {
      const data = await fetchActivities(topicId);
      setActivities(data);
    } catch (error) {
      console.error("Erro ao carregar atividades:", error);
      toast.error("Não foi possível carregar atividades do topico.");
    }
  };

  const loadActivityLinks = async (topicId: number) => {
    try {
      const links = await fetchActivityLinks(topicId);
      const mapped: Record<number, number[]> = {};
      links.forEach((l) => {
        mapped[l.conteudo_id] = mapped[l.conteudo_id] || [];
        if (!mapped[l.conteudo_id].includes(l.atividade_id)) {
          mapped[l.conteudo_id].push(l.atividade_id);
        }
      });
      setActivityLinks(mapped);
    } catch (error) {
      console.error("Erro ao carregar vinculações atividade/conteúdo:", error);
      toast.error("Não foi possível carregar vinculacoes de atividades.");
    }
  };

  const loadCards = async (topicId: number) => {
    try {
      const data = await fetchCards(topicId);
      setCards(data);
    } catch (error) {
      console.error("Erro ao carregar cards:", error);
      toast.error("Não foi possível carregar cards.");
    }
  };

  const loadQuestions = async (atividadeId: number) => {
    try {
      const data = await fetchQuestions(atividadeId);
      setQuestions(data);
    } catch (error) {
      console.error("Erro ao carregar questões:", error);
      toast.error("Não foi possível carregar questoes.");
    }
  };

  return {
    loadData,
    loadContents,
    loadActivities,
    loadActivityLinks,
    loadCards,
    loadQuestions,
  };
}
