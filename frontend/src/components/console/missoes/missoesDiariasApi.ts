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
  return {
    dia: String(bruto.dia ?? ""),
    missoes: lista.map(mapearMissaoDiaria),
  };
}

/** Percentual 0–100; sem alunos do perfil dá 0 (não divide por zero). */
export function percentualCumprido(cumpriram: number, alunos: number): number {
  if (alunos <= 0) return 0;
  return Math.min(100, Math.round((cumpriram / alunos) * 100));
}
