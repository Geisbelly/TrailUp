// Conquista da turma cadastrada pelo professor (#158).
//
// A regra central da issue, e ela e' de correcao: **a metrica e uma lista
// fechada, nunca texto livre.** O que avalia conquista e um ramo de `IF` dentro
// de `trg_eventos_aluno_after_iud`; metrica que o motor nao conhece vira
// conquista morta -- cadastrada com sucesso, nunca destravada, sem nada
// avisando. Foi assim que 21 das 27 conquistas ficaram paradas (#157).
//
// Metrica nova e' migracao, feita por quem desenvolve: ela precisa de um ramo
// no gatilho E de uma entrada em `fn_conquista_metrica_suportada`, que o banco
// usa num CHECK. Digitar aqui nao cria nenhum dos dois.

/** Exatamente o que `fn_conquista_metrica_suportada` aceita hoje. */
export type MetricaDeConquista =
  | "atividades_concluidas"
  | "topicos_concluidos"
  | "topicos_visitados"
  | "dias_seguidos"
  | "minutos_totais"
  | "acertos_percentual"
  | "trilha_percentual"
  | "atividade_rapida"
  | "eventos_totais";

export interface DefinicaoDeMetrica {
  metrica: MetricaDeConquista;
  rotulo: string;
  /** O que o professor digita ao lado do seletor. */
  rotuloDoLimiar: string;
  /** Nome do campo dentro de `criterio`, como o gatilho o le. */
  chaveDoLimiar: string;
  /** Ajuda curta, na linguagem do professor. */
  ajuda: string;
  minimo: number;
  maximo: number;
  sugestao: number;
}

/**
 * A ordem importa: as mais compreensiveis primeiro. O professor que abre o
 * seletor pela primeira vez precisa reconhecer o que a primeira linha faz.
 */
export const METRICAS: readonly DefinicaoDeMetrica[] = [
  {
    metrica: "atividades_concluidas",
    rotulo: "Atividades concluídas",
    rotuloDoLimiar: "Quantas",
    chaveDoLimiar: "minimo",
    ajuda: "Conta atividades que o aluno concluiu, em qualquer turma.",
    minimo: 1,
    maximo: 500,
    sugestao: 10,
  },
  {
    metrica: "topicos_concluidos",
    rotulo: "Tópicos concluídos",
    rotuloDoLimiar: "Quantos",
    chaveDoLimiar: "minimo",
    ajuda: "Tópicos com a trilha inteira fechada.",
    minimo: 1,
    maximo: 200,
    sugestao: 3,
  },
  {
    metrica: "topicos_visitados",
    rotulo: "Tópicos visitados",
    rotuloDoLimiar: "Quantos",
    chaveDoLimiar: "visitados",
    ajuda: "Tópicos distintos que o aluno abriu — não precisa concluir.",
    minimo: 1,
    maximo: 200,
    sugestao: 5,
  },
  {
    metrica: "dias_seguidos",
    rotulo: "Dias seguidos de estudo",
    rotuloDoLimiar: "Quantos dias",
    chaveDoLimiar: "dias_seguidos",
    ajuda: "Maior sequência de dias com atividade registrada.",
    minimo: 2,
    maximo: 90,
    sugestao: 3,
  },
  {
    metrica: "minutos_totais",
    rotulo: "Minutos acumulados",
    rotuloDoLimiar: "Minutos",
    chaveDoLimiar: "minutos",
    ajuda: "Tempo somado de conteúdo e atividade, medido pela telemetria.",
    minimo: 5,
    maximo: 100000,
    sugestao: 120,
  },
  {
    metrica: "acertos_percentual",
    rotulo: "Acertos em uma atividade (%)",
    rotuloDoLimiar: "Percentual",
    chaveDoLimiar: "percentual",
    ajuda: "Olha a MELHOR atividade do aluno, não a média.",
    minimo: 1,
    maximo: 100,
    sugestao: 100,
  },
  {
    metrica: "trilha_percentual",
    rotulo: "Progresso em um tópico (%)",
    rotuloDoLimiar: "Percentual",
    chaveDoLimiar: "percentual",
    ajuda: "Olha o tópico mais avançado do aluno.",
    minimo: 1,
    maximo: 100,
    sugestao: 100,
  },
  {
    metrica: "atividade_rapida",
    rotulo: "Concluir uma atividade em até",
    rotuloDoLimiar: "Minutos",
    chaveDoLimiar: "max_tempo",
    ajuda: "Vale a atividade mais rápida que o aluno já concluiu.",
    minimo: 1,
    maximo: 240,
    sugestao: 2,
  },
  {
    metrica: "eventos_totais",
    rotulo: "Ações registradas no app",
    rotuloDoLimiar: "Quantas",
    chaveDoLimiar: "minimo",
    ajuda: "Qualquer ação de estudo. Útil para a primeira medalha da turma.",
    minimo: 1,
    maximo: 10000,
    sugestao: 1,
  },
] as const;

