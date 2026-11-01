import { chaveDoPerfil } from "../perfilCores";

/**
 * Tentativas de atividade e cronômetro de um aluno, para o professor ler (#136, fase 3).
 *
 * Tudo vem do banco: `atividade_tentativas` (início e entrega pelo relógio do servidor),
 * `aluno_cronometro` (a escolha do aluno ou da IA), o bônus em `eventos_aluno` e a regra em
 * `app_config`/`eventos_pontuacao`. Aqui só se agrupa e formata.
 */

/**
 * Perfis com cronômetro ligado quando não há escolha: o `TIMER_PROFILES` do app e o
 * `PERFIS_COM_CRONOMETRO` de `fn_cronometro_ligado` (migration 20261101_13). Seeker e Socializer
 * ficam de fora; sem perfil, o banco desliga.
 */
export const PERFIS_COM_CRONOMETRO = ["survivor", "mastermind", "achiever", "conqueror", "daredevil"] as const;

export type OrigemDoCronometro = "perfil" | "aluno" | "ia";

export type EscolhaDoCronometro = {
  ligado: boolean;
  origem: "aluno" | "ia";
  motivo: string | null;
  atualizado_em: string | null;
};

export type EstadoDoCronometro = {
  ligado: boolean;
  origem: OrigemDoCronometro;
  motivo: string | null;
  desde: string | null;
};

/** A escolha gravada vence o perfil, como em `fn_cronometro_ligado`. */
export function estadoDoCronometro(escolha: EscolhaDoCronometro | null, perfilDominante: string | null): EstadoDoCronometro {
  if (escolha) {
    return { ligado: escolha.ligado, origem: escolha.origem, motivo: escolha.motivo, desde: escolha.atualizado_em };
  }
  const chave = chaveDoPerfil(perfilDominante);
  const ligado = chave !== null && (PERFIS_COM_CRONOMETRO as readonly string[]).includes(chave);
  return { ligado, origem: "perfil", motivo: null, desde: null };
}

export function textoDaOrigem(origem: OrigemDoCronometro): string {
  if (origem === "aluno") return "escolha do aluno";
  if (origem === "ia") return "decisão da IA";
  return "padrão do perfil";
}

export type LinhaDeTentativa = {
  atividade_id: number;
  numero: number;
  iniciada_em: string;
  respondida_em: string | null;
  cronometrada: boolean;
  limite_seg: number | null;
  no_tempo: boolean | null;
  acertos_percentual: number | string | null;
  pontuacao_obtida: number | string | null;
  pontuacao_maxima: number | string | null;
};

export type AtividadeDoResumo = { id: number; titulo: string | null; tentativas_max: number | null };

/** Linha de `eventos_aluno` com o bônus de tempo (`atividade_no_tempo_70/80/90`). */
export type BonusPago = { referencia: string | null; valor: number | string | null };

export type TentativaRespondida = {
  numero: number;
  respondidaEm: string;
  acertos: number | null;
  pontos: number | null;
  pontosMax: number | null;
  cronometrada: boolean;
  noTempo: boolean | null;
  /** Do início à entrega, pelo relógio do banco. */
  duracaoSeg: number | null;
};

export type ResumoDaAtividade = {
  atividadeId: number;
  titulo: string;
  feitas: number;
  maximo: number | null;
  /** Há uma tentativa iniciada e ainda não entregue. */
  emAberto: boolean;
  ultima: TentativaRespondida | null;
  /** Acerto da 1ª tentativa entregue: a última pode ter vindo depois de ver o gabarito. */
  primeiraAcertos: number | null;
  bonusXp: number;
  ultimaMovimentacao: string;
};

// O PostgREST devolve `numeric` como texto.
const numero = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const instante = (iso: string | null): number => (iso ? new Date(iso).getTime() : Number.NaN);

function duracaoEmSegundos(t: LinhaDeTentativa): number | null {
  const ms = instante(t.respondida_em) - instante(t.iniciada_em);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : null;
}

