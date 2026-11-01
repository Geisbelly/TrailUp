import { supabase } from "@/database/supabase";
import { mensagemDaDoacao, normalizarFundo, type FundoDaTurma } from "@/services/loja/fundoTurmaModel";

export type FundoComMinhaDoacao = { fundo: FundoDaTurma; minhaDoacao: number };

/**
 * O fundo ativo (aberto ou com a meta atingida) da turma e quanto EU doei. Direto no Supabase: a RLS
 * de `fundos_turma` libera o fundo da turma do aluno, e a de `fundos_turma_contribuicao` só a
 * própria doação — a dos colegas nunca chega ao app.
 */
export async function carregarFundoDaTurma(classeId: number, alunoId: string): Promise<FundoComMinhaDoacao | null> {
  const { data, error } = await supabase
    .from("fundos_turma" as never)
    .select("id, titulo, beneficio, meta, arrecadado, status")
    .eq("classe_id", classeId)
    .in("status", ["aberto", "atingido"])
    .order("criado_em", { ascending: false })
    .limit(1);
  if (error) throw error;
  const fundo = normalizarFundo((data as unknown[] | null)?.[0]);
  if (!fundo) return null;
  const doacoes = await supabase
    .from("fundos_turma_contribuicao" as never)
    .select("moedas")
    .eq("fundo_id", fundo.id)
    .eq("aluno_id", alunoId)
    .is("estornada_em", null);
  if (doacoes.error) throw doacoes.error;
  const minhaDoacao = ((doacoes.data ?? []) as { moedas: number }[]).reduce((t, d) => t + Number(d.moedas || 0), 0);
  return { fundo, minhaDoacao };
}

function chave() {
  return `fundo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Doa ao fundo: debita e soma numa transação só (`fundo_turma_contribuir`), ou nada. */
export async function doarAoFundo(fundoId: number, moedas: number) {
  const { data, error } = await supabase.rpc("fundo_turma_contribuir" as never, {
    p_fundo_id: fundoId,
    p_moedas: moedas,
    p_idempotency_key: chave(),
  } as never);
  if (error) throw error;
  const erro = mensagemDaDoacao(data);
  if (erro) throw new Error(erro);
  return data as { ok: true; moedas: number; arrecadado: number; meta: number; status: string; saldo: number };
}
