import { supabase } from "@/integrations/supabase/client";
import { mensagemDeErro, resumirCarteiras, type CarteiraDoAluno, type LimitesDeUso, type LinhaDaCarteira, type StatusDoFundo } from "./economiaRegras";

type Resposta = { ok?: boolean; erro?: string; id?: number; devolvido?: number };

type Consulta = {
  select: (colunas: string) => Consulta;
  eq: (coluna: string, valor: unknown) => Consulta;
  in: (coluna: string, valores: unknown[]) => Consulta;
  order: (coluna: string, opcoes?: { ascending: boolean }) => Consulta;
  limit: (n: number) => Consulta;
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
  then: Promise<{ data: unknown; error: { message: string } | null }>["then"];
};

const db = supabase as unknown as {
  from: (tabela: string) => Consulta;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

async function chamar(fn: string, args: Record<string, unknown>): Promise<Resposta> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  const resposta = (data ?? {}) as Resposta;
  if (resposta.ok === false) throw new Error(mensagemDeErro(resposta.erro));
  return resposta;
}

export type ConfigDaTurma = {
  prazo_max_dias_total: number;
  prazo_max_por_ativ: number;
  retry_max_por_topico: number;
  prazo_extensao_min_dias: number;
  prazo_extensao_max_dias: number;
  tempo_extra_min_minutos: number;
  tempo_extra_max_minutos: number;
  tempo_max_por_ativ: number;
  itens_desligados: string[];
};

export const CONFIG_PADRAO: ConfigDaTurma = {
  prazo_max_dias_total: 2,
  prazo_max_por_ativ: 2,
  retry_max_por_topico: 1,
  prazo_extensao_min_dias: 1,
  prazo_extensao_max_dias: 1,
  tempo_extra_min_minutos: 5,
  tempo_extra_max_minutos: 15,
  tempo_max_por_ativ: 30,
  itens_desligados: [],
};

export type ItemDaLoja = { codigo: string; nome: string; efeito: string; preco_base: number; preco_fator: number; ordem: number };
export type PrecoDaTurma = { item_codigo: string; preco_base: number | null; estoque: number | null; uso_max_por_aluno: number | null; ativo: boolean | null; preco_fator: number | null };
export type ValorDeEvento = { tipo: string; pontos: number; moedas: number; descricao: string | null; pontosTurma: number | null; moedasTurma: number | null };
export type Meta = {
  id: number;
  escopo: string;
  alvo_id: number | null;
  titulo: string;
  criterio: string;
  limiar: number;
  moedas: number;
  pontos: number;
  ativa: boolean;
};
export type LinhaExtrato = {
  id: number;
  criado_em: string;
  delta: number;
  motivo: string;
  evento_tipo: string | null;
  referencia: string | null;
  compra_id: number | null;
};
export type Uso = { id: number; aluno_id: string; item_codigo: string; efeito: string; alvo_id: number | null; criado_em: string };
export type EscopoDeLimite = "classe" | "topico" | "atividade";
export type LimiteDeUso = LimitesDeUso & { escopo: EscopoDeLimite; alvo_id: number; item_codigo: string };
export type AlunoDaTurma = { id: string; nome: string };

