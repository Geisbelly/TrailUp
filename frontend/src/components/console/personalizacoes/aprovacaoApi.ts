// Ler e decidir a aprovação do material personalizado: Supabase direto, sem a API.
//
// Decidir não tem modelo de linguagem no meio (regra de fronteira do CLAUDE.md). A leitura
// passa pela RLS do dono da turma (`professor_all_conteudo_personalizado`), e a decisão pela
// RPC `personalizacao_decidir`, que confere a posse, trava as linhas e recusa a decisão se o
// material mudou depois que o professor o abriu (`conteudo_versao`).

import { supabase } from "@/integrations/supabase/client";
import {
  mapearRegistroAprovacao,
  type Decisao,
  type ItemDecisao,
  type RegistroAprovacao,
} from "./aprovacao";

export const COLUNAS_DA_APROVACAO =
  "id, topico_id, conteudo_id, aluno_id, brainhex_profile_key, status, aprovacao, aprovacao_em, " +
  "aprovacao_motivo, conteudo_versao, formatos_gerados";

const PAGINA = 1000;

export async function lerAprovacoesDaTurma(classeId: number): Promise<RegistroAprovacao[]> {
  const registros: RegistroAprovacao[] = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await supabase
      .from("conteudo_personalizado" as never)
      .select(COLUNAS_DA_APROVACAO as never)
      .eq("classe_id" as never, classeId as never)
      .order("id" as never, { ascending: true })
      .range(inicio, inicio + PAGINA - 1);
    if (error) throw error;
    const pagina = (data ?? []) as unknown as Record<string, unknown>[];
    for (const bruto of pagina) {
      const registro = mapearRegistroAprovacao(bruto);
      if (registro) registros.push(registro);
    }
    if (pagina.length < PAGINA) return registros;
  }
}

export async function decidirAprovacao(
  itens: ItemDecisao[],
  decisao: Decisao,
  motivo?: string | null,
): Promise<number> {
  if (itens.length === 0) return 0;
  const { data, error } = await supabase.rpc("personalizacao_decidir" as never, {
    p_itens: itens,
    p_decisao: decisao,
    p_motivo: decisao === "recusado" ? (motivo ?? "").trim() || null : null,
  } as never);
  if (error) throw error;
  return Number(data) || 0;
}
