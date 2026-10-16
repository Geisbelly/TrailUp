import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TurmaDoProfessor = { id: number; descricao: string | null };

/**
 * As turmas do professor e a escolhida. As telas novas do console (Conquistas, Notas,
 * Missões…) são todas "por turma"; este hook evita cada uma reescrever a mesma leitura.
 * Erro de leitura NÃO vira lista vazia: `erro` fica preenchido e a tela mostra o erro.
 */
export function useTurmasDoProfessor(professorId: string | undefined) {
  const [turmas, setTurmas] = useState<TurmaDoProfessor[]>([]);
  const [turmaId, setTurmaId] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!professorId) return;
    setCarregando(true);
    setErro(null);
    const { data, error } = await supabase.from("classe").select("id, descricao").eq("professor_id", professorId).order("id");
    if (error) {
      setErro(error.message || "erro desconhecido");
    } else {
      const lista = (data ?? []) as TurmaDoProfessor[];
      setTurmas(lista);
      setTurmaId((atual) => (lista.some((t) => t.id === atual) ? atual : (lista[0]?.id ?? null)));
    }
    setCarregando(false);
  }, [professorId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { turmas, turmaId, setTurmaId, carregando, erro, recarregar: carregar };
}
