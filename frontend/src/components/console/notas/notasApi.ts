import { supabase } from "@/integrations/supabase/client";
import type { LinhaDaFila } from "./fila";

// notas_fila() e avaliar_entrega() (migrations 20261016_04/05) ainda não estão nos tipos
// gerados do Supabase, por isso a chamada passa por `as never`.

type LinhaDoBanco = {
  aluno_id: string;
  aluno_nome: string | null;
  atividade_id: number | string;
  topico_id: number | string;
  titulo: string;
  enunciado: string | null;
  gabarito: string | null;
  resposta: string | null;
  entregue_em: string | null;
  prazo: string | null;
  pontuacao_maxima: number | string | null;
  pontuacao_obtida: number | string | null;
  avaliado_em: string | null;
  feedback: string | null;
};

const numero = (v: number | string | null): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export function mapearLinha(l: LinhaDoBanco): LinhaDaFila {
  return {
    alunoId: l.aluno_id,
    alunoNome: l.aluno_nome?.trim() || "Aluno sem nome",
    atividadeId: Number(l.atividade_id),
    topicoId: Number(l.topico_id),
    titulo: l.titulo,
    enunciado: l.enunciado ?? "",
    gabarito: l.gabarito && l.gabarito.trim() ? l.gabarito : null,
    resposta: l.resposta,
    entregueEm: l.entregue_em,
    prazo: l.prazo,
    pontuacaoMaxima: numero(l.pontuacao_maxima),
    pontuacaoObtida: numero(l.pontuacao_obtida),
    avaliadoEm: l.avaliado_em,
    feedback: l.feedback,
  };
}

export async function listarFila(classeId: number): Promise<LinhaDaFila[]> {
  const { data, error } = await supabase.rpc("notas_fila" as never, { p_classe_id: classeId } as never);
  if (error) throw error;
  return ((data ?? []) as unknown as LinhaDoBanco[]).map(mapearLinha);
}

export async function avaliarEntrega(atividadeId: number, alunoId: string, nota: number, feedback: string): Promise<number> {
  const { data, error } = await supabase.rpc(
    "avaliar_entrega" as never,
    { p_atividade_id: atividadeId, p_aluno_id: alunoId, p_nota: nota, p_feedback: feedback.trim() || null } as never,
  );
  if (error) throw error;
  return Number(data);
}

/** Mensagem para o professor (códigos de avaliar_entrega: 42501 permissão, 22023 validação). */
export function traduzirErroDeNota(erro: { code?: string; message?: string } | null | undefined): string {
  if (!erro) return "Não foi possível salvar a avaliação.";
  if (erro.code === "42501") return "Você não tem permissão para avaliar esta entrega.";
  if (erro.code === "22023") return erro.message || "Confira a nota e o feedback.";
  return "Não foi possível salvar a avaliação. Tente de novo.";
}
