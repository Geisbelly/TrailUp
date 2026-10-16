// Modal de matrículas (docs/frontend/redesign-fase-2/03-analise-turmas.md, 4.9).
// Busca e ordenação puras, e o perfil dominante de cada aluno.

export type AlunoCandidato = { id: string; nome: string; email?: string | null };
export type PerfilDoAluno = { aluno_id: string; afinidade: number | null; perfil: { nome: string | null } | null };

/** Sem acento, sem caixa e sem espaço sobrando: "João" encontra "joao". */
export function normalizar(texto: string | null | undefined): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type ResultadoDaBusca = AlunoCandidato & { jaMatriculado: boolean };

/**
 * Filtra por nome ou e-mail. Termo vazio lista todos. Ordem: quem pode ser
 * matriculado antes de quem já está na turma; dentro de cada grupo, nome que
 * começa com o termo antes de nome que só o contém, e depois alfabética.
 */
export function buscarAlunos(candidatos: AlunoCandidato[], termo: string, matriculados: Set<string>): ResultadoDaBusca[] {
  const t = normalizar(termo);
  const resultados = candidatos
    .filter((a) => !t || normalizar(a.nome).includes(t) || normalizar(a.email).includes(t))
    .map((a) => ({ ...a, jaMatriculado: matriculados.has(a.id) }));
  const peso = (a: ResultadoDaBusca) => (a.jaMatriculado ? 2 : 0) + (t && !normalizar(a.nome).startsWith(t) ? 1 : 0);
  return resultados.sort((a, b) => peso(a) - peso(b) || a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
}

export function rotuloDaContagem(n: number, termo: string): string {
  if (!normalizar(termo)) return `${n} ${n === 1 ? "aluno" : "alunos"}`;
  return n === 0 ? "nenhum resultado" : `${n} ${n === 1 ? "resultado" : "resultados"}`;
}

/** Maior afinidade; empate fica com o primeiro que o banco devolveu. null sem perfil. */
export function perfilDominantePorAluno(linhas: PerfilDoAluno[]): Map<string, string> {
  const melhor = new Map<string, { nome: string; afinidade: number }>();
  for (const l of linhas) {
    const nome = l.perfil?.nome?.trim();
    if (!nome) continue;
    const afinidade = Number(l.afinidade ?? 0);
    const atual = melhor.get(l.aluno_id);
    if (!atual || afinidade > atual.afinidade) melhor.set(l.aluno_id, { nome, afinidade });
  }
  return new Map([...melhor].map(([id, p]) => [id, p.nome]));
}

/** "desde 04/03/2026" a partir de classe_aluno.created_at (data no fuso do navegador). */
export function formatarDesde(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