export function acharMetrica(
  metrica: string | null | undefined,
): DefinicaoDeMetrica | null {
  return METRICAS.find((m) => m.metrica === metrica) ?? null;
}

export type EscopoDaConquista = "comum" | "perfil";

export const PERFIS_BRAINHEX = [
  "seeker",
  "achiever",
  "survivor",
  "daredevil",
  "mastermind",
  "conqueror",
  "socializer",
] as const;

export type PerfilBrainHex = (typeof PERFIS_BRAINHEX)[number];

export interface EntradaDeConquista {
  classeId: number | null;
  nome: string;
  descricao: string;
  metrica: string;
  limiar: number | null;
  pontos: number | null;
  escopo: EscopoDaConquista;
  perfilAlvo: string | null;
  /** `app_config.conquista_recompensa_maxima`. Sem ele, o banco decide. */
  tetoDePontos?: number | null;
  /** `tipo` das conquistas já cadastradas NA MESMA turma. */
  tiposEmUso?: readonly string[];
}

export interface LinhaParaGravar {
  classe_id: number;
  nome: string;
  descricao: string | null;
  categoria: string;
  tipo: string;
  criterio: Record<string, unknown>;
  pontos_recompensa: number;
  escopo: EscopoDaConquista;
  perfil_alvo: string | null;
}

export interface ResultadoDoCadastro {
  erro: string | null;
  linha: LinhaParaGravar | null;
}

function recusar(erro: string): ResultadoDoCadastro {
  return { erro, linha: null };
}

/**
 * Acentos do português, mapeados um a um.
 *
 * `normalize("NFD")` + range de combining marks funciona, mas grava caracteres
 * invisíveis no fonte — ninguém revisa o que não vê, e um `replace` acidental
 * apaga a regra sem deixar rastro. A tabela é maior e legível.
 */
const SEM_ACENTO: Record<string, string> = {
  á: "a", à: "a", ã: "a", â: "a", ä: "a",
  é: "e", è: "e", ê: "e", ë: "e",
  í: "i", ì: "i", î: "i", ï: "i",
  ó: "o", ò: "o", õ: "o", ô: "o", ö: "o",
  ú: "u", ù: "u", û: "u", ü: "u",
  ç: "c", ñ: "n",
};

/**
 * `tipo` e a chave tecnica, e ela e UNICA POR TURMA (`20260911_06`) -- antes
 * era unica globalmente, o que colidia com as conquistas globais.
 *
 * Derivar do nome em vez de pedir ao professor: ele nao tem por que saber que
 * existe uma chave, e um campo a mais no formulario e um campo a mais para
 * errar. O sufixo numerico resolve o nome repetido dentro da turma.
 */
export function derivarTipo(
  nome: string,
  tiposEmUso: readonly string[] = [],
): string {
  const base =
    nome
      .trim()
      .toLowerCase()
      .replace(/./g, (c) => SEM_ACENTO[c] ?? c)
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "conquista";

  if (!tiposEmUso.includes(base)) return base;

  for (let n = 2; n < 1000; n += 1) {
    const tentativa = `${base}_${n}`;
    if (!tiposEmUso.includes(tentativa)) return tentativa;
  }

  return `${base}_${Date.now()}`;
}

