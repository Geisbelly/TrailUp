import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ContaEmNumeros = { turmas: number; alunos: number; topicos: number };

/**
 * O que seria removido com a conta (protótipo, "Sua conta em números").
 * Três contagens `head` — nenhuma linha trafega. Falha vira `null`: a tela
 * esconde o bloco em vez de mostrar zeros que pareceriam verdade.
 */
export function useContaEmNumeros(professorId: string | undefined) {
  const [numeros, setNumeros] = useState<ContaEmNumeros | null>(null);

  useEffect(() => {
    if (!professorId) return;
    let ativo = true;
    (async () => {
      try {
        const { data: classes, error } = await supabase.from("classe").select("id").eq("professor_id", professorId);
        if (error) throw error;
        const ids = (classes ?? []).map((c) => c.id);
        if (ids.length === 0) {
          if (ativo) setNumeros({ turmas: 0, alunos: 0, topicos: 0 });
          return;
        }
        const [alunos, topicos] = await Promise.all([
          supabase.from("classe_aluno").select("*", { count: "exact", head: true }).in("classe_id", ids),
          supabase.from("topicos").select("*", { count: "exact", head: true }).in("classe_id", ids),
        ]);
        if (alunos.error) throw alunos.error;
        if (topicos.error) throw topicos.error;
        if (ativo) setNumeros({ turmas: ids.length, alunos: alunos.count ?? 0, topicos: topicos.count ?? 0 });
      } catch (err) {
        console.error("Erro ao contar dados da conta:", err);
        if (ativo) setNumeros(null);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [professorId]);

  return numeros;
}
