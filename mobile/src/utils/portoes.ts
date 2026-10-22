// Nem tudo aparece no primeiro acesso.
//
// O aluno que abre o app pela primeira vez e ve o ranking esta, necessariamente,
// em ultimo -- nao por desempenho, mas por ainda nao ter comecado. E o mesmo
// dano que o corte em 15 evita (`vw_rank_posicoes_por_classe`), so que na unica
// hora em que ele e garantido.
//
// O fundamento e o Modelo de Comportamento de Fogg: comportamento exige
// motivacao, CAPACIDADE e um gatilho, e gatilho disparado com capacidade baixa
// frustra em vez de mover. Placar no dia zero e exatamente isso.
//
// **Travar e esconder, nunca deixar de contar.** O aluno com o rank fechado
// continua acumulando pontos normalmente -- os eventos entram em `eventos_aluno`
// como sempre e a posicao existe no banco. Quando o portao abre, ele ja chega
// com a posicao real, nao zerada. Isto aqui e apresentacao; o corte em 15,
// aquele sim, e de dados e mora na view.

/**
 * ## Quem decide agora e' o banco
 *
 * O `abre` de cada portao abaixo era a decisao: o cliente contava `conteudo_aluno` e
 * `topico_aluno` em duas consultas e avaliava aqui. Isso tinha dois defeitos medidos:
 *
 * 1. a conta era GLOBAL — nao ha `classe_id` em nenhuma das duas tabelas —, entao concluir
 *    em uma turma abria a aba em todas;
 * 2. qualquer erro de rede virava zero, por decisao explicita ("erro nao pode abrir portao"),
 *    e o aluno com o conteudo concluido via cadeado e uma instrucao falsa de como destravar.
 *
 * A decisao agora e' a view `vw_portoes_do_aluno`, por (aluno, turma). O que sobra aqui e' o
 * TEXTO da cerimonia — titulo, promessa, passos — e `abre` como registro legivel da regra que a
 * view implementa. Mudar `abre` nao muda mais nada em tela; a regra mora na migration
 * `20261022_02`.
 */
export type Funcionalidade = "social" | "rank";

/** Muda quando os portoes mudam: a cerimonia volta a aparecer. */
export const PORTOES_VERSAO = 2;

export interface ProgressoDoAluno {
  conteudosConcluidos: number;
  topicosConcluidos: number;
}

export interface Portao {
  funcionalidade: Funcionalidade;
  titulo: string;
  /** O que o aluno ganha. E o texto da cerimonia. */
  promessa: string;
  /** O que falta, para quem ainda nao chegou la. */
  comoAbrir: string;
  /** O tutorial curto da cerimonia: o que fazer agora que abriu. */
  passos: readonly string[];
  abre: (progresso: ProgressoDoAluno) => boolean;
}

// A ordem importa: e a ordem em que as cerimonias aparecem quando ha mais de uma
// pendente.
export const PORTOES: readonly Portao[] = [
  {
    funcionalidade: "social",
    titulo: "Amizades liberadas",
    promessa:
      "Agora você pode se conectar com colegas da turma e acompanhar o avanço de quem você escolher.",
    comoAbrir: "Conclua seu primeiro conteúdo para liberar.",
    passos: [
      "Envie um convite para um colega da turma.",
      "A amizade só existe quando os dois aceitam.",
      "Você pode desfazer ou bloquear quando quiser.",
    ],
    abre: (p) => p.conteudosConcluidos >= 1,
  },
  {
    funcionalidade: "rank",
    titulo: "Ranking liberado",
    promessa:
      "Sua posição na turma já estava sendo contada desde o começo. Agora ela aparece — e você chega nela com os pontos que já fez.",
    comoAbrir: "Conclua o primeiro bloco de conteúdo para liberar.",
    passos: [
      "A aba Ranking mostra as primeiras posições da turma.",
      "Sua posição aparece sempre, mesmo fora do topo.",
      "Estudar é o que move o ranking — presença e atividades contam.",
    ],
    abre: (p) => p.topicosConcluidos >= 1,
  },
];

export const PROGRESSO_ZERADO: ProgressoDoAluno = {
  conteudosConcluidos: 0,
  topicosConcluidos: 0,
};

export type Aberturas = Record<Funcionalidade, boolean>;

export function avaliarPortoes(progresso: ProgressoDoAluno): Aberturas {
  const saida = {} as Aberturas;
  for (const portao of PORTOES) {
    saida[portao.funcionalidade] = portao.abre(progresso);
  }
  return saida;
}

export function portaoDe(funcionalidade: Funcionalidade): Portao {
  const achado = PORTOES.find((p) => p.funcionalidade === funcionalidade);
  if (!achado) throw new Error(`portão desconhecido: ${funcionalidade}`);
  return achado;
}

/**
 * Quais cerimônias ainda devem aparecer.
 *
 * A regra é "aberto e ainda não visto", não "acabou de abrir". Comparar estados
 * exigiria um estado anterior confiável, e no primeiro carregamento não há um --
 * o aluno que já tinha tudo aberto antes desta versão nunca veria a cerimônia,
 * que é justamente quem precisa saber que a funcionalidade existe.
 */
export function cerimoniasPendentes(
  aberturas: Aberturas,
  jaVistas: readonly Funcionalidade[],
): Funcionalidade[] {
  const vistas = new Set(jaVistas);
  return PORTOES.filter((p) => aberturas[p.funcionalidade] && !vistas.has(p.funcionalidade)).map(
    (p) => p.funcionalidade,
  );
}

/**
 * Chave por aluno e por funcionalidade. A versão entra para que mudar os
 * portões volte a mostrar a cerimônia, do mesmo jeito que o tour de primeiro
 * acesso faz.
 */
export function chaveDaCerimonia(
  userId: string,
  funcionalidade: Funcionalidade,
  classeId: number,
): string {
  return `trailup:portao:v${PORTOES_VERSAO}:${userId}:${classeId}:${funcionalidade}`;
}
