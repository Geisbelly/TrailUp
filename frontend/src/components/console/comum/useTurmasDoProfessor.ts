import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TurmaDoProfessor = { id: number; descricao: string | null };

/** `?turma=` da URL, se houver: é por onde a Lumi e outros links levam a uma turma. */
function turmaDaUrl(): number | null {
  try {
    const n = Number(new URLSearchParams(window.location.search).get("turma"));
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * As turmas do professor e a escolhida (a da URL, se for dele; senão a primeira). As telas novas do console (Conquistas, Notas,
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
      const daUrl = turmaDaUrl();
      setTurmaId((atual) => {
        if (lista.some((t) => t.id === atual)) return atual;
        if (daUrl !== null && lista.some((t) => t.id === daUrl)) return daUrl;
        return lista[0]?.id ?? null;
      });
    }
    setCarregando(false);
  }, [professorId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { turmas, turmaId, setTurmaId, carregando, erro, recarregar: carregar };
}
