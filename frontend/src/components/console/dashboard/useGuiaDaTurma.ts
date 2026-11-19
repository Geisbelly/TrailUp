import { useEffect, useRef, useState } from "react";
import { selectView } from "@/lib/supabaseViews";
import { createRequestGuard } from "@/lib/requestGuard";
import {
  normalizarAlunoTopico,
  normalizarConceito,
  normalizarTurmaTopico,
  viewAusente,
  type GuiaAlunoTopico,
  type GuiaConceito,
  type GuiaTurmaTopico,
  type TopicoDoGuia,
} from "./guia";

export type DadosDoGuia = {
  topicos: TopicoDoGuia[];
  porTopico: GuiaTurmaTopico[];
  conceitos: GuiaConceito[];
  porAluno: GuiaAlunoTopico[];
};

export type EstadoDoGuia =
  | { tipo: "carregando" }
  | { tipo: "pronto" }
  | { tipo: "indisponivel" } // migration 20261118_01 ainda não aplicada neste banco
  | { tipo: "erro"; detalhe: string };

const VAZIO: DadosDoGuia = { topicos: [], porTopico: [], conceitos: [], porAluno: [] };

type ErroDoBanco = { code?: string; message: string };

class FalhaDeLeitura extends Error {
  constructor(readonly erro: ErroDoBanco) {
    super(erro.message);
  }
}

async function ler(consulta: PromiseLike<{ data: unknown[] | null; error?: { message: string } | null }>): Promise<Record<string, unknown>[]> {
  const { data, error } = await consulta;
  if (error) throw new FalhaDeLeitura(error as ErroDoBanco);
  return (data ?? []) as Record<string, unknown>[];
}

/**
 * Leitura direta do Supabase para a aba Guia (sem API: é leitura de banco, não tem modelo de
 * linguagem no meio). As três views são `security_invoker`, então a RLS de `chat_guia_registros`
 * vale: o professor só vê as turmas dele (`app_classes_do_professor()`). A aba só é montada aberta.
 */
export function useGuiaDaTurma(classIds: number[]) {
  const [dados, setDados] = useState<DadosDoGuia>(VAZIO);
  const [estado, setEstado] = useState<EstadoDoGuia>({ tipo: "carregando" });
  const guarda = useRef(createRequestGuard());

  useEffect(() => {
    const request = guarda.current.next();
    if (classIds.length === 0) {
      setDados(VAZIO);
      setEstado({ tipo: "pronto" });
      return;
    }
    setEstado({ tipo: "carregando" });
    Promise.all([
      ler(selectView("topicos", "id, classe_id, nome").in("classe_id", classIds).order("ordem", { ascending: true })),
      ler(selectView("vw_chat_guia_turma_topico", "*").in("classe_id", classIds)),
      ler(selectView("vw_chat_guia_conceitos_turma", "*").in("classe_id", classIds)),
      ler(selectView("vw_chat_guia_aluno_topico", "*").in("classe_id", classIds)),
    ])
      .then(([topicos, porTopico, conceitos, porAluno]) => {
        if (!request.isCurrent()) return;
        setDados({
          topicos: topicos.map((t) => ({ id: Number(t.id), classe_id: Number(t.classe_id), nome: String(t.nome ?? "") })),
          porTopico: porTopico.map(normalizarTurmaTopico),
          conceitos: conceitos.map(normalizarConceito),
          porAluno: porAluno.map(normalizarAlunoTopico),
        });
        setEstado({ tipo: "pronto" });
      })
      .catch((e: unknown) => {
        if (!request.isCurrent()) return;
        const erro = e instanceof FalhaDeLeitura ? e.erro : null;
        if (viewAusente(erro)) setEstado({ tipo: "indisponivel" });
        else setEstado({ tipo: "erro", detalhe: e instanceof Error ? e.message : "Não foi possível carregar as perguntas ao Guia." });
      });
  }, [classIds]);

  return { dados, estado };
}
