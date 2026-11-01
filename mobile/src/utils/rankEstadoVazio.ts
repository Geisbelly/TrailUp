import type { ProfileShellPalette } from "./profileShellPalette";

/**
 * Por que a tela de Rank não tem classificação para mostrar. Cada motivo vira o mesmo
 * cartão (`RankEstadoVazio`), com título, explicação e — quando existe — a saída.
 *
 * "Vazio" e "erro" são coisas diferentes de propósito: antes, uma falha ao ler
 * `vw_rank_posicoes_por_classe` virava "Nenhum ranking disponível nesta turma", e o
 * aluno não tinha como saber que bastava tentar de novo.
 */
export type MotivoSemRank =
  | "carregando"
  | "erro"
  | "sem_turma"
  | "sem_ranks"
  | "sem_pontuacao"
  | "sem_posicao"
  | "recorte_vazio"
  | "nao_encontrado";

/** O que o botão do cartão faz. `null`: o cartão só explica. */
export type AcaoSemRank = "trilha" | "tentar" | "geral" | null;

export interface TextoSemRank {
  titulo: string;
  texto: string;
  /** Nome do ícone em `MaterialCommunityIcons`. */
  icone: string;
  acao: AcaoSemRank;
  /** Rótulo do botão; vazio quando `acao` é `null`. */
  rotuloAcao: string;
}

/**
 * Motivo da tela de categorias (aba Rank) ficar sem lista. `null` quando há ranking.
 * Com ranks já carregados, uma recarga em andamento não esconde o que está na tela.
 */
export function motivoSemRankDaTurma({
  quantidadeDeRanks,
  carregando,
  erro,
  temTurma,
}: {
  quantidadeDeRanks: number;
  carregando: boolean;
  erro: boolean;
  temTurma: boolean;
}): MotivoSemRank | null {
  if (quantidadeDeRanks > 0) return null;
  if (carregando) return "carregando";
  if (erro) return "erro";
  if (!temTurma) return "sem_turma";
  return "sem_ranks";
}

/**
 * Ninguém pontuou na categoria. A view junta `classe_aluno`, então numa turma que ainda
 * não começou cada aluno vem com pontuação zero — todos empatados em 1º, e o pódio
 * mostrava três colegas "líderes" com 0. Isso não é classificação; é o estado vazio.
 *
 * Só zero (ou nulo) conta como "não pontuou". O Elo começa em um rating positivo, então
 * uma turma de Elo nunca cai aqui só por ninguém ter jogado.
 */
export function ninguemPontuou(linhas: readonly { pontuacao: number | null }[]): boolean {
  return linhas.every((linha) => linha.pontuacao == null || !(linha.pontuacao > 0));
}

/** Onde, na Trilha, a categoria ganha valor. Só para o cartão de "ninguém pontuou". */
function dicaDoCriterio(criterio: string | null | undefined): string {
  if (criterio === "tempo") return "O tempo de estudo nos materiais da Trilha entra nesta categoria.";
  if (criterio === "percentual") return "O avanço nos tópicos da Trilha entra nesta categoria.";
  if (criterio === "acertos") return "Os acertos nas atividades da Trilha entram nesta categoria.";
  if (criterio === "missoes") return "Cada missão concluída entra nesta categoria.";
  return "Conclua atividades e missões da Trilha para somar pontos.";
}

export function textoSemRank(motivo: MotivoSemRank, criterio?: string | null): TextoSemRank {
  switch (motivo) {
    case "carregando":
      return {
        titulo: "Abrindo a sala de honra",
        texto: "Buscando a classificação da sua turma…",
        icone: "trophy-outline",
        acao: null,
        rotuloAcao: "",
      };
    case "erro":
      return {
        titulo: "Não foi possível carregar o ranking",
        texto: "Verifique sua conexão e tente de novo. Seus pontos continuam guardados.",
        icone: "wifi-off",
        acao: "tentar",
        rotuloAcao: "Tentar de novo",
      };
    case "sem_turma":
      return {
        titulo: "Escolha uma turma para ver o ranking",
        texto: "O ranking é por turma. Entre em uma turma pela Trilha e a classificação aparece aqui.",
        icone: "account-group-outline",
        acao: "trilha",
        rotuloAcao: "Ir para a Trilha",
      };
    case "sem_ranks":
      return {
        titulo: "Sua turma ainda não tem ranking",
        texto:
          "Quando o professor abrir as categorias de ranking, elas aparecem aqui. Enquanto isso, siga na Trilha concluindo atividades e missões.",
        icone: "trophy-outline",
        acao: "trilha",
        rotuloAcao: "Ir para a Trilha",
      };
    case "sem_pontuacao":
      return {
        titulo: "O pódio está em aberto",
        texto: `Ninguém pontuou nesta categoria ainda. ${dicaDoCriterio(criterio)} Quem começar primeiro sai na frente.`,
        icone: "podium-gold",
        acao: "trilha",
        rotuloAcao: "Ir para a Trilha",
      };
    case "sem_posicao":
      return {
        titulo: "Você ainda não está nesta classificação",
        texto: "Conclua atividades e missões da Trilha para aparecer aqui.",
        icone: "account-star-outline",
        acao: "trilha",
        rotuloAcao: "Ir para a Trilha",
      };
    case "recorte_vazio":
      return {
        titulo: "Ninguém neste recorte",
        texto: "Nenhum colega da turma cai neste filtro. A classificação completa está em Geral.",
        icone: "filter-variant-remove",
        acao: "geral",
        rotuloAcao: "Ver Geral",
      };
    case "nao_encontrado":
      return {
        titulo: "Ranking não encontrado",
        texto: "Esta categoria pode ter sido encerrada ou removida pelo professor.",
        icone: "trophy-broken",
        acao: "tentar",
        rotuloAcao: "Tentar de novo",
      };
  }
}

/** Cores do cartão. Centralizadas aqui para o teste de contraste conferir os 7 perfis. */
export function coresDoRankVazio(p: ProfileShellPalette) {
  return {
    cartao: p.surface,
    borda: p.border,
    titulo: p.text,
    texto: p.textMuted,
    // O accent sobre o próprio `accentMuted` dava 4,46:1 no Conqueror; o fundo da tela é mais escuro.
    seloFundo: p.background,
    seloBorda: p.accentSoft,
    icone: p.accent,
    botaoFundo: p.accent,
    botaoTexto: p.background,
    botaoSecundarioBorda: p.borderStrong,
    botaoSecundarioTexto: p.text,
    pressionado: p.surfaceElevated,
  };
}
