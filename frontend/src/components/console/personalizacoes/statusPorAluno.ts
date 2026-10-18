import { getPersonalizacaoStatusBadge } from "./statusBadge";

// Lista "Todos os alunos" da aba Por aluno. Leitura pura de
// `conteudo_personalizado` (camada por aluno: aluno_id NOT NULL), direto do
// Supabase — o professor ja le essa tabela por RLS, e sem modelo de linguagem
// no meio isto nao tem lugar na API (regra de fronteira do CLAUDE.md).

export type LinhaPersonalizacaoAluno = {
  aluno_id: string | null;
  status: string | null;
  gerado_em: string | null;
  updated_at: string | null;
};

export type TomStatusAluno = "pronto" | "andamento" | "falha" | "sem_material";

export type LinhaStatusAluno = {
  alunoId: string;
  nome: string;
  perfil: string;
  rotulo: string;
  tom: TomStatusAluno;
};

type AlunoBase = { id: string; nome: string | null; email: string | null; perfil_dominante: string };

const TOM_POR_VARIANTE = {
  default: "pronto",
  secondary: "andamento",
  destructive: "falha",
  outline: "sem_material",
} as const;

/** Uma linha por aluno da turma; quem não tem registro entra como "Sem material". */
export function montarStatusPorAluno(
  alunos: AlunoBase[],
  registros: LinhaPersonalizacaoAluno[],
  agora: Date = new Date(),
): LinhaStatusAluno[] {
  const maisRecente = new Map<string, LinhaPersonalizacaoAluno>();
  for (const r of registros) {
    if (!r.aluno_id) continue;
    const atual = maisRecente.get(r.aluno_id);
    const quando = r.updated_at ?? r.gerado_em ?? "";
    if (!atual || quando > (atual.updated_at ?? atual.gerado_em ?? "")) maisRecente.set(r.aluno_id, r);
  }
  return alunos
    .map((a) => {
      const r = maisRecente.get(a.id);
      const badge = getPersonalizacaoStatusBadge({
        temPersonalizacao: Boolean(r),
        status: r?.status,
        updatedAt: r?.updated_at,
        geradoEm: r?.gerado_em,
        now: agora,
      });
      return {
        alunoId: a.id,
        nome: a.nome || a.email || a.id,
        perfil: a.perfil_dominante,
        rotulo: badge.label,
        tom: TOM_POR_VARIANTE[badge.variant],
      };
    })
    .sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"));
}

export function filtrarPorNome(linhas: LinhaStatusAluno[], busca: string): LinhaStatusAluno[] {
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  return termo ? linhas.filter((l) => l.nome.toLocaleLowerCase("pt-BR").includes(termo)) : linhas;
}
