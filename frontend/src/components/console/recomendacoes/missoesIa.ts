// Missões sugeridas pela IA (migration 20261102_20, #151). O professor pede, a IA propõe e o professor
// aprova ou recusa; nada chega ao aluno sem a aprovação. Aqui ficam só as regras de tela: o que o
// pedido diz, quantas opções a faixa dá e a taxa de aprovação. O que entra de verdade é regra do banco.

export type LimitesDeMissoesIa = {
  padrao: number;
  minimo: number;
  maximo: number;
  pedidos_por_dia: number;
  pedidos_restantes: number;
};

export type PedidoDeMissoesIa = {
  id: string;
  classe_id: number;
  topico_id: number | null;
  quantidade: number;
  status: string;
  tentativas: number;
  gerados: number | null;
  ultimo_erro: string | null;
  created_at: string;
  finalizado_em: string | null;
};

export type MissaoSugerida = {
  id: number;
  classe_id: number;
  titulo: string;
  descricao: string;
  criterio: unknown;
  base_ia: string | null;
  aprovacao: string;
  motivo_recusa: string | null;
  criado_em: string;
};

/** O banco para de tentar na 5ª (`MAX_TENTATIVAS` da migration). */
export const MAX_TENTATIVAS_DO_PEDIDO = 5;

/** Lê o JSON da RPC sem confiar no formato; faixa quebrada cai em algo que ainda deixa pedir. */
export function lerLimites(bruto: unknown): LimitesDeMissoesIa | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  const n = (v: unknown, reserva: number) => (typeof v === "number" && Number.isFinite(v) ? v : reserva);
  const minimo = Math.max(1, Math.trunc(n(b.minimo, 1)));
  const maximo = Math.max(minimo, Math.trunc(n(b.maximo, 5)));
  return {
    padrao: Math.min(maximo, Math.max(minimo, Math.trunc(n(b.padrao, 3)))),
    minimo,
    maximo,
    pedidos_por_dia: Math.max(1, Math.trunc(n(b.pedidos_por_dia, 3))),
    pedidos_restantes: Math.max(0, Math.trunc(n(b.pedidos_restantes, 0))),
  };
}

/** As quantidades que o professor pode escolher: a faixa inteira, do menor ao maior. */
export function opcoesDeQuantidade(limites: Pick<LimitesDeMissoesIa, "minimo" | "maximo">): number[] {
  const tamanho = Math.max(0, limites.maximo - limites.minimo + 1);
  return Array.from({ length: tamanho }, (_, i) => limites.minimo + i);
}

export function podePedir(limites: LimitesDeMissoesIa | null, pendentesDaTurma: number): boolean {
  if (!limites) return false;
  return limites.pedidos_restantes > 0 && pendentesDaTurma < limites.maximo;
}

export type SituacaoDoPedido =
  | { tipo: "na_fila"; texto: string }
  | { tipo: "tentando"; texto: string }
  | { tipo: "concluido"; texto: string }
  | { tipo: "falhou"; texto: string };

/**
 * O que dizer do pedido mais recente. "Na fila" ainda não foi tentado: a API pode estar fora do ar e o
 * pedido espera na tabela, o que não é um erro. "Tentando" já falhou ao menos uma vez e o banco
 * espaçou a próxima tentativa.
 */
export function situacaoDoPedido(p: Pick<PedidoDeMissoesIa, "status" | "tentativas" | "gerados" | "ultimo_erro">): SituacaoDoPedido {
  if (p.status === "concluido") {
    const n = p.gerados ?? 0;
    return { tipo: "concluido", texto: n === 1 ? "A IA propôs 1 missão. Decida abaixo." : `A IA propôs ${n} missões. Decida abaixo.` };
  }
  if (p.status === "falhou") {
    return {
      tipo: "falhou",
      texto: `A IA não conseguiu propor missões depois de ${MAX_TENTATIVAS_DO_PEDIDO} tentativas${motivoLegivel(p.ultimo_erro)}. Você pode pedir de novo.`,
    };
  }
  if (p.ultimo_erro) {
    return {
      tipo: "tentando",
      texto: `A IA ainda não respondeu (tentativa ${Math.min(p.tentativas, MAX_TENTATIVAS_DO_PEDIDO)} de ${MAX_TENTATIVAS_DO_PEDIDO}). Tentamos de novo em alguns minutos.`,
    };
  }
  return { tipo: "na_fila", texto: "Pedido na fila. A IA responde assim que puder; você pode sair desta tela." };
}

