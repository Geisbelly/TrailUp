// Regras do formulário e do estado de um evento de turma (tabela `eventos_classe`, issue #152).
//
// Padrões PROVISÓRIOS de produto (ver docs/frontend/redesign-fase-2/05-analise-novas-telas.md §5):
// as 5 peças, "pelo menos uma", medalha de destaque sempre junto com a de participação, moedas só
// gravadas (o crédito depende da carteira #142, que ainda não existe).

export const PECAS_DO_EVENTO = [
  { chave: "missoes", rotulo: "Missões", ajuda: "Missões ligadas ao evento." },
  { chave: "metas", rotulo: "Metas coletivas", ajuda: "Objetivo que a turma cumpre junto." },
  { chave: "conquistas", rotulo: "Conquistas do evento", ajuda: "Medalhas exclusivas do período." },
  { chave: "desafios", rotulo: "Desafios", ajuda: "Desafios de turma ou de guilda." },
  // A chave continua `arena` (é o que o banco grava em `pecas`), mas "Arena" agora é o duelo do Social:
  // isto é o rank do evento (#155, D3).
  { chave: "arena", rotulo: "Rank do evento", ajuda: "Ranking só de quem quiser entrar, na janela do evento." },
] as const;

/**
 * Critérios do rank do evento (`eventos_classe.arena_criterios`, migrations 20261104_01 e _07). Só os
 * que respeitam a janela do evento: o banco recusa os outros (CHECK). Sem escolha, vale `ranqueada`.
 */
export const CRITERIOS_DO_RANK = [
  { chave: "ranqueada", rotulo: "Pontos de batalha", ajuda: "Ganhos e perdidos nos desafios ranqueados." },
  { chave: "pontuacao", rotulo: "Pontuação", ajuda: "Todos os pontos do evento, inclusive de duelo." },
  { chave: "missoes", rotulo: "Missões cumpridas", ajuda: "Quantas missões cada um concluiu na janela." },
  { chave: "tempo", rotulo: "Tempo de estudo", ajuda: "Minutos de estudo ativo na janela, sem contar o tempo parado." },
] as const;

export type CriterioDoRank = (typeof CRITERIOS_DO_RANK)[number]["chave"];
export const CRITERIO_PADRAO_DO_RANK: CriterioDoRank = "ranqueada";

export type ChaveDePeca = (typeof PECAS_DO_EVENTO)[number]["chave"];
export type StatusDoEvento = "rascunho" | "aberto" | "encerrado";

export const TITULO_MAX = 120;
export const DESCRICAO_MAX = 1000;
export const RECOMPENSA_MAX = 300;
export const PONTOS_MAX = 10000;
export const MOEDAS_MAX = 10000;
export const MISSOES_MAX = 20;
export const GUILDA_MIN = 2;
export const GUILDA_MAX = 20;

export type FormularioDeEvento = {
  titulo: string;
  descricao: string;
  /** `datetime-local`. */
  inicio: string;
  fim: string;
  /** Id do tópico em texto, ou vazio para o evento valer para a turma toda. */
  topicoId: string;
  pecas: ChaveDePeca[];
  /** Ids das missões ligadas ao evento (peça "Missões"). */
  missoesIds: number[];
  /** Critérios do rank do evento (peça "arena"). Vazio = `ranqueada`. */
  arenaCriterios: CriterioDoRank[];
  modalidadeGuilda: boolean;
  guildaTamanhoMax: string;
  pontos: string;
  moedas: string;
  medalhaParticipacao: boolean;
  medalhaDestaque: boolean;
  recompensa: string;
  /** Agendado: o rascunho abre sozinho no início da janela (#141). O fim vale para todo evento aberto. */
  abrirNoInicio: boolean;
};

export const FORMULARIO_DE_EVENTO_VAZIO: FormularioDeEvento = {
  titulo: "",
  descricao: "",
  inicio: "",
  fim: "",
  topicoId: "",
  pecas: [],
  missoesIds: [],
  arenaCriterios: [],
  modalidadeGuilda: false,
  guildaTamanhoMax: "",
  pontos: "0",
  moedas: "0",
  medalhaParticipacao: true,
  medalhaDestaque: false,
  recompensa: "",
  // Evento novo já sai agendado; o banco mantém `false` para os rascunhos antigos (opt-in).
  abrirNoInicio: true,
};

