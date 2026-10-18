import { supabase } from "@/integrations/supabase/client";
import type { Duelo, LinhaDoRanking } from "./batalha";

// `arena_professor_resumo` é nova (migration 20261017_04) e não está nos tipos gerados do Supabase.

export type ResumoDasBatalhas = { duelos: Duelo[]; ranking: LinhaDoRanking[] };

type Bruto = Record<string, unknown>;

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const numero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const dentro = <T extends string>(v: unknown, validos: readonly T[], padrao: T): T => (validos.includes(v as T) ? (v as T) : padrao);

export function mapearDuelo(b: Bruto): Duelo {
  const equipes = Array.isArray(b.equipes) ? (b.equipes as Bruto[]) : [];
  return {
    id: String(b.id),
    titulo: texto(b.titulo) ?? "",
    formato: dentro(b.formato, ["guilda", "dupla", "solo"] as const, "guilda"),
    modo: dentro(b.modo, ["todos", "velocidade", "precisao"] as const, "todos"),
    status: dentro(b.status, ["aberto", "encerrado"] as const, "aberto"),
    resultado: b.resultado === "vitoria" || b.resultado === "empate" || b.resultado === "sem_adversario" ? b.resultado : null,
    vencedorEquipe: b.vencedor_equipe === 1 || b.vencedor_equipe === 2 ? b.vencedor_equipe : null,
    guildaNome: texto(b.guilda_nome),
    rivalNome: texto(b.guilda_rival_nome),
    criadoEm: String(b.created_at ?? ""),
    aceitaram: numero(b.aceitaram),
    equipes: equipes.map((e) => ({ equipe: numero(e.equipe), pontos: numero(e.pontos), integrantes: numero(e.integrantes) })),
  };
}

export function mapearLinhaDoRanking(b: Bruto): LinhaDoRanking {
  return {
    guildaId: String(b.guilda_id),
    nome: texto(b.nome) ?? "Guilda",
    vitorias: numero(b.vitorias),
    empates: numero(b.empates),
    duelos: numero(b.duelos),
  };
}

export async function lerBatalhas(classeId: number): Promise<ResumoDasBatalhas> {
  const { data, error } = await supabase.rpc("arena_professor_resumo" as never, { p_classe_id: classeId } as never);
  if (error) throw error;
  const bruto = (data ?? {}) as { duelos?: Bruto[]; ranking?: Bruto[] };
  return {
    duelos: (bruto.duelos ?? []).map(mapearDuelo),
    ranking: (bruto.ranking ?? []).map(mapearLinhaDoRanking),
  };
}
