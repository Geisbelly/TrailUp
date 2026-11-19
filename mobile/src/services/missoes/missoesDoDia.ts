import { supabase } from "@/database/supabase";
import { montarDesafios, type LinhaDeDesafio, type MissaoComDesafio } from "./desafio.core";
import { LIMITE_DE_MISSOES, montarMissoes, type MissaoDoAluno } from "./missaoModel";

export type { MissaoDoAluno } from "./missaoModel";
export type { MissaoComDesafio } from "./desafio.core";

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
 * As missões do aluno na turma: **a do dia, a do professor e a que a IA sugeriu e o professor aprovou**.
 *
 * Antes isto buscava só `origem = 'sistema'` com `dia = hoje`, então a missão do professor —
 * criada pelo console desde a fase 2, com `origem = 'professor'` e sem `dia` — **nunca
 * aparecia para o aluno**. A policy `missoes_aluno_sel` sempre a liberou; era o filtro daqui
 * que a escondia.
 *
 * O `or` é uma expressão só porque o PostgREST combina condições de nível diferente com `and`:
 * `dia.eq.<hoje>` vale para a diária e `origem.eq.professor`/`origem.eq.ia` para a do professor
 * e a sugerida pela IA, e todas precisam ser alternativas, não cumulativas.
 *
 * `ativa` e `aprovacao` NÃO são filtrados aqui de propósito: a policy já os cobre, e repetir
 * a regra no cliente cria uma segunda fonte da verdade que envelhece sozinha.
 *
 * **Sem os desafios** (`desafio IS NULL`): eles vêm de `carregarDesafiosDoTopico`, só os do tópico
 * da vez e do anterior, um por grupo. Aqui apareceriam uma vez por perfil e ocupariam as vagas do
 * limite das missões comuns.
 */
const COLUNAS = "id, titulo, descricao, criterio, perfil_alvo, dia, slot, origem, escopo, janela_inicio, janela_fim";
const COLUNAS_DO_DESAFIO = "desafio, conteudo_id, desafio_grupo";

/**
 * O banco ainda não tem a coluna (molde de `faltaColunaDoDesafio` do console): 42703 é a que o
 * Postgres não conhece, PGRST204 a que o cache de schema do PostgREST não tem. Erro de sintaxe
 * (PGRST100) não entra: repetir sem a coluna esconderia um erro de verdade.
 */
function faltaColuna(erro: { code?: string } | null | undefined): boolean {
  return erro?.code === "42703" || erro?.code === "PGRST204";
}

export async function carregarMissoesDoAluno(
  classeId: number,
  perfilAtivo?: string | null,
): Promise<MissaoDoAluno[]> {
  const dia = diaDeHoje();

  const buscar = (colunas: string, semDesafio: boolean) => {
    const q = supabase
      .from("missoes")
      .select(colunas as never)
      .eq("classe_id", classeId)
      .or(`and(origem.eq.sistema,dia.eq.${dia}),origem.eq.professor,origem.eq.ia`);
    return (semDesafio ? q.is("desafio" as never, null) : q).limit(LIMITE_DE_MISSOES);
  };

  // Do banco mais novo ao mais velho: sem `desafio` (antes da 20261117_02) a lista vem sem o
  // filtro, e não há desafio para filtrar; sem `alvo_por_membro` (antes da 20261105_13, #154) ela
  // vem sem a coluna, e o rótulo fica o de antes.
  const tentativas: [string, boolean][] = [
    [`${COLUNAS}, alvo_por_membro`, true],
    [`${COLUNAS}, alvo_por_membro`, false],
    [COLUNAS, false],
  ];
  let { data, error } = await buscar(...tentativas[0]);
  for (const tentativa of tentativas.slice(1)) {
    if (!faltaColuna(error)) break;
    ({ data, error } = await buscar(...tentativa));
  }
  if (error) throw error;
  const linhas = (data ?? []) as never[];
  if (!linhas.length) return [];

  const ids = linhas.map((m) => Number((m as Record<string, unknown>).id));
  return montarMissoes(linhas as never, await progressoDe(ids), { perfilAtivo });
}

async function progressoDe(ids: number[]) {
  const { data, error } = await supabase
    .from("missao_aluno" as never)
    .select("missao_id, status, progresso")
    .in("missao_id", ids);
  if (error) throw error;
  return (data ?? []) as never[];
}

/** Quantos desafios a leitura traz no máximo (linhas, uma por perfil, antes de juntar por grupo). */
const LIMITE_DE_DESAFIOS = 30;

/**
 * Os desafios (missão com `desafio`) dos conteúdos `conteudoIds`, para os `perfis` do aluno, um por
 * `desafio_grupo`.
 *
 * - **Conteúdos:** os do tópico da vez e do anterior (`conteudosDosDesafios`), que a turma já tem
 *   carregados (`classeAtual.topicos[].conteudos`). O desafio é sobre o que o aluno está estudando,
 *   e não deve encher a lista com a trilha inteira. Não há leitura de `conteudos` aqui: era uma
 *   consulta a mais por foco para um dado que já estava na memória.
 * - **Perfis:** os representativos do aluno (`resolveRepresentativeBrainHexProfiles`), não só o
 *   ativo. É a mesma regra com que `missao_desafio_responder` aceita o aluno (`20261117_04:318`), e o
 *   filtro vai no servidor (`.in('perfil_alvo', perfis)`).
 * - **O que a RLS já cobre:** missão ativa e aprovada da turma, e a policy restritiva
 *   `missoes_desafio_visivel_sel` tira o desafio de tópico oculto e de turma retida pelo estudo.
 *
 * Banco anterior às colunas do desafio: nenhum desafio, sem erro. Outro erro sobe.
 */
export async function carregarDesafiosDoTopico(
  classeId: number,
  conteudoIds: readonly number[],
  perfis: string[],
): Promise<MissaoComDesafio[]> {
  if (!conteudoIds.length || !perfis.length) return [];

  const { data, error } = await supabase
    .from("missoes")
    .select(`${COLUNAS}, ${COLUNAS_DO_DESAFIO}` as never)
    .eq("classe_id", classeId)
    .not("desafio" as never, "is", null)
    .in("conteudo_id" as never, [...conteudoIds] as never)
    .in("perfil_alvo", perfis)
    // Sem ordem, o corte de 30 linhas podia mudar entre duas leituras e o desafio "sumir". Do mais
    // novo: com mais de 30 linhas, quem fica de fora é o desafio antigo, não o que acabou de sair.
    .order("id", { ascending: false })
    .limit(LIMITE_DE_DESAFIOS);
  if (faltaColuna(error)) return [];
  if (error) throw error;
  const linhas = (data ?? []) as unknown as LinhaDeDesafio[];
  if (!linhas.length) return [];

  return montarDesafios(linhas, await progressoDe(linhas.map((l) => Number(l.id))), perfis);
}

/** @deprecated Nome antigo, de quando a lista era só a do dia. Use `carregarMissoesDoAluno`. */
export const carregarMissoesDoDia = carregarMissoesDoAluno;
