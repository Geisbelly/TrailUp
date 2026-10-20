/**
 * O evento da turma como o aluno o vê.
 *
 * O que ele pode ver não é decisão desta tela — é a RLS, e ela já desenhou o produto:
 *
 * - `eventos_classe_aluno_sel`: eventos da minha turma com `status <> 'rascunho'`. **Rascunho
 *   é invisível por policy**, então a tela nunca precisa filtrar isso.
 * - `eventos_classe_missoes_aluno_sel`: as missões do evento, mesma condição.
 * - `eventos_classe_resultado_aluno_sel`: **só quando `status = 'encerrado'`**, e só a minha
 *   linha **ou** `posicao <= 10`. Então "sem resultado" em evento aberto não é falha de
 *   carregamento: é o desenho.
 *
 * Corolário que vale repetir, porque é o tipo de coisa que se tenta "consertar": pedir
 * resultado de um evento aberto devolve lista vazia, não erro. Quem tratar isso como erro vai
 * mostrar uma falha que não existe.
 */

export type FaseDoEvento = "agendado" | "em_andamento" | "encerrado" | "aguardando_apuracao";

export type MissaoDoEvento = { atividadeId: number; titulo: string };

export type PosicaoDoEvento = {
  alunoId: string;
  pontos: number;
  participou: boolean;
  posicao: number | null;
  destaque: boolean;
};

export type EventoDaTurma = {
  id: string;
  titulo: string;
  descricao: string;
  status: "aberto" | "encerrado";
  inicio: string | null;
  fim: string | null;
  modalidadeGuilda: boolean;
  pontos: number;
  moedas: number;
  medalhaParticipacao: boolean;
  medalhaDestaque: boolean;
  recompensa: string | null;
  missoes: MissaoDoEvento[];
  /** Vazio enquanto o evento não encerra — por policy, não por falta de dado. */
  posicoes: PosicaoDoEvento[];
};

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo ? limpo : null;
}

function numero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Em que pé o evento está, do ponto de vista do aluno.
 *
 * `status` e a janela são coisas DIFERENTES e as duas importam: `fn_evento_classe_apurar` soma
 * os eventos do aluno dentro de `[inicio, fim]`, então é a janela que decide o que pontua —
 * mas é o `status` que decide se já houve apuração. Um evento `aberto` cuja janela já passou
 * está esperando o professor encerrar, e dizer "em andamento" ali seria mentira.
 */
export function faseDoEvento(evento: EventoDaTurma, agora: Date = new Date()): FaseDoEvento {
  if (evento.status === "encerrado") return "encerrado";
  const t = agora.getTime();
  const inicio = evento.inicio ? Date.parse(evento.inicio) : null;
  const fim = evento.fim ? Date.parse(evento.fim) : null;
  if (inicio !== null && Number.isFinite(inicio) && t < inicio) return "agendado";
  if (fim !== null && Number.isFinite(fim) && t > fim) return "aguardando_apuracao";
  return "em_andamento";
}

export function rotuloDaFase(fase: FaseDoEvento): string {
  if (fase === "agendado") return "Começa em breve";
  if (fase === "em_andamento") return "Acontecendo agora";
  if (fase === "aguardando_apuracao") return "Aguardando apuração";
  return "Encerrado";
}

/** A minha linha do resultado. `null` em evento aberto — ver o aviso do topo. */
export function minhaPosicao(evento: EventoDaTurma, meuId: string | null): PosicaoDoEvento | null {
  if (!meuId) return null;
  return evento.posicoes.find((p) => p.alunoId === meuId) ?? null;
}

/**
 * O pódio: as posições ordenadas, sem as linhas de quem não participou.
 *
 * `fn_evento_classe_apurar` grava `posicao` só para quem participou (`CASE WHEN b.participou`),
 * então linha sem posição é quem ficou de fora — e ela existe no resultado de propósito, para
 * o professor ver quem não jogou. Na tela do aluno ela não é pódio.
 */
