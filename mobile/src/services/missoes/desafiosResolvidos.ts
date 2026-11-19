import type { MissaoDoAluno } from "./missaoModel";

/**
 * Os desafios que o aluno resolveu NESTA sessão do app, só em memória.
 *
 * A tela do desafio marca o `missaoId` quando o banco diz que está resolvido (acertou agora, ou
 * `ja_concluida`), e a lista da aba Social e o rastreador da Trilha desenham aquela missão como
 * cumprida ao voltar. Sem isso, o caminho principal — Social → Resolver → acertou → voltar —
 * deixava o cartão com "Resolver": a Social não relê as missões no foco, e uma consulta a mais a
 * cada volta é o que já derrubou o banco.
 *
 * Não é fonte da verdade: quem diz se a missão está cumprida continua sendo `missao_aluno`, pela
 * próxima leitura. Daqui só sai `concluida` para quem o servidor ainda mostrava em aberto.
 *
 * Por aluno, porque nada limpa a memória no logout: no aparelho da escola, o acerto do aluno A
 * apareceria como cumprido para o B.
 */
const porAluno = new Map<string, ReadonlySet<number>>();
const ouvintes = new Set<() => void>();
const VAZIO: ReadonlySet<number> = new Set();

type Aluno = string | null | undefined;

export function marcarDesafioResolvido(alunoId: Aluno, missaoId: number): void {
  if (!alunoId || !Number.isInteger(missaoId)) return;
  const atual = porAluno.get(alunoId) ?? VAZIO;
  if (atual.has(missaoId)) return;
  // Conjunto novo a cada marca: `useSyncExternalStore` compara pela identidade.
  porAluno.set(alunoId, new Set([...atual, missaoId]));
  for (const ouvinte of [...ouvintes]) ouvinte();
}

export function desafiosResolvidosDe(alunoId: Aluno): ReadonlySet<number> {
  return (alunoId && porAluno.get(alunoId)) || VAZIO;
}

export function assinarDesafiosResolvidos(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** Só para os testes. */
export function esquecerDesafiosResolvidos(): void {
  porAluno.clear();
  ouvintes.clear();
}

/**
 * A lista com as missões resolvidas nesta sessão como `concluida`. Só mexe na que o servidor
 * ainda mostra em aberto: a expirada continua expirada. Sem nada a mudar, devolve a mesma lista.
 */
export function comDesafiosResolvidos<M extends Pick<MissaoDoAluno, "id" | "status">>(
  missoes: readonly M[],
  resolvidos: ReadonlySet<number>,
): M[] {
  if (!resolvidos.size) return missoes as M[];
  let mudou = false;
  const lista = missoes.map((m) => {
    if (!resolvidos.has(m.id) || (m.status !== "pendente" && m.status !== "em_andamento")) return m;
    mudou = true;
    return { ...m, status: "concluida" } as M;
  });
  return mudou ? lista : (missoes as M[]);
}
