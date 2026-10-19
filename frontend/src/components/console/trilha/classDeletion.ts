import { supabase } from "@/integrations/supabase/client";

type IdRow = { id: number };
type ConteudoSourceRow = { id: number; conteudo: string | null; metadata: unknown };
type FonteStorageRow = { storage_path: string | null };
type DynamicDeleteQuery = {
  eq: (column: string, value: number) => Promise<{ error: unknown }>;
  in: (column: string, values: number[]) => Promise<{ error: unknown }>;
};
type DynamicSupabaseClient = {
  from: (table: string) => {
    delete: () => DynamicDeleteQuery;
  };
};

const dynamicSupabase = supabase as unknown as DynamicSupabaseClient;

function looksLikeStoragePath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return false;
  if (trimmed.includes("\n")) return false;
  return trimmed.includes("/");
}

function collectMetadataFilePaths(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const files = (metadata as { files?: unknown }).files;
  if (!Array.isArray(files)) return [];
  return files
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const path = (entry as { path?: unknown }).path;
      return typeof path === "string" && looksLikeStoragePath(path) ? path : null;
    })
    .filter((path): path is string => path !== null);
}

type ConteudoComArquivo = { id: number; conteudo?: string | null; metadata?: unknown };

/** Caminho do Storage -> conteúdos que apontam para ele (no `conteudo` ou em metadata.files). */
export function referenciasPorCaminho(linhas: ConteudoComArquivo[]): Map<string, Set<number>> {
  const refs = new Map<string, Set<number>>();
  const marcar = (caminho: string, id: number) => refs.set(caminho, (refs.get(caminho) ?? new Set()).add(id));
  for (const l of linhas) {
    if (typeof l.conteudo === "string" && looksLikeStoragePath(l.conteudo)) marcar(l.conteudo, l.id);
    collectMetadataFilePaths(l.metadata).forEach((caminho) => marcar(caminho, l.id));
  }
  return refs;
}

/**
 * Quantos conteúdos AINDA apontam para cada caminho. Uma turma duplicada
 * (duplicar_classe) aponta para os mesmos arquivos da original — SQL não copia
 * objeto do Storage —, então apagar o arquivo de uma quebraria a outra. O RLS
 * mostra só os conteúdos do próprio professor, que é quem duplica.
 */
export async function contarReferencias(caminhos: string[]): Promise<Map<string, number>> {
  const unicos = Array.from(new Set(caminhos));
  const contagem = new Map(unicos.map((c) => [c, 0]));
  if (unicos.length === 0) return contagem;
  const [porConteudo, porMetadata] = await Promise.all([
    supabase.from("conteudos").select("id, conteudo").in("conteudo", unicos),
    supabase.from("conteudos").select("id, metadata").not("metadata", "is", null),
  ]);
  const erro = porConteudo.error ?? porMetadata.error;
  if (erro) throw erro;
  const refs = referenciasPorCaminho([
    ...((porConteudo.data ?? []) as ConteudoComArquivo[]),
    ...((porMetadata.data ?? []) as ConteudoComArquivo[]),
  ]);
  for (const c of unicos) contagem.set(c, refs.get(c)?.size ?? 0);
  return contagem;
}

async function deleteStoragePaths(paths: string[]) {
  if (paths.length === 0) return;
  // Chamado depois que as linhas da turma saíram do banco: qualquer
  // referência que sobrar é de outra turma (uma cópia) e o arquivo fica.
  let uniquePaths = Array.from(new Set(paths));
  try {
    const refs = await contarReferencias(uniquePaths);
    uniquePaths = uniquePaths.filter((caminho) => (refs.get(caminho) ?? 0) === 0);
  } catch (error) {
    // Sem saber se o arquivo é compartilhado, não apagar: sobra um arquivo
    // órfão, mas nenhum conteúdo de outra turma quebra.
    console.warn("[ClassDeletion] Não foi possível conferir arquivos compartilhados; nada será removido do Storage:", error);
    return;
  }

  for (let i = 0; i < uniquePaths.length; i += 100) {
    const chunk = uniquePaths.slice(i, i + 100);
    const { error } = await supabase.storage.from("conteudos").remove(chunk);
    if (error) {
      console.warn("[ClassDeletion] Falha opcional ao remover arquivos do bucket conteudos:", error);
    }
  }
}

