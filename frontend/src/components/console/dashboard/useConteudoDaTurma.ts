import { useEffect, useRef, useState } from "react";
import { selectView } from "@/lib/supabaseViews";
import { createRequestGuard } from "@/lib/requestGuard";
import type {
  AtividadeAlunoLinha,
  ConteudoAlunoLinha,
  ConteudoBase,
  ProgressoPersonalizadoLinha,
  TopicoBase,
  VinculoAtividade,
} from "./conteudo";

export type DadosDeConteudo = {
  topicos: TopicoBase[];
  conteudos: ConteudoBase[];
  conteudoAluno: ConteudoAlunoLinha[];
  progressoPersonalizado: ProgressoPersonalizadoLinha[];
  vinculos: VinculoAtividade[];
  atividadeAluno: AtividadeAlunoLinha[];
};

const VAZIO: DadosDeConteudo = { topicos: [], conteudos: [], conteudoAluno: [], progressoPersonalizado: [], vinculos: [], atividadeAluno: [] };

async function ler<T>(consulta: PromiseLike<{ data: unknown[] | null; error?: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

/**
 * Leitura direta do Supabase para a aba Conteúdo (sem API: não há modelo de
 * linguagem no meio). A aba só é montada quando está aberta. RLS do professor
 * cobre todas as tabelas (posse pela classe; migrations 20260826_08 a _10).
 */
export function useConteudoDaTurma(classIds: number[]) {
  const [dados, setDados] = useState<DadosDeConteudo>(VAZIO);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const guarda = useRef(createRequestGuard());

  useEffect(() => {
    const request = guarda.current.next();
    if (classIds.length === 0) {
      setDados(VAZIO);
      return;
    }
    setCarregando(true);
    setErro(null);
    (async () => {
      // Na ordem da trilha: a tabela lista os conteúdos tópico a tópico.
      const topicos = await ler<TopicoBase>(
        selectView("topicos", "id, classe_id, nome").in("classe_id", classIds).order("ordem", { ascending: true }),
      );
      const topicoIds = topicos.map((t) => t.id);
      const conteudos = topicoIds.length
        ? await ler<ConteudoBase>(selectView("conteudos", "id, topico_id, titulo, tipo, ordem").in("topico_id", topicoIds))
        : [];
      const conteudoIds = conteudos.map((c) => c.id);
      if (conteudoIds.length === 0) return { ...VAZIO, topicos };
      const [conteudoAluno, progressoPersonalizado, vinculos] = await Promise.all([
        ler<ConteudoAlunoLinha>(selectView("conteudo_aluno", "aluno_id, conteudo_id, status, percentual_concluido").in("conteudo_id", conteudoIds)),
        ler<ProgressoPersonalizadoLinha>(selectView("personalizacao_item_progresso", "aluno_id, classe_id, item_key").in("classe_id", classIds)),
        ler<VinculoAtividade>(selectView("atividade_conteudos", "atividade_id, conteudo_id").in("conteudo_id", conteudoIds)),
      ]);
      const atividadeIds = [...new Set(vinculos.map((v) => v.atividade_id))];
      const atividadeAluno = atividadeIds.length
        ? await ler<AtividadeAlunoLinha>(
            selectView("atividade_aluno", "aluno_id, atividade_id, status, acertos_percentual").in("atividade_id", atividadeIds),
          )
        : [];
      return { topicos, conteudos, conteudoAluno, progressoPersonalizado, vinculos, atividadeAluno };
    })()
      .then((resultado) => {
        if (request.isCurrent()) setDados(resultado);
      })
      .catch((e: unknown) => {
        if (request.isCurrent()) setErro(e instanceof Error ? e.message : "Não foi possível carregar os conteúdos.");
      })
      .finally(() => {
        if (request.isCurrent()) setCarregando(false);
      });
  }, [classIds]);

  return { dados, carregando, erro };
}
