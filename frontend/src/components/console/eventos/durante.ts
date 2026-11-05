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

/** Uma linha de `evento_inscricoes` (migration 20261104_01): quem entrou no rank do evento. */
export type Inscricao = { alunoId: string; inscritoEm: string };

export type Inscrito = { alunoId: string; nome: string; inscritoEm: string };

/**
 * Nome de cada inscrito, a partir dos alunos do painel; em ordem de nome. Inscrito fora da lista (saiu
 * da turma depois de entrar) não aparece: a view do rank também não o conta, porque lê a matrícula.
 */
export function inscritosComNome(inscricoes: Inscricao[], alunos: AlunoNoEvento[]): Inscrito[] {
  const nomes = new Map(alunos.map((a) => [a.alunoId, a.nome]));
  return inscricoes
    .filter((i) => nomes.has(i.alunoId))
    .map((i) => ({ alunoId: i.alunoId, nome: nomes.get(i.alunoId), inscritoEm: i.inscritoEm }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export function resumoDosInscritos(inscritos: number, total: number): string {
  if (total === 0) return "Nenhum aluno matriculado nesta turma.";
  if (inscritos === 0) return "Ninguém entrou no rank ainda. Entrar é opcional e não muda nota nem XP.";
  const quem = inscritos === 1 ? "1 aluno entrou" : `${inscritos} alunos entraram`;
  return `${quem} no rank (${percentual(inscritos, total)}% da turma). Entrar é opcional e não muda nota nem XP.`;
}

/** O que o painel precisa de cada duelo da turma (`arena_professor_resumo`). */
export type DueloDaTurma = { eventoId: string | null; status: "aberto" | "encerrado"; resultado: string | null };

export type DuelosDoEvento = { total: number; jogados: number; aguardando: number; semAdversario: number };

/**
 * Os duelos de um evento (#154): os que o resumo da arena marca com o `evento_id` dele. `jogados` são
 * os encerrados com resultado de verdade; `sem_adversario` (ninguém aceitou) conta à parte.
 */
export function duelosDoEvento(duelos: DueloDaTurma[], eventoId: string): DuelosDoEvento {
  const doEvento = duelos.filter((d) => d.eventoId === eventoId);
  const semAdversario = doEvento.filter((d) => d.status === "encerrado" && d.resultado === "sem_adversario").length;
  const aguardando = doEvento.filter((d) => d.status === "aberto").length;
  return { total: doEvento.length, jogados: doEvento.length - aguardando - semAdversario, aguardando, semAdversario };
}

/**
 * A frase do painel. `recorte`: o resumo da arena traz só os duelos mais recentes da turma (40); com a
 * lista cheia, a contagem pode estar curta, e a frase diz isso em vez de afirmar um total.
 */
export function resumoDosDuelos(d: DuelosDoEvento, recorte: boolean): string {
  if (d.total === 0) return "Nenhum duelo no evento ainda. Duelar é opcional: quem perde não perde ponto.";
  const partes = [`${d.jogados} ${d.jogados === 1 ? "jogado" : "jogados"}`];
  if (d.aguardando) partes.push(`${d.aguardando} esperando o adversário aceitar`);
  if (d.semAdversario) partes.push(`${d.semAdversario} sem adversário`);
  const total = `${d.total} ${d.total === 1 ? "duelo" : "duelos"} no evento: ${partes.join(", ")}.`;
  return recorte ? `${total} A contagem olha os 40 duelos mais recentes da turma.` : total;
}
