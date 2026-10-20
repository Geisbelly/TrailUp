import { supabase } from "@/database/supabase";
import { normalizeEvento, type EventoDaTurma } from "./eventoModel";

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
       medalha_participacao, medalha_destaque, recompensa,
       missoes:eventos_classe_missoes(atividade_id, atividade:atividades(titulo)),
       posicoes:eventos_classe_resultado(aluno_id, pontos, participou, posicao, destaque)` as never,
    )
    .eq("classe_id", classeId)
    .order("inicio", { ascending: false })
    .limit(10);

  if (error) throw error;
  return ((data ?? []) as unknown[]).map(normalizeEvento).filter(Boolean) as EventoDaTurma[];
}
