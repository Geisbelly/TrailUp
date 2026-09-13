import { BrainHexType, PerfilTema } from '../types';

export const BRAIN_HEX_PROFILES: Record<BrainHexType, PerfilTema> = {
  Achiever: {
    perfil: 'Achiever',
    nomePt: 'Realizador',
    archetype: 'Paladino da Glória',
    palette: {
      primary: '#C9A227',
      secondary: '#836919',
      accent: '#E7D59E',
      background: '#141004',
    },
    tom: 'objetivo, progressivo e orientado a metas claras',
    voiceDescription: 'Kwame fala com nobreza resoluta, tom conciso, direto e focado em metas inegociáveis, padrões de excelência, KPIs e conquistas graduais (XP).',
    environmentDescription: 'Cidadela Solar dos Estandartes & Salão Dourado de Conquistas (arquitetura heráldica, ouro sagrado, vitrais de vitórias e mapas de campanha).',
    diretrizes: [
      'Estruturar o conteúdo em checklists e marcos graduais.',
      'Destacar avanço, pontuação de XP e sensação de conclusão de etapas.',
      'Usar linguagem direta, objetiva e focada em resultados mensuráveis.',
      'Oferecer recompensas visuais a cada módulo conquistado.',
    ],
    mote: 'Cada etapa concluída é um troféu gravado na eternidade.',
    elemento: 'Ouro Sagrado & Luz',
    simbolo: 'Espada Dourada & Insígnia do Triunfo',
    soundArchetype: 'fanfare',
    characterImg: '/assets/achiever.webp',
    badgeName: 'Ordem da Vitória Perfeita',
    description:
      'Motivado por colecionar realizações, completar 100% dos objetivos, acumular badges e dominar todos os checklists de aprendizado.',
    strengths: ['Foco em resultados', 'Organização metódica', 'Persistência até 100% de conclusão'],
    learningTriggers: ['Barras de progresso claras', 'Checklists interativos', 'Conquistas desbloqueáveis'],
  },
  Seeker: {
    perfil: 'Seeker',
    nomePt: 'Explorador',
    archetype: 'Ranger dos Mistérios',
    palette: {
      primary: '#17A398',
      secondary: '#0F6A63',
      accent: '#97D6D1',
      background: '#02100F',
    },
    tom: 'curioso, exploratório e investigativo',
    voiceDescription: 'Amara fala com curiosidade instigante, mistério e fascínio pelo desconhecido, revelando conexões profundas e perguntas abertas.',
    environmentDescription: 'Ruínas Arcanas Esquecidas, Florestas Silvestres de Éter & Cartografia de Fronteiras Inexploradas (antigos monólitos, bússolas místicas, névoa e manuscritos).',
    diretrizes: [
      'Trazer perguntas instigantes de descoberta e curiosidades ocultas.',
      'Conectar conceitos teóricos com expedições e exploração de novos mundos.',
      'Incluir pistas, segredos reveláveis e desafios progressivos de descoberta.',
      'Incentivar a exploração não-linear de caminhos e saberes antigos.',
    ],
    mote: 'O verdadeiro tesouro é a verdade oculta além do horizonte.',
    elemento: 'Vento Silvestre & Éter das Florestas',
    simbolo: 'Bússola Mística dos Ventos',
    soundArchetype: 'chime',
    characterImg: '/assets/seeker.webp',
    badgeName: 'Guardião dos Mapas Perdidos',
    description:
      'Apaixonado por descobrir segredos, explorar territórios desconhecidos, encontrar easter eggs e desvendar o que há por trás de cada conceito.',
    strengths: ['Pensamento divergente', 'Curiosidade insaciável', 'Visão ampla do ecossistema'],
    learningTriggers: ['Segredos e lore revelável', 'Mapas conceituais abertos', 'Estudos de caso investigativos'],
  },
  Mastermind: {
    perfil: 'Mastermind',
    nomePt: 'Estrategista',
    archetype: 'Mago dos Tomos Arcanos',
    palette: {
      primary: '#5B3FD9',
      secondary: '#3B298D',
      accent: '#B5A9EE',
      background: '#090616',
    },
    tom: 'analítico, lógico e estratégico',
    voiceDescription: 'Idris fala com tom analítico, rigoroso, reflexivo e oracular, baseado em primeiros princípios, desconstrução lógica de axiomas, análise de trade-offs e teoremas.',
    environmentDescription: 'Observatório Astral das Constelações & Tomos Celestiais (abóbada celeste, esferas armilares, pergaminhos astronômicos, runas arcanas e geometrias sagradas).',
    diretrizes: [
      'Priorizar estrutura conceitual robusta e diagramas esquemáticos.',
      'Explicar rigorosamente relações de causa-efeito e trade-offs.',
      'Usar exemplos com tomada de decisão técnica e arquitetural.',
      'Estimular planejamento sistêmico e otimização de soluções complexas.',
    ],
    mote: 'A mente que decifra o padrão governa o desfecho da batalha.',
    elemento: 'Cosmos Estelar & Runas do Saber',
    simbolo: 'Tomo Astral com a Coruja da Sabedoria',
    soundArchetype: 'mystic',
    characterImg: '/assets/mastermind.webp',
    badgeName: 'Círculo dos Arquimagos da Lógica',
    description:
      'Impulsionado por resolver quebra-cabeças lógicos profundos, arquitetar estratégias perfeitas e dominar a essência das regras e algoritmos.',
    strengths: ['Pensamento analítico', 'Arquitetura de sistemas', 'Previsão de cenários complexos'],
    learningTriggers: ['Relações de causa-efeito', 'Árvores de decisão', 'Análise crítica de trade-offs'],
  },
  Conqueror: {
    perfil: 'Conqueror',
    nomePt: 'Conquistador',
    archetype: 'General das Forças Reais',
    palette: {
      primary: '#1E4FD6',
      secondary: '#14338B',
      accent: '#9AB0ED',
      background: '#030815',
    },
    tom: 'competitivo, desafiador e focado em performance',
    voiceDescription: 'Amina fala como comandante imperial destemida, intensa e eletrizante, focada em liderança de ponta, superação de limites, destruição de gargalos e domínio de alta performance.',
    environmentDescription: 'Arena Imperial da Tempestade & Bastião dos Reis (safira imperial, fogo azul, estandartes de batalha, troféus de combate e muralhas fortificadas).',
    diretrizes: [
      'Propor metas comparativas e desafios de alta intensidade (Boss Battles).',
      'Valorizar precisão, maestria rápida e superação de adversidades.',
      'Usar chamadas épicas de vitória e dominação de mercado/conhecimento.',
      'Evidenciar rankings, métricas de poder e bônus de performance.',
    ],
    mote: 'Não há glória sem combate, nem coroa sem superação absoluta.',
    elemento: 'Cristal Safira Imperial & Fogo Azul',
    simbolo: 'Cajado de Cristal dos Reis',
    soundArchetype: 'wardrum',
    characterImg: '/assets/conqueror.webp',
    badgeName: 'Lança da Supremacia Invicta',
    description:
      'Gosta de vencer obstáculos difíceis, duelos intelectuais intensos, liderar tabelas de classificação e dominar territórios de conhecimento.',
    strengths: ['Alta competitividade', 'Foco inabalável sob pressão', 'Liderança decisiva'],
    learningTriggers: ['Boss fights e quizzes de tempo', 'Desafios de alto nível', 'Benchmarking de performance'],
  },
  Socializer: {
    perfil: 'Socializer',
    nomePt: 'Sociável',
    archetype: 'Bardo da Taverna Encantada',
    palette: {
      primary: '#F4623A',
      secondary: '#9F4026',
      accent: '#FAB8A6',
      background: '#180A06',
    },
    tom: 'colaborativo, acolhedor e dialógico',
    voiceDescription: 'Mateo & Zuri falam com calor humano, empatia, ritmo envolvente e dialógico, focados em inteligência coletiva, colaboração de guilda, escuta ativa e histórias de impacto humano.',
    environmentDescription: 'Taverna Encantada da Aliança, Fogueira da Guilda & Mural Coletivo de Histórias (madeira acolhedora, lanternas douradas, pergaminhos afixados, alaúdes e roda de saberes).',
    diretrizes: [
      'Incluir dinâmicas de colaboração, conexão humana e troca de saberes.',
      'Usar histórias com personagens, guildas e trabalho em equipe.',
      'Estimular feedback entre pares, debates empáticos e construção conjunta.',
      'Adotar linguagem calorosa, acolhedora e que crie senso de comunidade.',
    ],
    mote: 'A canção mais bela é aquela cantada em coro por todos nós.',
    elemento: 'Fogo da Taverna & Harmonia das Cordas',
    simbolo: 'Alaúde Encantado & Flauta de Prata',
    soundArchetype: 'lute',
    characterImg: '/assets/socializer.webp',
    badgeName: 'Aliança dos Bardos Unidos',
    description:
      'Move-se pela interação humana, networking, empatia, debate em grupo, compartilhamento de experiências e construção coletiva de soluções.',
    strengths: ['Inteligência interpessoal', 'Comunicação envolvente', 'Facilitação de grupos'],
    learningTriggers: ['Cenários de diálogo e guildas', 'Dinâmicas colaborativas', 'Histórias com personagens vivos'],
  },
  Daredevil: {
    perfil: 'Daredevil',
    nomePt: 'Ousado',
    archetype: 'Piromante da Ação Veloz',
    palette: {
      primary: '#D7263D',
      secondary: '#8C1928',
      accent: '#ED9DA8',
      background: '#160406',
    },
    tom: 'dinâmico, energético e orientado à ação',
    voiceDescription: 'Ember fala com ousadia elétrica, dinamismo e agilidade veloz, orientada à ação imediata sem hesitação, resposta rápida a incidentes sob pressão e experimentação no calor da batalha.',
    environmentDescription: 'Forja Primordial do Caos, Linha de Frente Tática & Centro de Resposta Relâmpago (chamas ardentes, centelhas de fogo, magma, painéis táticos em tempo real e ritmo frenético).',
    diretrizes: [
      'Aplicar cenários práticos imediatos com sensação de risco calculado.',
      'Usar linguagem eletrizante de execução ágil e ritmo veloz.',
      'Evitar excesso de teoria abstrata ou parágrafos longos estáticos.',
      'Desafiar o aluno a agir rápido, experimentar sem medo e iterar no calor da batalha.',
    ],
    mote: 'Salte no abismo com coragem: as asas brotam durante a queda.',
    elemento: 'Chamas Primordiais & Magia da Ação',
    simbolo: 'Orbe de Chamas Ardentes',
    soundArchetype: 'firewhoosh',
    characterImg: '/assets/daredevil.webp',
    badgeName: 'Coração de Fogo Indomável',
    description:
      'Adora adrenalina, experimentos ousados, agir rápido, assumir riscos calculados e aprender na prática com o calor da execução imediata.',
    strengths: ['Agilidade extrema', 'Coragem para inovar', 'Orientação prática imediata'],
    learningTriggers: ['Sprints de ação rápida', 'Testes sob pressão', 'Desafios de improviso prático'],
  },
  Survivor: {
    perfil: 'Survivor',
    nomePt: 'Sobrevivente',
    archetype: 'Monge Guardião da Fortaleza',
    palette: {
      primary: '#4E5A66',
      secondary: '#333A42',
      accent: '#AFB5BA',
      background: '#08090A',
    },
    tom: 'resiliente, encorajador e focado em superação',
    voiceDescription: 'Kenji fala com serenidade paciente, resiliência firme e cautela prudente, focado em contenção de riscos, redundância sólida, salvaguardas permanentes e eliminação de vulnerabilidades (SPOF).',
    environmentDescription: 'Fortaleza Inviolável da Montanha & Desfiladeiro Rúnico dos Ventos (pedra maciça talhada, escudos de ferro, barreiras intransponíveis, fogueiras protegidas e postos de vigia).',
    diretrizes: [
      'Quebrar desafios gigantes em etapas pequenas e protegidas (checkpoints).',
      'Reforçar o progresso incremental seguro e a tolerância a erros.',
      'Usar mensagens de persistência, autocuidado e firmeza mental.',
      'Prover escudos defensivos de aprendizado e mitigação de frustrações.',
    ],
    mote: 'A rocha não teme a tempestade: com calma, toda muralha é erguida.',
    elemento: 'Pedra Rúnica & Escudo de Ferro',
    simbolo: 'Grande Escudo Prisma Rúnico',
    soundArchetype: 'shieldbell',
    characterImg: '/assets/survivor.webp',
    badgeName: 'Baluarte da Fortaleza Eterna',
    description:
      'Destaca-se pela tenacidade, resiliência contra adversidades, cautela estratégica e capacidade de superar cenários de alta escassez ou crise.',
    strengths: ['Resiliência emocional', 'Gestão de riscos', 'Disciplina e constância inquebrantável'],
    learningTriggers: ['Checkpoints com salvamento', 'Guia passo-a-passo seguro', 'Gestão de erros e recuperação'],
  },
};

