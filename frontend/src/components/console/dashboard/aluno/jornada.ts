// Jornada real do aluno (docs/frontend/redesign-fase-2/02-desenho-jornada-real.md).
// Monta os passos a partir de telemetria_eventos_app, na ordem em que o aluno
// estudou, e detecta os desvios em relação à ordem da trilha.
//
// Passo = visita a um tópico com estudo dentro. A visita acaba quando o aluno
// muda de tópico ou fica PAUSA_MAXIMA_MS sem evento; vira passo se tiver
// resposta, conteúdo concluído, tópico concluído ou TEMPO_MINIMO_SEG de tempo
// registrado. O resto são passagens rápidas (abrir o mapa e sair).

export type EventoDoApp = {
  id: string;
  occurred_at: string;
  event_name: string;
  topico_id: number | null;
  conteudo_id: number | null;
  atividade_id: number | null;
  questao_id: number | null;
  attempt_number: number | null;
  is_correct: boolean | null;
};

export type SessaoDeTopico = { topico_id: number | null; aberto_em: string; duracao_sec: number | null };
export type TopicoDaTrilha = { id: number; nome: string | null; ordem: number | null };

export type TipoDePasso = "ok" | "err" | "retry" | "skip" | "back" | "drop";

export type Tentativa = { questaoId: number | null; numero: number | null; correta: boolean };
export type AtividadeNoPasso = { atividadeId: number; tentativas: Tentativa[]; acertouNoFim: boolean };

export type Passo = {
  /** `evento:<id do primeiro evento da visita>` — chave dos comentários do professor. */
  ref: string;
  indice: number;
  topicoId: number;
  topicoNome: string;
  /** Posição do tópico na trilha (1 = primeiro). */
  topicoNumero: number;
  inicio: string;
  fim: string;
  conteudosAbertos: number[];
  conteudosConcluidos: number[];
  atividades: AtividadeNoPasso[];
  respostas: number;
  certas: number;
  /** Atividades respondidas aqui que já tinham sido respondidas em passo anterior. */
  refez: number[];
  concluiuTopico: boolean;
  /** Soma de estudo_sessoes (scope topic) na visita; null = sem registro. */
  tempoSeg: number | null;
  /** 1 = primeira vez que o aluno estuda este tópico. */
  visitaNoTopico: number;
  /** Atividades da trilha acertadas até o fim deste passo ÷ total; null sem atividades. */
  progressoPct: number | null;
  tipo: TipoDePasso;
  desvios: Exclude<TipoDePasso, "ok">[];
  conector: { rotulo: string; tipo: TipoDePasso } | null;
};

export type Jornada = {
  passos: Passo[];
  passagensRapidas: number;
  resumo: { retornos: number; foraDeOrdem: number; repeticoes: number; abandonos: number };
};

export const PAUSA_MAXIMA_MS = 30 * 60_000;
export const TEMPO_MINIMO_SEG = 60;
/** O último passo da jornada só é abandono depois disto sem voltar. */
export const ABANDONO_APOS_MS = 7 * 86_400_000;
const TOLERANCIA_SESSAO_MS = 5_000;

const PRIORIDADE: Exclude<TipoDePasso, "ok">[] = ["drop", "back", "skip", "retry", "err"];

type Visita = {
  ref: string;
  topicoId: number;
  inicio: string;
  fim: string;
  abertos: Set<number>;
  concluidos: Set<number>;
  atividades: Map<number, Tentativa[]>;
  concluiuTopico: boolean;
  tempoSeg: number | null;
};

const ms = (iso: string) => new Date(iso).getTime();

