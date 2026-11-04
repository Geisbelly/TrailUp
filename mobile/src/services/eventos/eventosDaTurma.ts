import { supabase } from "@/database/supabase";
import { montarRanksDoEvento, normalizeEvento, type EventoDaTurma, type RankDoEvento } from "./eventoModel";

/**
 * Os eventos que o aluno pode ver na turma, com missões e resultado.
 *
 * **Leitura direta, sem RPC e sem API** — regra de fronteira do CLAUDE.md: não tem modelo de
 * linguagem no meio, e a API pode estar fora do ar. A autorização é a RLS, que já está no
 * lugar e desenha o produto:
 *
 * - `eventos_classe_aluno_sel` esconde `rascunho`, então não há filtro de status aqui;
 * - `eventos_classe_resultado_aluno_sel` só devolve linha de evento **encerrado**, e só a
 *   minha ou `posicao <= 10`. Evento aberto vem com `posicoes: []` por desenho.
 *
 * O `select` aninhado usa os nomes das FKs porque é como o PostgREST embute: `eventos_classe`
 * é referenciada por `eventos_classe_missoes.evento_id` e `eventos_classe_resultado.evento_id`.
 */
export async function carregarEventosDaTurma(classeId: number): Promise<EventoDaTurma[]> {
  const { data, error } = await supabase
    .from("eventos_classe")
    .select(
      `id, titulo, descricao, status, inicio, fim, modalidade_guilda, pontos, moedas,
       medalha_participacao, medalha_destaque, recompensa, pecas,
       missoes:eventos_classe_missoes(atividade_id, atividade:atividades(titulo)),
       posicoes:eventos_classe_resultado(aluno_id, pontos, participou, posicao, destaque)` as never,
    )
    .eq("classe_id", classeId)
    .order("inicio", { ascending: false })
    .limit(10);

  if (error) throw error;
  return ((data ?? []) as unknown[]).map(normalizeEvento).filter(Boolean) as EventoDaTurma[];
}

/**
 * Ranking das guildas de um evento (`eventos_classe_resultado_guilda`). A RLS
 * (`eventos_classe_resultado_guilda_aluno_sel`) só devolve linha de evento **encerrado**
 * da turma do aluno, até a 10ª posição: evento aberto vem vazio por desenho.
 */
export async function carregarGuildasDoEvento(eventoId: string): Promise<unknown[]> {
  const { data, error } = await supabase
    .from("eventos_classe_resultado_guilda")
    .select("guilda_id, pontos, membros, posicao")
    .eq("evento_id", eventoId)
    .order("posicao", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown[];
}

/**
 * Estou inscrito no rank deste evento? `evento_inscricoes_sel` só me devolve a minha linha, então
 * qualquer linha é a minha.
 */
export async function estouNoRank(eventoId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("evento_inscricoes" as never)
    .select("aluno_id")
    .eq("evento_id", eventoId)
    .limit(1);
  if (error) throw error;
  return ((data ?? []) as unknown[]).length > 0;
}

/** Entra ou sai do rank do evento. Só a RPC escreve: a tabela não tem escrita para o cliente. */
export async function mudarInscricao(eventoId: string, entrar: boolean): Promise<void> {
  const { error } = await supabase.rpc(
    (entrar ? "evento_classe_inscrever" : "evento_classe_sair") as never,
    { p_evento_id: eventoId } as never,
  );
  if (error) throw error;
}

/**
 * Os ranks do evento e as posições. O rank nasce quando o evento abre, um por critério; as
 * posições vêm da mesma view filtrada do ranking da turma (`vw_rank_posicoes_por_classe`), que
 * já aplica o corte de visibilidade e conta só os inscritos.
 */
export async function carregarRanksDoEvento(eventoId: string, meuId: string | null): Promise<RankDoEvento[]> {
  const { data: ranks, error } = await supabase
    .from("ranks")
    .select("id, tipo:rank_tipo(nome, criterio)" as never)
    .eq("evento_id" as never, eventoId as never);
  if (error) throw error;
  const ids = ((ranks ?? []) as unknown as { id: number }[]).map((r) => r.id).filter((id) => Number.isFinite(Number(id)));
  if (!ids.length) return [];
  const { data: posicoes, error: erroPosicoes } = await supabase
    .from("vw_rank_posicoes_por_classe")
    .select("rank_id, posicao, id_aluno, nome_aluno, pontuacao")
    .in("rank_id", ids)
    .order("posicao", { ascending: true });
  if (erroPosicoes) throw erroPosicoes;
  return montarRanksDoEvento(ranks, posicoes, meuId);
}
