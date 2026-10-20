import { supabase } from "@/database/supabase";
import { montarMissoes, type MissaoDoAluno } from "./missaoModel";

export type { MissaoDoAluno } from "./missaoModel";

/** O dia de hoje no fuso do cron da diária (`America/Sao_Paulo`). `en-CA` dá YYYY-MM-DD. */
function diaDeHoje(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * As missões do aluno na turma: **a do dia e a do professor**.
 *
 * Antes isto buscava só `origem = 'sistema'` com `dia = hoje`, então a missão do professor —
 * criada pelo console desde a fase 2, com `origem = 'professor'` e sem `dia` — **nunca
 * aparecia para o aluno**. A policy `missoes_aluno_sel` sempre a liberou; era o filtro daqui
 * que a escondia.
 *
 * O `or` é uma expressão só porque o PostgREST combina condições de nível diferente com `and`:
 * `dia.eq.<hoje>` vale para a diária e `origem.eq.professor` para a do professor, e as duas
 * precisam ser alternativas, não cumulativas.
 *
 * `ativa` e `aprovacao` NÃO são filtrados aqui de propósito: a policy já os cobre, e repetir
 * a regra no cliente cria uma segunda fonte da verdade que envelhece sozinha.
 */
export async function carregarMissoesDoAluno(
  classeId: number,
  perfilAtivo?: string | null,
): Promise<MissaoDoAluno[]> {
  const dia = diaDeHoje();

  const { data, error } = await supabase
    .from("missoes")
    .select("id, titulo, descricao, criterio, perfil_alvo, dia, slot, origem, escopo, janela_inicio, janela_fim" as never)
    .eq("classe_id", classeId)
    .or(`and(origem.eq.sistema,dia.eq.${dia}),origem.eq.professor`)
    .limit(30);

  if (error) throw error;
  const linhas = (data ?? []) as never[];
  if (!linhas.length) return [];

  const ids = linhas.map((m) => Number((m as Record<string, unknown>).id));
  const { data: prog, error: errProg } = await supabase
    .from("missao_aluno" as never)
    .select("missao_id, status, progresso")
    .in("missao_id", ids);
  if (errProg) throw errProg;

  return montarMissoes(linhas as never, (prog ?? []) as never, { perfilAtivo });
}

/** @deprecated Nome antigo, de quando a lista era só a do dia. Use `carregarMissoesDoAluno`. */
export const carregarMissoesDoDia = carregarMissoesDoAluno;
