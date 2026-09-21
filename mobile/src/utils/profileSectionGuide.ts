import type { SectionGuideStep } from "@/components/SectionGuideButton";
import type { ProfileMetricsViewModel } from "@/components/perfil/profileMetricsViewModel";
import { normalizeBrainHexProfile } from "@/constants/brainHexProfiles";
import type { MetricsThemeResolved } from "@/utils/profileMetricThemes";

type ProfileGuideOptions = {
  hasProfileSwitcher: boolean;
  theme: MetricsThemeResolved;
  vm: ProfileMetricsViewModel;
};

export function getProfileGuideEmphasis(
  profileName: string | null | undefined,
  section: "ranking" | "notifications" | "achievements",
) {
  const profile = normalizeBrainHexProfile(profileName) ?? "seeker";
  const emphasis = {
    seeker: "O guia destaca descoberta, novidades e próximos caminhos.",
    survivor: "O guia destaca continuidade, retomada e progresso seguro.",
    daredevil: "O guia destaca ritmo, resposta rápida e resultados da sessão.",
    mastermind: "O guia destaca critérios, comparação e origem dos números.",
    conqueror: "O guia destaca posição, domínio e evolução competitiva.",
    socializer: "O guia destaca participação, contexto coletivo e comunicação.",
    achiever: "O guia destaca metas, marcos concluídos e o que falta alcançar.",
  }[profile];

  if (section === "ranking") return `${emphasis} No ranking, a personalização não altera os valores calculados.`;
  if (section === "notifications") return `${emphasis} Os avisos continuam sendo os mesmos dados da sua conta.`;
  return `${emphasis} A biblioteca inclui todos os seus perfis representativos, não apenas o perfil ativo.`;
}

function metricStep(
  id: string,
  title: string,
  description: string,
  icon: SectionGuideStep["icon"],
): SectionGuideStep {
  return { id, target: `profile_metric_${id}`, title, description, icon };
}

function heroMetricSteps(theme: MetricsThemeResolved): SectionGuideStep[] {
  if (theme === "arena") {
    return [
      metricStep("arena-precision", "Precisão", "É a porcentagem de respostas corretas nas atividades da classe. Quando não há atividades detalhadas, usa o resumo acadêmico disponível.", "crosshairs-gps"),
      metricStep("arena-position", "Posição", "É a melhor colocação registrada para você nos rankings da classe. Sem rank significa apenas que ainda não há posição válida salva.", "podium"),
      metricStep("arena-active-time", "Tempo ativo", "É o tempo da sessão atual em que houve atividade, sem os períodos classificados como ociosos. Na ausência de telemetria, o cartão mostra um resumo de presença.", "clock-outline"),
      metricStep("arena-campaign", "Campanha", "É a porcentagem de avanço acadêmico da classe, calculada a partir da conclusão real dos tópicos e limitada entre 0 e 100%.", "flag-outline"),
    ];
  }

  if (theme === "goals") {
    return [
      metricStep("goals-main", "Meta principal", "É a porcentagem de avanço acadêmico da trilha, calculada pela conclusão real dos tópicos.", "target"),
      metricStep("goals-achievements", "Conquistas", "Conta os emblemas já desbloqueados, tanto os comuns da plataforma quanto os ligados aos seus perfis representativos.", "check-decagram-outline"),
      metricStep("goals-invested-time", "Tempo investido", "Combina o tempo persistido da classe com a sessão atual. A média por atividade usa apenas atividades com tempo acadêmico registrado.", "clock-outline"),
      metricStep("goals-accuracy", "Taxa de acerto", "É a proporção de respostas corretas entre as atividades respondidas na classe atual.", "chart-donut"),
    ];
  }

  if (theme === "mystery") {
    return [
      metricStep("mystery-revealed", "Mapa revelado", "É tópicos descobertos ÷ total de tópicos. Um tópico é descoberto quando está concluído ou em andamento.", "compass-outline"),
      metricStep("mystery-content", "Arquivos lidos", "Conta conteúdos concluídos no material acadêmico e personalizado, removendo duplicações quando os dois registros representam o mesmo conteúdo.", "book-open-page-variant-outline"),
      metricStep("mystery-challenges", "Desafios resolvidos", "Conta atividades finalizadas, incluindo quizzes do percurso personalizado que não existem na tabela acadêmica de atividades.", "help-circle-outline"),
      metricStep("mystery-relics", "Relíquias", "É o número de conquistas já desbloqueadas. O nome muda para combinar com o mapa, mas a fonte é a mesma biblioteca de conquistas.", "star-circle-outline"),
    ];
  }

  if (theme === "squad") {
    return [
      metricStep("squad-presence-hero", "Presença", "Conta quantas datas distintas possuem eventos de estudo registrados. O resumo classifica o ritmo como alto, consistente, em retomada ou sem movimento recente.", "account-group-outline"),
      metricStep("squad-ranking", "Ranking", "Mostra a melhor posição registrada para você. Sem posição significa que ainda não existe uma colocação válida salva.", "podium"),
      metricStep("squad-achievements", "Conquistas", "Conta os emblemas já obtidos, comuns da plataforma ou relacionados aos seus perfis representativos.", "trophy-outline"),
      metricStep("squad-movement", "Movimento", "Conta todos os eventos de estudo registrados nos últimos sete dias. Várias ações no mesmo dia contam separadamente.", "pulse"),
    ];
  }

  return [
    metricStep("analytics-progress", "Progresso", "É a porcentagem concluída da estrutura acadêmica da classe. Considera o avanço real nos tópicos e fica sempre entre 0 e 100%.", "chart-donut"),
    metricStep("analytics-accuracy", "Acertos", "É a proporção de respostas corretas nas atividades da classe. Quando não há atividades detalhadas, usa o resumo acadêmico disponível.", "target"),
    metricStep("analytics-time", "Tempo de estudo", "Combina o tempo persistido da classe com o tempo decorrido da sessão atual. A média por atividade vem dos registros acadêmicos.", "clock-outline"),
    metricStep("analytics-achievements", "Conquistas", "Conta emblemas desbloqueados. O texto auxiliar mostra sua melhor posição registrada ou informa que ainda não há ranking.", "trophy-outline"),
  ];
}