async function fetchTrailIds(classeId: number) {
  const { data: topicRows, error: topicFetchErr } = await supabase
    .from("topicos")
    .select("id")
    .eq("classe_id", classeId);
  if (topicFetchErr) throw topicFetchErr;

  const topicIds = (topicRows ?? []).map((row: IdRow) => row.id);
  if (topicIds.length === 0) {
    return { topicIds: [], conteudoIds: [], atividadeIds: [], questionIds: [], storagePaths: [] };
  }

  const { data: conteudoRows, error: conteudoFetchErr } = await supabase
    .from("conteudos")
    .select("id, conteudo, metadata")
    .in("topico_id", topicIds);
  if (conteudoFetchErr) throw conteudoFetchErr;

  const { data: fonteRows, error: fonteFetchErr } = await supabase
    .from("fontes_personalizacao")
    .select("storage_path")
    .eq("classe_id", classeId);
  if (fonteFetchErr) throw fonteFetchErr;

  const { data: atividadeRows, error: atividadeFetchErr } = await supabase
    .from("atividades")
    .select("id")
    .in("topico_id", topicIds);
  if (atividadeFetchErr) throw atividadeFetchErr;

  const atividadeIds = (atividadeRows ?? []).map((row: IdRow) => row.id);
  let questionIds: number[] = [];
  if (atividadeIds.length > 0) {
    const { data: questionRows, error: questionFetchErr } = await supabase
      .from("questoes")
      .select("id")
      .in("atividade_id", atividadeIds);
    if (questionFetchErr) throw questionFetchErr;
    questionIds = (questionRows ?? []).map((row: IdRow) => row.id);
  }

  const storagePaths = new Set<string>();
  (conteudoRows as ConteudoSourceRow[] | null)?.forEach((row) => {
    if (typeof row.conteudo === "string" && looksLikeStoragePath(row.conteudo)) {
      storagePaths.add(row.conteudo);
    }
    collectMetadataFilePaths(row.metadata).forEach((path) => storagePaths.add(path));
  });
  (fonteRows as FonteStorageRow[] | null)?.forEach((row) => {
    if (typeof row.storage_path === "string" && looksLikeStoragePath(row.storage_path)) {
      storagePaths.add(row.storage_path);
    }
  });

  return {
    topicIds,
    conteudoIds: (conteudoRows ?? []).map((row: IdRow) => row.id),
    atividadeIds,
    questionIds,
    storagePaths: Array.from(storagePaths),
  };
}

async function tryDeleteEq(table: string, column: string, value: number) {
  try {
    const { error } = await dynamicSupabase.from(table).delete().eq(column, value);
    if (error) {
      console.warn(`[ClassDeletion] Falha opcional ao limpar ${table}:`, error);
    }
  } catch (error) {
    console.warn(`[ClassDeletion] Falha opcional ao limpar ${table}:`, error);
  }
}

async function tryDeleteIn(table: string, column: string, values: number[]) {
  if (values.length === 0) return;

  try {
    const { error } = await dynamicSupabase.from(table).delete().in(column, values);
    if (error) {
      console.warn(`[ClassDeletion] Falha opcional ao limpar ${table}:`, error);
    }
  } catch (error) {
    console.warn(`[ClassDeletion] Falha opcional ao limpar ${table}:`, error);
  }
}

