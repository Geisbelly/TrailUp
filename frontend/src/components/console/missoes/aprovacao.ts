// Quem cumpre, quem escreveu e o que falta o professor decidir — as regras de tela que o
// cartão e a seção de missões compartilham.
//
// Três fatos do banco desenham este arquivo (medidos na produção, `20261021_14`):
//
// - **`escopo` é `aluno | turma | guilda`** (`missoes_escopo_check`). O console só gravava o
//   literal `turma`; a diária do sistema nasce `aluno`; a de guilda é a que a IA propõe.
// - **`trg_missoes_guarda` congela o texto, o critério, a janela e o escopo de missão que não
//   é do professor** — e congela EM SILÊNCIO (reatribui `NEW := OLD`, sem erro). Um botão
//   "Editar" numa missão da IA mostraria "Missão atualizada." sem ter mudado nada: a mesma
//   escrita fantasma que o #540 tirou dos tipos de ranking. Por isso `podeEditar`.
// - **A aprovação é o único estado que o professor muda numa missão alheia.** `pendente` não
//   chega ao aluno (policy `missoes_aluno_sel`) e não é avaliada (gatilho da fase 5a); recusar
//   exige motivo (`missoes_recusa_tem_motivo`, até 500 caracteres).

export type EscopoDaMissao = "aluno" | "turma" | "guilda";
export type OrigemDaMissao = "professor" | "ia" | "sistema";
export type Aprovacao = "nao_requer" | "pendente" | "aprovada" | "recusada";

/** Mesmo teto de `missoes_motivo_recusa_check`. */
export const MOTIVO_MAX = 500;

const ESCOPOS: readonly EscopoDaMissao[] = ["aluno", "turma", "guilda"];
const ORIGENS: readonly OrigemDaMissao[] = ["professor", "ia", "sistema"];
const APROVACOES: readonly Aprovacao[] = ["nao_requer", "pendente", "aprovada", "recusada"];

/** Valor desconhecido cai em `turma`, que é o que o console sempre gravou. */
export function escopoDe(v: unknown): EscopoDaMissao {
  return ESCOPOS.includes(v as EscopoDaMissao) ? (v as EscopoDaMissao) : "turma";
}

/**
 * Valor desconhecido cai em `ia`, não em `professor`: tratar como do professor liberaria o
 * "Editar" numa linha que o gatilho congela — o erro silencioso que este arquivo existe para
 * evitar. O contrário (esconder o editar de uma missão que seria editável) é só incômodo.
 */
export function origemDe(v: unknown): OrigemDaMissao {
  return ORIGENS.includes(v as OrigemDaMissao) ? (v as OrigemDaMissao) : "ia";
}

export function aprovacaoDe(v: unknown): Aprovacao {
  return APROVACOES.includes(v as Aprovacao) ? (v as Aprovacao) : "nao_requer";
}

export function rotuloDoEscopo(escopo: EscopoDaMissao): string {
  if (escopo === "guilda") return "Guilda";
  if (escopo === "aluno") return "Cada aluno";
  return "Turma";
}

export function rotuloDaOrigem(origem: OrigemDaMissao): string {
  if (origem === "ia") return "Proposta pela IA";
  if (origem === "sistema") return "Do sistema";
  return "Sua";
}

/** O gatilho só deixa o professor mudar o texto de missão que é dele. */
export function podeEditar(m: { origem: string }): boolean {
  return m.origem === "professor";
}

/** Aprovar e recusar só fazem sentido enquanto a missão espera. */
export function aguardaDecisao(m: { aprovacao: string }): boolean {
  return m.aprovacao === "pendente";
}

/**
 * Pendentes primeiro, numa fila à parte: são as únicas que pedem algo do professor, e uma
 * pendente perdida no meio da lista é uma missão que nenhum aluno vê. A ordem relativa de cada
 * grupo é a que chegou (o banco já ordena por `criado_em`).
 */
export function separarPorDecisao<T extends { aprovacao: string }>(missoes: T[]): { pendentes: T[]; demais: T[] } {
  const pendentes: T[] = [];
  const demais: T[] = [];
  for (const m of missoes) (aguardaDecisao(m) ? pendentes : demais).push(m);
  return { pendentes, demais };
}

/**
 * Recusa pede motivo de verdade. `decidirMissao` ainda tem um texto de reserva para não violar
 * o CHECK, mas a tela não deve depender dele: o motivo é o que o professor deixa registrado.
 */
export function validarMotivoDeRecusa(motivo: string): { ok: true; motivo: string } | { ok: false; erro: string } {
  const limpo = motivo.trim();
  if (limpo.length < 3) return { ok: false, erro: "Diga em poucas palavras por que recusa." };
  if (limpo.length > MOTIVO_MAX) return { ok: false, erro: `No máximo ${MOTIVO_MAX} caracteres.` };
  return { ok: true, motivo: limpo };
}
