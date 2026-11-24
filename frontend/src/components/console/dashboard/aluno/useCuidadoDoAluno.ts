import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { selectView } from "@/lib/supabaseViews";
import { createRequestGuard } from "@/lib/requestGuard";
import { cuidadoDeExemplo } from "./exemploDoAluno";
import { normalizarMomento, rpcAusente, type MomentoDeCuidado } from "./cuidado";

export type EstadoDoCuidado =
  | { tipo: "carregando" }
  | { tipo: "pronto" }
  | { tipo: "indisponivel" } // migration 20261121_02 ainda não aplicada neste banco
  | { tipo: "erro"; detalhe: string };

export type DadosDoCuidado = { momentos: MomentoDeCuidado[]; topicos: Map<number, string> };

type ErroDoBanco = { code?: string; message: string };

class FalhaDeLeitura extends Error {
  constructor(readonly erro: ErroDoBanco) {
    super(erro.message);
  }
}

async function ler(consulta: PromiseLike<{ data: unknown; error?: { message: string } | null }>): Promise<Record<string, unknown>[]> {
  const { data, error } = await consulta;
  if (error) throw new FalhaDeLeitura(error as ErroDoBanco);
  return (Array.isArray(data) ? data : []) as Record<string, unknown>[];
}

const VAZIO: DadosDoCuidado = { momentos: [], topicos: new Map() };

/**
 * Leitura direta do Supabase, sem API (é leitura de banco, sem modelo no meio). A tabela base não
 * tem policy para o professor: só a RPC `cuidado_da_turma`, que confere a posse da turma e não
 * devolve o nível.
 */
export function useCuidadoDoAluno(alunoId: string, classeId: number) {
  const [dados, setDados] = useState<DadosDoCuidado>(VAZIO);
  const [estado, setEstado] = useState<EstadoDoCuidado>({ tipo: "carregando" });
  const guarda = useRef(createRequestGuard());

  useEffect(() => {
    const request = guarda.current.next();
    // Aluno de exemplo da turma de demonstração: não existe no banco, o dado é do navegador.
    const exemplo = cuidadoDeExemplo(alunoId, new Date());
    if (exemplo) {
      setDados(exemplo);
      setEstado({ tipo: "pronto" });
      return;
    }
    setEstado({ tipo: "carregando" });
    Promise.all([
      ler(supabase.rpc("cuidado_da_turma" as never, { p_classe_id: classeId, p_aluno_id: alunoId } as never)),
      ler(selectView("topicos", "id, nome").eq("classe_id", classeId)),
    ])
      .then(([momentos, topicos]) => {
        if (!request.isCurrent()) return;
        setDados({
          momentos: momentos.map(normalizarMomento).sort((a, b) => b.criado_em.localeCompare(a.criado_em)),
          topicos: new Map(topicos.map((t) => [Number(t.id), String(t.nome ?? "")])),
        });
        setEstado({ tipo: "pronto" });
      })
      .catch((e: unknown) => {
        if (!request.isCurrent()) return;
        const erro = e instanceof FalhaDeLeitura ? e.erro : null;
        if (rpcAusente(erro)) setEstado({ tipo: "indisponivel" });
        else setEstado({ tipo: "erro", detalhe: e instanceof Error ? e.message : "Não foi possível carregar os momentos de cuidado." });
      });
  }, [alunoId, classeId]);

  return { dados, estado };
}