/**
 * Id do cartão de sessão em cada tema. O passo sobre telemetria aponta para
 * ele: é o único bloco da tela que só existe quando há lote recente, e portanto
 * o lugar certo para explicar de onde aqueles números vêm.
 */
function idDoCartaoDeSessao(theme: MetricsThemeResolved): string {
  if (theme === "arena") return "arena-live";
  if (theme === "goals") return "goals-time";
  if (theme === "mystery") return "mystery-traces";
  if (theme === "squad") return "squad-session";
  return "analytics-session";
}

function telemetriaSteps(
  theme: MetricsThemeResolved,
  vm: ProfileMetricsViewModel,
): SectionGuideStep[] {
  // Sem lote recente os cartões de sessão nem existem; apontar para eles
  // deixaria o guia descrevendo um elemento ausente. Aí a explicação vai para
  // as abas, que estão sempre na tela.
  const alvo = vm.hasSessionMetrics
    ? `profile_metric_${idDoCartaoDeSessao(theme)}`
    : "profile_tabs";

  return [
    {
      id: "telemetria-origem",
      target: alvo,
      title: "De onde vêm os números da sessão",
      description:
        "Enquanto você estuda, o app envia em lotes o tempo ativo, o tempo ocioso, os toques e a rolagem registrados em cada tópico, conteúdo e atividade. É essa telemetria que alimenta os cartões de sessão e a leitura adaptativa da IA. Sem lote recente, os cartões de sessão não aparecem e as demais métricas continuam vindo dos registros já salvos.",
      icon: "access-point",
    },
    {
      id: "telemetria-ativo-ocioso",
      target: alvo,
      title: "Ativo, ocioso e engajamento",
      description:
        "Tempo ativo conta os trechos com interação; ocioso conta o material aberto sem interação. Engajamento é ativo ÷ (ativo + ocioso), em porcentagem. Interações contam toques registrados. Por isso o tempo ativo costuma ser menor que o tempo em que a tela ficou aberta.",
      icon: "timer-outline",
    },
    {
      id: "telemetria-camera",
      target: "profile_settings",
      title: "Câmera e o que você escolhe coletar",
      description:
        "A captura pela câmera é opcional: depende da permissão do sistema e da sua escolha em Coleta e acessos. O indicador informa apenas o estado da permissão e da coleta que você aceitou. Recusar a câmera não interrompe o restante da telemetria nem afeta suas notas.",
      icon: "camera-outline",
    },
  ];
}