export const BRAIN_HEX_GUIDE_NAMES: Record<BrainHexType, string> = {
  Mastermind: 'Idris',
  Achiever: 'Kwame',
  Seeker: 'Amara',
  Survivor: 'Kenji',
  Conqueror: 'Amina',
  Socializer: 'Mateo & Zuri',
  Daredevil: 'Ember',
};

export interface ProfileQuizConfig {
  archetypeTitle: string;
  cognitiveFocus: string;
  pedagogicalRole: string;
  feedbackSuccess: string;
  feedbackReview: string;
  badgeLabel: string;
}

export const BRAIN_HEX_QUIZ_CONFIGS: Record<BrainHexType, ProfileQuizConfig> = {
  Achiever: {
    archetypeTitle: 'Desafio de Maestria & Metas de Competência',
    cognitiveFocus: 'Validação de Precisão, Padrões Técnicos e Métricas Exatas',
    pedagogicalRole: 'Avaliação de proficiência técnica e aplicação exata de critérios normativos.',
    feedbackSuccess: 'Critério de maestria validado com exatidão máxima.',
    feedbackReview: 'Revise o parâmetro técnico para atingir conformidade de 100%.',
    badgeLabel: 'Meta de Competência',
  },
  Seeker: {
    archetypeTitle: 'Enigma Investigativo & Dedução de Padrões',
    cognitiveFocus: 'Identificação de Causas Raiz, Conexões Ocultas e Relações Subjacentes',
    pedagogicalRole: 'Estímulo ao pensamento divergente, raciocínio inferencial e análise comparativa.',
    feedbackSuccess: 'Padrão subjacente decifrado com sucesso investigativo.',
    feedbackReview: 'Analise os indícios teóricos e reconecte as evidências do conceito.',
    badgeLabel: 'Investigação Lógica',
  },
  Mastermind: {
    archetypeTitle: 'Análise Sistêmica & Decisão de Arquitetura',
    cognitiveFocus: 'Ponderação de Trade-offs, Primeiros Princípios e Escalabilidade',
    pedagogicalRole: 'Avaliação de raciocínio crítico, modelagem conceitual e escolhas de engenharia.',
    feedbackSuccess: 'Decisão arquitetural ideal fundamentada em primeiros princípios.',
    feedbackReview: 'Considere os custos de acoplamento e os impactos colaterais na arquitetura.',
    badgeLabel: 'Decisão de Engenharia',
  },
  Conqueror: {
    archetypeTitle: 'Gauntlet de Domínio Tático & Alta Performance',
    cognitiveFocus: 'Superação de Gargalos Críticos e Decisões de Alto Impacto sob Pressão',
    pedagogicalRole: 'Treinamento de alta intensidade para eliminação de armadilhas conceituais.',
    feedbackSuccess: 'Desafio superado com precisão e controle absoluto do sistema.',
    feedbackReview: 'Identifique o gargalo da solução antes de submeter a nova abordagem.',
    badgeLabel: 'Domínio Tático',
  },
  Socializer: {
    archetypeTitle: 'Dilema de Guilda & Decisão Ético-Colaborativa',
    cognitiveFocus: 'Dinâmicas de Equipe, Empatia Técnica e Governança Coletiva',
    pedagogicalRole: 'Desenvolvimento de inteligência socioemocional, comunicação e consenso em grupo.',
    feedbackSuccess: 'Consenso ideal alcançado, harmonizando o impacto técnico e humano.',
    feedbackReview: 'Pondere o impacto dessa decisão na comunicação e sustentabilidade da equipe.',
    badgeLabel: 'Inteligência Coletiva',
  },
  Daredevil: {
    archetypeTitle: 'Intervenção em Tempo Real & Resposta a Incidentes',
    cognitiveFocus: 'Ação Ágil sob Incerteza, Contenção Rápida e Resolução Prática',
    pedagogicalRole: 'Simulação de crises operacionais onde a velocidade de diagnóstico é essencial.',
    feedbackSuccess: 'Intervenção cirúrgica concluída sem interrupções críticas.',
    feedbackReview: 'Ação com alto risco colateral; priorize o isolamento imediato da falha.',
    badgeLabel: 'Resposta a Incidentes',
  },
  Survivor: {
    archetypeTitle: 'Auditoria de Vulnerabilidade & Blindagem de Risco',
    cognitiveFocus: 'Eliminação de Pontos Únicos de Falha (SPOF), Antifragilidade e Resiliência',
    pedagogicalRole: 'Desenvolvimento de mentalidade defensiva, continuidade operacional e mitigação de danos.',
    feedbackSuccess: 'Vulnerabilidade neutralizada e resiliência do sistema garantida.',
    feedbackReview: 'Ponto único de falha detectado; estruture redundância e proteção adequada.',
    badgeLabel: 'Blindagem Antifrágil',
  },
};

