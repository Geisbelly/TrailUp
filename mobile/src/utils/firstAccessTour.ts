import {
  BrainHexProfile,
  normalizeBrainHexProfile,
} from "@/constants/brainHexProfiles";
import { resolveProfileMetricsTheme } from "@/utils/profileMetricThemes";

export const FIRST_ACCESS_TOUR_VERSION = 4;

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
  /**
   * Nome do elemento a destacar, registrado pela tela via `useAlvoTour`.
   * Sem alvo na tela, o tour cai no `highlight` abaixo — que desenha uma
   * regiao aproximada, e nao o item.
   */
  target?: string;
  highlight?: "navigation" | "content" | "help";
};

const PROFILE_COPY: Record<
  BrainHexProfile,
  {
    label: string;
    guideName: string;
    guideRole: string;
    introductionTitle: string;
    introduction: string;
    welcome: string;
    strategy: string;
    voice: {
      navigation: string;
      guides: string;
      trail: string;
      study: string;
      notifications: string;
      ranking: string;
      profile: string;
      achievements: string;
      settings: string;
      finish: string;
    };
  }
> = {
  seeker: {
    label: "Explorador",
    guideName: "Amara",
    guideRole: "sua guia de descobertas",
    introductionTitle: "Amara, a Exploradora da Bússola Viva",
    introduction: "Eu sou Amara. Minha capa verde representa os territórios ainda desconhecidos, e minha bússola dourada encontra caminhos onde outros veem apenas dúvida. Como guardiã Exploradora, desperto curiosidade, revelo pistas e ajudo você a escolher a próxima descoberta.",
    welcome: "Vou mostrar onde encontrar cada pista e como descobrir novos caminhos.",
    strategy: "Seu painel prioriza descoberta, tópicos visitados e próximos caminhos.",
    voice: {
      navigation: "Antes de partirmos, olhe para a base da tela: são quatro portas, e eu conheço todas.",
      guides: "Se uma pista te escapar, é só me chamar: eu apareço em qualquer página.",
      trail: "Aqui está o território que vamos explorar juntos.",
      study: "Cada tópico que você abre revela um pedaço novo do mapa.",
      notifications: "É neste mural que as pistas recém-chegadas aparecem primeiro.",
      ranking: "Espie aqui até onde os outros exploradores já chegaram.",
      profile: "Este é o seu bornal: nele você ajusta como quer explorar.",
      achievements: "Cada descoberta sua fica registrada nesta estante.",
      settings: "Aqui ficam os instrumentos da expedição — ajuste-os quando quiser.",
      finish: "O mapa é seu agora. Vá na frente que eu te alcanço.",
    },
  },
  survivor: {
    label: "Sobrevivente",
    guideName: "Kenji",
    guideRole: "seu guardião de continuidade",
    introductionTitle: "Kenji, o Guardião dos Checkpoints",
    introduction: "Eu sou Kenji. Meu escudo de pedra e as vestes escuras representam resistência, proteção e calma diante dos obstáculos. Como guardião Sobrevivente, protejo o progresso conquistado e mostro como retomar a jornada sem perder o equilíbrio.",
    welcome: "Vou mostrar como retomar com segurança e acompanhar cada avanço.",
    strategy: "Seu painel prioriza constância, retomada, tempo e progresso seguro.",
    voice: {
      navigation: "Firme comigo: estas quatro portas são suas rotas seguras.",
      guides: "Se perder o rumo, me chame: eu recomponho o caminho sem você sair daqui.",
      trail: "Veja a trilha: cada checkpoint que você cravar fica protegido.",
      study: "Entre sem pressa. Se precisar sair, eu guardo exatamente onde você parou.",
      notifications: "Os avisos chegam aqui, no ritmo que você aguenta.",
      ranking: "Olhe a classificação como referência, nunca como cobrança.",
      profile: "Este é o seu abrigo: daqui você ajusta o passo da jornada.",
      achievements: "Cada marco aqui já está a salvo. Ninguém tira de você.",
      settings: "Aqui você decide os limites e o que quer compartilhar.",
      finish: "Seu próximo checkpoint já está preparado. Siga com calma.",
    },
  },
  daredevil: {
    label: "Aventureiro",
    guideName: "Ember",
    guideRole: "sua guia de ritmo e desafios",
    introductionTitle: "Ember, a Chama dos Desafios",
    introduction: "Eu sou Ember. O fogo em minhas mãos e os tons alaranjados representam energia, coragem e resposta rápida. Como guardiã Aventureira, transformo cada etapa em desafio e ajudo você a avançar com ritmo sem abrir mão da precisão.",
    welcome: "Vou mostrar os atalhos, desafios e indicadores de ritmo da jornada.",
    strategy: "Seu painel prioriza velocidade, precisão e resultados da sessão.",
    voice: {
      navigation: "Rápido, olhe embaixo: quatro portas, e todas levam à ação.",
      guides: "Travou? Me chama que eu te tiro do lugar em dois segundos.",
      trail: "É aqui que a sequência de desafios começa. Sinta o ritmo.",
      study: "Entre, tente, erre, volte. Eu guardo seu ponto para a próxima rodada.",
      notifications: "Os alertas caem aqui — é onde o próximo impulso aparece.",
      ranking: "Confira aqui quem está segurando o ritmo. Inclusive você.",
      profile: "Este é o seu painel de bordo. Ajuste e volte para a pista.",
      achievements: "Cada emblema aqui é um desafio que você derrubou.",
      settings: "Deixe tudo do seu jeito antes de acelerar de novo.",
      finish: "Chega de conversa. A próxima rodada é sua.",
    },
  },
  mastermind: {
    label: "Estrategista",
    guideName: "Idris",
    guideRole: "seu conselheiro de estratégia e análise",
    introductionTitle: "Idris, o Arquivista das Constelações",
    introduction: "Eu sou Idris. Meu livro, a coruja e o mapa de constelações representam conhecimento, observação e conexão entre ideias. Como guardião Estrategista, explico critérios, comparo evidências e revelo a lógica por trás de cada métrica.",
    welcome: "Vou explicar a lógica do sistema, a origem dos dados e como comparar resultados.",
    strategy: "Seu painel prioriza comparação, critérios e leitura analítica das métricas.",
    voice: {
      navigation: "Observe a base da tela: quatro áreas, cada uma guardando um tipo de dado.",
      guides: "Quando quiser saber de onde vem um número, me consulte na própria página.",
      trail: "Repare na estrutura: cada nó depende do anterior. Nada aqui é aleatório.",
      study: "Entre num tópico e note: estado, posição e conclusão ficam registrados.",
      notifications: "Aqui os eventos chegam ordenados por leitura e por horário.",
      ranking: "Cada categoria calcula um critério próprio. Compare com cuidado.",
      profile: "Este é o seu observatório. Trocar de perfil muda a lente, não o dado.",
      achievements: "Cada conquista traz requisito, estado e progresso. Leia com atenção.",
      settings: "Aqui ficam as variáveis que você controla conscientemente.",
      finish: "Você já conhece a estrutura. Agora opere-a com intenção.",
    },
  },
  conqueror: {
    label: "Conquistador",
    guideName: "Amina",
    guideRole: "sua comandante de campanha",
    introductionTitle: "Amina, a Comandante do Cristal Azul",
    introduction: "Eu sou Amina. Minha armadura azul e dourada, a coroa e o cajado de cristal representam liderança, estratégia e domínio conquistado com propósito. Como guardiã Conquistadora, comando sua campanha, acompanho sua posição e transformo progresso em território dominado.",
    welcome: "Vou mostrar como avançar, medir domínio e acompanhar sua posição.",
    strategy: "Seu painel prioriza campanha, posição, precisão e domínio da trilha.",
    voice: {
      navigation: "Antes da campanha, reconheça o terreno: quatro setores de comando.",
      guides: "Precisou de inteligência tática? Me acione sem sair do setor.",
      trail: "Este é o mapa da campanha. Cada território aqui pode ser seu.",
      study: "Avance sobre um tópico. Sua posição fica salva entre as investidas.",
      notifications: "As movimentações da sua campanha chegam por aqui.",
      ranking: "A Sala de Honra mostra onde você está em cada frente.",
      profile: "Este é o seu posto de comando. Ajuste o estilo, não as vitórias.",
      achievements: "Aqui ficam as insígnias que você conquistou em campo.",
      settings: "Daqui você comanda preferências, acessos e permissões.",
      finish: "O reconhecimento terminou. A campanha é sua — avance.",
    },
  },
  socializer: {
    label: "Socializador",
    guideName: "Mateo e Zuri",
    guideRole: "seus guias de conexão e participação",
    introductionTitle: "Mateo e Zuri, as Vozes da Conexão",
    introduction: "Somos Mateo e Zuri. O alaúde, a flauta e nossas vestes violetas representam diálogo, harmonia e experiências compartilhadas. Como guardiões Socializadores, conectamos pessoas, valorizamos presença e mostramos como cada participação fortalece o grupo.",
    welcome: "Vamos conhecer juntos os espaços de comunicação, presença e progresso coletivo.",
    strategy: "Seu painel prioriza presença, participação, ranking e energia do grupo.",
    voice: {
      navigation: "Venha com a gente: são quatro espaços, e nenhum se percorre sozinho.",
      guides: "Se ficar em dúvida, é só chamar a gente: conversamos ali mesmo.",
      trail: "Esta é a sua trilha — e ela caminha junto com a da turma.",
      study: "Entre num tópico e fique à vontade. Seu lugar fica guardado.",
      notifications: "É aqui que as novidades da turma chegam até você.",
      ranking: "A classificação mostra o grupo sem apagar o seu percurso.",
      profile: "Este é o seu canto. Aqui você escolhe como quer aparecer.",
      achievements: "Cada conquista aqui vale por você e pela turma.",
      settings: "Escolha aqui como quer participar e o que quer compartilhar.",
      finish: "Agora você já sabe onde tudo fica. Seguimos juntos.",
    },
  },
  achiever: {
    label: "Realizador",
    guideName: "Kwame",
    guideRole: "seu mentor de metas e realizações",
    introductionTitle: "Kwame, o Campeão dos Marcos",
    introduction: "Eu sou Kwame. Minha armadura dourada, a espada e o emblema de estrela representam disciplina, objetivos claros e realizações reconhecidas. Como guardião Realizador, organizo grandes jornadas em metas possíveis e celebro cada marco concluído.",
    welcome: "Vou organizar o sistema em metas claras, marcos e próximos objetivos.",
    strategy: "Seu painel prioriza metas, checklists, conquistas e o que falta concluir.",
    voice: {
      navigation: "Primeira meta: reconhecer as quatro áreas. Olhe a base da tela.",
      guides: "Dúvida vira próximo passo: me chame e eu transformo em tarefa.",
      trail: "Veja a trilha — o objetivo grande dividido em etapas alcançáveis.",
      study: "Dentro do tópico, cada tarefa concluída fica marcada, uma a uma.",
      notifications: "Prazos, retornos e novos marcos chegam por aqui.",
      ranking: "Compare aqui os resultados por objetivo e por critério.",
      profile: "Este é o seu quadro de metas. Ajuste sem alterar o que já conquistou.",
      achievements: "Aqui estão seus marcos concluídos — e os próximos.",
      settings: "Defina aqui como quer acompanhar sua jornada.",
      finish: "Apresentação concluída. Sua primeira meta já está definida.",
    },
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
      page: `Apresentação · ${copy.guideName}`,
      title: copy.introductionTitle,
      description: copy.introduction,
      highlight: "content",
    },
    {
      id: "navigation",
      route: "/(tabs)",
      page: "Navegação principal",
      title: "Suas quatro áreas",
      description: `${copy.voice.navigation} Trilha, Notificações, Ranking e Perfil — trocar de área não perde seu progresso.`,
      target: "abas_principais",
      highlight: "navigation",
    },
    {
      id: "local-guides",
      route: "/(tabs)",
      page: "Guias da interface",
      title: "Precisou de ajuda?",
      description: `${copy.voice.guides} Este botão abre o guia da página em que você estiver.`,
      target: "guia_botao",
      highlight: "help",
    },
    {
      id: "trail-overview",
      route: "/(tabs)",
      page: "Trilha",
      title: "Seu progresso",
      description: `${copy.voice.trail} Aqui ficam a classe e a porcentagem já concluída.`,
      target: "trilha_resumo",
      highlight: "content",
    },
    {
      id: "trail-topics",
      route: "/(tabs)",
      page: "Trilha",
      title: "Os tópicos",
      description: `${copy.voice.study} Cada nó é um tópico: concluído, disponível ou ainda bloqueado.`,
      target: "trilha_mapa",
      highlight: "content",
    },
    {
      id: "notifications",
      route: "/(tabs)/notificacoes",
      page: "Notificações",
      title: "Seus avisos",
      description: `${copy.voice.notifications} Arraste um aviso para marcar como lido ou excluir.`,
      target: "notificacoes_lista",
      highlight: "content",
    },
    {
      id: "ranking",
      route: "/(tabs)/ranking",
      page: "Ranking",
      title: "As classificações",
      description: `${copy.voice.ranking} Cada cartão abre uma tabela com critério próprio.`,
      target: "ranking_categorias",
      highlight: "content",
    },
    {
      id: "profile",
      route: "/(tabs)/perfil",
      page: "Perfil",
      title: "Seu perfil ativo",
      description: `${copy.voice.profile} Trocar de perfil muda cores, guia e recursos — nunca o seu histórico.`,
      target: "perfil_resumo",
      highlight: "content",
    },
    {
      id: "profile-metrics",
      route: "/(tabs)/perfil",
      page: "Perfil · Métricas",
      title: `Suas métricas: ${THEME_LABELS[metricsTheme]}`,
      description: `${copy.strategy} O guia desta página explica cada número.`,
      target: "perfil_metricas",
      highlight: "content",
    },
    {
      id: "achievements",
      route: "/(tabs)/perfil/biblioteca-conquistas",
      page: "Biblioteca de Conquistas",
      title: "Suas conquistas",
      description: `${copy.voice.achievements} Concluídas, em progresso e bloqueadas, com o requisito de cada uma.`,
      target: "conquistas_resumo",
      highlight: "content",
    },
    {
      id: "settings",
      route: "/(tabs)/perfil/settings",
      page: "Configurações",
      title: "Suas preferências",
      description: `${copy.voice.settings} Conta, estilo das métricas, coleta de dados e privacidade.`,
      target: "config_lista",
      highlight: "content",
    },
    {
      id: "finish",
      route: "/(tabs)",
      page: "Tutorial concluído",
      title: "Pronto",
      description: `${copy.voice.finish} O botão de ajuda continua em cada página.`,
      highlight: "content",
    },
  ];
}