/**
 * A categoria sai da métrica, não do professor.
 *
 * `conquistas.categoria` alimenta o agrupamento na biblioteca do aluno, e é um
 * conjunto fechado (`desempenho | habito | perfil_brainhex | progresso`). Pedir
 * ao professor seria mais um campo para errar, e categoria errada some do
 * agrupamento sem erro nenhum.
 */
export function categoriaDaMetrica(
  metrica: string,
  escopo: EscopoDaConquista,
): string {
  if (escopo === "perfil") return "perfil_brainhex";
  if (metrica === "dias_seguidos" || metrica === "minutos_totais") return "habito";
  if (
    metrica === "acertos_percentual" ||
    metrica === "atividade_rapida" ||
    metrica === "trilha_percentual"
  ) {
    return "desempenho";
  }
  return "progresso";
}

export function montarConquista(
  entrada: EntradaDeConquista,
): ResultadoDoCadastro {
  if (!entrada.classeId) {
    return recusar("Escolha uma turma.");
  }

  const nome = entrada.nome.trim();
  if (nome.length < 3) {
    return recusar("Dê um nome à conquista — é o que o aluno vê na medalha.");
  }

  const definicao = acharMetrica(entrada.metrica);
  if (!definicao) {
    // Não é validação de formulário: métrica fora da lista vira conquista
    // morta, cadastrada com sucesso e nunca destravada.
    return recusar("Escolha uma métrica da lista.");
  }

  if (entrada.limiar === null || !Number.isFinite(entrada.limiar)) {
    return recusar(`Informe ${definicao.rotuloDoLimiar.toLowerCase()}.`);
  }

  if (entrada.limiar < definicao.minimo || entrada.limiar > definicao.maximo) {
    return recusar(
      `${definicao.rotuloDoLimiar} precisa ficar entre ${definicao.minimo} e ${definicao.maximo}.`,
    );
  }

  if (entrada.pontos === null || !Number.isFinite(entrada.pontos) || entrada.pontos < 0) {
    return recusar("Informe quantos pontos a conquista vale.");
  }

  // O valor entra no razão como evento creditado, direto, sem passar por
  // `fn_pontos_do_evento`. O banco recusa acima do teto; recusar aqui evita a
  // ida perdida.
  if (entrada.tetoDePontos != null && entrada.pontos > entrada.tetoDePontos) {
    return recusar(`O máximo por conquista é ${entrada.tetoDePontos} pontos.`);
  }

  if (entrada.escopo === "perfil") {
    const perfil = (entrada.perfilAlvo ?? "").trim().toLowerCase();
    if (!PERFIS_BRAINHEX.includes(perfil as PerfilBrainHex)) {
      return recusar("Escolha o perfil BrainHex desta conquista.");
    }
  }

  const perfilAlvo =
    entrada.escopo === "perfil"
      ? (entrada.perfilAlvo ?? "").trim().toLowerCase()
      : null;

  return {
    erro: null,
    linha: {
      classe_id: entrada.classeId,
      nome,
      descricao: entrada.descricao.trim() || null,
      categoria: categoriaDaMetrica(definicao.metrica, entrada.escopo),
      tipo: derivarTipo(nome, entrada.tiposEmUso ?? []),
      criterio: {
        metrica: definicao.metrica,
        [definicao.chaveDoLimiar]: entrada.limiar,
      },
      pontos_recompensa: Math.round(entrada.pontos),
      escopo: entrada.escopo,
      perfil_alvo: perfilAlvo,
    },
  };
}

/** Frase que descreve a conquista montada, para conferência antes de salvar. */
export function descreverConquista(linha: LinhaParaGravar): string {
  const definicao = acharMetrica(String(linha.criterio.metrica ?? ""));
  if (!definicao) return "Critério não reconhecido.";

  const limiar = linha.criterio[definicao.chaveDoLimiar];
  const alvo =
    linha.escopo === "perfil" && linha.perfil_alvo
      ? ` Só para o perfil ${linha.perfil_alvo}.`
      : "";

  return `${definicao.rotulo}: ${limiar}. Vale ${linha.pontos_recompensa} pontos.${alvo}`;
}
