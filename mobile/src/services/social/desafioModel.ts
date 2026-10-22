import { normalizeMeuElo, type MeuElo } from "./arenaModel";

/**
 * O desafio como a tela de jogo o lê — normalizado de `arena_desafio`.
 *
 * Duas coisas que o normalizador tem de respeitar, porque o banco as garante de propósito:
 *
 * - **`resposta_correta` só vem depois de eu responder.** `arena_desafio` devolve `null`
 *   enquanto não existe resposta minha (`CASE WHEN r.questao_id IS NULL THEN NULL`). Então
 *   gabarito ausente **não** é dado faltando: é a questão ainda não respondida. Nunca tratar
 *   `null` como "sem gabarito" nem pedir de outro lugar.
 * - **`tentativas` e `tempo_seg` vêm do preset da dificuldade**, não de constante no cliente:
 *   `desafio_tentativas_dificil` é 1 e `desafio_tentativas_normal` é 2 hoje, e as chaves são
 *   privadas — só o banco sabe. Chutar aqui seria mostrar ao aluno um limite que o
 *   `guilda_desafio_responder` não cobra.
 */

export type QuestaoDoDesafio = {
  ordem: number;
  questaoId: number;
  enunciado: string;
  tipo: string | null;
  alternativas: string[];
  midiaUrl: string | null;
  minhaResposta: string | null;
  correta: boolean | null;
  /** `null` enquanto não respondida — ver o aviso do topo. */
  respostaCorreta: string | null;
};

export type ParamsDoDesafio = { tempoSeg: number; tentativas: number; apostaFator: number };

export type DesafioEmJogo = {
  id: string;
  formato: string;
  modo: string;
  status: "aberto" | "encerrado";
  dificuldade: string;
  consequencia: string;
  params: ParamsDoDesafio;
  meuEstado: string | null;
  minhaEquipe: number | null;
  /**
   * Tem adversário (equipe 2): é da arena, responde-se por `arena_responder`, com uma tentativa
   * por questão. Sem adversário é da guilda e vai por `guilda_desafio_responder`. Quem diz é o
   * banco (`arena_desafio`, 20261021_19); o banco também recusa o caminho errado.
   */
  competitivo: boolean;
  /** A minha variação de Elo nesta partida (20261021_19); só existe depois do fechamento. */
  meuElo: MeuElo | null;
  questoes: QuestaoDoDesafio[];
};

function alternativasDe(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((item) =>
      item && typeof item === "object"
        ? String((item as Record<string, unknown>).texto ?? (item as Record<string, unknown>).label ?? "")
        : String(item ?? ""),
    )
    .map((texto) => texto.trim())
    .filter(Boolean);
}

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo ? limpo : null;
}

function normalizeQuestao(valor: unknown, indice: number): QuestaoDoDesafio | null {
  if (!valor || typeof valor !== "object") return null;
  const row = valor as Record<string, unknown>;
  const questaoId = Number(row.questao_id);
  if (!Number.isFinite(questaoId) || questaoId <= 0) return null;
  return {
    ordem: Number(row.ordem) || indice + 1,
    questaoId,
    enunciado: String(row.enunciado ?? "").trim(),
    tipo: textoOuNulo(row.tipo),
    alternativas: alternativasDe(row.alternativas),
    midiaUrl: textoOuNulo(row.midia_url),
    minhaResposta: textoOuNulo(row.minha_resposta),
    correta: typeof row.correta === "boolean" ? row.correta : null,
    respostaCorreta: textoOuNulo(row.resposta_correta),
  };
}

/**
 * Os padrões aqui são os mesmos de `fn_desafio_params_efetivos` e existem só para o caso de
 * a RPC ser de uma versão anterior à `20261021_13`, que ainda não devolvia `params`. Se eles
 * estiverem sendo usados de verdade, a migração não foi aplicada.
 */
function normalizeParams(valor: unknown, dificuldade: string): ParamsDoDesafio {
  const row = (valor && typeof valor === "object" ? valor : {}) as Record<string, unknown>;
  const dificil = dificuldade === "dificil";
  const num = (v: unknown, padrao: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : padrao;
  };
  return {
    tempoSeg: num(row.tempo_seg, dificil ? 30 : 60),
    tentativas: num(row.tentativas, dificil ? 1 : 2),
    apostaFator: num(row.aposta_fator, dificil ? 2 : 1),
  };
}