/** Uma linha por atividade tentada, da mais recente para a mais antiga. */
export function resumirTentativas(
  tentativas: LinhaDeTentativa[],
  atividades: AtividadeDoResumo[],
  bonus: BonusPago[],
): ResumoDaAtividade[] {
  const porAtividade = new Map<number, LinhaDeTentativa[]>();
  for (const t of tentativas) {
    const lista = porAtividade.get(t.atividade_id) ?? [];
    lista.push(t);
    porAtividade.set(t.atividade_id, lista);
  }
  const bonusPorAtividade = new Map<number, number>();
  for (const b of bonus) {
    const m = /^atividade:(\d+)$/.exec(b.referencia ?? "");
    if (!m) continue;
    const id = Number(m[1]);
    bonusPorAtividade.set(id, (bonusPorAtividade.get(id) ?? 0) + (numero(b.valor) ?? 0));
  }
  const atividadePorId = new Map(atividades.map((a) => [a.id, a]));

  const resumos: ResumoDaAtividade[] = [];
  for (const [atividadeId, lista] of porAtividade) {
    const respondidas = lista.filter((t) => t.respondida_em).sort((a, b) => a.numero - b.numero);
    const ultimaLinha = respondidas[respondidas.length - 1] ?? null;
    const atividade = atividadePorId.get(atividadeId);
    const movimentos = lista
      .flatMap((t) => [instante(t.iniciada_em), instante(t.respondida_em)])
      .filter(Number.isFinite);
    resumos.push({
      atividadeId,
      titulo: atividade?.titulo?.trim() || `Atividade ${atividadeId}`,
      feitas: respondidas.length,
      maximo: atividade?.tentativas_max ?? null,
      emAberto: lista.some((t) => !t.respondida_em),
      ultima: ultimaLinha
        ? {
            numero: ultimaLinha.numero,
            respondidaEm: ultimaLinha.respondida_em as string,
            acertos: numero(ultimaLinha.acertos_percentual),
            pontos: numero(ultimaLinha.pontuacao_obtida),
            pontosMax: numero(ultimaLinha.pontuacao_maxima),
            cronometrada: ultimaLinha.cronometrada,
            noTempo: ultimaLinha.no_tempo,
            duracaoSeg: duracaoEmSegundos(ultimaLinha),
          }
        : null,
      primeiraAcertos: respondidas.length ? numero(respondidas[0].acertos_percentual) : null,
      bonusXp: bonusPorAtividade.get(atividadeId) ?? 0,
      ultimaMovimentacao: new Date(Math.max(0, ...movimentos)).toISOString(),
    });
  }
  return resumos.sort((a, b) => b.ultimaMovimentacao.localeCompare(a.ultimaMovimentacao));
}

export const TIPOS_DO_BONUS = ["atividade_no_tempo_70", "atividade_no_tempo_80", "atividade_no_tempo_90"] as const;

export type RegraDoCronometro = {
  duracaoSeg: number | null;
  toleranciaSeg: number | null;
  /** XP acumulado a partir de cada faixa de acerto: as faixas somam (10/20/30 no padrão). */
  faixas: { minimo: number; xp: number }[];
};

/**
 * A regra global, como o banco a aplica. Chave que não veio (migration 20261101_15 ainda não
 * aplicada, ou faixa removida) fica de fora em vez de virar um número inventado.
 */
export function regraDoCronometro(
  config: { chave: string; valor: string | null }[],
  pontuacao: { tipo: string; pontos: number | string | null }[],
): RegraDoCronometro {
  const valor = (chave: string) => {
    const n = numero(config.find((c) => c.chave === chave)?.valor ?? null);
    return n !== null && Number.isInteger(n) ? n : null;
  };
  let acumulado = 0;
  const faixas: { minimo: number; xp: number }[] = [];
  for (const tipo of TIPOS_DO_BONUS) {
    const linha = pontuacao.find((p) => p.tipo === tipo);
    if (!linha) continue;
    acumulado += numero(linha.pontos) ?? 0;
    faixas.push({ minimo: Number(tipo.slice(tipo.lastIndexOf("_") + 1)), xp: acumulado });
  }
  return {
    duracaoSeg: valor("cronometro_atividade_padrao_seg"),
    toleranciaSeg: valor("cronometro_tolerancia_seg"),
    faixas,
  };
}

/** "45 s", "2 min", "1 min 42 s". */
export function formatarDuracao(segundos: number | null): string {
  if (segundos === null) return "—";
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  if (min === 0) return `${seg} s`;
  return seg === 0 ? `${min} min` : `${min} min ${seg} s`;
}

/** "feitas/máximo" ou só "feitas" quando é ilimitado. */
export function textoDasTentativas(feitas: number, maximo: number | null): string {
  return maximo === null ? `${feitas} (ilimitadas)` : `${feitas}/${maximo}`;
}