export async function deleteClassTrail(classeId: number) {
  const { topicIds, conteudoIds, atividadeIds, questionIds, storagePaths } = await fetchTrailIds(classeId);
  if (topicIds.length === 0) return;

  // Storage so e removido no final, depois que TODAS as linhas do banco
  // confirmarem exclusao. Antes o Storage era limpo primeiro: qualquer erro no
  // meio do cascade (ex.: FK NO ACTION de uma tabela nao coberta aqui) deixava
  // `conteudos`/`topicos` intactos apontando para arquivo ja apagado do bucket
  // — corrupcao permanente, silenciosa, so descoberta quando a personalizacao
  // tentava baixar o material e recebia 400.
  await tryDeleteEq("telemetria_lotes", "classe_id", classeId);
  await tryDeleteEq("telemetria_sessoes", "classe_id", classeId);
  await tryDeleteEq("personalizacao_item_progresso", "classe_id", classeId);
  await tryDeleteEq("fontes_personalizacao", "classe_id", classeId);
  await tryDeleteEq("trilha_checkpoint_navegacao", "classe_id", classeId);
  await tryDeleteEq("ranks", "classe_id", classeId);
  await tryDeleteEq("classe_aluno", "classe_id", classeId);
  await tryDeleteEq("cards_personalizados", "classe_id", classeId);

  await tryDeleteIn("topico_aluno", "topico_id", topicIds);
  await tryDeleteIn("conteudo_aluno", "conteudo_id", conteudoIds);
  await tryDeleteIn("atividade_aluno", "atividade_id", atividadeIds);
  await tryDeleteIn("questao_aluno", "questao_id", questionIds);
  await tryDeleteIn("questao_aluno", "atividade_id", atividadeIds);
  await tryDeleteIn("materiais_gerados", "conteudo_id", conteudoIds);
  await tryDeleteIn("conteudo_personalizado", "conteudo_id", conteudoIds);
  await tryDeleteIn("conteudo_personalizado", "topico_id", topicIds);
  await tryDeleteIn("fontes_personalizacao", "topico_id", topicIds);
  await tryDeleteIn("fontes_personalizacao", "conteudo_id", conteudoIds);
  await tryDeleteIn("cards_personalizados", "topico_id", topicIds);
  await tryDeleteIn("cards_personalizados", "conteudo_id", conteudoIds);
  await tryDeleteIn("personalizacao_item_progresso", "topico_id", topicIds);
  // bag_itens tem FK NO ACTION para conteudos.id/topicos.id e nao tinha
  // nenhuma limpeza aqui — bastava um aluno ter guardado o conteudo na
  // mochila para o DELETE final em `topicos`/`conteudos` estourar 409.
  await tryDeleteIn("bag_itens", "topico_id", topicIds);
  await tryDeleteIn("bag_itens", "conteudo_id", conteudoIds);

  // Mesmo ponteiro, mesmo bloqueio: apagar o topico apaga as atividades dele,
  // e `classe_aluno."ultimaAtividade"` barra o DELETE igual. So nao apareceu
  // ainda porque a base de alunos esta vazia.
  await limparUltimaAtividade(atividadeIds);

  if (atividadeIds.length > 0) {
    const { error: e1 } = await supabase.from("questoes").delete().in("atividade_id", atividadeIds);
    if (e1) throw e1;
    const { error: e2 } = await supabase.from("atividade_conteudos").delete().in("atividade_id", atividadeIds);
    if (e2) throw e2;
  }

  if (conteudoIds.length > 0) {
    const { error: e3 } = await supabase.from("cards").delete().in("conteudo_id", conteudoIds);
    if (e3) throw e3;
    const { error: e4 } = await supabase.from("atividade_conteudos").delete().in("conteudo_id", conteudoIds);
    if (e4) throw e4;
  }

  if (atividadeIds.length > 0) {
    const { error: e5 } = await supabase.from("atividades").delete().in("id", atividadeIds);
    if (e5) throw e5;
  }

  if (conteudoIds.length > 0) {
    const { error: e6 } = await supabase.from("conteudos").delete().in("id", conteudoIds);
    if (e6) throw e6;
  }

  const { error: e7 } = await supabase.from("topicos").delete().in("id", topicIds);
  if (e7) throw e7;

  await deleteStoragePaths(storagePaths);
}

async function fetchTopicDependencyIds(topicoId: number) {
  const { data: conteudoRows, error: conteudoErr } = await supabase
    .from("conteudos")
    .select("id")
    .eq("topico_id", topicoId);
  if (conteudoErr) throw conteudoErr;
  const conteudoIds = (conteudoRows ?? []).map((row: IdRow) => row.id);

  const { data: atividadeRows, error: atividadeErr } = await supabase
    .from("atividades")
    .select("id")
    .eq("topico_id", topicoId);
  if (atividadeErr) throw atividadeErr;
  const atividadeIds = (atividadeRows ?? []).map((row: IdRow) => row.id);

  let questionIds: number[] = [];
  if (atividadeIds.length > 0) {
    const { data: questionRows, error: questionErr } = await supabase
      .from("questoes")
      .select("id")
      .in("atividade_id", atividadeIds);
    if (questionErr) throw questionErr;
    questionIds = (questionRows ?? []).map((row: IdRow) => row.id);
  }

  return { conteudoIds, atividadeIds, questionIds };
}

/** Remove um unico conteudo e tudo que depende dele (mesma ordem de deleteClassTrail,
 * so que para 1 id em vez de um lote) — usado ao excluir um item da lista de conteudos
 * do topico, que antes tentava DELETE direto em `conteudos` e batia em 409 de FK. */
