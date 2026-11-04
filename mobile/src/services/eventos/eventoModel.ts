import { normalizeBrainHexProfile, type BrainHexProfile } from "@/constants/brainHexProfiles";
import { formatRankScore } from "@/utils/rankingPodium";

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

export type LinhaDoRank = {
  posicao: number;
  alunoId: string;
  nome: string;
  pontos: number;
  eu: boolean;
  /** `percentual_do_lider` da view: nulo abaixo de 8 no rank, com líder sem ponto e no Elo (#155). */
  percentualDoLider: number | null;
};

export type RankDoEvento = { rankId: number; nome: string; criterio: string; linhas: LinhaDoRank[] };

/** O rank aceita entrar ou sair agora? Mesma regra das RPCs: aberto e antes do fim. */
export function podeMexerNaInscricao(evento: EventoDaTurma, agora: Date = new Date()): boolean {
  if (!evento.temRank || evento.status !== "aberto") return false;
  const fim = evento.fim ? Date.parse(evento.fim) : NaN;
  return !Number.isFinite(fim) || agora.getTime() < fim;
}

const ORDEM_DOS_CRITERIOS = ["ranqueada", "pontuacao", "missoes", "tempo"];

const NOME_DO_CRITERIO: Record<string, string> = {
  ranqueada: "Pontos de batalha",
  pontuacao: "Pontuação",
  missoes: "Missões cumpridas",
  tempo: "Tempo de estudo",
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
      percentualDoLider: row.percentual_do_lider == null || !Number.isFinite(Number(row.percentual_do_lider)) ? null : Number(row.percentual_do_lider),
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

// --- Desenho do rank no app (docs/superpowers/specs/2026-11-04-rank-do-evento-no-app-desenho.md) ---

/** O que vem entre o pódio e o fim: um acima, eu, um abaixo, e onde a lista pula. */
export type ItemDaVizinhanca = { tipo: "linha"; linha: LinhaDoRank } | { tipo: "salto"; chave: string };

/**
 * Rank relativo: quem está logo acima e logo abaixo de mim, fora do pódio (o pódio já mostra os três
 * primeiros). Rank absoluto desanima quem está embaixo e o relativo não (Li et al., 2024). Vazio se
 * eu não estou no rank ou se já estou no pódio.
 */
export function vizinhanca(rank: RankDoEvento): ItemDaVizinhanca[] {
  const i = rank.linhas.findIndex((l) => l.eu);
  const podio = rank.linhas.filter((l) => l.posicao <= 3).length;
  if (i < 0 || i < podio) return [];
  const ini = Math.max(podio, i - 1);
  const fim = Math.min(rank.linhas.length, i + 2);
  const itens: ItemDaVizinhanca[] = rank.linhas.slice(ini, fim).map((linha) => ({ tipo: "linha", linha }));
  if (ini > podio) itens.unshift({ tipo: "salto", chave: "antes" });
  if (fim < rank.linhas.length) itens.push({ tipo: "salto", chave: "depois" });
  return itens;
}

/**
 * A ênfase de cada perfil no rank do evento. A cor, a arena, a moldura e a medalha vêm do tema, como
 * no app inteiro; aqui fica o que aparece primeiro e o que a frase destaca. Mesmas fontes e mesmo
 * aviso de `socialDestaque.ts`: Nacke, Bateman e Mandryk (2014) para a motivação de cada arquétipo,
 * Orji, Vassileva e Mandryk (2014) para "a mesma estratégia ajuda um perfil e atrapalha outro".
 * Ponto de partida, para medir — não verdade.
 */
export type FocoDoRank = "rival" | "meta" | "regra" | "gente" | "seguro" | "explorar";
export type BlocoDoRank = "foco" | "podio" | "vizinhanca";

const ENFASE_DO_RANK: Record<BrainHexProfile, { foco: FocoDoRank; ordem: readonly BlocoDoRank[] }> = {
  conqueror: { foco: "rival", ordem: ["foco", "podio", "vizinhanca"] }, // vencer quem está acima
  daredevil: { foco: "rival", ordem: ["foco", "podio", "vizinhanca"] }, // a disputa agora
  achiever: { foco: "meta", ordem: ["foco", "podio", "vizinhanca"] }, // quanto falta para o pódio
  mastermind: { foco: "regra", ordem: ["foco", "podio", "vizinhanca"] }, // como o número é contado
  socializer: { foco: "gente", ordem: ["podio", "foco", "vizinhanca"] }, // quem está junto
  seeker: { foco: "explorar", ordem: ["foco", "podio", "vizinhanca"] }, // os outros critérios
  // Quem está embaixo sente mais pressão (Li et al., 2024): primeiro quem está perto, depois o topo.
  survivor: { foco: "seguro", ordem: ["foco", "vizinhanca", "podio"] },
};

export function enfaseDoRank(perfil: string | null | undefined): { foco: FocoDoRank; ordem: readonly BlocoDoRank[] } {
  return ENFASE_DO_RANK[normalizeBrainHexProfile(perfil) ?? "mastermind"];
}

const DESCRICAO_DO_CRITERIO: Record<string, string> = {
  ranqueada: "pontos de batalha",
  pontuacao: "pontos",
  missoes: "missões cumpridas",
  tempo: "minutos de estudo ativo",
};

function quantidade(valor: number, criterio: string): string {
  const n = Math.round(valor);
  if (criterio === "missoes") return `${n} ${n === 1 ? "missão" : "missões"}`;
  if (criterio === "tempo") return formatRankScore(valor, "tempo"); // "12min", "1h 05min": como no pódio
  return `${n} ${n === 1 ? "pt" : "pts"}`;
}

function comPonto(nome: string): string {
  return /[.!?]$/.test(nome) ? nome : `${nome}.`;
}

function dia(iso: string | null): string | null {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function janelaDoEvento(evento: EventoDaTurma): string {
  const [ini, fim] = [dia(evento.inicio), dia(evento.fim)];
  return ini && fim ? `de ${ini} a ${fim}` : fim ? `até ${fim}` : "durante o evento";
}

export type FraseDoRank = { titulo: string; detalhe: string };

/**
 * A frase do bloco de foco, pela ênfase do perfil. Só usa o que a view já entrega (posição, pontos,
 * nomes, quantos entraram e `percentual_do_lider`): nenhum número inventado. `outros` são os demais
 * ranks do evento, para o Seeker comparar critérios.
 */
export function fraseDoRank(
  perfil: string | null | undefined,
  evento: EventoDaTurma,
  rank: RankDoEvento,
  inscrito: boolean,
  outros: readonly RankDoEvento[] = [],
): FraseDoRank {
  const { foco } = enfaseDoRank(perfil);
  const L = rank.linhas;
  const c = rank.criterio;
  const eu = L.find((l) => l.eu) ?? null;
  const colegas = L.filter((l) => !l.eu).length;
  const deColegas = (n: number) => `${n} ${n === 1 ? "colega" : "colegas"}`;

  if (!inscrito || !eu) {
    if (inscrito) return { titulo: "Você está no rank.", detalhe: "Sua posição aparece assim que a lista atualizar." };
    const lider = L[0];
    if (!lider) return { titulo: "Ninguém entrou ainda.", detalhe: "Quem entrar primeiro abre a disputa." };
    if (foco === "rival") return { titulo: `${lider.nome} lidera com ${quantidade(lider.pontos, c)}.`, detalhe: `${deColegas(L.length)} na disputa agora.` };
    if (foco === "meta") {
      const terceiro = L.filter((l) => l.posicao <= 3).at(-1);
      return L.length < 3 || !terceiro
        ? { titulo: "O pódio ainda tem lugar.", detalhe: "Entre e veja onde você fica." }
        : { titulo: `Pódio a partir de ${quantidade(terceiro.pontos, c)}.`, detalhe: "Entre e veja quanto falta para chegar lá." };
    }
    if (foco === "regra") return { titulo: `Conta ${DESCRICAO_DO_CRITERIO[c] ?? "pontos"} ${janelaDoEvento(evento)}.`, detalhe: "Só quem entrou aparece, e nada disso vai para a nota." };
    if (foco === "gente") {
      const nomes = L.slice(0, 2).map((l) => l.nome);
      const resto = L.length - nomes.length;
      const quem = resto > 0 ? `${nomes.join(", ")} e mais ${deColegas(resto)}` : nomes.join(" e ");
      return { titulo: quem, detalhe: L.length === 1 ? "já entrou no rank." : "já entraram no rank." };
    }
    if (foco === "seguro") return { titulo: "É opcional e reversível.", detalhe: "Entrar ou sair não muda sua nota nem seu XP." };
    const total = outros.length + 1;
    return total > 1
      ? { titulo: `${total} jeitos de disputar neste evento.`, detalhe: "Descubra em qual você se sai melhor." }
      : { titulo: "Um rank novo para explorar.", detalhe: "Entre e veja onde você fica." };
  }

  if (eu.posicao === 1) {
    const segundo = L.find((l) => !l.eu && l.posicao > 1);
    return {
      titulo: "Você lidera.",
      detalhe: segundo ? `${segundo.nome} vem ${quantidade(eu.pontos - segundo.pontos, c)} atrás.` : colegas ? "Empatado no topo." : "Ninguém mais entrou ainda.",
    };
  }
  if (foco === "rival") {
    const acima = [...L].reverse().find((l) => l.posicao < eu.posicao);
    if (acima) return { titulo: `Faltam ${quantidade(acima.pontos - eu.pontos + 1, c)} para passar ${comPonto(acima.nome)}`, detalhe: `${acima.nome} está em ${acima.posicao}º, com ${quantidade(acima.pontos, c)}.` };
  }
  if (foco === "meta") {
    if (eu.posicao <= 3) return { titulo: "Você está no pódio.", detalhe: dia(evento.fim) ? `Segure o ${eu.posicao}º até ${dia(evento.fim)}.` : `Segure o ${eu.posicao}º até o fim.` };
    const terceiro = L.filter((l) => l.posicao <= 3).at(-1);
    if (terceiro) return { titulo: `${quantidade(terceiro.pontos - eu.pontos + 1, c)} para o pódio.`, detalhe: `O ${terceiro.posicao}º lugar tem ${quantidade(terceiro.pontos, c)}.` };
  }
  if (foco === "regra")
    return {
      titulo: `${quantidade(eu.pontos, c)} ${janelaDoEvento(evento)}.`,
      detalhe: eu.percentualDoLider != null ? `${Math.round(eu.percentualDoLider)}% do que o líder tem.` : "Com poucos no rank, o percentual do líder não aparece.",
    };
  if (foco === "gente")
    return colegas
      ? { titulo: `Você e mais ${deColegas(colegas)}.`, detalhe: "Quem entrou aparece aqui, só para a turma." }
      : { titulo: "Só você por enquanto.", detalhe: "Quem entrar aparece aqui, só para a turma." };
  if (foco === "explorar") {
    const melhor = outros
      .map((r) => ({ r, pos: r.linhas.find((l) => l.eu)?.posicao }))
      .filter((x): x is { r: RankDoEvento; pos: number } => x.pos != null)
      .sort((a, b) => a.pos - b.pos)[0];
    if (melhor) return { titulo: "Veja os outros critérios.", detalhe: `Em ${melhor.r.nome.toLowerCase()} você está em ${melhor.pos}º.` };
  }
  return { titulo: "Você está no rank.", detalhe: "Sair é a qualquer hora e não muda nota nem XP." };
}

/** O que dizer de um erro das RPCs de inscrição. O texto do banco já é para gente (22023). */
export function mensagemDaInscricao(erro: unknown): string {
  const e = (erro ?? {}) as { code?: unknown; message?: unknown };
  if (e.code === "42501") return "Você não está nesta turma, ou a sessão expirou. Entre de novo e tente outra vez.";
  if (e.code === "22023" && typeof e.message === "string" && e.message.trim()) return e.message.trim();
  return "Não foi possível falar com o servidor. Confira a conexão e tente de novo.";
}
