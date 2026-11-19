import { supabase } from "@/database/supabase";
import { resolveRepresentativeBrainHexProfiles } from "@/utils/brainHex";

import { juntarComDesafios, type MissaoComDesafio } from "./desafio.core";
import type { MissaoDoAluno } from "./missaoModel";
import { carregarDesafiosDoTopico, carregarMissoesDoAluno } from "./missoesDoDia";
import {
  conteudosDosDesafios,
  resolverRecompensa,
  type MissaoComExtras,
  type Recompensa,
  type TopicoDoRastreador,
} from "./rastreadorDeMissoes.core";

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
  // As mesmas duas tabelas que a Loja lê para "Como ganhar" — o aluno já tem SELECT nelas. Da
  // turma só as moedas: os pontos dela não valem no banco (ver `resolverRecompensa`).
  const [globais, daTurma] = await Promise.all([
    supabase.from("eventos_pontuacao").select("tipo,pontos,moedas").in("tipo", tipos),
    supabase.from("eventos_pontuacao_classe").select("tipo,moedas").eq("classe_id", classeId).in("tipo", tipos),
  ]);
  return {
    extras,
    globais: (globais.error ? [] : globais.data ?? []) as never[],
    daTurma: (daTurma.error ? [] : daTurma.data ?? []) as never[],
  };
}

/** O que a leitura dos desafios precisa: a trilha (para o tópico da vez) e o vetor do aluno. */
export type ContextoDosDesafios = {
  topicos: readonly TopicoDoRastreador[];
  atualId: string | number | null | undefined;
  /** `usuario.perfis` (`aluno_perfil`), cru: os representativos saem daqui. */
  perfis: Parameters<typeof resolveRepresentativeBrainHexProfiles>[0];
};

/**
 * O que a leitura dos desafios de fato usa: os conteúdos dos tópicos (o da vez e o anterior), da
 * turma já carregada, e os perfis representativos.
 */
function alvoDosDesafios(contexto: ContextoDosDesafios) {
  return {
    conteudoIds: conteudosDosDesafios(contexto.topicos, contexto.atualId),
    perfis: resolveRepresentativeBrainHexProfiles(contexto.perfis),
  };
}

/**
 * A identidade do contexto para os hooks: muda só quando muda o que a leitura usa. A Trilha monta
 * a lista de tópicos de novo a cada render, e reler as missões por isso seria uma consulta por
 * toque no mapa.
 */
export function chaveDosDesafios(contexto: ContextoDosDesafios): string {
  const { conteudoIds, perfis } = alvoDosDesafios(contexto);
  return `${conteudoIds.join(",")}|${perfis.join(",")}`;
}

/**
 * Os desafios do tópico da vez e do anterior, para os perfis representativos do aluno — a regra
 * única de `utils/brainHex`, a mesma com que o banco aceita a resposta. Não os "selecionáveis": a
 * conta de demonstração escolhe entre os 7, mas a RPC recusaria o desafio de um perfil que não é
 * representativo.
 *
 * Os desafios são um extra: falha aqui não derruba as missões comuns (nem a Trilha, nem a Social).
 */
export async function carregarDesafiosDoAluno(classeId: number, contexto: ContextoDosDesafios): Promise<MissaoComDesafio[]> {
  try {
    const { conteudoIds, perfis } = alvoDosDesafios(contexto);
    return await carregarDesafiosDoTopico(classeId, conteudoIds, perfis);
  } catch (e) {
    console.warn("[Rastreador de missões] sem desafios:", e instanceof Error ? e.message : e);
    return [];
  }
}

/**
 * As missões do aluno como o rastreador da Trilha as mostra: a mesma lista da aba Social
 * (`carregarMissoesDoAluno`, filtrada pela RLS e pelo perfil da missão), com categoria e
 * recompensa, e, com `desafios`, os desafios do tópico da vez depois das comuns. O destino do "Ir"
 * é a tela que calcula (`comDestino`).
 */
export async function carregarMissoesDoRastreador(
  classeId: number,
  perfilDaMissao: string | null,
  desafios?: ContextoDosDesafios,
): Promise<MissaoComExtras[]> {
  const [comuns, doTopico] = await Promise.all([
    carregarMissoesDoAluno(classeId, perfilDaMissao),
    desafios ? carregarDesafiosDoAluno(classeId, desafios) : Promise.resolve([] as MissaoComDesafio[]),
  ]);
  const missoes = juntarComDesafios<MissaoDoAluno & Partial<Pick<MissaoComDesafio, "desafio" | "desafioGrupo">>>(comuns, doTopico);
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

/** O prêmio de uma missão, pela mesma leitura do rastreador. Sem recompensa (ou sem leitura), `null`. */
export async function recompensaDaMissao(classeId: number, missaoId: number): Promise<Recompensa | null> {
  const { extras, globais, daTurma } = await carregarExtras(classeId, [missaoId]);
  return resolverRecompensa(extras.get(missaoId)?.recompensa_tipo, globais, daTurma);
}
