// Camada de dados das missões do professor.
//
// A fonte passou a ser `missoes` (`20261019_05`), não mais `atividades` com `tipo = 'missao'`.
// São **dois caminhos** na mesma tabela:
//
// - `entrega` — a `missoes` aponta uma `atividades` por `criterio = atividade_especifica`, e é
//   a atividade que guarda nota, moedas e questões (e alimenta `notas_fila`/`avaliar_entrega`);
// - `meta`    — a `missoes` tem só o critério, e o banco avalia sozinho.
//
// `missoes` é nova e não está nos tipos gerados do Supabase, daí os `as never` — mesmo padrão
// de `eventos_classe` em `eventos/eventosApi.ts`.

import { supabase } from "@/integrations/supabase/client";
import { saveActivity } from "../trilha/topicsApi";
import { rotuloDoCriterio } from "./criterio";
import { comCriterioDaAtividade, type PayloadDaAtividade, type PayloadDaMissao } from "./missao";

export type Missao = {
  id: number;
  titulo: string;
  objetivo: string;
  prazo: string | null;
  criterio: unknown;
  /** Rótulo curto do critério, para o cartão. */
  criterioRotulo: string;
  origem: string;
  aprovacao: string;
  ativa: boolean;
  /** `entrega` quando aponta uma atividade; `meta` quando o critério se basta. */
  caminho: "entrega" | "meta";
  atividadeId: number | null;
  /** Só em `entrega`: vêm da atividade. */
  topicoId: number | null;
  topicoNome: string;
  pontos: number;
  moedas: number;
  entregues: number;
  total: number;
};

type LinhaDeMissao = {
  id: number;
  titulo: string;
  descricao: string | null;
  janela_fim: string | null;
  criterio: unknown;
  origem: string;
  aprovacao: string;
  ativa: boolean;
  atividade_origem_id: number | null;
};

type LinhaDaAtividade = {
  id: number;
  topico_id: number;
  pontuacao_maxima: number | string | null;
  metadata?: unknown;
  topicos: { nome: string | null } | { nome: string | null }[] | null;
};

type LinhaDeEntrega = { atividade_id: number; aluno_id: string; status: string | null };

/** "concluido" (com ou sem acento, em qualquer caixa) conta como entregue — mesma regra do cálculo de progresso. */
export function foiEntregue(status: string | null | undefined): boolean {
  return (status ?? "").toLowerCase().includes("concl");
}

/** Entregas por atividade: um aluno conta uma vez, mesmo que haja mais de uma linha. */
export function contarEntregas(linhas: LinhaDeEntrega[]): Map<number, number> {
  const porAtividade = new Map<number, Set<string>>();
  for (const l of linhas) {
    if (!foiEntregue(l.status)) continue;
    const alunos = porAtividade.get(l.atividade_id) ?? new Set<string>();
    alunos.add(l.aluno_id);
    porAtividade.set(l.atividade_id, alunos);
  }
  return new Map([...porAtividade].map(([id, alunos]) => [id, alunos.size]));
}

/** `atividades.metadata.moedas` (inteiro >= 0). Qualquer outra coisa conta como nenhuma. */
export function moedasDe(metadata: unknown): number {
  const v = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).moedas : undefined;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export function mapearMissao(
  m: LinhaDeMissao,
  atividade: LinhaDaAtividade | null,
  entregues: number,
  total: number,
): Missao {
  const topico = Array.isArray(atividade?.topicos) ? atividade?.topicos[0] : atividade?.topicos;
  return {
    id: m.id,
    titulo: m.titulo,
    objetivo: m.descricao ?? "",
    prazo: m.janela_fim,
    criterio: m.criterio,
    criterioRotulo: rotuloDoCriterio(m.criterio),
    origem: m.origem,
    aprovacao: m.aprovacao,
    ativa: m.ativa,
    caminho: m.atividade_origem_id == null ? "meta" : "entrega",
    atividadeId: m.atividade_origem_id,
    topicoId: atividade?.topico_id ?? null,
    topicoNome: topico?.nome?.trim() || (atividade ? `Tópico ${atividade.topico_id}` : "—"),
    pontos: Number(atividade?.pontuacao_maxima ?? 0),
    moedas: moedasDe(atividade?.metadata),
    entregues,
    total,
  };
}