function montarVisitas(eventos: EventoDoApp[]): Visita[] {
  const ordenados = eventos
    .filter((e) => e.topico_id !== null)
    .sort((a, b) => ms(a.occurred_at) - ms(b.occurred_at) || a.id.localeCompare(b.id));
  const visitas: Visita[] = [];
  for (const e of ordenados) {
    let v = visitas[visitas.length - 1];
    if (!v || v.topicoId !== e.topico_id || ms(e.occurred_at) - ms(v.fim) > PAUSA_MAXIMA_MS) {
      v = {
        ref: `evento:${e.id}`,
        topicoId: e.topico_id!,
        inicio: e.occurred_at,
        fim: e.occurred_at,
        abertos: new Set(),
        concluidos: new Set(),
        atividades: new Map(),
        concluiuTopico: false,
        tempoSeg: null,
      };
      visitas.push(v);
    }
    v.fim = e.occurred_at;
    if (e.event_name === "content_open" && e.conteudo_id !== null) v.abertos.add(e.conteudo_id);
    if (e.event_name === "content_complete" && e.conteudo_id !== null) {
      v.abertos.add(e.conteudo_id);
      v.concluidos.add(e.conteudo_id);
    }
    if (e.event_name === "topic_complete") v.concluiuTopico = true;
    if (e.event_name === "question_attempt" && e.atividade_id !== null) {
      const lista = v.atividades.get(e.atividade_id) ?? [];
      lista.push({ questaoId: e.questao_id, numero: e.attempt_number, correta: e.is_correct === true });
      v.atividades.set(e.atividade_id, lista);
    }
  }
  return visitas;
}

/**
 * Cada pedaço de sessão entra na visita do mesmo tópico em cuja janela ele
 * começa. A janela vai além do último evento: ler não gera evento, mas a
 * sessão continua contando — então ela só fecha quando a próxima visita
 * começa (ou depois da pausa máxima).
 */
function atribuirTempo(visitas: Visita[], sessoes: SessaoDeTopico[]) {
  const janelas = visitas.map((v, i) => ({
    v,
    de: ms(v.inicio) - TOLERANCIA_SESSAO_MS,
    ate: Math.min(visitas[i + 1] ? ms(visitas[i + 1].inicio) : Infinity, ms(v.fim) + PAUSA_MAXIMA_MS),
  }));
  for (const s of sessoes) {
    if (s.topico_id === null || !s.duracao_sec) continue;
    const t = ms(s.aberto_em);
    const j = janelas.find((x) => x.v.topicoId === s.topico_id && t >= x.de && t < x.ate);
    if (j) j.v.tempoSeg = (j.v.tempoSeg ?? 0) + Number(s.duracao_sec);
  }
}

const ehPasso = (v: Visita) =>
  v.atividades.size > 0 || v.concluidos.size > 0 || v.concluiuTopico || (v.tempoSeg ?? 0) >= TEMPO_MINIMO_SEG;

