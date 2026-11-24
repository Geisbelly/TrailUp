import type { MaterialCommunityIcons } from "@expo/vector-icons";

/**
 * Chips do "Modo tutorial" do painel do Guia.
 *
 * Os ícones de Progresso e Limites eram `chart-timeline-variant` e `shield-check-outline`, e na
 * web do aluno apareceram como caracteres trocados no lugar do glifo (24/11). Os dois estão entre
 * os ícones mais novos da fonte (F0E93 e F0CC8), e os vizinhos da mesma fileira, que segundo o
 * relato apareciam certos, são todos do conjunto antigo. A causa exata não foi reproduzida: a fonte
 * publicada tem os dois glifos. Os substitutos também são do conjunto antigo
 * (`chart-timeline` F066E, `block-helper` F00AD) e nenhum deles tem outro sentido no app
 * ("Um ícone, um significado"): o teste ao lado confere as duas coisas.
 */
export type TutorialTip = {
  id: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  message: string;
};

export function buildTutorialTips(
  scope: "modulo" | "trilha_home",
  options: {
    hasBattle: boolean;
    hasReadingTimer: boolean;
    hasActivityTimer: boolean;
  }
): TutorialTip[] {
  if (scope === "trilha_home") {
    return [
      {
        id: "trilha-overview",
        icon: "compass-outline",
        label: "Trilha",
        message:
          "Na tela inicial da trilha você encontra os módulos liberados, a ordem sugerida de estudo e o acesso ao chat comigo. Eu não abro sozinho aqui: você decide quando conversar.",
      },
      {
        id: "trilha-personalizacao",
        icon: "auto-fix",
        label: "Personalização",
        message:
          "A personalização usa seu perfil, histórico e métricas para reorganizar o estudo. Eu posso explicar por que um módulo recebeu certo formato, ritmo ou apoio.",
      },
      {
        id: "trilha-metricas",
        icon: "chart-line",
        label: "Métricas",
        message:
          "Eu também consigo resumir métricas simples da sua jornada, como progresso recente, tempo de estudo e sinais de leitura adaptativa observados na trilha.",
      },
    ];
  }

  const tips: TutorialTip[] = [
    {
      id: "modulo-overview",
      icon: "message-text-outline",
      label: "Conversa",
      message:
        "Neste módulo eu apareço como guia em formato de conversa. Você pode me responder para pedir explicações sobre a personalização, o fluxo do módulo e a melhor estratégia de estudo.",
    },
    {
      id: "modulo-progresso",
      icon: "chart-timeline",
      label: "Progresso",
      message:
        "A barra horizontal mostra quanto do módulo já foi concluído. O contador ao lado indica quantas etapas já foram finalizadas dentro da sequência atual.",
    },
  ];

  if (options.hasReadingTimer || options.hasActivityTimer) {
    tips.push({
      id: "modulo-tempo",
      icon: "timer-outline",
      label: "Tempo",
      message: options.hasActivityTimer
        ? "O tempo regressivo vale para atividades quando a mecânica pede pressão. Já o tempo de leitura acompanha quanto você permaneceu no módulo ou no conteúdo ativo."
        : "Quando o módulo exibe o contador de tempo, ele acompanha sua permanência no conteúdo ativo e para assim que você sai da etapa atual.",
    });
  }

  if (options.hasBattle) {
    tips.push({
      id: "modulo-boss",
      icon: "sword-cross",
      label: "Boss",
      message:
        "O boss representa o desafio do módulo. Conforme você avança no conteúdo e acerta atividades, causa dano nele. Se o inimigo já tiver sido derrotado, o resumo do confronto continua disponível.",
    });
  }

  tips.push({
    id: "modulo-guardrail",
    icon: "block-helper",
    label: "Limites",
    message:
      "Eu posso orientar, resumir métricas e explicar a personalização, mas não entrego respostas de atividades. Quando você pedir ajuda, eu respondo dentro desses limites.",
  });

  return tips;
}
