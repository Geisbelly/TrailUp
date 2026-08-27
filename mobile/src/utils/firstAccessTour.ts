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
    welcome: "A apresentação percorre as quatro áreas e mostra onde cada novidade aparece.",
    strategy: "Seu painel destaca descoberta, novidades e próximos caminhos.",
    voice: {
      navigation: "Para o Explorador, a leitura começa pelo que ainda não foi aberto.",
      guides: "A ajuda de página existe para revelar o que passou despercebido.",
      trail: "A ênfase do Explorador está no que segue por descobrir.",
      study: "A exploração é medida pelo número de tópicos já visitados.",
      notifications: "O que interessa aqui é o que chegou desde a última visita.",
      ranking: "A comparação mostra o alcance de cada aluno da turma.",
      profile: "As métricas deste perfil giram em torno do que falta revelar.",
      achievements: "A coleção distingue o já descoberto do que segue fechado.",
      settings: "Estes controles definem o que é registrado e como o mapa é exibido.",
      finish: "O reconhecimento das áreas está completo.",
    },
  },
  survivor: {
    label: "Sobrevivente",
    guideName: "Kenji",
    guideRole: "seu guardião de continuidade",
    introductionTitle: "Kenji, o Guardião dos Checkpoints",
    introduction: "Eu sou Kenji. Meu escudo de pedra e as vestes escuras representam resistência, proteção e calma diante dos obstáculos. Como guardião Sobrevivente, protejo o progresso conquistado e mostro como retomar a jornada sem perder o equilíbrio.",
    welcome: "A apresentação percorre as quatro áreas e mostra onde o progresso fica salvo.",
    strategy: "Seu painel destaca continuidade, retomada e progresso seguro.",
    voice: {
      navigation: "Para o Sobrevivente, o essencial é que nada se perde ao mudar de área.",
      guides: "A ajuda de página mostra onde cada avanço fica guardado.",
      trail: "A ênfase do Sobrevivente está na sequência de pontos já assegurados.",
      study: "Uma interrupção não desfaz o que já foi percorrido.",
      notifications: "O que interessa aqui é o que mudou desde o último acesso.",
      ranking: "A comparação é referência e não interfere no seu avanço.",
      profile: "As métricas deste perfil giram em torno de constância e retomada.",
      achievements: "Um marco concluído permanece, mesmo após longas pausas.",
      settings: "Estes controles definem o que é registrado e quais limites se aplicam.",
      finish: "O ponto de retomada permanece guardado.",
    },
  },
  daredevil: {
    label: "Aventureiro",
    guideName: "Ember",
    guideRole: "sua guia de ritmo e desafios",
    introductionTitle: "Ember, a Chama dos Desafios",
    introduction: "Eu sou Ember. O fogo em minhas mãos e os tons alaranjados representam energia, coragem e resposta rápida. Como guardiã Aventureira, transformo cada etapa em desafio e ajudo você a avançar com ritmo sem abrir mão da precisão.",
    welcome: "A apresentação percorre as quatro áreas e mostra onde o ritmo é medido.",
    strategy: "Seu painel destaca ritmo, resposta rápida e resultados da sessão.",
    voice: {
      navigation: "Para o Aventureiro, mudar de área não interrompe a sessão em curso.",
      guides: "A ajuda de página resume os controles sem tirar você da tela.",
      trail: "A ênfase do Aventureiro está no próximo desafio liberado.",
      study: "Retomar no mesmo ponto é o que mantém o ritmo entre sessões.",
      notifications: "O que interessa aqui é o que surgiu desde a última sessão.",
      ranking: "A comparação coloca ritmo e precisão lado a lado.",
      profile: "As métricas deste perfil giram em torno da sessão atual.",
      achievements: "A coleção separa os desafios vencidos dos que seguem abertos.",
      settings: "Estes controles definem o que é registrado e como a interface responde.",
      finish: "O reconhecimento das áreas está completo.",
    },
  },
  mastermind: {
    label: "Estrategista",
    guideName: "Idris",
    guideRole: "seu conselheiro de estratégia e análise",
    introductionTitle: "Idris, o Arquivista das Constelações",
    introduction: "Eu sou Idris. Meu livro, a coruja e o mapa de constelações representam conhecimento, observação e conexão entre ideias. Como guardião Estrategista, explico critérios, comparo evidências e revelo a lógica por trás de cada métrica.",
    welcome: "A apresentação percorre as quatro áreas e indica a origem de cada número.",
    strategy: "Seu painel destaca critérios, comparação e origem dos números.",
    voice: {
      navigation: "As quatro áreas delimitam onde cada tipo de dado é apresentado.",
      guides: "A ajuda de página informa a origem de cada número exibido.",
      trail: "A ênfase do Estrategista está nas dependências entre os tópicos.",
      study: "Estado, posição e conclusão são registrados item a item.",
      notifications: "A ordenação combina estado de leitura e horário.",
      ranking: "Cada categoria é calculada de forma independente das demais.",
      profile: "A troca de perfil altera apresentação e recursos, nunca os dados acadêmicos.",
      achievements: "Requisito, estado e progresso são exibidos por conquista.",
      settings: "Estes controles reúnem as variáveis sob sua decisão direta.",
      finish: "A estrutura foi apresentada por inteiro.",
    },
  },
  conqueror: {
    label: "Conquistador",
    guideName: "Amina",
    guideRole: "sua comandante de campanha",
    introductionTitle: "Amina, a Comandante do Cristal Azul",
    introduction: "Eu sou Amina. Minha armadura azul e dourada, a coroa e o cajado de cristal representam liderança, estratégia e domínio conquistado com propósito. Como guardiã Conquistadora, comando sua campanha, acompanho sua posição e transformo progresso em território dominado.",
    welcome: "A apresentação percorre as quatro áreas e mostra onde a posição é registrada.",
    strategy: "Seu painel destaca posição, domínio e evolução competitiva.",
    voice: {
      navigation: "As quatro áreas são os setores em que a campanha é acompanhada.",
      guides: "A ajuda de página resume os indicadores de posição e domínio.",
      trail: "A ênfase do Conquistador está no território já dominado.",
      study: "Concluir um tópico eleva o domínio registrado da classe.",
      notifications: "O que interessa aqui é o que mudou na sua posição.",
      ranking: "A comparação expõe sua colocação em cada categoria cadastrada.",
      profile: "As métricas deste perfil giram em torno de posição e domínio.",
      achievements: "As insígnias reúnem marcos da trilha e do uso da plataforma.",
      settings: "Estes controles definem o que é registrado e quais acessos ficam abertos.",
      finish: "O reconhecimento dos setores está completo.",
    },
  },
  socializer: {
    label: "Socializador",
    guideName: "Mateo e Zuri",
    guideRole: "seus guias de conexão e participação",
    introductionTitle: "Mateo e Zuri, as Vozes da Conexão",
    introduction: "Somos Mateo e Zuri. O alaúde, a flauta e nossas vestes violetas representam diálogo, harmonia e experiências compartilhadas. Como guardiões Socializadores, conectamos pessoas, valorizamos presença e mostramos como cada participação fortalece o grupo.",
    welcome: "A apresentação percorre as quatro áreas e separa o individual do coletivo.",
    strategy: "Seu painel destaca participação, contexto coletivo e comunicação.",
    voice: {
      navigation: "As quatro áreas alternam entre o que é seu e o que é da turma.",
      guides: "A ajuda de página separa o individual do que é comparado.",
      trail: "A ênfase do Socializador está no percurso visto ao lado do da turma.",
      study: "Uma interrupção não desfaz o que já foi percorrido.",
      notifications: "O que interessa aqui é o que chegou para você.",
      ranking: "A comparação mostra o contexto coletivo sem alterar seu avanço.",
      profile: "As métricas deste perfil giram em torno de presença e participação.",
      achievements: "A coleção reúne marcos seus e marcos comuns a todos.",
      settings: "Estes controles definem o que é registrado e quais acessos ficam permitidos.",
      finish: "O reconhecimento das áreas está completo.",
    },
  },
  achiever: {
    label: "Realizador",
    guideName: "Kwame",
    guideRole: "seu mentor de metas e realizações",
    introductionTitle: "Kwame, o Campeão dos Marcos",
    introduction: "Eu sou Kwame. Minha armadura dourada, a espada e o emblema de estrela representam disciplina, objetivos claros e realizações reconhecidas. Como guardião Realizador, organizo grandes jornadas em metas possíveis e celebro cada marco concluído.",
    welcome: "A apresentação percorre as quatro áreas e mostra onde cada meta é acompanhada.",
    strategy: "Seu painel destaca metas, marcos concluídos e o que falta alcançar.",
    voice: {
      navigation: "As quatro áreas são onde cada meta é acompanhada.",
      guides: "A ajuda de página informa o requisito de cada item.",
      trail: "A ênfase do Realizador está no que falta para concluir.",
      study: "A conclusão é registrada item a item dentro do tópico.",
      notifications: "O que interessa aqui são prazos, retornos e novos marcos.",
      ranking: "Cada categoria compara um resultado diferente da turma.",
      profile: "As métricas deste perfil giram em torno de metas e marcos.",
      achievements: "Concluídas, em progresso e bloqueadas aparecem com o requisito de cada uma.",
      settings: "Estes controles definem o que é registrado e como o acompanhamento é exibido.",
      finish: "A primeira meta está definida.",
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
      title: "Quatro áreas sempre ao alcance",
      description: `${copy.voice.navigation} A barra inferior leva à Trilha, Notificações, Ranking e Perfil. O ícone colorido indica a página atual; tocar em outro ícone troca de área sem perder seu progresso.`,
      highlight: "navigation",
    },
    {
      id: "local-guides",
      route: "/(tabs)",
      page: "Guias da interface",
      title: "Ajuda disponível em cada página",
      description: `${copy.voice.guides} O botão com ponto de interrogação abre o guia local da página. Esses guias explicam apenas os controles e métricas realmente visíveis para o seu perfil.`,
      highlight: "help",
    },
    {
      id: "trail-overview",
      route: "/(tabs)",
      page: "Trilha",
      title: "Seu caminho de aprendizagem",
      description: `${copy.voice.trail} No topo ficam classe, progresso geral e porcentagem concluída. No mapa, cada nó representa um tópico: concluído, disponível ou bloqueado pelas dependências anteriores.`,
      highlight: "content",
    },
    {
      id: "trail-topics",
      route: "/(tabs)",
      page: "Trilha",
      title: "Tópicos, módulos e progresso",
      description: `${copy.voice.study} Abra um tópico disponível para estudar conteúdos, apresentações, áudios e atividades. O módulo salva o bloco, slide e posição do áudio onde você parou; o guia interno explica progresso, tempo e recursos do perfil.`,
      highlight: "content",
    },
    {
      id: "notifications",
      route: "/(tabs)/notificacoes",
      page: "Notificações",
      title: "Avisos e atualizações",
      description: `${copy.voice.notifications} Use Todas, Não lidas e Lidas para filtrar. Toque em um aviso para abrir a página completa; arraste para marcar como lido ou excluir e puxe a lista para atualizar.`,
      highlight: "content",
    },
    {
      id: "notification-details",
      route: "/(tabs)/notificacoes",
      page: "Notificações",
      title: "Detalhes ficam dentro do aviso",
      description: `${copy.voice.notifications} Ao abrir uma notificação, o guia daquela página explica título, estado de leitura, horário, mensagem e ações disponíveis. Assim o índice permanece simples.`,
      highlight: "help",
    },
    {
      id: "ranking",
      route: "/(tabs)/ranking",
      page: "Ranking",
      title: "Categorias de classificação",
      description: `${copy.voice.ranking} A Sala de Honra separa classificações por pontuação, tempo de estudo, percentual concluído e outras categorias cadastradas. Toque em um cartão para ver a tabela correspondente.`,
      highlight: "content",
    },
    {
      id: "ranking-details",
      route: "/(tabs)/ranking",
      page: "Ranking",
      title: "Cada ranking mede algo diferente",
      description: `${copy.voice.ranking} Dentro da categoria, o guia explica o critério exibido, filtros por perfil, posição, medalha e valor. Sua linha fica destacada, e a personalização visual nunca altera a pontuação.`,
      highlight: "help",
    },
    {
      id: "profile",
      route: "/(tabs)/perfil",
      page: "Perfil",
      title: "Identidade e perfis representativos",
      description: `${copy.voice.profile} Aqui você vê o perfil ativo e pode alternar entre os perfis BrainHex que mais representam você. A troca muda cores, guia, recursos e apresentação, mas preserva todo o histórico.`,
      highlight: "content",
    },
    {
      id: "profile-metrics",
      route: "/(tabs)/perfil",
      page: "Perfil · Métricas",
      title: `Seu estilo atual: ${THEME_LABELS[metricsTheme]}`,
      description: `${copy.voice.profile} ${copy.strategy} O guia desta página detalha o que cada número significa, como é calculado e de onde vêm os dados. Métricas ausentes não são anunciadas.`,
      highlight: "content",
    },
    {
      id: "achievements",
      route: "/(tabs)/perfil/biblioteca-conquistas",
      page: "Biblioteca de Conquistas",
      title: "Marcos pessoais e da plataforma",
      description: `${copy.voice.achievements} A biblioteca separa conquistas dos seus perfis representativos e conquistas comuns do TrailUp. Total, concluídas e progresso resumem a coleção; cada item mostra estado, requisito e avanço.`,
      highlight: "content",
    },
    {
      id: "settings",
      route: "/(tabs)/perfil/settings",
      page: "Configurações",
      title: "Controle da sua experiência",
      description: `${copy.voice.settings} Nas configurações ficam informações da conta, estilo das métricas, coleta e acessos, relatório dos dados, privacidade, segurança, exclusão da conta e informações do aplicativo.`,
      highlight: "content",
    },
    {
      id: "finish",
      route: "/(tabs)",
      page: "Tutorial concluído",
      title: "Tudo pronto para começar",
      description: `${copy.voice.finish} Você pode seguir pela Trilha e usar o botão de ajuda sempre que entrar em uma área nova. Os guias locais continuarão adaptados ao perfil ativo e ao conteúdo exibido.`,
      highlight: "content",
    },
  ];
}
