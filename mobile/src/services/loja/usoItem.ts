// Uso de item comprado na trilha. A decisão (saldo, teto, elegibilidade)
// fica em `loja_usar`. Aqui só o que a tela precisa antes e depois da chamada.

export type ResultadoDoUso =
  | { ok: true; valor: number }
  | { ok: false; erro: "faixa_invalida" | "extensao_desligada" | "teto_da_atividade" | "teto_da_turma" };

export type Faixa = { min: number; max: number; teto: number; tetoGeral?: number };

export function faixaValida(f: Faixa): boolean {
  if (![f.min, f.max, f.teto].every((n) => Number.isInteger(n) && n >= 0)) return false;
  if (f.min > f.max || f.max > f.teto) return false;
  if (f.tetoGeral !== undefined && f.teto > f.tetoGeral) return false;
  return true;
}

/** Mesma conta do banco: aperta o pedido e recusa o que não cabe no teto. */
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

const MENSAGEM: Record<string, string> = {
  saldo_insuficiente: "Saldo insuficiente.",
  extensao_desligada: "O professor desligou esta extensão.",
  teto_da_atividade: "A extensão passaria do máximo desta atividade.",
  teto_da_turma: "A extensão passaria do máximo da turma.",
  limite_de_uso: "Você já usou o máximo deste item nesta atividade.",
  ja_consumida: "Este item já foi usado.",
  estornada: "Esta compra foi estornada.",
  compra_nao_encontrada: "Compra não encontrada.",
  alvo_invalido: "Escolha a atividade em que o item será usado.",
  alvo_de_outra_turma: "Esta atividade não é desta turma.",
  teto_do_topico: "Este tópico já chegou no máximo de novas tentativas.",
  cooldown_24h: "A nova tentativa só libera 24 horas depois da anterior.",
  revise_o_material: "Revise o material do tópico antes de responder de novo.",
  sem_questao_elegivel: "Não há questão elegível para uma nova tentativa.",
  sem_sessao: "Sua sessão expirou. Entre de novo.",
  chave_ausente: "Não foi possível identificar o pedido. Tente de novo.",
  fora_da_turma: "Você não está nesta turma.",
};

export function mensagemDeUso(codigo: string | null | undefined): string {
  if (!codigo) return "Não foi possível usar o item.";
  return MENSAGEM[codigo] ?? "Não foi possível usar o item.";
}

/** O prazo que o aluno vê é o gravado no uso. Sem uso, vale a data da turma. */
export function prazoVisivel(
  dataEntrega: string | null | undefined,
  prazoEfetivo: string | null | undefined,
): string | null {
  const efetivo = prazoEfetivo?.trim();
  if (efetivo) return efetivo;
  const turma = dataEntrega?.trim();
  return turma || null;
}

export function rotuloDeTempoExtra(minutos: number): string | null {
  if (!Number.isFinite(minutos) || minutos <= 0) return null;
  if (minutos === 1) return "1 minuto extra nesta atividade";
  return `${minutos} minutos extras nesta atividade`;
}

const EFEITOS_NA_ATIVIDADE = new Set(["prazo_extra", "tempo_extra", "segunda_chance"]);

export type CompraUsavel = { id: number; codigo: string; nome: string };

export function comprasUsaveisNaAtividade(
  compras: readonly { id: number; item_codigo: string; status: string }[],
  nomes: ReadonlyMap<string, string>,
): CompraUsavel[] {
  return compras
    .filter((c) => c.status === "ativa" && EFEITOS_NA_ATIVIDADE.has(c.item_codigo))
    .map((c) => ({
      id: Number(c.id),
      codigo: c.item_codigo,
      nome: nomes.get(c.item_codigo) ?? ROTULO_PADRAO[c.item_codigo] ?? c.item_codigo,
    }));
}

const ROTULO_PADRAO: Record<string, string> = {
  prazo_extra: "Mais prazo",
  tempo_extra: "Mais tempo",
  segunda_chance: "Responder novamente",
};

export type RespostaDeUso = {
  ok: boolean;
  erro?: string;
  prazoEfetivo?: string | null;
  minutos?: number;
  efeito?: string;
};

export function lerRespostaDeUso(data: unknown): RespostaDeUso {
  if (!data || typeof data !== "object") return { ok: false, erro: "resposta_invalida" };
  const r = data as Record<string, unknown>;
  return {
    ok: r.ok === true,
    erro: typeof r.erro === "string" ? r.erro : undefined,
    prazoEfetivo: typeof r.prazo_efetivo === "string" ? r.prazo_efetivo : null,
    minutos: typeof r.minutos === "number" ? r.minutos : undefined,
    efeito: typeof r.efeito === "string" ? r.efeito : undefined,
  };
}
