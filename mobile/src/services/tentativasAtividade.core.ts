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
  /** Já inclui as pausas (`20261110_05`): o tempo efetivo é `limiteSeg - pausadoSeg`. */
  limiteSeg: number | null;
  iniciadaEm: string;
  /** Desde quando está pausada, pelo relógio do servidor; `null` = correndo. */
  pausadaEm: string | null;
  pausadoSeg: number;
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
    pausadaEm: texto(d.pausada_em),
    pausadoSeg: numero(d.pausado_seg) ?? 0,
    desvioMs: Number.isFinite(agoraServidor) ? agoraServidor - agoraLocalMs : 0,
    prazo: texto(d.prazo),
    restantes: numero(d.restantes),
  };
}

/**
 * O relógio que `atividade_pausar_tentativa` / `_retomar_tentativa` devolvem (`20261110_05`), por
 * cima da tentativa que o app já tem. Resposta de outra tentativa, ou ilegível, não muda nada.
 */
export function aplicarRelogio(t: TentativaAberta, dado: unknown, agoraLocalMs: number): TentativaAberta {
  const d = objeto(dado);
  if (!d || numero(d.tentativa_id) !== t.tentativaId) return t;
  const agoraServidor = Date.parse(String(d.agora ?? ""));
  return {
    ...t,
    cronometrada: d.cronometrada === true,
    limiteSeg: numero(d.limite_seg),
    iniciadaEm: texto(d.iniciada_em) ?? t.iniciadaEm,
    pausadaEm: texto(d.pausada_em),
    pausadoSeg: numero(d.pausado_seg) ?? t.pausadoSeg,
    desvioMs: Number.isFinite(agoraServidor) ? agoraServidor - agoraLocalMs : t.desvioMs,
  };
}

/**
 * Pausa no aparelho, na hora em que o aluno sai: o relógio da tela para mesmo que a RPC demore ou
 * falhe. Já pausada, ou sem cronômetro, fica como está.
 */
export function pausarNoAparelho(t: TentativaAberta, agoraLocalMs: number): TentativaAberta {
  if (!t.cronometrada || t.limiteSeg == null || t.pausadaEm) return t;
  return { ...t, pausadaEm: new Date(agoraLocalMs + t.desvioMs).toISOString() };
}

/** Retoma no aparelho com a mesma conta do banco: a pausa entra no limite e em `pausadoSeg`. */
export function retomarNoAparelho(t: TentativaAberta, agoraLocalMs: number): TentativaAberta {
  if (!t.pausadaEm) return t;
  const desde = Date.parse(t.pausadaEm);
  const pausa = Number.isFinite(desde) ? Math.max(0, Math.floor((agoraLocalMs + t.desvioMs - desde) / 1000)) : 0;
  return {
    ...t,
    pausadaEm: null,
    pausadoSeg: t.pausadoSeg + pausa,
    limiteSeg: t.limiteSeg == null ? null : t.limiteSeg + pausa,
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
 * As pausas já estão em `limiteSeg`; a pausa em curso para o relógio.
 */
export function segundosRestantes(t: TentativaAberta, agoraLocalMs: number): number | null {
  if (!t.cronometrada || t.limiteSeg == null) return null;
  const inicio = Date.parse(t.iniciadaEm);
  if (!Number.isFinite(inicio)) return null;
  // Pausada, o relógio parou em `pausadaEm`: o tempo fora não conta.
  const pausa = t.pausadaEm ? Date.parse(t.pausadaEm) : NaN;
  const agora = Number.isFinite(pausa) ? pausa : agoraLocalMs + t.desvioMs;
  const decorrido = (agora - inicio) / 1000;
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
 * só o que vem do banco: se saiu no tempo, o XP de bônus e quantas tentativas
 * sobram. Sem cronômetro não se fala de tempo. Tentativa que sobra só é anunciada
 * quando há o que refazer: o resumo da atividade oferece refazer as erradas.
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
  if (retorno.restantes === 0) {
    linhas.push("Esta foi a sua última tentativa nesta atividade.");
  } else if (retorno.restantes != null && retorno.restantes > 0 && retorno.acertosPercentual < 100) {
    linhas.push(`${rotuloDasRestantes(retorno.restantes)} para refazer as questões que você errou.`);
  }
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

/** A resposta de `atividade_situacao_tentativas` (`20261102_08`). */
export type SituacaoTentativas = {
  maximo: number;
  /** Tentativas já respondidas. */
  feitas: number;
  /** Há uma tentativa aberta, que ainda pode ser respondida. */
  aberta: boolean;
  /** Quantas ainda podem ser respondidas, contando a aberta. */
  restantes: number;
};

export function lerSituacao(dado: unknown): SituacaoTentativas | null {
  const d = objeto(dado);
  const maximo = numero(d?.maximo);
  if (!d || maximo == null) return null;
  return {
    maximo,
    feitas: numero(d.feitas) ?? 0,
    aberta: d.aberta === true,
    restantes: Math.max(0, numero(d.restantes) ?? 0),
  };
}

/**
 * Tentativas que o aluno nem começou. Enquanto houver uma, a segunda chance da loja
 * fica de fora (o banco recusa com `tem_tentativa_livre`): terminar esta tentativa e
 * refazer a questão na próxima é de graça.
 */
export function tentativasLivres(s: SituacaoTentativas): number {
  return Math.max(0, s.restantes - (s.aberta ? 1 : 0));
}

/** As questões que a próxima tentativa reabre: as que o aluno não acertou (#136, decisão de 02/11). */
export function questoesParaRefazer(questoes: unknown): number[] {
  if (!Array.isArray(questoes)) return [];
  return questoes
    .filter((q) => q && typeof q === "object" && (q as Record<string, unknown>).correta_aluno !== true)
    .map((q) => numero((q as Record<string, unknown>).id))
    .filter((id): id is number => id != null);
}

/** "Restam 2 tentativas" / "Resta 1 tentativa". */
export function rotuloDasRestantes(restantes: number): string {
  return restantes === 1 ? "Resta 1 tentativa" : `Restam ${restantes} tentativas`;
}
