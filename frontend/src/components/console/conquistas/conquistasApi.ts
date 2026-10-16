import { supabase } from "@/integrations/supabase/client";
import type { BrainHexProfileKey } from "@/features/signup/brainhex";
import { PERFIS_EM_ORDEM } from "../dashboard/perfilCores";
import { lerCriterio, type CriterioLido } from "./criterio";
import type { LinhaDeConquista } from "./formulario";

// As funções do banco (conquistas_da_turma, conquista_da_turma_salvar,
// conquista_da_turma_alternar — migrations 20261016_01/02) ainda não estão nos tipos
// gerados do Supabase, por isso a chamada passa por `as never`.

export type ConquistaDaTurma = {
  id: number;
  nome: string;
  descricao: string;
  escopo: "comum" | "perfil";
  perfil: BrainHexProfileKey | null;
  criterio: CriterioLido;
  pontos: number;
  ativa: boolean;
  /** Quantos alunos já ganharam: se > 0, editar o critério pede aviso. */
  concedidas: number;
};

export const TETO_PADRAO = 20;

type LinhaDoBanco = {
  id: number;
  nome: string;
  descricao: string | null;
  escopo: string;
  perfil_alvo: string | null;
  criterio: unknown;
  pontos_recompensa: number | null;
  ativa: boolean;
  concedidas: number | string | null;
};

/** Converte a linha do banco; conquista cujo critério a lista da turma não entende (ex.: métrica de sistema) é descartada. */
export function mapearConquista(l: LinhaDoBanco): ConquistaDaTurma | null {
  const criterio = lerCriterio(l.criterio);
  if (!criterio) return null;
  const perfil = (PERFIS_EM_ORDEM as readonly string[]).includes(l.perfil_alvo ?? "") ? (l.perfil_alvo as BrainHexProfileKey) : null;
  return {
    id: l.id,
    nome: l.nome,
    descricao: l.descricao ?? "",
    escopo: l.escopo === "perfil" ? "perfil" : "comum",
    perfil,
    criterio,
    pontos: Number(l.pontos_recompensa ?? 0),
    ativa: l.ativa !== false,
    concedidas: Number(l.concedidas ?? 0),
  };
}

/** Mensagem para o professor a partir do erro do banco (códigos das funções de 20261016_02). */
export function traduzirErro(erro: { code?: string; message?: string } | null | undefined): string {
  if (!erro) return "Não foi possível salvar a conquista.";
  if (erro.code === "54000") return erro.message || "Esta turma já tem o máximo de conquistas.";
  if (erro.code === "42501") return "Você não tem permissão para alterar conquistas desta turma.";
  if (erro.code === "22023") return erro.message || "Confira os campos da conquista.";
  return "Não foi possível salvar a conquista. Tente de novo.";
}

export async function listarConquistasDaTurma(classeId: number): Promise<ConquistaDaTurma[]> {
  const { data, error } = await supabase.rpc("conquistas_da_turma" as never, { p_classe_id: classeId } as never);
  if (error) throw error;
  return ((data ?? []) as unknown as LinhaDoBanco[]).map(mapearConquista).filter((c): c is ConquistaDaTurma => c !== null);
}

/** Teto de conquistas por turma (`app_config`, público). Falha de leitura cai no padrão: o servidor ainda barra. */
export async function lerTeto(): Promise<number> {
  const { data, error } = await supabase.from("app_config").select("valor").eq("chave", "conquistas_por_turma_max").maybeSingle();
  const n = Number((data as { valor?: string } | null)?.valor);
  return !error && Number.isInteger(n) && n > 0 ? n : TETO_PADRAO;
}

export async function salvarConquista(classeId: number, id: number | null, linha: LinhaDeConquista): Promise<number> {
  const { data, error } = await supabase.rpc(
    "conquista_da_turma_salvar" as never,
    {
      p_classe_id: classeId,
      p_id: id,
      p_nome: linha.nome,
      p_descricao: linha.descricao,
      p_escopo: linha.escopo,
      p_perfil_alvo: linha.perfil_alvo,
      p_criterio: linha.criterio,
      p_pontos: linha.pontos_recompensa,
    } as never,
  );
  if (error) throw error;
  return data as unknown as number;
}

export type ResultadoDoLote = { criadas: number[]; erro: string | null };

/**
 * Cria várias linhas (uma por perfil). Para no primeiro erro e diz quantas já entraram:
 * o REST não tem transação, e esconder as que entraram faria o professor recriar tudo e duplicar.
 */
export async function criarConquistas(classeId: number, linhas: LinhaDeConquista[]): Promise<ResultadoDoLote> {
  const criadas: number[] = [];
  for (const linha of linhas) {
    try {
      criadas.push(await salvarConquista(classeId, null, linha));
    } catch (e) {
      return { criadas, erro: traduzirErro(e as { code?: string; message?: string }) };
    }
  }
  return { criadas, erro: null };
}

export async function alternarConquista(id: number, ativa: boolean): Promise<void> {
  const { error } = await supabase.rpc("conquista_da_turma_alternar" as never, { p_id: id, p_ativa: ativa } as never);
  if (error) throw error;
}
