import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRequestGuard } from "@/lib/requestGuard";
import {
  contarGargalosPorFormato,
  SELECT_DA_BASE,
  type GargalosDePersonalizacao,
  type LinhaBaseDaPersonalizacao,
} from "./gargalos";

export type EstadoDosGargalos = {
  gargalos: GargalosDePersonalizacao | null;
  carregando: boolean;
  erro: string | null;
};

/**
 * Material-base das turmas do escopo, direto no Supabase: `professor_all_conteudo_personalizado`
 * libera as linhas das turmas do professor, inclusive a base (sem aluno). Não passa pela API, então
 * o card continua de pé com ela fora do ar, que é justamente quando os gargalos aparecem.
 */
export function useGargalosDePersonalizacao(classIds: number[]): EstadoDosGargalos {
  const [estado, setEstado] = useState<EstadoDosGargalos>({ gargalos: null, carregando: false, erro: null });
  const guarda = useRef(createRequestGuard());
  const chave = classIds.join(",");

  useEffect(() => {
    const request = guarda.current.next();
    const ids = chave ? chave.split(",").map(Number) : [];
    if (ids.length === 0) {
      setEstado({ gargalos: null, carregando: false, erro: null });
      return;
    }
    setEstado((e) => ({ ...e, carregando: true, erro: null }));
    void supabase
      .from("conteudo_personalizado" as never)
      .select(SELECT_DA_BASE)
      .in("classe_id", ids)
      .is("aluno_id", null)
      .limit(5000)
      .then(({ data, error }) => {
        if (!request.isCurrent()) return;
        setEstado({
          gargalos: error ? null : contarGargalosPorFormato((data ?? []) as unknown as LinhaBaseDaPersonalizacao[]),
          carregando: false,
          erro: error?.message ?? null,
        });
      });
  }, [chave]);

  return estado;
}
