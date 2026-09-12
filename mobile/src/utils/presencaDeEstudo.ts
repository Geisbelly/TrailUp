/**
 * Quando o aluno está de fato estudando -- e o que fazer quando não está.
 *
 * O cronômetro do módulo (`IAHeaderTimer`) media dois defeitos que vinham
 * juntos. Ele parava de contar quando o app ia para segundo plano, mas
 * continuava contando quando o aluno apenas **saía da tela de estudo** com o
 * app aberto: trocar para a aba Ranking ou Perfil não desmonta a tela da
 * trilha (o React Navigation mantém as telas visitadas montadas, e não há
 * `unmountOnBlur` aqui), então o `setInterval` seguia até zerar.
 *
 * As duas consequências:
 *
 * 1. **O diálogo aparecia fora do estudo.** `showDialog` vem do
 *    `DialogProvider`, que é global: o "Tempo esgotado" abria em cima do
 *    perfil, do ranking ou das notificações.
 * 2. **A personalização recebia uma informação falsa.** O `timer_timeout`
 *    entra em `emitSignal` como "o aluno estourou o tempo neste material",
 *    e a tela da trilha já havia encerrado a sessão de estudo por
 *    `endStudySession("screen_blur")`. O sinal descrevia um tempo em que o
 *    aluno não estava nem olhando o material.
 *
 * A regra fica aqui, e não espalhada nos dois pontos de uso, porque foi
 * exatamente a repetição que deixou o foco de fora: a tela da trilha calcula
 * `useIsFocused()` e usa para a telemetria, mas não para o cronômetro.
 */

/**
 * Ociosidade a partir da qual vale perguntar se o aluno continua no aparelho.
 *
 * Bem mais longa que o limiar de ociosidade da telemetria (15s, que serve para
 * separar tempo ativo de tempo parado): aqui o custo de errar é interromper
 * alguém que está lendo, então só conta parada longa.
 */
export const OCIOSIDADE_PARA_PERGUNTAR_MS = 4 * 60_000;

/** Espaço mínimo entre duas perguntas, para a checagem não virar insistência. */
export const INTERVALO_ENTRE_PERGUNTAS_MS = 15 * 60_000;

export interface EstadoDoCronometro {
  /** O recurso de tempo está ligado para este bloco/perfil. */
  recursoAtivo: boolean;
  /** O app está em primeiro plano (`AppState === "active"`). */
  appEmPrimeiroPlano: boolean;
  /** A tela de estudo está focada -- e não só montada em segundo plano. */
  telaFocada: boolean;
}

/**
 * O cronômetro só corre quando o aluno está diante do material.
 *
 * As três condições são necessárias, e a terceira é a que faltava: uma tela
 * montada mas sem foco não é estudo.
 */
export function cronometroDeveContar(estado: EstadoDoCronometro): boolean {
  return estado.recursoAtivo && estado.appEmPrimeiroPlano && estado.telaFocada;
}

export interface EstadoDePresenca {
  agoraMs: number;
  /** Último toque, rolagem ou retorno ao app. */
  ultimaInteracaoEmMs: number;
  appEmPrimeiroPlano: boolean;
  /** O aluno está dentro de um módulo da trilha. */
  estudando: boolean;
  /** Já existe um diálogo na tela (não vale sobrepor). */
  dialogoAberto: boolean;
  /** Quando a pergunta foi feita pela última vez. */
  perguntadoEmMs: number | null;
}

/**
 * Se cabe perguntar "você ainda está aí?".
 *
 * É a contrapartida do conserto acima: o app aberto e parado é uma situação
 * real, só não é a situação que o cronômetro de estudo descreve. Em vez de
 * anunciar um tempo que não passou estudando, pergunta -- e deixa o aluno
 * escolher entre voltar à trilha ou desligar a tela.
 */
export function devePerguntarSeEstaAi(estado: EstadoDePresenca): boolean {
  // Com o app fechado quem fala é a notificação, não um diálogo que ninguém vê.
  if (!estado.appEmPrimeiroPlano) return false;
  // Dentro do módulo o tempo já tem dono: o cronômetro daquele bloco.
  if (estado.estudando) return false;
  // Substituir um diálogo aberto apagaria a mensagem que o aluno ainda não leu.
  if (estado.dialogoAberto) return false;

  const ocioso = estado.agoraMs - estado.ultimaInteracaoEmMs;
  if (ocioso < OCIOSIDADE_PARA_PERGUNTAR_MS) return false;

  if (estado.perguntadoEmMs != null) {
    const desdeAPergunta = estado.agoraMs - estado.perguntadoEmMs;
    if (desdeAPergunta < INTERVALO_ENTRE_PERGUNTAS_MS) return false;
  }

  return true;
}

/**
 * O aluno está dentro de um módulo da trilha (e não na listagem).
 *
 * Mesma leitura de rota que decide esconder a barra de abas no módulo -- as
 * duas respondem à mesma pergunta, e manter uma cópia de cada lado deixaria as
 * respostas divergirem.
 */
export function estaNaTrilhaDeEstudo(segmentos: readonly string[]): boolean {
  const indice = segmentos.indexOf("trilha");
  if (indice < 0) return false;
  const seguinte = segmentos[indice + 1];
  return Boolean(seguinte && seguinte !== "index" && seguinte !== "_layout");
}