async function ler<T>(consulta: Consulta): Promise<T> {
  const { data, error } = await (consulta as unknown as Promise<{ data: unknown; error: { message: string } | null }>);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function carregarConfig(classeId: number): Promise<ConfigDaTurma> {
  const { data, error } = await db.from("loja_config_classe").select("*").eq("classe_id", classeId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return CONFIG_PADRAO;
  return { ...CONFIG_PADRAO, ...(data as Partial<ConfigDaTurma>) };
}

export async function salvarConfig(classeId: number, config: ConfigDaTurma) {
  await chamar("economia_salvar_config_classe", {
    p_classe_id: classeId,
    p_prazo_max_dias_total: config.prazo_max_dias_total,
    p_prazo_max_por_ativ: config.prazo_max_por_ativ,
    p_retry_max_por_topico: config.retry_max_por_topico,
    p_prazo_extensao_min_dias: config.prazo_extensao_min_dias,
    p_prazo_extensao_max_dias: config.prazo_extensao_max_dias,
    p_tempo_extra_min_minutos: config.tempo_extra_min_minutos,
    p_tempo_extra_max_minutos: config.tempo_extra_max_minutos,
    p_tempo_max_por_ativ: config.tempo_max_por_ativ,
    p_itens_desligados: config.itens_desligados,
  });
}

export async function carregarItens(classeId: number) {
  const [itens, precos, dotacao] = await Promise.all([
    ler<ItemDaLoja[]>(db.from("loja_itens").select("codigo, nome, efeito, preco_base, preco_fator, ordem").order("ordem")),
    ler<PrecoDaTurma[]>(db.from("loja_preco_classe").select("item_codigo, preco_base, estoque, uso_max_por_aluno, ativo, preco_fator").eq("classe_id", classeId)),
    ler<{ item_codigo: string; quantidade: number }[]>(db.from("loja_dotacao").select("item_codigo, quantidade").eq("classe_id", classeId)),
  ]);
  return { itens: itens ?? [], precos: precos ?? [], dotacao: dotacao ?? [] };
}

export async function salvarPreco(classeId: number, item: string, preco: number | null, estoque: number | null, usoMax: number | null, ativo: boolean | null, fator: number | null = null) {
  await chamar("economia_salvar_preco_classe", {
    p_classe_id: classeId,
    p_item: item,
    p_preco_base: preco,
    p_estoque: estoque,
    p_uso_max_por_aluno: usoMax,
    p_ativo: ativo,
    p_preco_fator: fator,
  });
}

const COLUNAS_DE_LIMITE = "escopo, alvo_id, item_codigo, por_atividade, por_questao, por_topico, por_dia, por_semana, por_turma";

export async function carregarLimites(classeId: number): Promise<LimiteDeUso[]> {
  return (await ler<LimiteDeUso[]>(db.from("loja_limite_uso").select(COLUNAS_DE_LIMITE).eq("classe_id", classeId).order("item_codigo"))) ?? [];
}

/** Tudo nulo apaga a regra daquele escopo (volta a herdar). */
export async function salvarLimiteUso(classeId: number, escopo: EscopoDeLimite, alvoId: number | null, item: string, limites: LimitesDeUso) {
  await chamar("economia_salvar_limite_uso", {
    p_classe_id: classeId,
    p_escopo: escopo,
    p_alvo_id: escopo === "classe" ? null : alvoId,
    p_item: item,
    p_por_atividade: limites.por_atividade,
    p_por_questao: limites.por_questao,
    p_por_topico: limites.por_topico,
    p_por_dia: limites.por_dia,
    p_por_semana: limites.por_semana,
    p_por_turma: limites.por_turma,
  });
}

export async function salvarDotacao(classeId: number, item: string, quantidade: number) {
  await chamar("economia_salvar_dotacao", { p_classe_id: classeId, p_item: item, p_quantidade: quantidade });
}

export async function carregarValores(classeId: number): Promise<ValorDeEvento[]> {
  const [globais, daTurma] = await Promise.all([
    ler<{ tipo: string; pontos: number; moedas: number; descricao: string | null }[]>(db.from("eventos_pontuacao").select("tipo, pontos, moedas, descricao").order("tipo")),
    ler<{ tipo: string; pontos: number | null; moedas: number | null }[]>(db.from("eventos_pontuacao_classe").select("tipo, pontos, moedas").eq("classe_id", classeId)),
  ]);
  const sobre = new Map((daTurma ?? []).map((l) => [l.tipo, l]));
  return (globais ?? []).map((g) => ({
    ...g,
    pontosTurma: sobre.get(g.tipo)?.pontos ?? null,
    moedasTurma: sobre.get(g.tipo)?.moedas ?? null,
  }));
}

export async function salvarValor(classeId: number, tipo: string, pontos: number | null, moedas: number | null) {
  await chamar("economia_salvar_valores_evento", { p_classe_id: classeId, p_tipo: tipo, p_pontos: pontos, p_moedas: moedas });
}

export async function carregarMetas(classeId: number): Promise<Meta[]> {
  return (await ler<Meta[]>(db.from("economia_meta").select("id, escopo, alvo_id, titulo, criterio, limiar, moedas, pontos, ativa").eq("classe_id", classeId).order("id"))) ?? [];
}

export async function salvarMeta(classeId: number, meta: Omit<Meta, "id" | "ativa"> & { id?: number }) {
  await chamar("economia_salvar_meta", {
    p_id: meta.id ?? null,
    p_classe_id: classeId,
    p_escopo: meta.escopo,
    p_alvo_id: meta.alvo_id,
    p_titulo: meta.titulo,
    p_criterio: meta.criterio,
    p_limiar: meta.limiar,
    p_moedas: meta.moedas,
    p_pontos: meta.pontos,
  });
}

export async function arquivarMeta(id: number) {
  await chamar("economia_arquivar_meta", { p_id: id });
}

export async function carregarAlunos(classeId: number): Promise<AlunoDaTurma[]> {
  const vinculos = await ler<{ aluno_id: string }[]>(db.from("classe_aluno").select("aluno_id").eq("classe_id", classeId));
  const ids = (vinculos ?? []).map((v) => v.aluno_id);
  if (!ids.length) return [];
  const alunos = await ler<{ id: string; nome: string }[]>(db.from("alunos").select("id, nome").in("id", ids).order("nome"));
  return alunos ?? [];
}

export async function carregarExtrato(alunoId: string, motivo: string | null): Promise<LinhaExtrato[]> {
  const { data, error } = await db.rpc("economia_extrato", {
    p_aluno_id: alunoId,
    p_motivo: motivo,
    p_desde: null,
    p_ate: null,
    p_limite: 50,
    p_offset: 0,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as LinhaExtrato[];
}

export async function carregarUsos(classeId: number): Promise<Uso[]> {
  return (await ler<Uso[]>(db.from("loja_uso_log").select("id, aluno_id, item_codigo, efeito, alvo_id, criado_em").eq("classe_id", classeId).order("criado_em", { ascending: false }).limit(40))) ?? [];
}

export async function estornar(compraId: number, motivo: string) {
  await chamar("loja_estornar", { p_compra_id: compraId, p_motivo: motivo });
}

export async function salvarEscopo(classeId: number, escopo: "topico" | "atividade", alvoId: number, moedasConclusao: number | null, moedasAprovacao: number | null, prazoMin: number | null, prazoMax: number | null) {
  await chamar("economia_salvar_escopo", {
    p_classe_id: classeId,
    p_escopo: escopo,
    p_alvo_id: alvoId,
    p_moedas_conclusao: moedasConclusao,
    p_moedas_aprovacao: moedasAprovacao,
    p_pontos: null,
    p_prazo_extensao_min_dias: prazoMin,
    p_prazo_extensao_max_dias: prazoMax,
    p_prazo_max_por_ativ: null,
    p_tempo_extra_min_minutos: null,
    p_tempo_extra_max_minutos: null,
    p_tempo_max_por_ativ: null,
    p_uso_max_prazo: null,
    p_uso_max_tempo: null,
    p_uso_max_retry: null,
  });
}

export type FundoDaTurma = {
  id: number;
  titulo: string;
  beneficio: string;
  meta: number;
  arrecadado: number;
  status: StatusDoFundo;
  criado_em: string;
  encerrado_em: string | null;
};

/** Fundos da turma, o ativo primeiro, e quantos alunos doaram a cada um (a RLS dá ao professor todas as doações). */
export async function carregarFundos(classeId: number): Promise<{ fundos: FundoDaTurma[]; doadores: Map<number, number> }> {
  const { data, error } = await db
    .from("fundos_turma")
    .select("id, titulo, beneficio, meta, arrecadado, status, criado_em, encerrado_em")
    .eq("classe_id", classeId)
    .order("criado_em", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  const fundos = (data ?? []) as FundoDaTurma[];
  const doadores = new Map<number, number>();
  if (fundos.length) {
    const doacoes = await db.from("fundos_turma_contribuicao").select("fundo_id, aluno_id").in("fundo_id", fundos.map((f) => f.id));
    if (doacoes.error) throw new Error(doacoes.error.message);
    const porFundo = new Map<number, Set<string>>();
    for (const d of (doacoes.data ?? []) as { fundo_id: number; aluno_id: string }[]) {
      if (!porFundo.has(d.fundo_id)) porFundo.set(d.fundo_id, new Set());
      porFundo.get(d.fundo_id)!.add(d.aluno_id);
    }
    for (const [id, alunos] of porFundo) doadores.set(id, alunos.size);
  }
  return { fundos, doadores };
}

export async function criarFundo(classeId: number, titulo: string, beneficio: string, meta: number) {
  await chamar("fundo_turma_criar", { p_classe_id: classeId, p_titulo: titulo, p_beneficio: beneficio, p_meta: meta });
}

/** `entregue = false` cancela e devolve as moedas a quem doou. */
export async function encerrarFundo(fundoId: number, entregue: boolean) {
  await chamar("fundo_turma_encerrar", { p_fundo_id: fundoId, p_entregue: entregue });
}

/** A moeda individual de cada aluno da turma: o razão dele (a RLS dá ao professor os seus alunos). */
export async function carregarCarteiras(classeId: number): Promise<CarteiraDoAluno[]> {
  const alunos = await carregarAlunos(classeId);
  if (!alunos.length) return [];
  const linhas = await ler<LinhaDaCarteira[]>(
    db.from("moedas_ledger").select("aluno_id, delta, motivo, classe_id").in("aluno_id", alunos.map((a) => a.id)).limit(10000),
  );
  return resumirCarteiras(alunos, linhas ?? [], classeId);
}
