// Fundo da turma (#144, `20261101_04`): a recompensa coletiva. O professor abre o fundo com uma
// meta em moedas e um benefício; os alunos doam; bateu a meta, a turma ganha. Funções puras: quem
// decide é `fundo_turma_contribuir` (atômica, idempotente, não cobra o que passa da meta).

export type StatusDoFundo = "aberto" | "atingido" | "entregue" | "cancelado";

export type FundoDaTurma = {
  id: number;
  titulo: string;
  beneficio: string;
  meta: number;
  arrecadado: number;
  status: StatusDoFundo;
};

const STATUS: readonly StatusDoFundo[] = ["aberto", "atingido", "entregue", "cancelado"];

export function normalizarFundo(linha: unknown): FundoDaTurma | null {
  if (!linha || typeof linha !== "object") return null;
  const l = linha as Record<string, unknown>;
  const id = Number(l.id);
  const meta = Number(l.meta);
  const arrecadado = Number(l.arrecadado);
  const status = String(l.status) as StatusDoFundo;
  if (!Number.isInteger(id) || !Number.isInteger(meta) || meta < 1 || !STATUS.includes(status)) return null;
  return {
    id,
    titulo: String(l.titulo ?? ""),
    beneficio: String(l.beneficio ?? ""),
    meta,
    arrecadado: Number.isFinite(arrecadado) && arrecadado > 0 ? Math.floor(arrecadado) : 0,
    status,
  };
}

/** 0 a 100, inteiro. */
export function progressoDoFundo(f: Pick<FundoDaTurma, "meta" | "arrecadado">): number {
  return Math.max(0, Math.min(100, Math.floor((100 * f.arrecadado) / f.meta)));
}

export function faltaParaAMeta(f: Pick<FundoDaTurma, "meta" | "arrecadado">): number {
  return Math.max(0, f.meta - f.arrecadado);
}

const VALORES = [5, 10, 20] as const;

/**
 * Valores para tocar e doar: os fixos que cabem no saldo e no que falta, mais "o que falta" quando
 * o aluno pode fechar a meta sozinho. Sem saldo ou fundo fechado, nada.
 */
export function opcoesDeDoacao(f: FundoDaTurma, saldo: number | null): number[] {
  if (f.status !== "aberto" || saldo === null || saldo < 1) return [];
  const falta = faltaParaAMeta(f);
  const teto = Math.min(saldo, falta);
  const opcoes: number[] = VALORES.filter((v) => v <= teto);
  if (falta <= saldo && !opcoes.includes(falta)) opcoes.push(falta);
  return opcoes.sort((a, b) => a - b);
}

export function textoDoProgresso(f: FundoDaTurma): string {
  return `${f.arrecadado} de ${f.meta} moedas (${progressoDoFundo(f)}%)`;
}

const ERROS: Record<string, string> = {
  saldo_insuficiente: "Você não tem moedas suficientes para essa doação.",
  fundo_fechado: "O fundo já fechou: a meta foi atingida ou o professor encerrou.",
  fundo_indisponivel: "Este fundo não está disponível para a sua turma.",
  valor_invalido: "Escolha um valor para doar.",
  chave_ausente: "Não foi possível registrar a doação. Tente de novo.",
  sem_sessao: "Entre de novo para doar.",
};

/** Mensagem para o erro de negócio que a RPC devolve em `{ ok: false, erro }`; null se deu certo. */
export function mensagemDaDoacao(resposta: unknown): string | null {
  if (!resposta || typeof resposta !== "object") return "Não foi possível registrar a doação.";
  const r = resposta as { ok?: unknown; erro?: unknown };
  if (r.ok === true) return null;
  return ERROS[String(r.erro)] ?? "Não foi possível registrar a doação.";
}

export function avisoDaDoacao(resposta: { moedas?: number; status?: string }): string {
  const moedas = Number(resposta.moedas ?? 0);
  if (resposta.status === "atingido") return `Você doou ${moedas} moedas e a turma bateu a meta!`;
  return `Você doou ${moedas} moedas para o fundo da turma.`;
}
