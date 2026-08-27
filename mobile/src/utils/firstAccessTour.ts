import {
  BrainHexProfile,
  normalizeBrainHexProfile,
} from "@/constants/brainHexProfiles";
import { resolveProfileMetricsTheme } from "@/utils/profileMetricThemes";

export const FIRST_ACCESS_TOUR_VERSION = 1;

export type FirstAccessTourRoute =
  | "/(tabs)"
  | "/(tabs)/notificacoes"
  | "/(tabs)/ranking"
  | "/(tabs)/perfil"
  | "/(tabs)/perfil/biblioteca-conquistas"
  | "/(tabs)/perfil/settings";

export type FirstAccessTourStep = {
  id: string;
  route: FirstAccessTourRoute;
  page: string;
  title: string;
  description: string;
  highlight?: "navigation" | "content" | "help";
};

const PROFILE_COPY: Record<
  BrainHexProfile,
  { label: string; welcome: string; strategy: string }
> = {
  seeker: {
    label: "Explorador",
    welcome: "Vou mostrar onde encontrar cada pista e como descobrir novos caminhos.",
    strategy: "Seu painel prioriza descoberta, tópicos visitados e próximos caminhos.",
  },
  survivor: {
    label: "Sobrevivente",
    welcome: "Vou mostrar como retomar com segurança e acompanhar cada avanço.",
    strategy: "Seu painel prioriza constância, retomada, tempo e progresso seguro.",
  },
  daredevil: {
    label: "Aventureiro",
    welcome: "Vou mostrar os atalhos, desafios e indicadores de ritmo da jornada.",
    strategy: "Seu painel prioriza velocidade, precisão e resultados da sessão.",
  },
  mastermind: {
    label: "Estrategista",
    welcome: "Vou explicar a lógica do sistema, a origem dos dados e como comparar resultados.",
    strategy: "Seu painel prioriza comparação, critérios e leitura analítica das métricas.",
  },
  conqueror: {
    label: "Conquistador",
    welcome: "Vou mostrar como avançar, medir domínio e acompanhar sua posição.",
    strategy: "Seu painel prioriza campanha, posição, precisão e domínio da trilha.",
  },
  socializer: {
    label: "Socializador",
    welcome: "Vamos conhecer juntos os espaços de comunicação, presença e progresso coletivo.",
    strategy: "Seu painel prioriza presença, participação, ranking e energia do grupo.",
  },
  achiever: {
    label: "Realizador",
    welcome: "Vou organizar o sistema em metas claras, marcos e próximos objetivos.",
    strategy: "Seu painel prioriza metas, checklists, conquistas e o que falta concluir.",
  },
};

const THEME_LABELS = {
  arena: "Arena Tática",
  goals: "Metas",
  mystery: "Mistério",
  analytics: "Painel Analítico",
  squad: "Squad",
} as const;

export function buildFirstAccessTourStorageKey(userId: string) {
  return `@trailup/tutorial-inicial-v${FIRST_ACCESS_TOUR_VERSION}/${userId}`;
}

