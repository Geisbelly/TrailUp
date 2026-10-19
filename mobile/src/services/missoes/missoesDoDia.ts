import { supabase } from "@/database/supabase";

export type MissaoDoDia = {
  id: number;
  titulo: string;
  descricao: string;
  progresso: number;
  status: "pendente" | "em_andamento" | "concluida";
  criterioRotulo: string;
};

type LinhaMissao = {
  id: number;
  titulo: string | null;
  descricao: string | null;
  criterio: unknown;
  perfil_alvo: string | null;
  dia: string | null;
};

type LinhaProgresso = {
  missao_id: number;
  status: string | null;
  progresso: number | null;
};

function rotuloCriterio(criterio: unknown): string {
  const c = criterio && typeof criterio === "object" ? (criterio as Record<string, unknown>) : null;
  const metrica = String(c?.metrica ?? "");
  if (metrica === "minutos_no_dia") return `${Number(c?.minutos) || "?"} min hoje`;
  if (metrica === "eventos_no_dia") {
    const n = Number(c?.minimo) || "?";
    const ev = String(c?.evento ?? "");
    if (ev.includes("atividade")) return `${n} atividade(s)`;
    if (ev.includes("conteudo")) return `${n} conteúdo(s)`;
    return `${n} ação(ões) na trilha`;
  }
  return metrica || "missão do dia";
}

function statusDe(s: string | null | undefined): MissaoDoDia["status"] {
  const v = (s ?? "").toLowerCase();
  if (v.includes("conclu")) return "concluida";
  if (v.includes("andamento") || v.includes("progress")) return "em_andamento";
  return "pendente";
}

/** Missões do dia da turma do aluno (origem sistema), com o progresso dele. */
export async function carregarMissoesDoDia(classeId: number, perfilAtivo?: string | null): Promise<MissaoDoDia[]> {
  // Mesmo fuso do cron (`America/Sao_Paulo`). `en-CA` devolve YYYY-MM-DD.
  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const q = supabase
    .from("missoes" as never)
    .select("id, titulo, descricao, criterio, perfil_alvo, dia")
    .eq("classe_id", classeId)
    .eq("origem", "sistema")
    .eq("dia", dia)
    .eq("ativa", true)
    .order("slot", { ascending: true });

  const { data, error } = await q;
  if (error) throw error;
  let linhas = (data ?? []) as LinhaMissao[];

  if (perfilAtivo) {
    const perfil = perfilAtivo.toLowerCase();
    linhas = linhas.filter((m) => !m.perfil_alvo || m.perfil_alvo.toLowerCase() === perfil);
  }

  if (linhas.length === 0) return [];

  const ids = linhas.map((m) => m.id);
  const { data: prog, error: errProg } = await supabase
    .from("missao_aluno" as never)
    .select("missao_id, status, progresso")
    .in("missao_id", ids);
  if (errProg) throw errProg;

  const porId = new Map<number, LinhaProgresso>();
  for (const p of (prog ?? []) as LinhaProgresso[]) porId.set(Number(p.missao_id), p);

  return linhas.map((m) => {
    const p = porId.get(m.id);
    return {
      id: m.id,
      titulo: m.titulo?.trim() || "Missão do dia",
      descricao: m.descricao?.trim() || "",
      progresso: Number(p?.progresso ?? 0),
      status: statusDe(p?.status),
      criterioRotulo: rotuloCriterio(m.criterio),
    };
  });
}
