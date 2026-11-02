/**
 * Núcleo puro das tentativas de atividade (#136): ler o que as RPCs devolvem e
 * dizer por que o servidor recusou.
 *
 * O relógio que vale é o do banco (`20261101_13`): `atividade_iniciar_tentativa`
 * registra o início e `atividade_responder_tentativa` decide prazo, tentativas e
 * "no tempo". O app só mostra. Separado de `tentativasAtividade.ts` porque o
 * cliente do Supabase não carrega no runner de testes em Node.
 */

export type TentativaAberta = {
  tentativaId: number;
  numero: number;
  cronometrada: boolean;
  limiteSeg: number | null;
  iniciadaEm: string;
  /** Relógio do servidor menos o do aparelho, em ms: para a contagem não depender do aparelho. */
  desvioMs: number;
  prazo: string | null;
  restantes: number | null;
};

export type RetornoTentativa = {
  tentativaId: number;
  numero: number;
  cronometrada: boolean;
  noTempo: boolean;
  acertosPercentual: number;
  pontuacaoObtida: number | null;
  pontuacaoMaxima: number | null;
  xpBonus: number;
  restantes: number | null;
};

export type MotivoRecusa =
  | "prazo_expirado"
  | "sem_tentativas"
  | "tentativa_ja_respondida"
  | "tentativa_nao_encontrada"
  | "sem_matricula"
  | "sem_sessao";

const MOTIVOS: readonly MotivoRecusa[] = [
  "prazo_expirado",
  "sem_tentativas",
  "tentativa_ja_respondida",
  "tentativa_nao_encontrada",
  "sem_matricula",
  "sem_sessao",
];

export const MENSAGEM_DA_RECUSA: Record<MotivoRecusa, { titulo: string; descricao: string }> = {
  prazo_expirado: {
    titulo: "Prazo encerrado",
    descricao: "O prazo desta atividade já passou, então a resposta não pode mais ser enviada.",
  },
  sem_tentativas: {
    titulo: "Tentativas esgotadas",
    descricao: "Você já usou todas as tentativas desta atividade.",
  },
  tentativa_ja_respondida: {
    titulo: "Tentativa já enviada",
    descricao: "Esta tentativa já foi registrada. Abra a atividade de novo para começar outra.",
  },
  tentativa_nao_encontrada: {
    titulo: "Tentativa não encontrada",
    descricao: "Não achamos esta tentativa. Abra a atividade de novo para começar outra.",
  },
  sem_matricula: {
    titulo: "Fora da turma",
    descricao: "Esta atividade é de uma turma em que você não está matriculado.",
  },
  sem_sessao: {
    titulo: "Sessão encerrada",
    descricao: "Entre de novo para enviar a resposta.",
  },
};

export class TentativaRecusada extends Error {
  readonly motivo: MotivoRecusa;
  constructor(motivo: MotivoRecusa) {
    super(MENSAGEM_DA_RECUSA[motivo].descricao);
    this.name = "TentativaRecusada";
    this.motivo = motivo;
  }
}

type ErroDoSupabase = { message?: unknown; code?: unknown; details?: unknown; hint?: unknown } | null | undefined;

/**
 * O que um erro da RPC quer dizer. `rpc_indisponivel` é a função que não existe no
 * banco (local sem a migration): quem chama volta ao caminho antigo. `null` é
 * qualquer outra falha (rede, por exemplo): quem chama trata como erro comum.
 */
export function motivoDoErro(erro: ErroDoSupabase): MotivoRecusa | "rpc_indisponivel" | null {
  if (!erro) return null;
  const codigo = String(erro.code ?? "");
  const mensagem = String(erro.message ?? "");
  if (codigo === "PGRST202" || codigo === "42883") return "rpc_indisponivel";
  return MOTIVOS.find((motivo) => mensagem.includes(motivo)) ?? null;
}

/**
 * O que mostrar ao aluno quando o servidor recusou. Vale também para a resposta de
 * questão gravada direto em `questao_aluno`, que o banco recusa com `prazo_expirado`
 * depois do prazo (`20261102_04`). `null`: não foi recusa, é falha comum.
 */
export function mensagemDaRecusa(erro: ErroDoSupabase): { titulo: string; descricao: string } | null {
  const motivo = motivoDoErro(erro);
  return motivo && motivo !== "rpc_indisponivel" ? MENSAGEM_DA_RECUSA[motivo] : null;
}

function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor : null;
}

function objeto(dado: unknown): Record<string, unknown> | null {
  return dado && typeof dado === "object" && !Array.isArray(dado) ? (dado as Record<string, unknown>) : null;
}