function themeMetricSteps(
  theme: MetricsThemeResolved,
  vm: ProfileMetricsViewModel,
): SectionGuideStep[] {
  if (theme === "arena") {
    return [
      metricStep("arena-status", "Status da operação", "Concluídos são tópicos finalizados; em andamento são tópicos iniciados; conquistas são marcos já obtidos. As barras dividem cada quantidade pelo total correspondente da classe.", "sword-cross"),
      metricStep("arena-radar", "Inteligência de combate", "O radar compara cinco escalas de 0 a 100: precisão das respostas, progresso da trilha, tópicos descobertos, atividades concluídas e presença. Presença equivale aos dias ativos divididos por 7, limitada a 100%.", "radar"),
      metricStep("arena-week", "Pulso da semana", "Cada coluna conta os eventos de estudo registrados em um dos últimos sete dias. Ela mostra frequência de atividade, não horas estudadas.", "chart-bar"),
      ...(vm.hasSessionMetrics
        ? [metricStep("arena-live", "Operação em tempo real", "Eficiência é tempo ativo ÷ (tempo ativo + tempo ocioso). Ações contam toques registrados e Tópicos conta quantos tópicos tiveram visita na sessão atual.", "timer-outline")]
        : []),
    ];
  }

  if (theme === "goals") {
    return [
      metricStep("goals-checklist", "Checklist da jornada", "A meta da trilha termina em 100%; conteúdo e atividades exigem concluir todos os itens; presença é atingida com pelo menos cinco dias ativos.", "clipboard-check-outline"),
      metricStep("goals-rings", "Anéis de metas", "Exploração é tópicos descobertos ÷ total; Conteúdo é conteúdos concluídos ÷ total; Atividades é atividades finalizadas ÷ total. Cada anel usa uma escala de 0 a 100%.", "chart-donut"),
      ...(vm.hasSessionMetrics
        ? [metricStep("goals-time", "Tempo por tipo", "As barras mostram a média de segundos ativos por tópico, conteúdo e atividade no lote atual de telemetria. O material focado é o tipo com maior tempo ativo na sessão.", "clock-check-outline")]
        : []),
      metricStep("goals-next", "Próximo marco", "A recomendação procura primeiro o próximo tópico a concluir; depois, atividades restantes. Quando tudo termina, passa a sugerir manutenção do ritmo.", "flag-outline"),
      metricStep("goals-affinity", "Perfil de aprendizagem", "Cada afinidade é uma pontuação de 0 a 100 produzida pelo questionário BrainHex. Ela representa compatibilidade com um estilo, não porcentagens que precisem somar 100.", "brain"),
    ];
  }

  if (theme === "mystery") {
    return [
      metricStep("mystery-map", "Mapa da trilha", "Tópicos descobertos são os concluídos mais os que estão em andamento. Conteúdos revelados e desafios superados contam itens concluídos, incluindo o percurso personalizado sem duplicar o material acadêmico.", "map"),
      metricStep("mystery-discovery", "Mapa de descoberta", "O setor revelado é tópicos descobertos ÷ total de tópicos. O gráfico radial apenas transforma essa mesma taxa em território visual.", "compass-outline"),
      ...(vm.hasSessionMetrics
        ? [metricStep("mystery-traces", "Rastros da exploração", "Tópicos visitados contam visitas da sessão; Profundidade converte a distância de rolagem em uma escala visual; Ativo é o tempo em que houve interação, descontando ociosidade.", "foot-print")]
        : []),
      metricStep("mystery-next", "Próxima pista", "A pista usa o próximo tópico ou atividade ainda não concluído. Pendentes é o total de tópicos menos concluídos e em andamento.", "telescope"),
    ];
  }

  if (theme === "squad") {
    return [
      metricStep("squad-energy", "Energia do grupo", "Progresso mede avanço na classe, Acertos mede respostas corretas e Tempo reúne o estudo persistido com a sessão atual. O último pulso mostra a data do evento mais recente.", "star-circle-outline"),
      metricStep("squad-presence", "Presença na semana", "Cada dia mostra quantos eventos de estudo foram registrados nos últimos sete dias. Dias ativos contam datas distintas com atividade.", "calendar-week"),
      ...(vm.hasSessionMetrics
        ? [metricStep("squad-session", "Energia da sessão", "Tempo ativo exclui períodos ociosos; Interações contam toques; Engajamento é tempo ativo ÷ (ativo + ocioso), em porcentagem.", "lightning-bolt-circle")]
        : []),
      metricStep("squad-position", "Seu lugar no momento", "Ranking usa a melhor posição registrada para você. Conquistas contam os emblemas já obtidos, comuns da plataforma ou ligados aos seus perfis representativos.", "podium"),
    ];
  }

  return [
    metricStep("analytics-journey", "Jornada da classe", "Concluídos são tópicos finalizados; em andamento são tópicos iniciados; pendentes são o restante. Conteúdos e atividades mostram concluídos ÷ total e incluem o percurso personalizado sem duplicação.", "chart-box-outline"),
    metricStep("analytics-affinity", "Radar de afinidades", "Cada eixo é a afinidade de 0 a 100 obtida no questionário BrainHex. Os eixos são independentes: ter 85 em um perfil e 60 em outro é válido e eles não precisam somar 100.", "spider-web"),
    metricStep("analytics-recent", "Engajamento recente", "Dias ativos conta datas distintas com eventos. Últimos 7 dias conta todos os eventos registrados nesse período; o último registro mostra a data e hora mais recente.", "pulse"),
    ...(vm.hasSessionMetrics
      ? [metricStep("analytics-session", "Análise da sessão", "A barra separa tempo ativo e ocioso. Os tempos de tópico, conteúdo e atividade são médias ativas da sessão; Interações conta toques e Engajamento é ativo ÷ (ativo + ocioso).", "chart-timeline-variant")]
      : []),
  ];
}

