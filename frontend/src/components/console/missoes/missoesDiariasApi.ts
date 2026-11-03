// Painel do professor: missões do dia (origem sistema) via `missoes_diarias_resumo`.

import { supabase } from "@/integrations/supabase/client";

export type MissaoDiariaResumo = {
  id: number;
  titulo: string;
  descricao: string;
  perfilAlvo: string | null;
  slot: number;
  cumpriram: number;
  alunosDoPerfil: number;
  criterio: Record<string, unknown>;
  atividadesDisponiveis: number;
  conteudosDisponiveis: number;
};

export type ResumoDasMissoesDiarias = {
  dia: string;
  missoes: MissaoDiariaResumo[];
};

type Bruto = Record<string, unknown>;

export function mapearMissaoDiaria(b: Bruto): MissaoDiariaResumo {
  return {
    id: Number(b.id) || 0,
    titulo: String(b.titulo ?? ""),
    descricao: String(b.descricao ?? ""),
    perfilAlvo: typeof b.perfil_alvo === "string" ? b.perfil_alvo : null,
    slot: Number(b.slot) || 0,
    cumpriram: Number(b.cumpriram) || 0,
    alunosDoPerfil: Number(b.alunos_do_perfil) || 0,
    criterio: b.criterio && typeof b.criterio === "object" ? b.criterio as Record<string, unknown> : {},
    atividadesDisponiveis: Number(b.atividades_disponiveis) || 0,
    conteudosDisponiveis: Number(b.conteudos_disponiveis) || 0,
  };
}

export async function lerMissoesDiarias(classeId: number, dia?: string): Promise<ResumoDasMissoesDiarias> {
  const { data, error } = await supabase.rpc("missoes_diarias_resumo" as never, {
    p_classe_id: classeId,
    ...(dia ? { p_dia: dia } : {}),
  } as never);
  if (error) throw error;
  const bruto = (data ?? {}) as Bruto;
  const lista = Array.isArray(bruto.missoes) ? (bruto.missoes as Bruto[]) : [];
  const { data: topicos, error: erroTopicos } = await supabase.from("topicos").select("id").eq("classe_id", classeId);
  if (erroTopicos) throw erroTopicos;
  const topicoIds = ((topicos ?? []) as { id: number }[]).map((t) => t.id);
  let atividadesDisponiveis = 0;
  if (topicoIds.length > 0) {
    const { count, error: erroAtividades } = await supabase.from("atividades").select("id", { count: "exact", head: true }).in("topico_id", topicoIds);
    if (erroAtividades) throw erroAtividades;
    atividadesDisponiveis = count ?? 0;
  }
  const { data: conteudos, error: erroConteudos } = await supabase
    .from("conteudo_personalizado" as never)
    .select("topico_id, conteudo_id" as never)
    .eq("classe_id" as never, classeId as never)
    .is("aluno_id" as never, null as never)
    .eq("status" as never, "pronto" as never);
  if (erroConteudos) throw erroConteudos;
  const chavesConteudos = new Set(((conteudos ?? []) as unknown as { topico_id: number; conteudo_id: number | null }[])
    .map((item) => `${item.topico_id}:${item.conteudo_id ?? "sem-id"}`));
  const totalConteudosDisponiveis = chavesConteudos.size;
  return {
    dia: String(bruto.dia ?? ""),
    missoes: lista.map((item) => ({ ...mapearMissaoDiaria(item), atividadesDisponiveis, conteudosDisponiveis: totalConteudosDisponiveis })),
  };
}

/** O professor ajusta somente o texto; critério, perfil, slot e data ficam sob controle do sistema. */
export async function atualizarTextoMissaoDiaria(args: {
  classeId: number;
  missaoId: number;
  titulo: string;
  descricao: string;
  criterio: Record<string, unknown>;
}): Promise<void> {
  const { data, error } = await supabase
    .from("missoes" as never)
    .update({ titulo: args.titulo.trim(), descricao: args.descricao.trim(), criterio: args.criterio } as never)
    .eq("id", args.missaoId)
    .eq("classe_id", args.classeId)
    .eq("origem", "sistema")
    .not("dia", "is", null)
    .select("id, titulo, descricao, criterio")
    .single();
  if (error) throw error;
  const salvo = data as unknown as { titulo: string; descricao: string; criterio: Record<string, unknown> };
  const criterioPersistido = Object.entries(args.criterio).every(([chave, valor]) => salvo.criterio?.[chave] === valor);
  if (salvo.titulo !== args.titulo.trim() || salvo.descricao !== args.descricao.trim() || !criterioPersistido) {
    throw new Error("O banco ainda não aplicou a edição completa das missões diárias. A meta não foi salva.");
  }
}

/** Desativa a missão diária da turma e conserva os registros de progresso dos alunos. */
export async function excluirMissaoDiaria(args: { classeId: number; missaoId: number }): Promise<void> {
  const { error } = await supabase
    .from("missoes" as never)
    .update({ ativa: false } as never)
    .eq("id", args.missaoId)
    .eq("classe_id", args.classeId)
    .eq("origem", "sistema")
    .not("dia", "is", null)
    .select("id")
    .single();
  if (error) throw error;
}

/** Percentual 0–100; sem alunos do perfil dá 0 (não divide por zero). */
export function percentualCumprido(cumpriram: number, alunos: number): number {
  if (alunos <= 0) return 0;
  return Math.min(100, Math.round((cumpriram / alunos) * 100));
}
