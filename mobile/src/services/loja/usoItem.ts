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

const ouvintesDeEfeito = new Set<() => void>();

/** O cronômetro da atividade relê os minutos gravados depois de um uso. */
export function avisarEfeitoNaAtividade() {
  for (const ouvinte of ouvintesDeEfeito) ouvinte();
}

export function ouvirEfeitoNaAtividade(ouvinte: () => void) {
  ouvintesDeEfeito.add(ouvinte);
  return () => ouvintesDeEfeito.delete(ouvinte);
}

const MENSAGEM: Record<string, string> = {
  saldo_insuficiente: "Saldo insuficiente.",
  extensao_desligada: "O professor desligou esta extensão.",
  teto_da_atividade: "A extensão passaria do máximo desta atividade.",
  teto_da_turma: "A extensão passaria do máximo da turma.",
  limite_por_atividade: "Você chegou no limite de usos deste item nesta atividade.",
  limite_por_questao: "Você chegou no limite de usos deste item nesta questão.",
  limite_por_topico: "Você chegou no limite de usos deste item neste tópico.",
  limite_por_dia: "Você chegou no limite de usos deste item hoje.",
  limite_por_semana: "Você chegou no limite de usos deste item nesta semana.",
  limite_por_turma: "Você chegou no limite de usos deste item na turma.",
  sem_unidade: "Você não tem este item na Bag. Compre na loja.",
  ja_liberada: "A dica desta questão já foi liberada.",
  ja_consumida: "Este item já foi usado.",
  estornada: "Esta compra foi estornada.",
  compra_nao_encontrada: "Compra não encontrada.",
  alvo_invalido: "Escolha a atividade em que o item será usado.",
  alvo_de_outra_turma: "Esta atividade não é desta turma.",
  cooldown_24h: "A nova tentativa só libera 24 horas depois da anterior.",
  revise_o_material: "Revise o material do tópico antes de responder de novo.",
  sem_questao_elegivel: "Não há questão elegível para uma nova tentativa.",
  sem_token: "Para responder de novo, compre uma segunda chance na loja.",
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

/** Segunda chance comprada só reabre a questão quando a tentativa livre acabou e o gabarito segue oculto. */
export function podeResponderComCompra(estado: {
  jaTentou: boolean;
  viuResposta: boolean;
  respostasVisiveis: boolean;
  semTentativaLivre: boolean;
  reabrindo: boolean;
}): boolean {
  return (
    estado.jaTentou &&
    estado.semTentativaLivre &&
    !estado.viuResposta &&
    !estado.respostasVisiveis &&
    !estado.reabrindo
  );
}

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

export type LinhaInventario = { item: string; ativos: number; usados: number; estornados: number };

function inteiro(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export function lerInventario(data: unknown): LinhaInventario[] {
  if (!Array.isArray(data)) return [];
  return data.map((r: Record<string, unknown>) => ({
    item: String(r.item_codigo ?? ""),
    ativos: inteiro(r.ativos),
    usados: inteiro(r.usados),
    estornados: inteiro(r.estornados),
  }));
}

export type ItemUsavel = { codigo: string; nome: string; ativos: number };

/** Um botão por TIPO de item (não por compra): cada uso gasta uma unidade, a mais antiga. */
export function itensUsaveisNaAtividade(inventario: readonly LinhaInventario[], nomes: ReadonlyMap<string, string>): ItemUsavel[] {
  return inventario
    .filter((l) => l.ativos > 0 && EFEITOS_NA_ATIVIDADE.has(l.item))
    .map((l) => ({ codigo: l.item, nome: nomes.get(l.item) ?? ROTULO_PADRAO[l.item] ?? l.item, ativos: l.ativos }));
}

export type PermissaoDeUso = {
  ativos: number;
  /** Usos que cabem agora: o menor entre o que tem na Bag e o que sobra no limite. */
  restantes: number;
  bloqueio: string | null;
  limite: number | null;
  usados: number;
};

export function lerPermissao(data: unknown): PermissaoDeUso {
  if (!data || typeof data !== "object") return { ativos: 0, restantes: 0, bloqueio: "resposta_invalida", limite: null, usados: 0 };
  const r = data as Record<string, unknown>;
  if (typeof r.erro === "string") return { ativos: 0, restantes: 0, bloqueio: r.erro, limite: null, usados: 0 };
  return {
    ativos: inteiro(r.ativos),
    restantes: inteiro(r.restantes),
    bloqueio: typeof r.bloqueio === "string" ? r.bloqueio : null,
    limite: typeof r.limite === "number" ? r.limite : null,
    usados: inteiro(r.usados),
  };
}

/** Texto e estado do botão "usar": quanto ainda dá para usar aqui, ou por que não dá. */
export function botaoDeUso(item: Pick<ItemUsavel, "nome" | "ativos">, permissao: PermissaoDeUso | null) {
  const naBag = item.ativos === 1 ? "1 na Bag" : `${item.ativos} na Bag`;
  if (!permissao) return { texto: `Usar ${item.nome}`, detalhe: naBag, habilitado: false, motivo: null as string | null };
  if (permissao.bloqueio || permissao.restantes <= 0) {
    return { texto: `Usar ${item.nome}`, detalhe: naBag, habilitado: false, motivo: mensagemDeUso(permissao.bloqueio ?? "sem_unidade") };
  }
  const aqui = permissao.restantes === 1 ? "pode usar 1 aqui" : `pode usar ${permissao.restantes} aqui`;
  return { texto: `Usar ${item.nome}`, detalhe: `${naBag} · ${aqui}`, habilitado: true, motivo: null as string | null };
}