/** " (modelo indisponível)" quando dá para dizer; nunca despeja o erro técnico na tela. */
function motivoLegivel(erro: string | null): string {
  if (!erro) return "";
  if (/Nenhum provedor|rate.?limit|quota|insufficient|credit|indispon/i.test(erro)) return " (a IA está indisponível agora)";
  if (/nenhuma proposta válida/i.test(erro)) return " (nenhuma proposta passou nas regras)";
  return "";
}

export type TaxaDeAprovacao = { aprovadas: number; decididas: number; pct: number | null };

export const JANELA_DE_APROVACAO_DIAS = 30;

/**
 * Aprovadas ÷ decididas, das missões que a IA propôs (a leitura já vem limitada aos últimos 30 dias,
 * pela data da decisão). Pendente não entra: ainda
 * não é um "não". Nada decidido = sem número, não 0%. Só mede: não realimenta o prompt (decisão da #151,
 * sem forma de avaliar, realimentar é ajustar a ruído).
 */
export function taxaDeAprovacao(linhas: Pick<MissaoSugerida, "aprovacao">[]): TaxaDeAprovacao {
  let aprovadas = 0;
  let decididas = 0;
  for (const l of linhas) {
    if (l.aprovacao === "aprovada") {
      aprovadas++;
      decididas++;
    } else if (l.aprovacao === "recusada") {
      decididas++;
    }
  }
  return { aprovadas, decididas, pct: decididas === 0 ? null : (aprovadas / decididas) * 100 };
}

export function textoDaTaxa(t: TaxaDeAprovacao): string {
  if (t.pct === null) return `Nenhuma missão da IA decidida nos últimos ${JANELA_DE_APROVACAO_DIAS} dias`;
  return `${Math.round(t.pct)}% das missões da IA aprovadas nos últimos ${JANELA_DE_APROVACAO_DIAS} dias (${t.aprovadas} de ${t.decididas})`;
}

/** Pendentes da turma: o pedido novo é recusado pelo banco quando passa do teto. */
export function contarPendentesDaTurma(linhas: Pick<MissaoSugerida, "classe_id" | "aprovacao">[], classeId: number): number {
  return linhas.filter((l) => l.classe_id === classeId && l.aprovacao === "pendente").length;
}

/** O pedido mais recente da turma, para dizer em que pé ele está. */
export function pedidoMaisRecente(pedidos: PedidoDeMissoesIa[], classeId: number): PedidoDeMissoesIa | null {
  return (
    pedidos
      .filter((p) => p.classe_id === classeId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))[0] ?? null
  );
}

/**
 * A mensagem do banco (`missao_ia_pedir`) já vem em português e diz o que fazer ("A quantidade vai de 1 a
 * 5.", "Limite de 3 pedidos por dia atingido."). O que não for dele vira um aviso genérico.
 */
export function mensagemDoPedido(erro: { code?: string; message?: string } | null | undefined): string {
  const mensagem = (erro?.message ?? "").trim();
  if (erro?.code === "22023" || erro?.code === "54000" || erro?.code === "42501") return mensagem || "Não foi possível pedir agora.";
  return "Não foi possível pedir as sugestões agora. Tente de novo em instantes.";
}

/** A função ou a tabela ainda não existe (migration pendente): a seção some em vez de mostrar erro. */
export function eMigracaoPendente(erro: { code?: string; message?: string } | null | undefined): boolean {
  if (!erro) return false;
  return (
    erro.code === "42883" ||
    erro.code === "42P01" ||
    erro.code === "42703" ||
    erro.code === "PGRST202" ||
    erro.code === "PGRST205" ||
    (/missao_ia_|missoes_ia_|base_ia/i.test(erro.message ?? "") && /does not exist|schema cache|could not find/i.test(erro.message ?? ""))
  );
}