/** A resposta de `atividade_iniciar_tentativa`; `agoraLocalMs` é `Date.now()` na chegada. */
export function lerTentativa(dado: unknown, agoraLocalMs: number): TentativaAberta | null {
  const d = objeto(dado);
  const tentativaId = numero(d?.tentativa_id);
  const iniciadaEm = texto(d?.iniciada_em);
  if (!d || tentativaId == null || !iniciadaEm) return null;
  const agoraServidor = Date.parse(String(d.agora ?? ""));
  return {
    tentativaId,
    numero: numero(d.numero) ?? 1,
    cronometrada: d.cronometrada === true,
    limiteSeg: numero(d.limite_seg),
    iniciadaEm,
    desvioMs: Number.isFinite(agoraServidor) ? agoraServidor - agoraLocalMs : 0,
    prazo: texto(d.prazo),
    restantes: numero(d.restantes),
  };
}

/** A resposta de `atividade_responder_tentativa`. */
export function lerRetorno(dado: unknown): RetornoTentativa | null {
  const d = objeto(dado);
  const tentativaId = numero(d?.tentativa_id);
  if (!d || tentativaId == null) return null;
  return {
    tentativaId,
    numero: numero(d.numero) ?? 1,
    cronometrada: d.cronometrada === true,
    noTempo: d.no_tempo === true,
    acertosPercentual: numero(d.acertos_percentual) ?? 0,
    pontuacaoObtida: numero(d.pontuacao_obtida),
    pontuacaoMaxima: numero(d.pontuacao_maxima),
    xpBonus: numero(d.xp_bonus) ?? 0,
    restantes: numero(d.restantes),
  };
}

/**
 * Segundos que faltam pelo relógio do servidor; `null` sem cronômetro. Nunca
 * negativo: zero é "acabou o tempo", e a nota continua valendo (só o bônus sai).
 */
export function segundosRestantes(t: TentativaAberta, agoraLocalMs: number): number | null {
  if (!t.cronometrada || t.limiteSeg == null) return null;
  const inicio = Date.parse(t.iniciadaEm);
  if (!Number.isFinite(inicio)) return null;
  const decorrido = (agoraLocalMs + t.desvioMs - inicio) / 1000;
  return Math.max(0, Math.ceil(t.limiteSeg - decorrido));
}

/**
 * Acerto a partir do qual a tentativa no tempo paga bônus: a primeira faixa de
 * `atividade_responder_tentativa` (`FAIXAS` em `20261101_13`, 70/80/90, como no
 * estudo UCT). Mudou lá, muda aqui.
 */
export const ACERTO_MINIMO_DO_BONUS = 70;

/**
 * O que o servidor decidiu sobre a tentativa, em frases para o aluno (#136,
 * "feedback imediato após cada tentativa"). A nota o app já mostra; aqui entram
 * só o que vem do banco: se saiu no tempo, o XP de bônus e se acabaram as
 * tentativas. Sem cronômetro não se fala de tempo. Tentativas que sobram não
 * entram: o app ainda não oferece a próxima sem a segunda chance da loja, e
 * "restam 2" sem botão para usá-las confundiria.
 */
export function linhasDoRetorno(retorno: RetornoTentativa): string[] {
  const linhas: string[] = [];
  if (retorno.cronometrada) {
    if (!retorno.noTempo) {
      linhas.push("Fora do tempo: a nota vale, mas sem bônus de XP.");
    } else if (retorno.xpBonus > 0) {
      linhas.push(`Dentro do tempo: +${retorno.xpBonus} XP de bônus.`);
    } else if (retorno.acertosPercentual < ACERTO_MINIMO_DO_BONUS) {
      linhas.push(`Dentro do tempo. O bônus de XP começa em ${ACERTO_MINIMO_DO_BONUS}% de acerto.`);
    } else {
      // A faixa paga uma vez por atividade: uma tentativa anterior já levou este bônus.
      linhas.push("Dentro do tempo. O bônus desta faixa já foi pago nesta atividade.");
    }
  }
  if (retorno.restantes === 0) linhas.push("Esta foi a sua última tentativa nesta atividade.");
  return linhas;
}

// O retorno sai em `Atividade.registrarConclusao`, longe da tela que respondeu. A
// tela anota a hora antes de pedir a conclusão e lê daqui depois: assim não pega
// o retorno de uma tentativa anterior da mesma atividade.
const retornosRecentes = new Map<number, { retorno: RetornoTentativa; emMs: number }>();

export function guardarRetorno(atividadeId: number, retorno: RetornoTentativa, agoraMs: number): void {
  retornosRecentes.set(atividadeId, { retorno, emMs: agoraMs });
}

/** O retorno guardado a partir de `desdeMs`, uma vez só: quem lê consome. */
export function retornoDesde(atividadeId: number, desdeMs: number): RetornoTentativa | null {
  const guardado = retornosRecentes.get(atividadeId);
  if (!guardado || guardado.emMs < desdeMs) return null;
  retornosRecentes.delete(atividadeId);
  return guardado.retorno;
}
