import { consolePathForView } from "@/pages/consoleSections";

// Números e rótulos do card da turma (docs/frontend/redesign-fase-2/03-analise-turmas.md, 4.4).
// Tudo aqui é conta pura sobre o que o Supabase devolve — sem dado inventado:
// sem aluno, a conclusão é null ("—"), não 0%.

export type MatriculaDaTurma = { classe_id: number; aluno_id: string; porcentagemConcluida: number | null };
export type TopicoDaTurma = { classe_id: number };

export type ResumoDaTurma = {
  alunos: number;
  topicos: number;
  /** Média de classe_aluno.porcentagemConcluida; null sem aluno. */
  conclusaoPct: number | null;
};

const ROMANO = /^(I{1,3}|IV|V|VI{0,3}|IX|X)$/;

/**
 * Sigla do círculo do card. Professores escrevem o nome de vários jeitos
 * ("SPD - 3N 2026/2", "Física I", "Laboratório de Física"), então:
 * sigla já em maiúsculas no começo vale inteira; algarismo romano entra
 * inteiro ("Física II" → "FII"); senão, as iniciais das duas primeiras
 * palavras que começam com letra.
 */
export function siglaDaTurma(nome: string | null | undefined): string {
  const pedacos = String(nome ?? "").split(/[\s\-–—_/·.,:;()]+/).filter(Boolean);
  const palavras = pedacos.filter((p) => /^\p{L}/u.test(p));
  if (palavras.length === 0) {
    // "2N - 2026": o primeiro pedaço com letra, como está escrito.
    const comLetra = pedacos.find((p) => /\p{L}/u.test(p));
    return comLetra ? comLetra.slice(0, 3).toUpperCase() : "T";
  }
  const [primeira, segunda] = palavras;
  if (/^\p{Lu}{2,4}$/u.test(primeira) && !ROMANO.test(primeira)) return primeira;
  if (segunda && ROMANO.test(segunda)) return `${primeira[0]}${segunda}`.toUpperCase();
  return palavras
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

/**
 * Mesma conta do KPI "Conclusão média" do dashboard: média de
 * porcentagemConcluida de quem está matriculado, contando o valor ausente
 * como 0 (é progresso, não nota). Aluno repetido na turma conta uma vez.
 */
export function resumirTurmas(
  classeIds: number[],
  matriculas: MatriculaDaTurma[],
  topicos: TopicoDaTurma[],
): Map<number, ResumoDaTurma> {
  const porTurma = new Map<number, Map<string, number>>(classeIds.map((id) => [id, new Map()]));
  for (const m of matriculas) {
    const alunos = porTurma.get(m.classe_id);
    if (!alunos || alunos.has(m.aluno_id)) continue;
    const pct = Number(m.porcentagemConcluida ?? 0);
    alunos.set(m.aluno_id, Number.isFinite(pct) ? pct : 0);
  }
  const topicosPorTurma = new Map<number, number>();
  for (const t of topicos) topicosPorTurma.set(t.classe_id, (topicosPorTurma.get(t.classe_id) ?? 0) + 1);

  return new Map(
    classeIds.map((id) => {
      const valores = [...(porTurma.get(id)?.values() ?? [])];
      return [
        id,
        {
          alunos: valores.length,
          topicos: topicosPorTurma.get(id) ?? 0,
          conclusaoPct: valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null,
        },
      ];
    }),
  );
}

export const rotuloDeAlunos = (n: number) => `${n} ${n === 1 ? "aluno" : "alunos"}`;

export type Situacao = { rotulo: "Com trilha" | "Sem trilha"; tom: "success" | "warning" };

/** Derivada da trilha: o banco não tem estado de turma "ativa" ou "rascunho". */
export const situacaoDaTurma = (topicos: number): Situacao =>
  topicos > 0 ? { rotulo: "Com trilha", tom: "success" } : { rotulo: "Sem trilha", tom: "warning" };

/** Atalho do card para a trilha da turma (a trilha lê ?turma=). */
export const caminhoDaTrilha = (turmaId: number) => `${consolePathForView("trilha")}?turma=${encodeURIComponent(String(turmaId))}`;

export const formatarConclusao = (pct: number | null) => (pct === null ? "—" : `${Math.round(pct)}%`);
