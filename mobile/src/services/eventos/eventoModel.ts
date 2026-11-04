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
  /** O professor ligou o rank do evento (peça `arena`, #155). Entrar nele é opcional. */
  temRank: boolean;
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
    temRank: Array.isArray(row.pecas) && row.pecas.includes("arena"),
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

export type GuildaNoEvento = { guildaId: string; nome: string; pontos: number; posicao: number; minha: boolean };

/**
 * Ranking das guildas de um evento encerrado (`eventos_classe_resultado_guilda`), para a
 * coluna lateral do Social na web (#508). O nome vem das guildas que o Social já carrega;
 * a guilda que não existe mais vira "Guilda". Mostra o pódio (três primeiras) e, se a
 * guilda do aluno ficou fora dele, ela também.
 */
export function rankingDasGuildas(
  linhas: unknown,
  guildas: readonly { id: string; nome: string; souMembro: boolean }[],
): GuildaNoEvento[] {
  if (!Array.isArray(linhas)) return [];
  const porId = new Map(guildas.map((g) => [g.id, g]));
  const todas = linhas
    .map((linha): GuildaNoEvento | null => {
      if (!linha || typeof linha !== "object") return null;
      const r = linha as Record<string, unknown>;
      const id = String(r.guilda_id ?? "");
      const posicao = Number(r.posicao);
      if (!id || !Number.isFinite(posicao) || posicao < 1) return null;
      const guilda = porId.get(id);
      return { guildaId: id, nome: guilda?.nome ?? "Guilda", pontos: Number(r.pontos) || 0, posicao, minha: guilda?.souMembro ?? false };
    })
    .filter((g): g is GuildaNoEvento => g !== null)
    .sort((a, b) => a.posicao - b.posicao);
  const podio = todas.slice(0, 3);
  const minha = todas.find((g) => g.minha);
  return minha && !podio.includes(minha) ? [...podio, minha] : podio;
}

// --- Rank do evento (#155, migration 20261104_01) --------------------------------------------
//
// Quando o evento abre, o banco cria um rank por critério escolhido pelo professor, com a janela
// do evento, e a view do ranking conta SÓ quem se inscreveu. Entrar e sair são RPCs
// (`evento_classe_inscrever` / `_sair`); só valem com o evento aberto e antes do fim. Entrar não
// muda nota nem XP: o duelo saiu do XP na fase 1 (`20261103_15`).

export type LinhaDoRank = { posicao: number; alunoId: string; nome: string; pontos: number; eu: boolean };

export type RankDoEvento = { rankId: number; nome: string; criterio: string; linhas: LinhaDoRank[] };

/** O rank aceita entrar ou sair agora? Mesma regra das RPCs: aberto e antes do fim. */
export function podeMexerNaInscricao(evento: EventoDaTurma, agora: Date = new Date()): boolean {
  if (!evento.temRank || evento.status !== "aberto") return false;
  const fim = evento.fim ? Date.parse(evento.fim) : NaN;
  return !Number.isFinite(fim) || agora.getTime() < fim;
}

const ORDEM_DOS_CRITERIOS = ["ranqueada", "pontuacao", "missoes"];

const NOME_DO_CRITERIO: Record<string, string> = {
  ranqueada: "Pontos de batalha",
  pontuacao: "Pontuação",
  missoes: "Missões cumpridas",
};

/**
 * Junta os ranks do evento (`ranks` com `rank_tipo`) com as posições da view filtrada. Quem não se
 * inscreveu não aparece nas linhas, e o corte de visibilidade já veio do banco: aqui só se ordena.
 */
export function montarRanksDoEvento(ranks: unknown, posicoes: unknown, meuId: string | null): RankDoEvento[] {
  if (!Array.isArray(ranks)) return [];
  const linhasPorRank = new Map<number, LinhaDoRank[]>();
  for (const valor of Array.isArray(posicoes) ? posicoes : []) {
    if (!valor || typeof valor !== "object") continue;
    const row = valor as Record<string, unknown>;
    const rankId = Number(row.rank_id);
    const posicao = Number(row.posicao);
    const alunoId = textoOuNulo(row.id_aluno);
    if (!Number.isFinite(rankId) || !Number.isFinite(posicao) || posicao < 1 || !alunoId) continue;
    const linha: LinhaDoRank = {
      posicao,
      alunoId,
      nome: textoOuNulo(row.nome_aluno) ?? "Colega",
      pontos: numero(row.pontuacao),
      eu: alunoId === meuId,
    };
    linhasPorRank.set(rankId, [...(linhasPorRank.get(rankId) ?? []), linha]);
  }
  return ranks
    .map((valor): RankDoEvento | null => {
      if (!valor || typeof valor !== "object") return null;
      const row = valor as Record<string, unknown>;
      const rankId = Number(row.id);
      if (!Number.isFinite(rankId)) return null;
      const tipo = row.tipo && typeof row.tipo === "object" ? (row.tipo as Record<string, unknown>) : {};
      const criterio = textoOuNulo(tipo.criterio) ?? "";
      return {
        rankId,
        criterio,
        nome: NOME_DO_CRITERIO[criterio] ?? textoOuNulo(tipo.nome) ?? "Rank do evento",
        linhas: (linhasPorRank.get(rankId) ?? []).sort((a, b) => a.posicao - b.posicao || a.nome.localeCompare(b.nome, "pt-BR")),
      };
    })
    .filter((r): r is RankDoEvento => r !== null)
    .sort((a, b) => {
      const ia = ORDEM_DOS_CRITERIOS.indexOf(a.criterio);
      const ib = ORDEM_DOS_CRITERIOS.indexOf(b.criterio);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.rankId - b.rankId;
    });
}

/** As primeiras posições e, se eu fiquei de fora delas, a minha linha. */
export function linhasVisiveis(rank: RankDoEvento, quantas = 5): LinhaDoRank[] {
  const topo = rank.linhas.slice(0, quantas);
  const eu = rank.linhas.find((l) => l.eu);
  return eu && !topo.includes(eu) ? [...topo, eu] : topo;
}

/** O que dizer de um erro das RPCs de inscrição. O texto do banco já é para gente (22023). */
export function mensagemDaInscricao(erro: unknown): string {
  const e = (erro ?? {}) as { code?: unknown; message?: unknown };
  if (e.code === "42501") return "Você não está nesta turma, ou a sessão expirou. Entre de novo e tente outra vez.";
  if (e.code === "22023" && typeof e.message === "string" && e.message.trim()) return e.message.trim();
  return "Não foi possível falar com o servidor. Confira a conexão e tente de novo.";
}