export async function deleteContentCascade(conteudoId: number) {
  await tryDeleteEq("conteudo_aluno", "conteudo_id", conteudoId);
  await tryDeleteEq("materiais_gerados", "conteudo_id", conteudoId);
  await tryDeleteEq("conteudo_personalizado", "conteudo_id", conteudoId);
  await tryDeleteEq("fontes_personalizacao", "conteudo_id", conteudoId);
  await tryDeleteEq("cards_personalizados", "conteudo_id", conteudoId);
  await tryDeleteEq("cards", "conteudo_id", conteudoId);
  await tryDeleteEq("atividade_conteudos", "conteudo_id", conteudoId);
  await tryDeleteEq("bag_itens", "conteudo_id", conteudoId);

  const { error } = await supabase.from("conteudos").delete().eq("id", conteudoId);
  if (error) throw error;
}

/** Remove um unico topico e tudo que depende dele (conteudos, atividades, questoes,
 * cards, links, personalizacoes, progresso) — mesmo grafo de dependencias de
 * deleteClassTrail, so que para 1 topico em vez do lote da classe inteira. Antes
 * tentava DELETE direto em `topicos` e batia em 409 de FK sempre que o topico
 * tinha qualquer conteudo/atividade cadastrado. */
/**
 * `classe_aluno."ultimaAtividade"` aponta para a atividade e NAO e limpo
 * sozinho quando ela sai.
 *
 * A coluna tem DOIS foreign keys para `atividades(id)`: o novo
 * (`classe_aluno_ultimaatividade_fkey`) com `ON DELETE SET NULL`, e um antigo
 * (`classe_aluno_ultimaAtividade_fkey`) sem `ON DELETE` nenhum. O Postgres
 * aplica os dois, e o restritivo ganha -- o SET NULL nunca chega a rodar, e o
 * DELETE da atividade volta 23503. Ver a migracao `20261014_01`, que derruba a
 * sombra.
 *
 * Enquanto a sombra existir em producao, limpar o ponteiro aqui e o que faz a
 * exclusao funcionar. Depois que ela cair, esta funcao vira redundante e
 * inofensiva -- o UPDATE simplesmente nao acha linha. Por isso ela nao bloqueia
 * em erro: o professor pode UPDATE em `classe_aluno` das classes dele
 * (`classe_aluno_posse_upd`), e se a RLS mudar, o DELETE abaixo e quem reclama,
 * com a mensagem certa.
 */
async function limparUltimaAtividade(atividadeIds: number[]) {
  if (atividadeIds.length === 0) return;

  try {
    // Cliente tipado, nao o shim `dynamicSupabase`: `classe_aluno` esta nos
    // tipos gerados, e o shim so declara `delete`.
    const { error } = await supabase
      .from("classe_aluno")
      .update({ ultimaAtividade: null })
      .in("ultimaAtividade", atividadeIds);
    if (error) {
      console.warn("[ClassDeletion] Falha opcional ao limpar classe_aluno.ultimaAtividade:", error);
    }
  } catch (error) {
    console.warn("[ClassDeletion] Falha opcional ao limpar classe_aluno.ultimaAtividade:", error);
  }
}

/**
 * Remove UMA atividade e tudo que depende dela.
 *
 * `deleteActivity` (topicsApi) e um DELETE direto em `atividades`, e por isso
 * nunca funcionou para nenhuma atividade que o professor veja na tela: toda
 * atividade listada esta vinculada a um conteudo, e `atividade_conteudos` e
 * `questao_aluno` referenciam `atividades` com NO ACTION. O DELETE voltava
 * 23503 antes de tocar em qualquer coisa.
 *
 * Mesma ordem de `deleteTopicCascade`, so que para 1 atividade: primeiro o que
 * aponta para as questoes, depois as questoes, depois o que aponta para a
 * atividade, e so entao ela.
 */
