import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useProfessorData() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["professor", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("professor")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

export function useProfessorClasses() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["classes", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("classe")
        .select("*")
        .eq("professor_id", user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
}

export function useClassTopics(classeId?: number) {
  return useQuery({
    queryKey: ["topicos", classeId],
    queryFn: async () => {
      if (!classeId) return [];
      const { data, error } = await supabase
        .from("topicos")
        .select("*")
        .eq("classe_id", classeId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!classeId,
  });
}

export function useTopicContents(topicoId?: number) {
  return useQuery({
    queryKey: ["conteudos", topicoId],
    queryFn: async () => {
      if (!topicoId) return [];
      const { data, error } = await supabase
        .from("conteudos")
        .select("*")
        .eq("topico_id", topicoId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!topicoId,
  });
}

export function useTopicActivities(topicoId?: number) {
  return useQuery({
    queryKey: ["atividades", topicoId],
    queryFn: async () => {
      if (!topicoId) return [];
      const { data, error } = await supabase
        .from("atividades")
        .select("*")
        .eq("topico_id", topicoId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!topicoId,
  });
}