export function buildProfileGuideSteps({
  hasProfileSwitcher,
  theme,
  vm,
}: ProfileGuideOptions): SectionGuideStep[] {
  return [
    {
      id: "profile-summary",
      target: "profile_summary",
      title: "Seu perfil ativo",
      description: "Este é o perfil que personaliza agora as cores, o guia, o estilo das métricas e os recursos da plataforma. A afinidade vem do questionário BrainHex.",
      icon: "account-circle-outline",
    },
    ...(hasProfileSwitcher
      ? [{
          id: "profile-switcher",
          target: "profile_switcher",
          title: "Troca de perfil",
          description: "Você pode alternar entre todos os perfis que realmente representam você. A troca muda a apresentação e os recursos, mas não apaga progresso, conquistas ou histórico.",
          icon: "account-switch-outline" as const,
        }]
      : []),
    {
      id: "profile-tabs",
      target: "profile_tabs",
      title: "Métricas e conquistas",
      description: "Métricas explica seu estudo com dados da classe, progresso personalizado, eventos e telemetria. Conquistas reúne marcos comuns da plataforma e marcos dos seus perfis representativos.",
      icon: "chart-box-outline",
    },
    ...heroMetricSteps(theme),
    ...(vm.temTempoAcumulado || vm.hasSessionMetrics
      ? [metricStep("study-time-detail", "Tempo por material", "Nos cartões por tipo, o acumulado vem dos registros salvos de tópicos, conteúdos e atividades. Os valores da sessão são médias de tempo ativo no lote atual da telemetria.", "timer-outline")]
      : []),
    ...(vm.danoTotal !== null
      ? [metricStep("boss", "Dano ao Boss", "É a soma de dano confirmada pelo estado da batalha do módulo. A métrica só aparece quando o perfil e o conteúdo oferecem um confronto ativo.", "sword-cross")]
      : []),
    ...(vm.melhorTempoMin !== null
      ? [metricStep("best-time", "Melhor tempo", "É o menor tempo gasto entre as atividades concluídas que possuem duração registrada. Atividades sem tempo válido não entram na comparação.", "timer-sand")]
      : []),
    ...(vm.hasAnyData === false
      ? []
      : [
          ...themeMetricSteps(theme, vm),
          ...telemetriaSteps(theme, vm),
          ...(theme !== "goals"
            ? [metricStep("adaptive-reading", "Leitura adaptativa", "Mostra a última interpretação da IA: estado percebido, sinais, recomendações e ajustes aplicados. O indicador da câmera informa apenas o estado da permissão e da coleta escolhida por você.", "radar")]
            : []),
        ]),
    {
      id: "achievements-tab",
      target: "profile_achievements",
      title: "Aba Conquistas",
      description: "Aqui aparecem os marcos já obtidos. Conquistas comuns refletem o uso da plataforma; conquistas de perfil aparecem quando pertencem a um dos seus perfis representativos.",
      icon: "trophy-outline",
    },
    {
      id: "profile-library",
      target: "profile_library",
      title: "Biblioteca de conquistas",
      description: "O troféu abre a biblioteca completa, separando conquistas concluídas, em progresso e bloqueadas, com o requisito e a porcentagem de cada uma.",
      icon: "trophy-variant-outline",
    },
    {
      id: "settings-main",
      target: "profile_settings",
      title: "Configurações do perfil",
      description: "A engrenagem abre informações da conta, estilo das métricas, coleta e acessos, relatório dos dados, privacidade, segurança e informações do aplicativo.",
      icon: "cog-outline",
    },
    {
      id: "settings-metrics",
      target: "profile_settings",
      title: "Estilo das métricas",
      description: "Em Automático, o estilo acompanha o perfil ativo. Você também pode fixar Arena Tática, Metas, Mistério, Painel Analítico ou Squad sem alterar suas pontuações.",
      icon: "palette-outline",
    },
    {
      id: "settings-data",
      target: "profile_settings",
      title: "Dados, coleta e segurança",
      description: "Coleta e acessos controla permissões como câmera; o relatório permite consultar seus dados; privacidade e termos explicam o uso; exclusão de conta e redefinição de senha ficam nas áreas de conta e segurança.",
      icon: "shield-account-outline",
    },
  ];
}
