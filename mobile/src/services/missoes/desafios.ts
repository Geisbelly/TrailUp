import { supabase } from "@/database/supabase";
import { isNetworkRequestFailedError } from "@/services/apiBaseUrl.core";

import {
  lerDesafioPublico,
  lerResultadoDoDesafio,
  type DesafioPublico,
  type RespostaDoAluno,
  type ResultadoDoDesafio,
} from "./desafio.core";
import { recompensaDaMissao, type Recompensa } from "./rastreadorDeMissoes";

export * from "./desafio.core";
export { carregarDesafiosDoTopico } from "./missoesDoDia";

/**
 * O "Conferir": manda a resposta a `missao_desafio_responder` (`20261117_04`), direto ao Supabase,
 * sem a API (regra de fronteira do CLAUDE.md). É o banco que corrige, limita e paga uma vez.
 *
 * **Nunca lança.** O erro volta traduzido para a tela:
 * - `limite`: `limite_de_tentativas` (`P0001`), mais de 20 tentativas na hora neste desafio;
 * - `rede`: só a chamada que não chegou ao banco. O postgrest-js devolve a falha do `fetch` como
 *   erro com `status` 0 em vez de lançar; o `fetch` medido ou o cliente podem lançar o `TypeError`
 *   do `fetch` ("Network request failed"). A tela diz que a resposta continua no aparelho;
 * - `indisponivel`: `42501`, o banco recusou o acesso (`topico_nao_publicado`,
 *   `personalizacao_retida`, perfil fora dos representativos, missão de outra turma). A tela não tem
 *   por que distinguir um do outro, e nenhum deles muda com outra tentativa: a tela diz que o desafio
 *   não está mais disponível e desliga o "Conferir";
 * - `outro`: todo o resto. 5xx, `57014` (statement timeout) e exceção do próprio código chegaram ao
 *   banco ou não têm a ver com rede, e dizer "sem conexão" mandaria o aluno conferir o Wi-Fi à toa.
 *
 * **Nunca revela a resposta:** a RPC não a devolve, e do retorno só passam os quatro campos dela.
 */
export async function conferirDesafio(missaoId: number, resposta: RespostaDoAluno): Promise<ResultadoDoDesafio> {
  try {
    const { data, error, status } = await supabase.rpc("missao_desafio_responder" as never, {
      p_missao_id: missaoId,
      p_resposta: resposta,
    } as never);
    if (error) {
      if (String(error.message ?? "").includes("limite_de_tentativas")) return { erro: "limite" };
      if (status === 0) return { erro: "rede" };
      if ((error as { code?: string }).code === "42501") return { erro: "indisponivel" };
      return { erro: "outro" };
    }
    return lerResultadoDoDesafio(data);
  } catch (e) {
    return { erro: e instanceof TypeError && isNetworkRequestFailedError(e) ? "rede" : "outro" };
  }
}

/** O que a tela do desafio desenha. Sem resposta: o app não a tem. */
export type DesafioDaMissao = {
  missaoId: number;
  titulo: string;
  descricao: string;
  desafio: DesafioPublico;
  desafioGrupo: string;
  /** O aluno já acertou este quebra-cabeça, por esta linha ou pela de outro perfil do grupo. */
  resolvido: boolean;
  /** O que o banco paga no primeiro acerto (`resolverRecompensa`), ou `null`. */
  recompensa: Recompensa | null;
};

/** Mesmo molde de `faltaColuna` em `missoesDoDia.ts`: banco anterior às colunas do desafio. */
const faltaColuna = (erro: { code?: string } | null | undefined) => erro?.code === "42703" || erro?.code === "PGRST204";

/**
 * A missão-desafio da tela `/desafio/[id]`: uma leitura da linha (a RLS decide se o aluno a vê), e
 * em paralelo o "já resolvido" e o prêmio.
 *
 * **Perfil:** a linha só vale se `perfil_alvo` estiver entre os `perfis` representativos do aluno
 * (`resolveRepresentativeBrainHexProfiles`), a mesma regra com que `missao_desafio_responder` o
 * aceita (`lower(btrim(perfil_alvo))`, `20261117_04:318`). A policy não filtra perfil: por um link
 * direto, o desafio de outro perfil abria e o "Conferir" falhava sempre. Fora da lista, é `null`,
 * como não encontrado.
 *
 * **Resolvido** é o que a RPC usa para `ja_concluida` (`20261117_04`): existe tentativa do aluno no
 * grupo com `acertou`. Não `missao_aluno`, que é da linha e sai em cascata se o professor a apagar.
 * Se essa leitura falhar, a tela abre para resolver, e o banco responde `ja_concluida` no "Conferir".
 *
 * Missão que não existe, que não é desafio, ou que o app não sabe desenhar é `null`. Outro erro na
 * leitura da linha sobe; as outras duas leituras nunca derrubam a tela.
 */
export async function carregarDesafioDaMissao(
  missaoId: number,
  alunoId: string | null,
  perfis: readonly string[],
): Promise<DesafioDaMissao | null> {
  const { data, error } = await supabase
    .from("missoes")
    .select("id, titulo, descricao, classe_id, desafio, desafio_grupo, perfil_alvo" as never)
    .eq("id", missaoId)
    .maybeSingle();
  if (faltaColuna(error)) return null;
  if (error) throw error;
  const linha = data as unknown as {
    id: number;
    titulo: string | null;
    descricao: string | null;
    classe_id: number;
    desafio: unknown;
    desafio_grupo: string | null;
    perfil_alvo: string | null;
  } | null;
  const desafio = linha ? lerDesafioPublico(linha.desafio) : null;
  if (!linha || !desafio || !linha.desafio_grupo) return null;
  const perfilAlvo = String(linha.perfil_alvo ?? "").trim().toLowerCase();
  if (!perfilAlvo || !perfis.some((p) => p.toLowerCase() === perfilAlvo)) return null;
  const grupo = linha.desafio_grupo;

  const [resolvido, recompensa] = await Promise.all([
    (async () => {
      let q = supabase
        .from("missao_desafio_tentativa" as never)
        .select("id")
        .eq("desafio_grupo" as never, grupo as never)
        .eq("acertou" as never, true as never);
      if (alunoId) q = q.eq("aluno_id" as never, alunoId as never);
      const { data: tentativas, error: erro } = await q.limit(1);
      if (erro) console.warn("[Desafio] sem a leitura das tentativas:", erro.message);
      return !erro && Array.isArray(tentativas) && tentativas.length > 0;
    })().catch(() => false),
    recompensaDaMissao(Number(linha.classe_id), Number(linha.id)).catch(() => null),
  ]);

  return {
    missaoId: Number(linha.id),
    titulo: linha.titulo ?? "",
    descricao: linha.descricao ?? "",
    desafio,
    desafioGrupo: grupo,
    resolvido,
    recompensa,
  };
}
