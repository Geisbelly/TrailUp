export type SinaisDoAluno = { abandonoPct: number | null; ultimaSessao: string | null };

export type LinhaEngajamento = { aluno_id: string; classe_id: number; taxa_abandono_pct: number | null };
export type LinhaSessao = { aluno_id: string; classe_id: number; dia: string };

export const chaveAlunoTurma = (alunoId: string, classeId: number) => `${alunoId}:${classeId}`;

export function juntarSinais(engajamento: LinhaEngajamento[], sessoes: LinhaSessao[]): Map<string, SinaisDoAluno> {
  const sinais = new Map<string, SinaisDoAluno>();
  const pegar = (chave: string) => sinais.get(chave) ?? { abandonoPct: null, ultimaSessao: null };
  for (const linha of engajamento) {
    const chave = chaveAlunoTurma(linha.aluno_id, Number(linha.classe_id));
    sinais.set(chave, { ...pegar(chave), abandonoPct: linha.taxa_abandono_pct === null ? null : Number(linha.taxa_abandono_pct) });
  }
  for (const linha of sessoes) {
    const chave = chaveAlunoTurma(linha.aluno_id, Number(linha.classe_id));
    const atual = pegar(chave);
    const dia = linha.dia.slice(0, 10);
    if (!atual.ultimaSessao || dia > atual.ultimaSessao) sinais.set(chave, { ...atual, ultimaSessao: dia });
  }
  return sinais;
}
