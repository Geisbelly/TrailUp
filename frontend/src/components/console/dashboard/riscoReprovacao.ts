/**
 * Risco de reprovação (#135): o que `professor_risco_reprovacao_turma` devolve, lido com
 * desconfiança (RPC sem tipos gerados). A função só responde ao professor da turma; o aluno
 * nunca vê isto (exposição negativa desmotiva — é a razão do corte no rank).
 */
export type FatorDeRisco = { fator: string; texto: string };

export type RiscoDoAluno = {
  aluno_id: string;
  sinalizado: boolean;
  fatores: FatorDeRisco[];
};

export function lerRiscoDeReprovacao(dados: unknown): RiscoDoAluno[] | null {
  if (!Array.isArray(dados)) return null;
  const linhas: RiscoDoAluno[] = [];
  for (const linha of dados) {
    if (!linha || typeof linha !== "object") continue;
    const l = linha as Record<string, unknown>;
    if (typeof l.aluno_id !== "string") continue;
    const fatores = (Array.isArray(l.fatores) ? l.fatores : [])
      .filter((f): f is Record<string, unknown> => Boolean(f) && typeof f === "object")
      .filter((f) => typeof f.fator === "string" && typeof f.texto === "string")
      .map((f) => ({ fator: f.fator as string, texto: f.texto as string }));
    linhas.push({ aluno_id: l.aluno_id, sinalizado: l.sinalizado === true, fatores });
  }
  return linhas;
}

export type ResumoDoRisco = {
  sinalizados: RiscoDoAluno[];
  /** Com algum fator, mas abaixo do corte: não aparecem um a um, só contam. */
  emObservacao: number;
};

/** Sinalizados primeiro pelo número de fatores; o empate fica na ordem que o banco mandou. */
export function resumirRisco(linhas: RiscoDoAluno[]): ResumoDoRisco {
  const sinalizados = linhas
    .filter((l) => l.sinalizado)
    .map((l, i) => ({ l, i }))
    .sort((a, b) => b.l.fatores.length - a.l.fatores.length || a.i - b.i)
    .map(({ l }) => l);
  return { sinalizados, emObservacao: linhas.filter((l) => !l.sinalizado && l.fatores.length > 0).length };
}

/** A função ainda não existe no banco deste ambiente (migration `20261101_03` não aplicada). */
export function eFuncaoAusente(erro: { code?: string; message?: string } | null | undefined): boolean {
  if (!erro) return false;
  return erro.code === "PGRST202" || erro.code === "42883" || /could not find the function|does not exist/i.test(erro.message ?? "");
}