export type PayloadDoEvento = {
  topico_id: number | null;
  titulo: string;
  descricao: string;
  inicio: string;
  fim: string;
  pecas: ChaveDePeca[];
  /** Vazio sem a peça arena; o banco congela ao abrir. */
  arena_criterios: CriterioDoRank[];
  modalidade_guilda: boolean;
  guilda_tamanho_max: number | null;
  pontos: number;
  moedas: number;
  medalha_participacao: boolean;
  medalha_destaque: boolean;
  recompensa: string | null;
  abrir_no_inicio: boolean;
};

export type ErrosDoEvento = Partial<
  Record<"titulo" | "descricao" | "inicio" | "fim" | "pecas" | "missoes" | "guildaTamanhoMax" | "pontos" | "moedas" | "recompensa", string>
>;

// Duas chaves exclusivas: strictNullChecks está desligado no projeto.
export type ResultadoDoEvento = { ok: boolean; payload: PayloadDoEvento | null; /** Missões ligadas (vazio se a peça não está marcada). */ missoes: number[]; erros: ErrosDoEvento | null };

const inteiro = (texto: string) => {
  const t = texto.trim().replace(",", ".");
  const n = Number(t);
  return t !== "" && Number.isInteger(n) ? n : NaN;
};

export function validarEvento(form: FormularioDeEvento): ResultadoDoEvento {
  const erros: ErrosDoEvento = {};

  const titulo = form.titulo.trim();
  if (titulo.length < 3) erros.titulo = "Dê um título de pelo menos 3 letras.";
  else if (titulo.length > TITULO_MAX) erros.titulo = `No máximo ${TITULO_MAX} caracteres.`;

  const descricao = form.descricao.trim();
  if (descricao.length > DESCRICAO_MAX) erros.descricao = `No máximo ${DESCRICAO_MAX} caracteres.`;

  const inicio = form.inicio ? new Date(form.inicio) : null;
  const fim = form.fim ? new Date(form.fim) : null;
  if (!inicio || Number.isNaN(inicio.getTime())) erros.inicio = "Informe quando o evento começa.";
  if (!fim || Number.isNaN(fim.getTime())) erros.fim = "Informe quando o evento termina.";
  if (!erros.inicio && !erros.fim && fim.getTime() <= inicio.getTime()) erros.fim = "O fim precisa ser depois do começo.";

  const pecas = PECAS_DO_EVENTO.map((p) => p.chave).filter((c) => form.pecas.includes(c));
  if (pecas.length === 0) erros.pecas = "Escolha pelo menos uma peça para o evento.";
  const missoes = pecas.includes("missoes") ? [...new Set(form.missoesIds)] : [];
  if (pecas.includes("missoes") && missoes.length === 0) erros.missoes = "Escolha as missões do evento, ou desmarque a peça Missões.";
  if (missoes.length > MISSOES_MAX) erros.missoes = `No máximo ${MISSOES_MAX} missões por evento.`;

  let guildaTamanhoMax: number | null = null;
  if (form.modalidadeGuilda) {
    guildaTamanhoMax = inteiro(form.guildaTamanhoMax);
    if (Number.isNaN(guildaTamanhoMax) || guildaTamanhoMax < GUILDA_MIN || guildaTamanhoMax > GUILDA_MAX) {
      erros.guildaTamanhoMax = `Tamanho máximo da guilda: de ${GUILDA_MIN} a ${GUILDA_MAX} alunos.`;
    }
  }

  const pontos = inteiro(form.pontos);
  if (Number.isNaN(pontos) || pontos < 0 || pontos > PONTOS_MAX) erros.pontos = `Pontos: inteiro de 0 a ${PONTOS_MAX}.`;
  const moedas = inteiro(form.moedas);
  if (Number.isNaN(moedas) || moedas < 0 || moedas > MOEDAS_MAX) erros.moedas = `Moedas: inteiro de 0 a ${MOEDAS_MAX}.`;

  const recompensa = form.recompensa.trim();
  if (recompensa.length > RECOMPENSA_MAX) erros.recompensa = `No máximo ${RECOMPENSA_MAX} caracteres.`;

  if (Object.keys(erros).length > 0) return { ok: false, payload: null, missoes: [], erros };

  const topico = Number(form.topicoId);
  return {
    ok: true,
    erros: null,
    missoes,
    payload: {
      topico_id: form.topicoId && Number.isInteger(topico) && topico > 0 ? topico : null,
      titulo,
      descricao,
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      pecas,
      arena_criterios: pecas.includes("arena") ? criteriosDoRank(form.arenaCriterios) : [],
      modalidade_guilda: form.modalidadeGuilda,
      guilda_tamanho_max: guildaTamanhoMax,
      pontos,
      moedas,
      // Regra do banco (CHECK): destaque nunca sem participação.
      medalha_participacao: form.medalhaParticipacao || form.medalhaDestaque,
      medalha_destaque: form.medalhaDestaque,
      recompensa: recompensa || null,
      abrir_no_inicio: form.abrirNoInicio,
    },
  };
}