export async function deleteActivityCascade(atividadeId: number) {
  const { data: questionRows, error: questionErr } = await supabase
    .from("questoes")
    .select("id")
    .eq("atividade_id", atividadeId);
  if (questionErr) throw questionErr;
  const questionIds = (questionRows ?? []).map((row: IdRow) => row.id);

  await limparUltimaAtividade([atividadeId]);
  await tryDeleteEq("atividade_aluno", "atividade_id", atividadeId);
  await tryDeleteIn("questao_aluno", "questao_id", questionIds);
  // `questao_aluno` referencia atividade E questao. A linha cuja questao ja
  // saiu some pelo cascade de `questao_id`, mas a que tiver so `atividade_id`
  // ficaria -- e e ela que bloqueia o DELETE no fim.
  await tryDeleteEq("questao_aluno", "atividade_id", atividadeId);

  const { error: questoesErr } = await supabase
    .from("questoes")
    .delete()
    .eq("atividade_id", atividadeId);
  if (questoesErr) throw questoesErr;

  const { error: vinculosErr } = await supabase
    .from("atividade_conteudos")
    .delete()
    .eq("atividade_id", atividadeId);
  if (vinculosErr) throw vinculosErr;

  const { error } = await supabase.from("atividades").delete().eq("id", atividadeId);
  if (error) throw error;
}

export async function deleteTopicCascade(topicoId: number) {
  const { conteudoIds, atividadeIds, questionIds } = await fetchTopicDependencyIds(topicoId);

  await tryDeleteEq("topico_aluno", "topico_id", topicoId);
  await tryDeleteEq("conteudo_personalizado", "topico_id", topicoId);
  await tryDeleteEq("fontes_personalizacao", "topico_id", topicoId);
  await tryDeleteEq("cards_personalizados", "topico_id", topicoId);
  await tryDeleteEq("personalizacao_item_progresso", "topico_id", topicoId);

  await tryDeleteIn("conteudo_aluno", "conteudo_id", conteudoIds);
  await tryDeleteIn("materiais_gerados", "conteudo_id", conteudoIds);
  await tryDeleteIn("conteudo_personalizado", "conteudo_id", conteudoIds);
  await tryDeleteIn("fontes_personalizacao", "conteudo_id", conteudoIds);
  await tryDeleteIn("cards_personalizados", "conteudo_id", conteudoIds);
  await tryDeleteIn("atividade_aluno", "atividade_id", atividadeIds);
  await tryDeleteIn("questao_aluno", "questao_id", questionIds);
  await tryDeleteIn("questao_aluno", "atividade_id", atividadeIds);
  await tryDeleteEq("bag_itens", "topico_id", topicoId);
  await tryDeleteIn("bag_itens", "conteudo_id", conteudoIds);
  // Mesmo ponteiro, mesmo bloqueio que em `deleteActivityCascade`: apagar o
  // topico apaga as atividades dele, e `classe_aluno."ultimaAtividade"` barra
  // o DELETE igual.
  await limparUltimaAtividade(atividadeIds);

  if (atividadeIds.length > 0) {
    const { error: e1 } = await supabase.from("questoes").delete().in("atividade_id", atividadeIds);
    if (e1) throw e1;
    const { error: e2 } = await supabase.from("atividade_conteudos").delete().in("atividade_id", atividadeIds);
    if (e2) throw e2;
  }

  if (conteudoIds.length > 0) {
    const { error: e3 } = await supabase.from("cards").delete().in("conteudo_id", conteudoIds);
    if (e3) throw e3;
    const { error: e4 } = await supabase.from("atividade_conteudos").delete().in("conteudo_id", conteudoIds);
    if (e4) throw e4;
  }

  if (atividadeIds.length > 0) {
    const { error: e5 } = await supabase.from("atividades").delete().in("id", atividadeIds);
    if (e5) throw e5;
  }

  if (conteudoIds.length > 0) {
    const { error: e6 } = await supabase.from("conteudos").delete().in("id", conteudoIds);
    if (e6) throw e6;
  }

  const { error: e7 } = await supabase.from("topicos").delete().eq("id", topicoId);
  if (e7) throw e7;
}

export async function deleteClasseCascade(classeId: number) {
  // One transaction, including dependencies. Never remove Storage files first.
  const { data, error } = await supabase.rpc("excluir_classe", { p_classe_id: classeId });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("A exclusão da classe não foi confirmada.");
}

export async function removeClassStudent(classeId: number, alunoId: string) {
  // The DELETE trigger performs cleanup in the same transaction, without API jobs.
  const { data, error } = await supabase.from("classe_aluno").delete()
    .eq("classe_id", classeId).eq("aluno_id", alunoId).select("aluno_id");
  if (error) throw new Error(error.message);
  if (!data?.length) {
    throw new Error("Matrícula não encontrada ou sem permissão para remover o aluno.");
  }
}
