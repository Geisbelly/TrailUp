/**
 * O gabarito que o console mostra ao professor vem de `questao_gabarito` (corte da fase 3,
 * `20261110_02`). Desde o corte, `authenticated` não lê `questoes.resposta_correta`, e o professor
 * também é `authenticated`. `questao_gabarito` é o espelho mantido pelo banco
 * (`trg_questoes_espelha_gabarito`) e só o professor da turma tem policy nele.
 *
 * A escrita continua em `questoes.resposta_correta`: o espelho acompanha.
 */

import { supabase } from "@/integrations/supabase/client";

export type LinhaDeGabarito = { questao_id: number; resposta_correta: string | null };

/** Ids por requisição: `in.(...)` vai na URL. */
const LOTE = 200;

/** Junta o gabarito a cada questão. Questão sem linha no espelho fica com `null`. */
export function juntarGabaritos<T extends { id: number }>(
  questoes: T[],
  gabaritos: LinhaDeGabarito[],
): (T & { resposta_correta: string | null })[] {
  const porQuestao = new Map(gabaritos.map((g) => [Number(g.questao_id), g.resposta_correta ?? null]));
  return questoes.map((q) => ({ ...q, resposta_correta: porQuestao.get(Number(q.id)) ?? null }));
}

/** Lê o gabarito das questões em lotes. Erro de leitura sobe: gabarito vazio sem aviso seria pior. */
export async function lerGabaritos(questaoIds: number[]): Promise<LinhaDeGabarito[]> {
  const ids = Array.from(new Set(questaoIds.filter((id) => Number.isSafeInteger(id) && id > 0)));
  const linhas: LinhaDeGabarito[] = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data, error } = await supabase
      .from("questao_gabarito")
      .select("questao_id, resposta_correta")
      .in("questao_id", ids.slice(i, i + LOTE));
    if (error) throw error;
    linhas.push(...((data as LinhaDeGabarito[] | null) ?? []));
  }
  return linhas;
}

/** As questões com o gabarito do espelho. */
export async function comGabarito<T extends { id: number }>(questoes: T[]) {
  if (questoes.length === 0) return [] as (T & { resposta_correta: string | null })[];
  return juntarGabaritos(questoes, await lerGabaritos(questoes.map((q) => Number(q.id))));
}