export const BRAIN_HEX_GUIDE_INFOS: Record<
  BrainHexType,
  {
    name: string;
    title: string;
    color: string;
    quote: string;
    description: string;
    traits: string[];
    style: string;
  }
> = {
  Mastermind: {
    name: 'Idris',
    title: 'O Sábio das Constelações',
    color: '#707c88ff',
    quote: 'Toda pergunta certa já contém metade da resposta.',
    description:
      'Dizem que Idris nasceu sob uma chuva de estrelas. Enquanto outros procuram respostas, ele busca padrões ocultos que conectam todas as coisas. Para ele, conhecimento não é acumular informações, mas enxergar além do óbvio. Cada decisão começa com uma pergunta, e cada estratégia nasce da compreensão do cenário antes do primeiro passo.',
    traits: ['Analítico', 'Estratégico', 'Profundo'],
    style: 'Analítico, rigoroso, baseado em primeiros princípios, padrões ocultos e trade-offs estruturais.',
  },
  Achiever: {
    name: 'Kwame',
    title: 'O Cavaleiro Solar',
    color: 'rgb(173, 96, 2)',
    quote: 'Cada marco conquistado abre o próximo caminho.',
    description:
      'Kwame nunca acreditou em atalhos. Cada cicatriz em sua armadura representa uma promessa cumprida, uma meta alcançada e um dia em que escolheu continuar quando seria mais fácil desistir. Para ele, o sucesso não pertence aos mais talentosos, mas aos que seguem avançando mesmo quando ninguém está olhando.',
    traits: ['Focado', 'Disciplinado', 'Determinado'],
    style: 'Direto, focado em metas de competência, marcos de progresso e KPIs de excelência.',
  },
  Seeker: {
    name: 'Amara',
    title: 'A Guardiã das Runas',
    color: 'rgb(167, 140, 7)',
    quote: 'Todo mapa esconde uma pergunta melhor que a resposta.',
    description:
      'Amara percorre ruínas esquecidas em busca de conhecimentos que o tempo tentou apagar. Ela acredita que cada descoberta revela um novo mistério, tornando a jornada mais valiosa que o destino. Sua maior habilidade não é encontrar respostas, mas nunca perder a curiosidade que a impulsiona a seguir em frente.',
    traits: ['Curiosa', 'Exploradora', 'Intuitiva'],
    style: 'Investigativo, curioso, revelador de conexões profundas e relações subjacentes.',
  },
  Survivor: {
    name: 'Kenji',
    title: 'O Guardião da Montanha',
    color: '#720101',
    quote: 'Sobreviver é ter um plano B. Redundância não é desperdício.',
    description:
      'Durante anos, Kenji protegeu sozinho uma antiga passagem entre montanhas, onde um único erro podia custar tudo. Ele aprendeu que coragem não é ignorar os riscos, mas estar preparado para eles. Enquanto outros apostam tudo em uma única chance, Kenji sempre constrói uma segunda saída.',
    traits: ['Paciente', 'Resiliente', 'Confiável'],
    style: 'Resiliente, paciente, focado em contenção de riscos, redundância e blindagem sistêmica.',
  },
  Conqueror: {
    name: 'Amina',
    title: 'A Rainha da Tempestade',
    color: '#01808bff',
    quote: 'Não existe segundo lugar na sua própria jornada.',
    description:
      'Amina lidera como a própria tempestade: intensa, determinada e impossível de ignorar. Ela acredita que o maior adversário nunca é quem está ao lado, mas a versão de ontem de si mesma. Sua liderança inspira outros a enfrentarem desafios que pareciam inalcançáveis e a nunca aceitarem menos do que seu verdadeiro potencial.',
    traits: ['Líder', 'Competitiva', 'Determinada'],
    style: 'Desafiador, líder, focado em alta performance, superação de limites e domínio tático.',
  },
  Socializer: {
    name: 'Mateo & Zuri',
    title: 'Os Gêmeos Espíritos da Aurora',
    color: 'rgb(109, 21, 190)',
    quote: 'Ninguém chega longe sozinho... nem mesmo você.',
    description:
      'Mateo conquista pessoas com histórias que despertam esperança, enquanto Zuri enxerga sentimentos escondidos até mesmo no silêncio. Juntos, unem pessoas, constroem alianças e transformam desconhecidos em companheiros de jornada. Eles sabem que os maiores feitos sempre começam com uma boa conexão.',
    traits: ['Comunicativo', 'Empático', 'Inspirador'],
    style: 'Colaborativo, empático, unificador de comunidades e focado em inteligência coletiva.',
  },
  Daredevil: {
    name: 'Ember',
    title: 'A Fênix do Caos',
    color: '#1b6b1b',
    quote: 'Hesitar é a única forma de perder.',
    description:
      'Ember nunca espera o momento perfeito, porque acredita que ele simplesmente não existe. Ela mergulha no desconhecido, aprende com cada desafio e transforma cada queda em impulso para voar ainda mais alto. Para ela, o medo não é um obstáculo, mas a prova de que vale a pena seguir em frente.',
    traits: ['Ousada', 'Energética', 'Impulsiva'],
    style: 'Ousado, dinâmico, orientado a intervenções rápidas e resposta imediata sob incerteza.',
  },
};

export function getProfileTheme(profile: BrainHexType): PerfilTema {
  return BRAIN_HEX_PROFILES[profile] || BRAIN_HEX_PROFILES.Achiever;
}

export function getGuideName(profile: BrainHexType): string {
  return BRAIN_HEX_GUIDE_NAMES[profile] || 'Guardião';
}

