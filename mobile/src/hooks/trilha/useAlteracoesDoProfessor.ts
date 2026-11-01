import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "@/database/supabase";
import {
  carregarAlteracoesDoAluno,
  marcarAlteracaoVista,
} from "@/services/alteracoesProfessor";
import {
  chaveDoItem,
  resumirAlteracoes,
  type LinhaAlteracaoAluno,
} from "@/utils/alteracoesDoProfessor";

/**
 * O que o professor mudou nesta turma depois que o aluno já tinha visto ou feito o item: o selo
 * "Atualizado" e as atividades que voltaram como revisão pendente.
 *
 * Lê `alteracao_aluno` direto do Supabase e escuta a mesma tabela pelo Realtime: a decisão da IA
 * chega minutos depois do save do professor, e o aluno pode estar com o tópico aberto.
 * Falha de leitura deixa a tela como estava (sem selo), nunca a quebra.
 */
export function useAlteracoesDoProfessor(params: {
  alunoId: string | null | undefined;
  classeId: number | null | undefined;
}) {
  const alunoId = params.alunoId ?? null;
  const classeId =
    typeof params.classeId === "number" && Number.isFinite(params.classeId) ? params.classeId : null;
  const [linhas, setLinhas] = useState<LinhaAlteracaoAluno[]>([]);
  const marcadas = useRef(new Set<string>());

  const recarregar = useCallback(async () => {
    if (!alunoId || classeId == null) return;
    try {
      setLinhas(await carregarAlteracoesDoAluno(alunoId, classeId));
    } catch (erro) {
      console.warn("[alteracoesProfessor] Falha ao ler alteracoes do professor:", erro);
    }
  }, [alunoId, classeId]);

  useEffect(() => {
    setLinhas([]);
    marcadas.current = new Set();
    if (!alunoId || classeId == null) return;
    void recarregar();
    const canal = supabase
      .channel(`rt_alteracao_aluno_${classeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alteracao_aluno", filter: `aluno_id=eq.${alunoId}` },
        () => void recarregar()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [alunoId, classeId, recarregar]);

  const alteracoes = useMemo(() => resumirAlteracoes(linhas), [linhas]);

  /** Uma vez por item e por tela: o destaque some na hora, e o banco confirma em segundo plano. */
  const marcarVista = useCallback(
    (tipo: "conteudo" | "atividade", id: number) => {
      const chave = chaveDoItem(tipo, id);
      if (!alteracoes.destaques.has(chave) || marcadas.current.has(chave)) return;
      marcadas.current.add(chave);
      const agora = new Date().toISOString();
      setLinhas((atuais) =>
        atuais.map((linha) =>
          !linha.vista_em &&
          ((tipo === "conteudo" && Number(linha.conteudo_id) === id) ||
            (tipo === "atividade" && Number(linha.atividade_id) === id))
            ? { ...linha, vista_em: agora }
            : linha
        )
      );
      marcarAlteracaoVista(tipo === "conteudo" ? { conteudoId: id } : { atividadeId: id }).catch((erro) => {
        console.warn("[alteracoesProfessor] Falha ao marcar alteracao como vista:", erro);
      });
    },
    [alteracoes]
  );

  return { alteracoes, marcarVista, recarregar };
}