export async function listarMissoes(classeId: number): Promise<Missao[]> {
  const { data, error } = await supabase
    .from("missoes" as never)
    .select("id, titulo, descricao, janela_fim, criterio, origem, aprovacao, ativa, atividade_origem_id")
    .eq("classe_id", classeId)
    .order("criado_em", { ascending: false });
  if (error) throw error;
  const missoes = (data ?? []) as unknown as LinhaDeMissao[];
  if (missoes.length === 0) return [];

  const atividadeIds = missoes.map((m) => m.atividade_origem_id).filter((v): v is number => v != null);

  // Só busca atividade e entregas se houver missão de entrega. Missão-meta não tem nenhuma das
  // duas, e pedir `in` com lista vazia traria a turma inteira.
  const [atividades, entregas, alunos] = await Promise.all([
    atividadeIds.length > 0
      ? supabase.from("atividades").select("id, topico_id, pontuacao_maxima, metadata, topicos(nome)").in("id", atividadeIds)
      : Promise.resolve({ data: [], error: null }),
    atividadeIds.length > 0
      ? supabase.from("atividade_aluno").select("atividade_id, aluno_id, status").in("atividade_id", atividadeIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("classe_aluno").select("*", { count: "exact", head: true }).eq("classe_id", classeId),
  ]);
  if (atividades.error) throw atividades.error;
  if (entregas.error) throw entregas.error;
  if (alunos.error) throw alunos.error;

  const porAtividade = new Map(
    ((atividades.data ?? []) as unknown as LinhaDaAtividade[]).map((a) => [a.id, a]),
  );
  const contagem = contarEntregas((entregas.data ?? []) as unknown as LinhaDeEntrega[]);
  const total = alunos.count ?? 0;

  return missoes.map((m) =>
    mapearMissao(
      m,
      m.atividade_origem_id == null ? null : (porAtividade.get(m.atividade_origem_id) ?? null),
      m.atividade_origem_id == null ? 0 : (contagem.get(m.atividade_origem_id) ?? 0),
      total,
    ),
  );
}

/**
 * Grava a missão nos dois caminhos.
 *
 * Em `entrega` a atividade vem **primeiro**, porque o critério precisa do id dela. Se o INSERT
 * da `missoes` falhar depois, a atividade fica órfã — e isso é melhor que o contrário: a
 * atividade órfã aparece na trilha e o professor a vê, enquanto uma `missoes` apontando um id
 * que não existe seria invisível e o critério nunca fecharia.
 */
export async function salvarMissao(
  classeId: number,
  missao: PayloadDaMissao,
  atividade: PayloadDaAtividade | null,
  id?: number,
  atividadeIdExistente?: number | null,
): Promise<number> {
  let pronta = missao;

  if (atividade) {
    const atividadeId = await saveActivity({
      id: atividadeIdExistente ?? undefined,
      topico_id: atividade.topico_id,
      titulo: atividade.titulo,
      descricao: atividade.descricao,
      tipo: atividade.tipo,
      data_entrega: atividade.data_entrega,
      pontuacao_maxima: atividade.pontuacao_maxima,
    });
    await gravarMoedas(atividadeId, atividade.moedas);
    pronta = comCriterioDaAtividade(missao, atividadeId);
  }

  const linha = {
    classe_id: classeId,
    escopo: pronta.escopo,
    origem: pronta.origem,
    titulo: pronta.titulo,
    descricao: pronta.descricao,
    criterio: pronta.criterio,
    recompensa_tipo: pronta.recompensa_tipo,
    janela_fim: pronta.janela_fim,
    atividade_origem_id: atividade ? (pronta.criterio as { atividade_id: number }).atividade_id : null,
  };

  if (id) {
    // `classe_id`, `origem` e `criado_por` são congelados pelo trigger `trg_missoes_guarda`;
    // mandá-los no UPDATE é inofensivo, mas não mandar deixa claro o que de fato muda.
    const { error } = await supabase
      .from("missoes" as never)
      .update({
        titulo: linha.titulo,
        descricao: linha.descricao,
        criterio: linha.criterio,
        recompensa_tipo: linha.recompensa_tipo,
        janela_fim: linha.janela_fim,
      } as never)
      .eq("id", id);
    if (error) throw error;
    return id;
  }

  const { data, error } = await supabase
    .from("missoes" as never)
    .insert(linha as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as unknown as { id: number }).id;
}

/**
 * Grava `metadata.moedas` sem apagar o resto do JSON (regras de correção, anexos…): lê, mescla e escreve.
 * O banco paga estas moedas só quando o professor aprova a entrega (`avaliar_entrega`).
 */
export async function gravarMoedas(atividadeId: number, moedas: number): Promise<void> {
  const lida = await supabase.from("atividades").select("metadata").eq("id", atividadeId).maybeSingle();
  if (lida.error) throw lida.error;
  const atual =
    lida.data?.metadata && typeof lida.data.metadata === "object" && !Array.isArray(lida.data.metadata)
      ? (lida.data.metadata as Record<string, unknown>)
      : {};
  const { moedas: _antiga, ...resto } = atual;
  const novo = moedas > 0 ? { ...resto, moedas } : resto;
  const { error } = await supabase.from("atividades").update({ metadata: novo as never }).eq("id", atividadeId);
  if (error) throw error;
}

/**
 * Copia a missão. Em `entrega`, a atividade é copiada pela função do banco `duplicar_atividade`
 * (que leva as questões numa transação) e a cópia da `missoes` aponta a atividade nova. Em
 * `meta`, é só uma linha nova com o mesmo critério.
 *
 * A cópia nasce com `origem = 'professor'` mesmo quando a original é da IA: quem clicou em
 * duplicar está assumindo a missão, e manter `origem = 'ia'` a deixaria congelada pelo
 * `trg_missoes_guarda` — o professor não conseguiria editar a própria cópia.
 */
export async function duplicarMissao(m: Missao): Promise<number> {
  let criterio = m.criterio;
  let atividadeId: number | null = null;

  if (m.caminho === "entrega" && m.atividadeId != null) {
    const { data, error } = await supabase.rpc("duplicar_atividade" as never, {
      p_atividade_id: m.atividadeId,
      p_conteudo_id: null,
    } as never);
    if (error) throw error;
    atividadeId = data as unknown as number;
    criterio = { metrica: "atividade_especifica", atividade_id: atividadeId };
  }

  const { data, error } = await supabase
    .from("missoes" as never)
    .insert({
      classe_id: await classeDaMissao(m.id),
      escopo: "turma",
      origem: "professor",
      titulo: `${m.titulo} (cópia)`.slice(0, 120),
      descricao: m.objetivo,
      criterio,
      recompensa_tipo: "missao_concluida",
      janela_fim: m.prazo,
      atividade_origem_id: atividadeId,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as unknown as { id: number }).id;
}

/** `classe_id` é congelado pelo trigger, então a cópia tem de nascer na turma certa. */
async function classeDaMissao(id: number): Promise<number> {
  const { data, error } = await supabase.from("missoes" as never).select("classe_id").eq("id", id).single();
  if (error) throw error;
  return (data as unknown as { classe_id: number }).classe_id;
}

/** Aprova ou recusa missão que a IA ou o sistema propôs. Recusa exige motivo (CHECK no banco). */
export async function decidirMissao(id: number, aprovar: boolean, motivo?: string): Promise<void> {
  const { error } = await supabase
    .from("missoes" as never)
    .update(
      (aprovar
        ? { aprovacao: "aprovada", motivo_recusa: null }
        : { aprovacao: "recusada", motivo_recusa: (motivo ?? "").trim() || "Sem motivo informado." }) as never,
    )
    .eq("id", id);
  if (error) throw error;
}

/** Liga ou desliga a missão sem apagá-la. */
export async function alternarMissao(id: number, ativa: boolean): Promise<void> {
  const { error } = await supabase.from("missoes" as never).update({ ativa } as never).eq("id", id);
  if (error) throw error;
}

/**
 * Apaga a missão. Em `entrega`, a atividade sai depois — e os vínculos com conteúdo antes dela,
 * porque a FK `atividade_conteudos` é NO ACTION (as demais da trilha são CASCADE). Se outra
 * tabela impedir (ex.: entregas dos alunos), o erro do banco é propagado para a tela dizer que
 * não foi possível, em vez de fingir que apagou.
 *
 * A `missoes` sai primeiro: `atividade_origem_id` é `ON DELETE SET NULL`, então apagar a
 * atividade antes transformaria a missão numa missão-meta com critério apontando um id que não
 * existe mais — pior que o erro.
 */
export async function excluirMissao(id: number, atividadeId: number | null): Promise<void> {
  const { error } = await supabase.from("missoes" as never).delete().eq("id", id);
  if (error) throw error;
  if (atividadeId == null) return;

  const vinculos = await supabase.from("atividade_conteudos").delete().eq("atividade_id", atividadeId);
  if (vinculos.error) throw vinculos.error;
  const apagada = await supabase.from("atividades").delete().eq("id", atividadeId);
  if (apagada.error) throw apagada.error;
}
