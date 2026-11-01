import { supabase } from '@/database/supabase';
import {
  COLUNAS_ALTERACAO_ALUNO,
  type LinhaAlteracaoAluno,
} from '@/utils/alteracoesDoProfessor';

/**
 * Alterações do professor em itens que o aluno já viu ou fez (`alteracao_aluno`, migração
 * `20261101_12`).
 *
 * O banco registra a mudança e a IA decide, por aluno, se ela só merece destaque ou se a
 * atividade precisa ser refeita. Aqui só se lê o resultado e se marca o destaque como visto: o
 * app fala direto com o Supabase, como em `notificacoes` (a API é só para IA).
 *
 * O que fazer com as linhas (destaque, revisão pendente) está em `utils/alteracoesDoProfessor.ts`.
 */

export async function carregarAlteracoesDoAluno(
  alunoId: string,
  classeId: number
): Promise<LinhaAlteracaoAluno[]> {
  const { data, error } = await supabase
    .from('alteracao_aluno')
    .select(COLUNAS_ALTERACAO_ALUNO)
    .eq('aluno_id', alunoId)
    .eq('classe_id', classeId)
    .order('id', { ascending: true });
  if (error) throw error;
  return (data ?? []) as LinhaAlteracaoAluno[];
}

/** Abriu o item: o destaque some. A revisão pendente não some por abrir, só por refazer. */
export async function marcarAlteracaoVista(item: {
  conteudoId?: number | null;
  atividadeId?: number | null;
}): Promise<number> {
  const { data, error } = await supabase.rpc('alteracao_marcar_vista', {
    p_conteudo_id: item.conteudoId ?? null,
    p_atividade_id: item.atividadeId ?? null,
  });
  if (error) throw error;
  return Number(data ?? 0);
}
