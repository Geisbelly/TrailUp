/** Regras da economia que a tela precisa decidir antes de chamar o banco. */

export type Faixa = { min: number; max: number; teto: number; tetoGeral?: number };

export type ResultadoDoUso =
  | { ok: true; valor: number }
  | { ok: false; erro: "faixa_invalida" | "extensao_desligada" | "teto_da_atividade" | "teto_da_turma" };

export function faixaValida(f: Faixa): boolean {
  if (![f.min, f.max, f.teto].every((n) => Number.isInteger(n) && n >= 0)) return false;
  if (f.min > f.max || f.max > f.teto) return false;
  if (f.tetoGeral !== undefined && f.teto > f.tetoGeral) return false;
  return true;
}

/**
 * Aperta o pedido do item para dentro do mínimo e do máximo de um uso.
 * Se o valor não cabe no teto da atividade ou da turma, recusa o uso inteiro.
 */
export function concedido(
  pedido: number,
  minimo: number,
  maximo: number,
  usadoNaAtividade: number,
  tetoAtividade: number,
  usadoNaTurma = 0,
  tetoTurma = tetoAtividade,
): ResultadoDoUso {
  if (!faixaValida({ min: minimo, max: maximo, teto: tetoAtividade, tetoGeral: tetoTurma })) {
    return { ok: false, erro: "faixa_invalida" };
  }
  const valor = Math.min(Math.max(pedido, minimo), maximo);
  if (valor <= 0) return { ok: false, erro: "extensao_desligada" };
  if (usadoNaAtividade + valor > tetoAtividade) return { ok: false, erro: "teto_da_atividade" };
  if (usadoNaTurma + valor > tetoTurma) return { ok: false, erro: "teto_da_turma" };
  return { ok: true, valor };
}

export const MENSAGEM_DE_ERRO: Record<string, string> = {
  sem_permissao: "Você não pode alterar a economia desta turma.",
  sem_sessao: "A sessão expirou. Entre de novo.",
  faixa_invalida: "Confira os números: o mínimo não pode passar do máximo, nem o máximo do teto.",
  tipo_desconhecido: "Esse tipo de evento não existe no catálogo global.",
  item_indisponivel: "Esse item não está no catálogo.",
  saldo_insuficiente: "Saldo insuficiente.",
  estoque_esgotado: "O estoque deste item na turma acabou.",
  limite_de_compras: "Este aluno já comprou o máximo permitido deste item.",
  limite_de_uso: "Este aluno já usou o máximo deste item nesta atividade.",
  teto_da_atividade: "A extensão passaria do máximo desta atividade.",
  teto_da_turma: "A extensão passaria do máximo da turma.",
  extensao_desligada: "O professor desligou esta extensão.",
  ja_usado: "O item já foi usado. Estorno só vale para o que ainda está na mochila.",
  ja_consumida: "Este item já foi usado.",
  estornada: "Esta compra foi estornada.",
  compra_nao_encontrada: "Compra não encontrada.",
  alvo_invalido: "Escolha a atividade ou a questão em que o item será usado.",
  alvo_de_outra_turma: "O alvo não pertence a esta turma.",
  teto_do_topico: "O tópico já chegou no máximo de novas tentativas.",
  cooldown_24h: "A nova tentativa só libera 24 horas depois da anterior.",
  revise_o_material: "Para responder de novo, é preciso revisar o material do tópico antes.",
  sem_questao_elegivel: "Não há questão elegível para uma nova tentativa.",
  nota_minima_exige_atividade: "Nota mínima só vale numa atividade.",
  criterio_exige_turma: "Acertos e presenças são metas da turma inteira.",
  meta_nao_encontrada: "Meta não encontrada nesta turma.",
  chave_ausente: "Não foi possível identificar o pedido. Tente de novo.",
};

export function mensagemDeErro(codigo: string | null | undefined, padrao = "Não foi possível concluir."): string {
  if (!codigo) return padrao;
  return MENSAGEM_DE_ERRO[codigo] ?? padrao;
}

export type FiltroDeExtrato = "todos" | "evento" | "compra" | "estorno" | "concessao" | "dotacao";

export type LinhaDeExtrato = { id: number; motivo: string; delta: number };

export function filtrarExtrato<T extends LinhaDeExtrato>(linhas: readonly T[], filtro: FiltroDeExtrato): T[] {
  if (filtro === "todos") return [...linhas];
  return linhas.filter((l) => l.motivo === filtro);
}

export function numeroOuNulo(texto: string): number | null {
  const limpo = texto.trim();
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : Number.NaN;
}