/** Na ordem da lista e sem repetir nem valor desconhecido: o banco compara o array ao travar a edição. */
export function criteriosDoRank(escolhidos: readonly string[]): CriterioDoRank[] {
  return CRITERIOS_DO_RANK.map((c) => c.chave).filter((c) => escolhidos.includes(c));
}

/** "Pontos de batalha · Missões cumpridas"; sem escolha, o padrão que o banco usa ao abrir. */
export function rotuloDosCriterios(escolhidos: readonly string[]): string {
  const validos = criteriosDoRank(escolhidos);
  const lista = validos.length > 0 ? validos : [CRITERIO_PADRAO_DO_RANK];
  return CRITERIOS_DO_RANK.filter((c) => lista.includes(c.chave)).map((c) => c.rotulo).join(" · ");
}

const dois = (n: number) => String(n).padStart(2, "0");

/** ISO do banco → valor de `<input type="datetime-local">` no fuso do navegador. */
export function dataParaCampo(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}T${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

const dataEHora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : `${dois(d.getDate())}/${dois(d.getMonth() + 1)} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
};

const dataCurta = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : `${dois(d.getDate())}/${dois(d.getMonth() + 1)}`;
};

export function rotuloDaJanela(inicio: string, fim: string): string {
  return `${dataCurta(inicio)} a ${dataCurta(fim)}`;
}

export function rotuloDoStatus(status: StatusDoEvento): string {
  return status === "aberto" ? "Aberto" : status === "encerrado" ? "Encerrado" : "Rascunho";
}

/** Texto de apoio do cartão: o que acontece com o evento agora. */
export function situacaoDoEvento(
  e: { status: StatusDoEvento; inicio: string; fim: string; abrirNoInicio?: boolean },
  agora: Date = new Date(),
): string {
  if (e.status === "encerrado") return "Encerrado";
  const inicio = new Date(e.inicio).getTime();
  const fim = new Date(e.fim).getTime();
  if (e.status === "rascunho") {
    if (fim <= agora.getTime()) return "Janela já passou — ajuste as datas para abrir";
    if (e.abrirNoInicio) return agora.getTime() < inicio ? `Abre sozinho em ${dataEHora(e.inicio)}` : "Abrindo sozinho em instantes";
    return "Ainda não aberto aos alunos";
  }
  if (agora.getTime() < inicio) return "Aberto, começa em breve";
  // A varredura (pg_cron, a cada minuto) encerra e apura; o botão segue valendo para quem não quer esperar.
  if (agora.getTime() > fim) return "Janela terminou — encerra sozinho em instantes";
  return "Em andamento";
}

export function rotuloDasPecas(pecas: string[]): string {
  const nomes = PECAS_DO_EVENTO.filter((p) => pecas.includes(p.chave)).map((p) => p.rotulo);
  return nomes.length > 0 ? nomes.join(" · ") : "Nenhuma peça";
}

/** O que a abertura vai fazer — texto do diálogo de confirmação ("guildas congeladas", janela, peças). */
export function resumoDeAbertura(e: {
  titulo: string;
  modalidadeGuilda: boolean;
  pecas: string[];
  inicio: string;
  fim: string;
  arenaCriterios?: readonly string[];
}): string[] {
  const linhas = [`Janela: ${rotuloDaJanela(e.inicio, e.fim)}.`, `Peças: ${rotuloDasPecas(e.pecas)}.`];
  if (e.pecas.includes("arena")) {
    linhas.push(
      `Rank do evento por: ${rotuloDosCriterios(e.arenaCriterios ?? [])}. Só aparece quem entrar, e entrar não muda nota nem XP.`,
    );
  }
  if (e.modalidadeGuilda) linhas.push("As guildas são congeladas agora: quem entrar ou sair depois não muda a apuração deste evento.");
  linhas.push("Depois de aberto, só título e descrição podem mudar.");
  return linhas;
}
