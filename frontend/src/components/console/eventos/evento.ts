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
  { chave: "arena", rotulo: "Arena", ajuda: "Rank de batalhas, só enquanto o evento está aberto." },
] as const;

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
  modalidadeGuilda: boolean;
  guildaTamanhoMax: string;
  pontos: string;
  moedas: string;
  medalhaParticipacao: boolean;
  medalhaDestaque: boolean;
  recompensa: string;
};

export const FORMULARIO_DE_EVENTO_VAZIO: FormularioDeEvento = {
  titulo: "",
  descricao: "",
  inicio: "",
  fim: "",
  topicoId: "",
  pecas: [],
  missoesIds: [],
  modalidadeGuilda: false,
  guildaTamanhoMax: "",
  pontos: "0",
  moedas: "0",
  medalhaParticipacao: true,
  medalhaDestaque: false,
  recompensa: "",
};

export type PayloadDoEvento = {
  topico_id: number | null;
  titulo: string;
  descricao: string;
  inicio: string;
  fim: string;
  pecas: ChaveDePeca[];
  modalidade_guilda: boolean;
  guilda_tamanho_max: number | null;
  pontos: number;
  moedas: number;
  medalha_participacao: boolean;
  medalha_destaque: boolean;
  recompensa: string | null;
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
      modalidade_guilda: form.modalidadeGuilda,
      guilda_tamanho_max: guildaTamanhoMax,
      pontos,
      moedas,
      // Regra do banco (CHECK): destaque nunca sem participação.
      medalha_participacao: form.medalhaParticipacao || form.medalhaDestaque,
      medalha_destaque: form.medalhaDestaque,
      recompensa: recompensa || null,
    },
  };
}

const dois = (n: number) => String(n).padStart(2, "0");

/** ISO do banco → valor de `<input type="datetime-local">` no fuso do navegador. */
export function dataParaCampo(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}T${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

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
export function situacaoDoEvento(e: { status: StatusDoEvento; inicio: string; fim: string }, agora: Date = new Date()): string {
  if (e.status === "encerrado") return "Encerrado";
  const inicio = new Date(e.inicio).getTime();
  const fim = new Date(e.fim).getTime();
  if (e.status === "rascunho") return fim <= agora.getTime() ? "Janela já passou — ajuste as datas para abrir" : "Ainda não aberto aos alunos";
  if (agora.getTime() < inicio) return "Aberto, começa em breve";
  if (agora.getTime() > fim) return "Janela terminou — encerre para fechar o evento";
  return "Em andamento";
}

export function rotuloDasPecas(pecas: string[]): string {
  const nomes = PECAS_DO_EVENTO.filter((p) => pecas.includes(p.chave)).map((p) => p.rotulo);
  return nomes.length > 0 ? nomes.join(" · ") : "Nenhuma peça";
}

/** O que a abertura vai fazer — texto do diálogo de confirmação ("guildas congeladas", janela, peças). */
export function resumoDeAbertura(e: { titulo: string; modalidadeGuilda: boolean; pecas: string[]; inicio: string; fim: string }): string[] {
  const linhas = [`Janela: ${rotuloDaJanela(e.inicio, e.fim)}.`, `Peças: ${rotuloDasPecas(e.pecas)}.`];
  if (e.modalidadeGuilda) linhas.push("As guildas são congeladas agora: quem entrar ou sair depois não muda a apuração deste evento.");
  linhas.push("Depois de aberto, só título e descrição podem mudar.");
  return linhas;
}
