import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRequestGuard } from "@/lib/requestGuard";
import { eFuncaoAusente, lerRiscoDeReprovacao, type RiscoDoAluno } from "./riscoReprovacao";

export type EstadoDoRisco = {
  linhas: RiscoDoAluno[] | null;
  carregando: boolean;
  erro: string | null;
  indisponivel: boolean;
};

/**
 * Risco de reprovação de UMA turma (#135), direto no Supabase: a regra mora no banco
 * (`professor_risco_reprovacao_turma`), sem modelo de linguagem, então não passa pela API.
 * A função confere a posse; turma alheia volta erro, não lista vazia.
 */
export function useRiscoDeReprovacao(classeId: number | null): EstadoDoRisco {
  const [estado, setEstado] = useState<EstadoDoRisco>({ linhas: null, carregando: false, erro: null, indisponivel: false });
  const guarda = useRef(createRequestGuard());

  useEffect(() => {
    const request = guarda.current.next();
    if (classeId === null) {
      setEstado({ linhas: null, carregando: false, erro: null, indisponivel: false });
      return;
    }
    setEstado((e) => ({ ...e, carregando: true, erro: null, indisponivel: false }));
    void supabase
      .rpc("professor_risco_reprovacao_turma" as never, { p_classe_id: classeId } as never)
      .then(({ data, error }) => {
        if (!request.isCurrent()) return;
        if (error) {
          setEstado({ linhas: null, carregando: false, erro: error.message, indisponivel: eFuncaoAusente(error) });
          return;
        }
        const linhas = lerRiscoDeReprovacao(data);
        setEstado({
          linhas,
          carregando: false,
          erro: linhas === null ? "A resposta não veio no formato esperado." : null,
          indisponivel: false,
        });
      });
  }, [classeId]);

  return estado;
}