export function buildFirstAccessTourSteps(
  profileName?: string | null,
): FirstAccessTourStep[] {
  const profile = normalizeBrainHexProfile(profileName) ?? "seeker";
  const copy = PROFILE_COPY[profile];
  const metricsTheme = resolveProfileMetricsTheme(profile);

  return [
    {
      id: "welcome",
      route: "/(tabs)",
      page: "Bem-vindo ao TrailUp",
      title: `Sua jornada como ${copy.label}`,
      description: `Eu serei seu guia durante o uso do aplicativo. ${copy.welcome}`,
      highlight: "content",
    },
    {
      id: "navigation",
      route: "/(tabs)",
      page: "Navegação principal",
      title: "Quatro áreas sempre ao alcance",
      description:
        "A barra inferior leva à Trilha, Notificações, Ranking e Perfil. O ícone colorido indica a página atual; tocar em outro ícone troca de área sem perder seu progresso.",
      highlight: "navigation",
    },
    {
      id: "local-guides",
      route: "/(tabs)",
      page: "Guias da interface",
      title: "Ajuda disponível em cada página",
      description:
        "O botão com ponto de interrogação abre o guia local da página. Esses guias explicam apenas os controles e métricas realmente visíveis para o seu perfil.",
      highlight: "help",
    },
    {
      id: "trail-overview",
      route: "/(tabs)",
      page: "Trilha",
      title: "Seu caminho de aprendizagem",
      description:
        "No topo ficam classe, progresso geral e porcentagem concluída. No mapa, cada nó representa um tópico: concluído, disponível ou bloqueado pelas dependências anteriores.",
      highlight: "content",
    },
    {
      id: "trail-topics",
      route: "/(tabs)",
      page: "Trilha",
      title: "Tópicos, módulos e progresso",
      description:
        "Abra um tópico disponível para estudar conteúdos, apresentações, áudios e atividades. O módulo salva o bloco, slide e posição do áudio onde você parou; o guia interno explica progresso, tempo e recursos do perfil.",
      highlight: "content",
    },
    {
      id: "notifications",
      route: "/(tabs)/notificacoes",
      page: "Notificações",
      title: "Avisos e atualizações",
      description:
        "Use Todas, Não lidas e Lidas para filtrar. Toque em um aviso para abrir a página completa; arraste para marcar como lido ou excluir e puxe a lista para atualizar.",
      highlight: "content",
    },
    {
      id: "notification-details",
      route: "/(tabs)/notificacoes",
      page: "Notificações",
      title: "Detalhes ficam dentro do aviso",
      description:
        "Ao abrir uma notificação, o guia daquela página explica título, estado de leitura, horário, mensagem e ações disponíveis. Assim o índice permanece simples.",
      highlight: "help",
    },
    {
      id: "ranking",
      route: "/(tabs)/ranking",
      page: "Ranking",
      title: "Categorias de classificação",
      description:
        "A Sala de Honra separa classificações por pontuação, tempo de estudo, percentual concluído e outras categorias cadastradas. Toque em um cartão para ver a tabela correspondente.",
      highlight: "content",
    },
    {
      id: "ranking-details",
      route: "/(tabs)/ranking",
      page: "Ranking",
      title: "Cada ranking mede algo diferente",
      description:
        "Dentro da categoria, o guia explica o critério exibido, filtros por perfil, posição, medalha e valor. Sua linha fica destacada, e a personalização visual nunca altera a pontuação.",
      highlight: "help",
    },
    {
      id: "profile",
      route: "/(tabs)/perfil",
      page: "Perfil",
      title: "Identidade e perfis representativos",
      description:
        "Aqui você vê o perfil ativo e pode alternar entre os perfis BrainHex que mais representam você. A troca muda cores, guia, recursos e apresentação, mas preserva todo o histórico.",
      highlight: "content",
    },
    {
      id: "profile-metrics",
      route: "/(tabs)/perfil",
      page: "Perfil · Métricas",
      title: `Seu estilo atual: ${THEME_LABELS[metricsTheme]}`,
      description: `${copy.strategy} O guia desta página detalha o que cada número significa, como é calculado e de onde vêm os dados. Métricas ausentes não são anunciadas.`,
      highlight: "content",
    },
    {
      id: "achievements",
      route: "/(tabs)/perfil/biblioteca-conquistas",
      page: "Biblioteca de Conquistas",
      title: "Marcos pessoais e da plataforma",
      description:
        "A biblioteca separa conquistas dos seus perfis representativos e conquistas comuns do TrailUp. Total, concluídas e progresso resumem a coleção; cada item mostra estado, requisito e avanço.",
      highlight: "content",
    },
    {
      id: "settings",
      route: "/(tabs)/perfil/settings",
      page: "Configurações",
      title: "Controle da sua experiência",
      description:
        "Nas configurações ficam informações da conta, estilo das métricas, coleta e acessos, relatório dos dados, privacidade, segurança, exclusão da conta e informações do aplicativo.",
      highlight: "content",
    },
    {
      id: "finish",
      route: "/(tabs)",
      page: "Tutorial concluído",
      title: "Tudo pronto para começar",
      description:
        "Você pode seguir pela Trilha e usar o botão de ajuda sempre que entrar em uma área nova. Os guias locais continuarão adaptados ao perfil ativo e ao conteúdo exibido.",
      highlight: "content",
    },
  ];
}