export function montarJornada({
  eventos,
  topicos,
  sessoes,
  totalAtividades,
  topicosConcluidos,
  agora,
}: {
  eventos: EventoDoApp[];
  topicos: TopicoDaTrilha[];
  sessoes: SessaoDeTopico[];
  totalAtividades: number;
  topicosConcluidos: Set<number>;
  agora: Date;
}): Jornada {
  const ordenados = [...topicos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.id - b.id);
  const numeroDe = new Map(ordenados.map((t, i) => [t.id, i + 1]));
  const nomeDe = new Map(ordenados.map((t) => [t.id, t.nome?.trim() || `Tópico ${t.id}`]));

  // Tópico que não é desta trilha (removido, outra turma) não vira passo.
  const visitas = montarVisitas(eventos.filter((e) => e.topico_id !== null && numeroDe.has(e.topico_id)));
  atribuirTempo(visitas, sessoes);
  const estudo = visitas.filter(ehPasso);

  const respondidas = new Set<number>();
  const acertadas = new Set<number>();
  const visitasPorTopico = new Map<number, number>();
  const concluidoAte = new Set<number>(); // topic_complete visto até o passo
  let maiorNumero = 0;

  const passos: Passo[] = estudo.map((v, indice) => {
    const numero = numeroDe.get(v.topicoId)!;
    const atividades: AtividadeNoPasso[] = [...v.atividades].map(([atividadeId, tentativas]) => ({
      atividadeId,
      tentativas,
      acertouNoFim: tentativas[tentativas.length - 1]?.correta ?? false,
    }));
    const refez = atividades.map((a) => a.atividadeId).filter((id) => respondidas.has(id));
    const visitaNoTopico = (visitasPorTopico.get(v.topicoId) ?? 0) + 1;
    const jaVisitado = visitaNoTopico > 1;

    const desvios: Exclude<TipoDePasso, "ok">[] = [];
    const anterior = indice > 0 ? numeroDe.get(estudo[indice - 1].topicoId)! : null;
    if (anterior !== null && numero < anterior) desvios.push("back");
    // Fora de ordem: pulou tópico nunca estudado, ou deixou um anterior
    // inacabado e precisou voltar a ele depois.
    const deixouInacabado = estudo.slice(0, indice).some((p) => {
      const n = numeroDe.get(p.topicoId)!;
      return n < numero && !concluidoAte.has(p.topicoId) && estudo.slice(indice + 1).some((q) => q.topicoId === p.topicoId);
    });
    if (numero > maiorNumero + 1 || deixouInacabado) desvios.push("skip");
    if (jaVisitado && refez.length > 0) desvios.push("retry");
    if (atividades.some((a) => !a.acertouNoFim)) desvios.push("err");

    for (const a of atividades) {
      respondidas.add(a.atividadeId);
      if (a.tentativas.some((t) => t.correta)) acertadas.add(a.atividadeId);
    }
    visitasPorTopico.set(v.topicoId, visitaNoTopico);
    if (v.concluiuTopico) concluidoAte.add(v.topicoId);
    maiorNumero = Math.max(maiorNumero, numero);

    return {
      ref: v.ref,
      indice,
      topicoId: v.topicoId,
      topicoNome: nomeDe.get(v.topicoId)!,
      topicoNumero: numero,
      inicio: v.inicio,
      fim: v.fim,
      conteudosAbertos: [...v.abertos],
      conteudosConcluidos: [...v.concluidos],
      atividades,
      respostas: atividades.reduce((n, a) => n + a.tentativas.length, 0),
      certas: atividades.reduce((n, a) => n + a.tentativas.filter((t) => t.correta).length, 0),
      refez,
      concluiuTopico: v.concluiuTopico,
      tempoSeg: v.tempoSeg,
      visitaNoTopico,
      progressoPct: totalAtividades > 0 ? (acertadas.size / totalAtividades) * 100 : null,
      tipo: "ok",
      desvios,
      conector: null,
    };
  });

  // Abandono precisa do futuro: é o último passo do tópico, e o tópico
  // continua sem concluir hoje.
  passos.forEach((p, i) => {
    const ultimoDoTopico = !passos.slice(i + 1).some((q) => q.topicoId === p.topicoId);
    const recente = i === passos.length - 1 && agora.getTime() - ms(p.fim) < ABANDONO_APOS_MS;
    if (ultimoDoTopico && !topicosConcluidos.has(p.topicoId) && !p.concluiuTopico && !recente) p.desvios.unshift("drop");
    p.tipo = PRIORIDADE.find((t) => p.desvios.includes(t)) ?? "ok";
    if (i === 0) return;
    const anterior = passos[i - 1].topicoNumero;
    p.conector =
      p.topicoNumero < anterior
        ? { rotulo: `voltou p/ ${p.topicoNumero}`, tipo: "back" }
        : p.topicoNumero > anterior + 1 || p.desvios.includes("skip")
          ? { rotulo: `pulou p/ ${p.topicoNumero}`, tipo: "skip" }
          : p.desvios.includes("retry")
            ? { rotulo: "repetiu", tipo: "retry" }
            : { rotulo: "seguiu", tipo: "ok" };
  });

  const conta = (t: TipoDePasso) => passos.filter((p) => p.desvios.includes(t as Exclude<TipoDePasso, "ok">)).length;
  return {
    passos,
    passagensRapidas: visitas.length - estudo.length,
    resumo: { retornos: conta("back"), foraDeOrdem: conta("skip"), repeticoes: conta("retry"), abandonos: conta("drop") },
  };
}

/** "45 s", "6 min", "1 h 5 min"; sem registro, "—" (não "0 min"). */
export function formatarTempo(seg: number | null): string {
  if (seg === null) return "—";
  if (seg < 60) return `${Math.round(seg)} s`;
  if (seg < 3600) return `${Math.round(seg / 60)} min`;
  return `${Math.floor(seg / 3600)} h ${Math.round((seg % 3600) / 60)} min`;
}
