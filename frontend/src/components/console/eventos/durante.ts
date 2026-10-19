// Regras de leitura do painel "Durante" de um evento (função do banco `evento_classe_durante`,
// migration 20261017_08). Só funções puras; o cliente do banco só busca e normaliza.

export type SituacaoDoAluno = "comecou" | "parou" | "nao_comecou";

export type AlunoNoEvento = { alunoId: string; nome: string; situacao: SituacaoDoAluno };

export type PainelDurante = {
  total: number;
  comecaram: number;
  pararam: number;
  naoComecaram: number;
  guildasAtivas: number;
  guildasTotal: number;
  porModalidade: { individual: number; guilda: number };
  alunos: AlunoNoEvento[];
};

/** 0–100; turma vazia dá 0 em vez de dividir por zero. */
export function percentual(parte: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((parte / total) * 100)) : 0;
}

export const ROTULO_DA_SITUACAO: Record<SituacaoDoAluno, string> = {
  comecou: "Participando",
  parou: "Parou",
  nao_comecou: "Não começou",
};

/** Quem precisa de um empurrão: parou ou nunca começou. Parou antes (já tinha engajado), depois nome. */
export function quemPrecisaDeEmpurrao(alunos: AlunoNoEvento[]): AlunoNoEvento[] {
  const peso = (s: SituacaoDoAluno) => (s === "parou" ? 0 : 1);
  return alunos
    .filter((a) => a.situacao !== "comecou")
    .sort((a, b) => peso(a.situacao) - peso(b.situacao) || a.nome.localeCompare(b.nome, "pt-BR"));
}

export function resumoEmFrase(p: PainelDurante): string {
  if (p.total === 0) return "Nenhum aluno matriculado nesta turma.";
  const base = `${p.comecaram} de ${p.total} alunos já participaram (${percentual(p.comecaram, p.total)}%).`;
  if (p.naoComecaram === 0 && p.pararam === 0) return `${base} Todos estão ativos.`;
  const partes = [];
  if (p.naoComecaram > 0) partes.push(p.naoComecaram === 1 ? "1 ainda não começou" : `${p.naoComecaram} ainda não começaram`);
  if (p.pararam > 0) partes.push(p.pararam === 1 ? "1 parou" : `${p.pararam} pararam`);
  return `${base} ${partes.join(" e ")}.`;
}

export function rotuloDasGuildas(p: Pick<PainelDurante, "guildasAtivas" | "guildasTotal">): string {
  return p.guildasTotal === 0 ? "Sem guildas neste evento" : `${p.guildasAtivas} de ${p.guildasTotal} ativas`;
}
