import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createRequestGuard } from "@/lib/requestGuard";
import {
  COLUNAS_ALTERACAO,
  COLUNAS_ALTERACAO_ALUNO,
  eEstruturaAusente,
  type AlteracaoDaTrilha,
  type AlteracaoDoAluno,
  type DecisaoDoProfessor,
} from "./alteracoes";

export type EstadoDasAlteracoes =
  | { tipo: "carregando" }
  | { tipo: "pronto" }
  | { tipo: "indisponivel" } // migration 20261101_12 ainda não aplicada
  | { tipo: "erro"; detalhe: string };

const LIMITE_POR_TURMA = 30;

/**
 * Alterações da trilha e a decisão da IA, lidas direto do Supabase (RLS
 * `alteracao_professor_professor_sel` / `alteracao_aluno_sel`). Desfazer é a RPC
 * `alteracao_decidir`, que confere a posse. A API não entra: ela só decide.
 */
export function useAlteracoesDaTrilha(classIds: number[]) {
  const [alteracoes, setAlteracoes] = useState<AlteracaoDaTrilha[]>([]);
  const [alunosPorAlteracao, setAlunosPorAlteracao] = useState<Map<number, AlteracaoDoAluno[]>>(new Map());
  const [titulos, setTitulos] = useState<Map<string, string>>(new Map());
  const [estado, setEstado] = useState<EstadoDasAlteracoes>({ tipo: "carregando" });
  const guarda = useRef(createRequestGuard());

  const carregar = useCallback(async () => {
    const request = guarda.current.next();
    if (classIds.length === 0) {
      setAlteracoes([]);
      setEstado({ tipo: "pronto" });
      return;
    }
    const lidas = await supabase
      .from("alteracao_professor")
      .select(COLUNAS_ALTERACAO)
      .in("classe_id", classIds)
      .order("criada_em", { ascending: false })
      .limit(LIMITE_POR_TURMA * classIds.length);
    if (!request.isCurrent()) return;
    if (lidas.error) {
      setEstado(eEstruturaAusente(lidas.error) ? { tipo: "indisponivel" } : { tipo: "erro", detalhe: lidas.error.message });
      return;
    }
    const linhas = (lidas.data ?? []) as unknown as AlteracaoDaTrilha[];
    const ids = linhas.map((a) => a.id);
    const conteudos = [...new Set(linhas.map((a) => a.conteudo_id).filter((v): v is number => v != null))];
    const atividades = [...new Set(linhas.map((a) => a.atividade_id).filter((v): v is number => v != null))];
    const [alunos, tConteudos, tAtividades] = await Promise.all([
      ids.length
        ? supabase.from("alteracao_aluno").select(COLUNAS_ALTERACAO_ALUNO).in("alteracao_id", ids)
        : Promise.resolve({ data: [], error: null }),
      conteudos.length
        ? supabase.from("conteudos").select("id, titulo").in("id", conteudos)
        : Promise.resolve({ data: [], error: null }),
      atividades.length
        ? supabase.from("atividades").select("id, titulo").in("id", atividades)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (!request.isCurrent()) return;
    if (alunos.error) {
      setEstado({ tipo: "erro", detalhe: alunos.error.message });
      return;
    }
    const porAlteracao = new Map<number, AlteracaoDoAluno[]>();
    for (const linha of (alunos.data ?? []) as unknown as AlteracaoDoAluno[]) {
      porAlteracao.set(linha.alteracao_id, [...(porAlteracao.get(linha.alteracao_id) ?? []), linha]);
    }
    const nomes = new Map<string, string>();
    for (const c of (tConteudos.data ?? []) as { id: number; titulo: string }[]) nomes.set(`conteudo:${c.id}`, c.titulo);
    for (const a of (tAtividades.data ?? []) as { id: number; titulo: string }[]) nomes.set(`atividade:${a.id}`, a.titulo);
    setAlteracoes(linhas);
    setAlunosPorAlteracao(porAlteracao);
    setTitulos(nomes);
    setEstado({ tipo: "pronto" });
  }, [classIds]);

  useEffect(() => {
    setEstado({ tipo: "carregando" });
    void carregar();
  }, [carregar]);

  const decidir = useCallback(
    async (alteracaoId: number, alunoId: string | null, decisao: DecisaoDoProfessor) => {
      const { error } = await supabase.rpc("alteracao_decidir", {
        p_alteracao_id: alteracaoId,
        p_aluno_id: alunoId,
        p_decisao: decisao,
      });
      if (error) throw new Error(error.message);
      await carregar();
    },
    [carregar],
  );

  return { alteracoes, alunosPorAlteracao, titulos, estado, decidir, recarregar: carregar };
}
