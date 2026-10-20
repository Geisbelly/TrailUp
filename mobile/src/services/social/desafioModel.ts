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