export function normalizeDesafio(valor: unknown): DesafioEmJogo | null {
  if (!valor || typeof valor !== "object") return null;
  const row = valor as Record<string, unknown>;
  const id = textoOuNulo(row.id);
  if (!id) return null;
  const dificuldade = textoOuNulo(row.dificuldade) ?? "normal";
  const questoes = Array.isArray(row.questoes)
    ? (row.questoes.map(normalizeQuestao).filter(Boolean) as QuestaoDoDesafio[])
    : [];
  return {
    id,
    formato: textoOuNulo(row.formato) ?? "guilda",
    modo: textoOuNulo(row.modo) ?? "todos",
    status: row.status === "encerrado" ? "encerrado" : "aberto",
    dificuldade,
    consequencia: textoOuNulo(row.consequencia) ?? "ranqueada",
    params: normalizeParams(row.params, dificuldade),
    meuEstado: textoOuNulo(row.meu_estado),
    minhaEquipe: Number.isFinite(Number(row.minha_equipe)) ? Number(row.minha_equipe) : null,
    competitivo: row.competitivo === true,
    meuElo: normalizeMeuElo(row.meu_elo),
    questoes: [...questoes].sort((a, b) => a.ordem - b.ordem),
  };
}

/** A primeira questão ainda sem resposta minha — por onde a tela abre. */
export function proximaQuestao(desafio: DesafioEmJogo): QuestaoDoDesafio | null {
  return desafio.questoes.find((q) => q.minhaResposta === null) ?? null;
}

/**
 * Quantas tentativas sobraram NESTA questão.
 *
 * O cliente não conta tentativa: `guilda_desafio_responder` devolve `tentativas_restantes` a
 * cada resposta, e é esse número que a tela mostra. Esta função serve só ao estado inicial,
 * antes da primeira resposta — e por isso só distingue "ainda não respondi" de "já respondi".
 * Contar aqui duplicaria a regra que o banco cobra, e as duas contas divergiriam no dia em que
 * `desafio_tentativas_*` mudasse.
 */
export function tentativasIniciais(desafio: DesafioEmJogo, questaoId: number): number {
  const questao = desafio.questoes.find((q) => q.questaoId === questaoId);
  if (!questao) return 0;
  return questao.minhaResposta === null ? tentativasPorQuestao(desafio) : 0;
}

/**
 * Na arena a primeira resposta vale (`arena_responder` grava uma vez e ignora as seguintes): uma
 * partida que mexe no Elo não dá segunda chance. Na guilda vale o preset da dificuldade.
 */
export function tentativasPorQuestao(desafio: DesafioEmJogo): number {
  return desafio.competitivo ? 1 : desafio.params.tentativas;
}

/** O resultado que a tela mostra ao fim: quantas acertei das que respondi. */
export function placarDoAluno(desafio: DesafioEmJogo): { respondidas: number; acertos: number; total: number } {
  const respondidas = desafio.questoes.filter((q) => q.minhaResposta !== null);
  return {
    respondidas: respondidas.length,
    acertos: respondidas.filter((q) => q.correta === true).length,
    total: desafio.questoes.length,
  };
}

/** O que o banco devolve ao responder, por qualquer um dos caminhos. */
export type RespostaDoDesafio = {
  correta?: boolean;
  /** Só na arena: `false` quando já havia resposta sua nesta questão. */
  registrada?: boolean;
  /** Só no cooperativo. */
  tentativas?: number;
  tentativas_restantes?: number;
  faltam?: number;
  encerrou?: { resultado?: string } | null;
  /** `desafio_responder` (20261021_27) diz qual regra valeu. Ausente no par antigo. */
  competitivo?: boolean;
};

/**
 * A função que o cliente pediu não existe neste banco.
 *
 * `desafio_responder` é de `20261021_27`: enquanto a migration não estiver aplicada, o
 * PostgREST responde **PGRST202**. O serviço usa isto para cair no par antigo
 * (`arena_responder`/`guilda_desafio_responder`), e é o que faz a ordem entre aplicar a
 * migration e publicar o app deixar de importar — mesmo cuidado de `carregarJanelaDaFormacao`.
 *
 * Reconhece pelo código E pelo texto: o código é o sinal estável, mas em erro de rede embrulhado
 * ele às vezes não vem, e aí só sobra a mensagem.
 */
export function ehFuncaoAusenteNoBanco(erro: unknown): boolean {
  const e = (erro ?? {}) as { code?: unknown; message?: unknown };
  if (String(e.code ?? "") === "PGRST202") return true;
  const texto = String(e.message ?? erro ?? "").toLowerCase();
  return texto.includes("could not find the function") || texto.includes("pgrst202");
}

/**
 * Qual regra valeu de fato na resposta que o banco acabou de registrar.
 *
 * **Quem decide é o retorno, não o que a tela supunha.** O `competitivo` que a tela carregou
 * pode estar velho: se o adversário aceitar entre a abertura do desafio e o envio da resposta, o
 * desafio passa a ter equipe 2 e as regras mudam. Antes de `desafio_responder` isso fazia o
 * cliente chamar a função errada e o aluno ver um 22023; agora o banco classifica na hora.
 *
 * `suposicao` é o fallback para o par antigo, que não devolve a chave.
 */
export function respostaFoiCompetitiva(resposta: RespostaDoDesafio, suposicao: boolean): boolean {
  return typeof resposta.competitivo === "boolean" ? resposta.competitivo : suposicao;
}

