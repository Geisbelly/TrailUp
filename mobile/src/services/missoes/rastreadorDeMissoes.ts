import { supabase } from "@/database/supabase";

import { carregarMissoesDoAluno } from "./missoesDoDia";
import { resolverRecompensa, type MissaoComExtras } from "./rastreadorDeMissoes.core";

export * from "./rastreadorDeMissoes.core";

type Extra = { id: number; categoria: string | null; recompensa_tipo: string | null };

/**
 * Categoria e recompensa de cada missão, numa leitura À PARTE.
 *
 * Não entram no `select` de `carregarMissoesDoAluno` de propósito: aquela leitura é também a
 * da aba Social, e uma coluna a mais lá faria a lista inteira falhar onde o banco ainda não a
 * tivesse. Aqui, falhar só tira o selo de recompensa e o peso de "principal" — a missão
 * continua no rastreador.
 */
async function carregarExtras(classeId: number, ids: number[]) {
  const extras = new Map<number, Extra>();
  const vazio = { extras, globais: [] as never[], daTurma: [] as never[] };
  if (!ids.length) return vazio;
  const { data, error } = await supabase
    .from("missoes")
    .select("id, categoria, recompensa_tipo" as never)
    .in("id", ids);
  if (error) {
    console.warn("[Rastreador de missões] sem categoria/recompensa:", error.message);
    return vazio;
  }
  for (const linha of (data ?? []) as unknown as Extra[]) extras.set(Number(linha.id), linha);

  const tipos = [...new Set([...extras.values()].map((e) => e.recompensa_tipo).filter((t): t is string => !!t))];
  if (!tipos.length) return vazio;
  // As mesmas duas tabelas que a Loja lê para "Como ganhar" — o aluno já tem SELECT nelas.
  const [globais, daTurma] = await Promise.all([
    supabase.from("eventos_pontuacao").select("tipo,pontos,moedas").in("tipo", tipos),
    supabase.from("eventos_pontuacao_classe").select("tipo,pontos,moedas").eq("classe_id", classeId).in("tipo", tipos),
  ]);
  return {
    extras,
    globais: (globais.error ? [] : globais.data ?? []) as never[],
    daTurma: (daTurma.error ? [] : daTurma.data ?? []) as never[],
  };
}

/**
 * As missões do aluno como o rastreador da Trilha as mostra: a mesma lista da aba Social
 * (`carregarMissoesDoAluno`, filtrada pela RLS e pelo perfil da missão), com categoria e
 * recompensa. O destino do "Ir" é a tela que calcula (`comDestino`).
 */
export async function carregarMissoesDoRastreador(
  classeId: number,
  perfilDaMissao: string | null,
): Promise<MissaoComExtras[]> {
  const missoes = await carregarMissoesDoAluno(classeId, perfilDaMissao);
  const { extras, globais, daTurma } = await carregarExtras(
    classeId,
    missoes.map((m) => m.id),
  );
  return missoes.map((m) => {
    const extra = extras.get(m.id);
    return {
      ...m,
      categoria: extra?.categoria === "principal" ? "principal" : "secundaria",
      recompensa: resolverRecompensa(extra?.recompensa_tipo, globais, daTurma),
    };
  });
}