export function podioDoEvento(evento: EventoDaTurma): PosicaoDoEvento[] {
  return evento.posicoes
    .filter((p) => p.participou && p.posicao !== null)
    .sort((a, b) => (a.posicao ?? 0) - (b.posicao ?? 0));
}

export function normalizeMissaoDoEvento(valor: unknown): MissaoDoEvento | null {
  if (!valor || typeof valor !== "object") return null;
  const row = valor as Record<string, unknown>;
  const atividadeId = Number(row.atividade_id);
  if (!Number.isFinite(atividadeId) || atividadeId <= 0) return null;
  // O título vem do join com `atividades`; sem ele, o id ainda identifica a missão.
  const atividade = row.atividade && typeof row.atividade === "object" ? (row.atividade as Record<string, unknown>) : null;
  return {
    atividadeId,
    titulo: textoOuNulo(atividade?.titulo) ?? textoOuNulo(row.titulo) ?? `Atividade ${atividadeId}`,
  };
}

export function normalizePosicao(valor: unknown): PosicaoDoEvento | null {
  if (!valor || typeof valor !== "object") return null;
  const row = valor as Record<string, unknown>;
  const alunoId = textoOuNulo(row.aluno_id);
  if (!alunoId) return null;
  const posicao = Number(row.posicao);
  return {
    alunoId,
    pontos: numero(row.pontos),
    participou: row.participou === true,
    posicao: Number.isFinite(posicao) && posicao > 0 ? posicao : null,
    destaque: row.destaque === true,
  };
}

export function normalizeEvento(valor: unknown): EventoDaTurma | null {
  if (!valor || typeof valor !== "object") return null;
  const row = valor as Record<string, unknown>;
  const id = textoOuNulo(row.id);
  if (!id) return null;
  return {
    id,
    titulo: textoOuNulo(row.titulo) ?? "Evento da turma",
    descricao: textoOuNulo(row.descricao) ?? "",
    // `rascunho` não chega aqui (policy), mas se chegasse não seria "aberto".
    status: row.status === "encerrado" ? "encerrado" : "aberto",
    inicio: textoOuNulo(row.inicio),
    fim: textoOuNulo(row.fim),
    modalidadeGuilda: row.modalidade_guilda === true,
    pontos: numero(row.pontos),
    moedas: numero(row.moedas),
    medalhaParticipacao: row.medalha_participacao === true,
    medalhaDestaque: row.medalha_destaque === true,
    recompensa: textoOuNulo(row.recompensa),
    missoes: Array.isArray(row.missoes)
      ? (row.missoes.map(normalizeMissaoDoEvento).filter(Boolean) as MissaoDoEvento[])
      : [],
    posicoes: Array.isArray(row.posicoes)
      ? (row.posicoes.map(normalizePosicao).filter(Boolean) as PosicaoDoEvento[])
      : [],
  };
}

/**
 * Qual evento mostrar quando há vários.
 *
 * Em andamento ganha de agendado, que ganha de aguardando apuração, que ganha de encerrado —
 * e, no empate, o mais recente. Mostrar o encerrado por cima de um que está acontecendo seria
 * esconder justamente o que o aluno pode fazer agora.
 */
const PESO_DA_FASE: Record<FaseDoEvento, number> = {
  em_andamento: 4,
  agendado: 3,
  aguardando_apuracao: 2,
  encerrado: 1,
};

export function eventoEmDestaque(eventos: EventoDaTurma[], agora: Date = new Date()): EventoDaTurma | null {
  if (!eventos.length) return null;
  return [...eventos].sort((a, b) => {
    const peso = PESO_DA_FASE[faseDoEvento(b, agora)] - PESO_DA_FASE[faseDoEvento(a, agora)];
    if (peso !== 0) return peso;
    return (Date.parse(b.inicio ?? "") || 0) - (Date.parse(a.inicio ?? "") || 0);
  })[0];
}
