import { DeckData } from '../types';
import { BRAIN_HEX_PROFILES } from './brainHexProfiles';
import { enrichDeckWithInteractiveElements } from '../utils/interactiveElementGenerator';

const RAW_PRESET_DECKS: DeckData[] = [
  {
    id: 'deck-achiever-clean-code',
    title: 'A Jornada do Código Limpo e Alta Performance',
    subtitle: 'Conquistando os Padrões da Ordem da Vitória',
    subject: 'Engenharia de Software & Refatoração',
    targetProfile: 'Achiever',
    rankLevel: 'Guardião',
    themeConfig: BRAIN_HEX_PROFILES.Achiever,
    createdAt: '2026-08-14',
    author: 'TrailUp Academy',
    estimatedMinutes: 8,
    tags: ['Clean Code', 'Metas', 'Checklist', 'Refatoração'],
    slides: [
      {
        id: 's1',
        type: 'cover',
        title: 'Código Limpo & Vitória Mensurável',
        subtitle: 'Trilha do Paladino da Glória: Rumo aos 100% de Maestria',
        narrativeText: 'Bem-vindo ao campo de treinamento real. Cada linha de código refatorada é um marco de conquista.',
        contentParagraphs: [
          'Você está prestes a dominar os princípios sagrados que diferenciam guerreiros amadores dos mestres condecorados do desenvolvimento de software.',
          'Sua missão hoje: completar todos os checklists e elevar o nível de sustentabilidade do seu projeto.',
        ],
        layout: 'monumental-card',
        rpgQuest: {
          questName: 'Missão de Honra: Pureza do Código',
          xpValue: 350,
          difficulty: 'Médio',
        },
      },
      {
        id: 's2',
        type: 'concept_breakdown',
        title: 'Pilar 1: Nomes que Revelam Intenções',
        subtitle: 'Eliminando ambiguidades no campo de batalha',
        conceptTitle: 'A Regra de Ouro dos Nomes Expressivos',
        contentParagraphs: [
          'Um nome no código deve responder três perguntas cruciais de imediato: por que existe, o que faz e como é utilizado.',
          'Se uma variável requer um comentário para ser compreendida, ela falhou no teste de clareza do guerreiro.',
        ],
        keyTakeaways: [
          'Evite abreviações crípticas como `usr_lst_tmp`. Prefira `activeUsersList`.',
          'Use termos do domínio do negócio sem medo de especificidade.',
          'Funções devem ser verbos de ação clara: `calculateTax()`, `validateInventory()`.',
        ],
        codeSnippet: {
          language: 'typescript',
          code: `// Ruim: O que significa 'd'?
const d = 86400;

// Excelente: Autoexplicativo e sem margem para erro
const SECONDS_PER_DAY = 86400;
function getActiveOrderCount(customerStatus: CustomerStatus): number {
  return orders.filter(o => o.status === customerStatus).length;
}`,
        },
        layout: 'arcane-codex',
      },
      {
        id: 's-achiever-timeline',
        type: 'timeline_process',
        title: 'Pipeline da Refatoração de Alta Performance',
        subtitle: '4 Etapas Sequenciais para Código Condecorado',
        contentParagraphs: [
          'Siga o fluxo metodológico para refatorar qualquer módulo crítico sem quebrar compatibilidade ou introduzir regressões.',
        ],
        timelineSteps: [
          {
            stepNumber: '01',
            title: 'Diagnóstico & Testes de Cobertura',
            description: 'Escreva testes de caracterização para garantir que o comportamento atual esteja blindado.',
            badge: 'Base Segura',
            highlight: false,
          },
          {
            stepNumber: '02',
            title: 'Decomposição em Funções Puras',
            description: 'Extraia blocos lógicos isolados eliminando efeitos colaterais e mutações inesperadas.',
            badge: 'Coesão Alta',
            highlight: false,
          },
          {
            stepNumber: '03',
            title: 'Inversão de Dependências (SOLID)',
            description: 'Substitua acoplamentos rígidos por contratos e interfaces desacopladas.',
            badge: 'Flexibilidade',
            highlight: true,
          },
          {
            stepNumber: '04',
            title: 'Benchmark & Integração Contínua',
            description: 'Meça tempo de execução, alocação de memória e publique com validação automática.',
            badge: 'Entrega 100%',
            highlight: false,
          },
        ],
        layout: 'timeline-flow',
      },
      {
        id: 's-achiever-metrics',
        type: 'stats_metrics',
        title: 'Métricas de Excelência do Paladino',
        subtitle: 'Impactos Quantitativos do Código Limpo no Reino',
        contentParagraphs: [
          'Resultados mensuráveis comprovados após a adoção dos padrões condecorados da Ordem da Vitória.',
        ],
        metricCards: [
          {
            value: '99.9%',
            label: 'Disponibilidade do Serviço',
            sublabel: 'Zero downtime em deploys',
            trend: '+14% YoY',
          },
          {
            value: '-65%',
            label: 'Tempo de Resolução de Bugs',
            sublabel: 'Média de MTTR reduzida',
            trend: 'Eficiência Máxima',
          },
          {
            value: '100%',
            label: 'Cobertura de Caminhos Críticos',
            sublabel: 'Testes unitários e de integração',
            trend: 'Meta Atingida',
          },
        ],
        layout: 'metric-dashboard',
      },
      {
        id: 's3',
        type: 'checklist_quest',
        title: 'Checklist de Avaliação Tática',
        subtitle: 'Validação de critérios de aceitação para o XP máximo',
        contentParagraphs: [
          'Marque cada item à medida que verificar a conformidade com as diretrizes do reino do software de alta qualidade.',
        ],
        checklist: [
          { id: 'c1', text: 'Funções realizam apenas uma única responsabilidade (Single Responsibility Principle)', completed: false, xp: 80 },
          { id: 'c2', text: 'Nenhum efeito colateral oculto altera o estado global sem aviso', completed: false, xp: 90 },
          { id: 'c3', text: 'Tratamento de exceções robusto em vez de retornar códigos de erro mágicos', completed: false, xp: 100 },
          { id: 'c4', text: 'Cobertura de testes automatizados valida os caminhos críticos', completed: false, xp: 120 },
        ],
        layout: 'parchment-scroll',
        rpgQuest: {
          questName: 'Checklist da Ordem Dourada',
          xpValue: 390,
          difficulty: 'Médio',
        },
      },
      {
        id: 's4',
        type: 'interactive_challenge',
        title: 'Desafio Prático: Refatoração sob Medida',
        subtitle: 'Teste de precisão do Paladino',
        contentParagraphs: [
          'Analise o cenário abaixo e selecione a ação técnica que garante o maior ganho de coesão e facilidade de manutenção.',
        ],
        interactiveType: 'quiz',
        quiz: {
          question: 'Você encontra uma função de 180 linhas que valida pagamento, atualiza banco, gera PDF e dispara e-mail. Qual a primeira refatoração recomendada?',
          options: [
            {
              id: 'q1',
              text: 'Aplicar Extract Method e decompor em serviços especializados (PaymentGateway, InvoiceGenerator, Notifier)',
              isCorrect: true,
              explanation: 'Correto! A decomposição em métodos e serviços focados restaura a coesão e viabiliza testes unitários isolados.',
            },
            {
              id: 'q2',
              text: 'Adicionar comentários explicativos a cada 10 linhas para guiar a leitura',
              isCorrect: false,
              explanation: 'Comentários não reduzem o acoplamento nem diminuem a complexidade ciclomática da função.',
            },
            {
              id: 'q3',
              text: 'Transformar todas as variáveis em globais para facilitar o acesso',
              isCorrect: false,
              explanation: 'Isso destruiria o encapsulamento e criaria efeitos colaterais gravíssimos.',
            },
          ],
        },
        layout: 'monumental-card',
      },
      {
        id: 's5',
        type: 'reward_certificate',
        title: 'Certificado de Conquista: 100% Concluído',
        subtitle: 'Insígnia do Realizador Dourado Desbloqueada',
        narrativeText: 'Sua determinação inabalável garantiu a vitória total nos marcos estabelecidos.',
        contentParagraphs: [
          'Você acumulou o total de 740 XP e conquistou o título de Guardião do Código Limpo.',
          'Continue mantendo o padrão de excelência em cada commit e entrega do seu dia a dia.',
        ],
        layout: 'monumental-card',
        quote: {
          text: 'Qualidade nunca é um acidente; é sempre o resultado de esforço inteligente.',
          author: 'John Ruskin',
        },
      },
    ],
  },

  {
    id: 'deck-seeker-algorithms',
    title: 'Expedição aos Segredos das Estruturas de Dados',
    subtitle: 'Seguindo as Pistas Ocultas nos Grafos e Árvores',
    subject: 'Ciência da Computação & Algoritmos',
    targetProfile: 'Seeker',
    rankLevel: 'Aprendiz',
    themeConfig: BRAIN_HEX_PROFILES.Seeker,
    createdAt: '2026-08-14',
    author: 'TrailUp Explorers',
    estimatedMinutes: 10,
    tags: ['Grafos', 'Exploração', 'Descoberta', 'Algoritmos'],
    slides: [
      {
        id: 'sk1',
        type: 'cover',
        title: 'O Mapa das Florestas de Dados',
        subtitle: 'Trilha do Ranger: Desvendando Caminhos Invisíveis',
        narrativeText: 'Existe um reino invisível de conexões que os olhos comuns não enxergam. Prepare sua bússola mística.',
        contentParagraphs: [
          'Muitos pensam que dados são apenas listas lineares. Mas a verdadeira riqueza reside nas relações complexas entre nós de uma rede.',
          'Hoje vamos desenterrar os segredos dos Grafos e das Buscas em Profundidade e Largura.',
        ],
        layout: 'discovery-map',
        rpgQuest: {
          questName: 'Expedição à Floresta dos Grafos',
          xpValue: 400,
          difficulty: 'Médio',
        },
      },
      {
        id: 'sk2',
        type: 'deep_lore',
        title: 'O Mistério das Sete Pontes de Königsberg',
        subtitle: 'O enigma que deu origem à Teoria dos Grafos em 1736',
        narrativeText: 'Leonhard Euler observou a cidade e formulou uma pergunta que mudaria a matemática para sempre.',
        contentParagraphs: [
          'Era possível cruzar todas as sete pontes de uma ilha sem passar por nenhuma delas duas vezes?',
          'Ao abstrair as massas de terra como vértices e as pontes como arestas, Euler provou que a resposta dependia apenas do grau dos nós.',
        ],
        secretLore: {
          hint: 'Clique para revelar a pista secreta sobre o Teorema de Euler',
          revealedContent: 'Um grafo admite um caminho Euleriano se e somente se tiver zero ou exatamente dois vértices de grau ímpar! Essa é a chave mestra de todos os percursos.',
        },
        layout: 'arcane-codex',
      },
      {
        id: 'sk3',
        type: 'concept_breakdown',
        title: 'DFS vs BFS: Dois Estilos de Exploração',
        subtitle: 'Mergulho vertical na masmorra ou varredura em anéis concêntricos',
        conceptTitle: 'Comparativo de Exploração',
        contentParagraphs: [
          'A Busca em Profundidade (DFS) segue um único túnel até o fundo antes de recuar (usando Pilha).',
          'A Busca em Largura (BFS) explora todos os vizinhos imediatos primeiro, garantindo o caminho mais curto em grafos sem peso (usando Fila).',
        ],
        keyTakeaways: [
          'BFS é ideal para encontrar a rota mais curta em redes sociais ou mapas de labirinto.',
          'DFS é excelente para detecção de ciclos, ordenação topológica e labirintos profundos.',
          'A complexidade temporal de ambos em representação por lista de adjacência é O(V + E).',
        ],
        layout: 'split-character',
      },
      {
        id: 'sk4',
        type: 'decision_branch',
        title: 'Dilema do Explorador: Qual Caminho Tomar?',
        subtitle: 'Você encontra uma caverna bifurcada na montanha de dados',
        contentParagraphs: [
          'Você precisa encontrar a conexão entre duas pessoas em uma rede social de 10 milhões de usuários. Qual técnica de busca você aciona?',
        ],
        decisionChoices: [
          {
            id: 'dec1',
            label: 'Busca Bidirecional (BFS Simultânea de Ambas as Pontas)',
            description: 'Disparar duas buscas em largura simultâneas a partir da origem e do destino.',
            outcome: 'Extraordinário! Reduz o espaço de busca de O(b^d) para O(b^(d/2)), economizando milhões de iterações!',
            xpReward: 250,
          },
          {
            id: 'dec2',
            label: 'DFS Simples com Backtracking Profundo',
            description: 'Seguir cada amigo até o final antes de tentar o próximo.',
            outcome: 'Peligroso! Você pode descer milhares de níveis em galhos irrelevantes antes de encontrar o vizinho mais próximo.',
            xpReward: 90,
          },
        ],
        layout: 'monumental-card',
      },
      {
        id: 'sk5',
        type: 'epic_conclusion',
        title: 'O Horizonte sem Limites',
        subtitle: 'A bússola mística aponta para novos territórios',
        narrativeText: 'Você desvendou as trilhas fundamentais dos grafos. Novos mapas e relíquias de conhecimento aguardam sua curiosidade.',
        contentParagraphs: [
          'Dominar grafos é ter em mãos a chave mestra de mapas GPS, inteligência artificial, compiladores e redes biológicas.',
        ],
        layout: 'discovery-map',
      },
    ],
  },

  {
    id: 'deck-mastermind-system-architecture',
    title: 'Arquitetura de Microsserviços e Teorema CAP',
    subtitle: 'A Engenharia dos Sistemas Distribuídos Resilientes',
    subject: 'Arquitetura de Software & Sistemas Distribuídos',
    targetProfile: 'Mastermind',
    rankLevel: 'Mestre',
    themeConfig: BRAIN_HEX_PROFILES.Mastermind,
    createdAt: '2026-08-14',
    author: 'TrailUp Tech Council',
    estimatedMinutes: 12,
    tags: ['Arquitetura', 'CAP', 'Sistemas Distribuídos', 'Consistência'],
    slides: [
      {
        id: 'mm1',
        type: 'cover',
        title: 'O Tabuleiro dos Sistemas Distribuídos',
        subtitle: 'Trilha do Estrategista: Dominando Trade-offs Arquiteturais',
        narrativeText: 'Em sistemas de alta escala, não existem soluções perfeitas — existem apenas trade-offs deliberadamente calculados.',
        contentParagraphs: [
          'Quando centenas de nós se comunicam através de redes falíveis, a arquitetura deve prever partições, latência e divergência de estado.',
          'Nesta sessão, dissecaremos a lógica implacável do Teorema CAP e os padrões de consistência eventual.',
        ],
        layout: 'arcane-codex',
        rpgQuest: {
          questName: 'Cálculo da Matriz de Consistência',
          xpValue: 500,
          difficulty: 'Difícil',
        },
      },
      {
        id: 'mm2',
        type: 'concept_breakdown',
        title: 'O Teorema CAP: A Tríade Inviolável',
        subtitle: 'Consistência (C), Disponibilidade (A) e Tolerância a Partições (P)',
        conceptTitle: 'Equações Fundamentais de Brewer',
        contentParagraphs: [
          'Em qualquer sistema distribuído com rede assíncrona, partições de rede (P) são inevitáveis.',
          'Portanto, o verdadeiro dilema reside na escolha entre CP (Consistência Estrita sob partição) ou AP (Alta Disponibilidade com Consistência Eventual).',
        ],
        keyTakeaways: [
          'Sistemas CP (ex: Raft, Zookeeper, Spanner): Recusam escritas se não puderem garantir quorum absoluto.',
          'Sistemas AP (ex: Cassandra, DynamoDB): Aceitam leituras/escritas mesmo isolados, reconciliando depois via CRDTs ou Vector Clocks.',
          'O modelo PACELC expande o CAP ao considerar o trade-off de Latência vs Consistência mesmo em regime normal.',
        ],
        layout: 'split-character',
      },
      {
        id: 'mm3',
        type: 'interactive_challenge',
        title: 'Análise de Trade-off Crítico',
        subtitle: 'Tomada de decisão arquitetural para o Banco Central',
        contentParagraphs: [
          'Você está projetando o sistema de transferência monetária instantânea de alta concorrência.',
        ],
        interactiveType: 'quiz',
        quiz: {
          question: 'Durante um corte de fibra óptica que isola 40% dos nós do cluster, qual estratégia de consistência o serviço de saldo de contas deve adotar?',
          options: [
            {
              id: 'q1',
              text: 'CP (Consistência Estrita com Quorum): O nó isolado rejeita transações para evitar double-spending até restaurar sincronismo.',
              isCorrect: true,
              explanation: 'Exato! Em operações financeiras críticas, consistência e correção matemática sobrepõem-se à disponibilidade irrestrita.',
            },
            {
              id: 'q2',
              text: 'AP (Disponibilidade Total): Aceitar todas as transações em paralelo e tentar resolver conflitos de saldo no final do dia.',
              isCorrect: false,
              explanation: 'Incorreto para saldo financeiro. Isso permitiria gastar o mesmo valor repetidas vezes em partições distintas.',
            },
            {
              id: 'q3',
              text: 'Desligar os logs de transação para acelerar o throughput.',
              isCorrect: false,
              explanation: 'Desativar logs violaria durabilidade e auditoria (ACID).',
            },
          ],
        },
        layout: 'monumental-card',
      },
      {
        id: 'mm4',
        type: 'deep_lore',
        title: 'Padrão SAGA vs Two-Phase Commit (2PC)',
        subtitle: 'Orquestração vs Coreografia de Transações Longas',
        narrativeText: 'Quando serviços independentes não compartilham um único banco de dados, transações ACID globais tornam-se um gargalo inaceitável.',
        contentParagraphs: [
          'A SAGA quebra a transação distribuída em uma sequência de transações locais.',
          'Cada etapa possui uma ação compensatória que reverte o estado em caso de falha a jusante.',
        ],
        secretLore: {
          hint: 'Clique para desvendar o diagrama lógico de uma SAGA compensatória',
          revealedContent: 'Ordem: Criar Pedido -> Reservar Estoque (Falha!) -> Executar Ação Compensatória: Cancelar Pedido e Desbloquear Crédito. O estado converge sem travamento de locks distribuídos!',
        },
        layout: 'arcane-codex',
      },
      {
        id: 'mm5',
        type: 'epic_conclusion',
        title: 'Síntese Estratégica da Arquitetura',
        subtitle: 'A maestria reside na clareza dos trade-offs',
        narrativeText: 'Sua mente articulou as engrenagens lógicas da infraestrutura distribuída com precisão cirúrgica.',
        contentParagraphs: [
          'Você agora possui as ferramentas para projetar sistemas que suportam milhões de requisições por segundo com integridade comprovada.',
        ],
        layout: 'arcane-codex',
      },
    ],
  },

  {
    id: 'deck-conqueror-performance-boss',
    title: 'Supremacia em Alta Concorrência & Boss Battle',
    subtitle: 'Dominando Tempos de Resposta Sub-Milissegundo',
    subject: 'Performance Extrema & Otimização de Carga',
    targetProfile: 'Conqueror',
    rankLevel: 'Ancião',
    themeConfig: BRAIN_HEX_PROFILES.Conqueror,
    createdAt: '2026-08-14',
    author: 'TrailUp Champions Arena',
    estimatedMinutes: 9,
    tags: ['Boss Battle', 'Performance', 'Concorrência', 'Recorde'],
    slides: [
      {
        id: 'cq1',
        type: 'cover',
        title: 'A Batalha dos 100k Requisições por Segundo',
        subtitle: 'Trilha do General Conquistador: Quebre o Gargalo ou Seja Esmagado',
        narrativeText: 'O tráfego de pico chegou como uma tempestade de dragões de ferro. Apenas a arquitetura mais agressiva resistirá.',
        contentParagraphs: [
          'Aqui não há espaço para lentidão ou alocação excessiva de memória no Garbage Collector.',
          'Prepare suas otimizações: vamos derrubar os tempos de latência p99 para menos de 5ms.',
        ],
        layout: 'battle-arena',
        rpgQuest: {
          questName: 'Conquista do Topo do Ranking',
          xpValue: 600,
          difficulty: 'Épico',
          bossHp: 1000,
        },
      },
      {
        id: 'cq2',
        type: 'concept_breakdown',
        title: 'Anatomia do Golpe de Velocidade: Otimizações Críticas',
        subtitle: '3 Armas para Reduzir Latência em 85%',
        conceptTitle: 'Táticas de Alto Rendimento',
        contentParagraphs: [
          '1. Cache em Camadas (L1 In-Memory + L2 Redis Cluster).',
          '2. Pool de Conexões assíncrono e Keep-Alive HTTP/2 multiplexado.',
          '3. Serialização zero-copy com Protocol Buffers ou FlatBuffers.',
        ],
        keyTakeaways: [
          'Elimine consultas N+1 com batch loading inteligente.',
          'Evite serializações JSON pesadas no loop crítico.',
          'Aplique rate-limiting com Token Bucket para repelir tempestades de requisições abusivas.',
        ],
        layout: 'battle-arena',
      },
      {
        id: 'cq3',
        type: 'boss_battle',
        title: 'BOSS BATTLE: O Monstro da Latência p99',
        subtitle: 'HP: 10.000 | Fraqueza: Estratégia de Concorrência Não-Bloqueante',
        narrativeText: 'O Monstro da Latência está enfileirando threads e saturando a CPU do servidor com locks sincronizados!',
        contentParagraphs: [
          'Escolha seu golpe certeiro para aplicar 5.000 de dano crítico e salvar o cluster da empresa.',
        ],
        interactiveType: 'decision',
        decisionChoices: [
          {
            id: 'hit1',
            label: 'Golpe de Event Loop Não-Bloqueante (I/O Multiplexing com Epoll/Async)',
            description: 'Liberar as threads do bloqueio de socket e usar filas de eventos assíncronas.',
            outcome: 'GOLPE CRÍTICO! 6.500 de Dano! O consumo de threads despenca de 4.000 para apenas 8 workers de CPU.',
            xpReward: 400,
          },
          {
            id: 'hit2',
            label: 'Adicionar mais 50 instâncias sem alterar o código com lock',
            description: 'Força bruta de hardware (Scale-Up desordenado).',
            outcome: 'Dano Fraco (800 de Dano). Os servidores adicionais apenas colapsam o banco de dados com contenção de locks!',
            xpReward: 100,
          },
        ],
        layout: 'battle-arena',
      },
      {
        id: 'cq4',
        type: 'reward_certificate',
        title: 'Vitória Suprema na Arena',
        subtitle: 'Você conquistou o Troféu Diamante de Performance',
        narrativeText: 'O cluster bateu o recorde de 120.000 RPS com latência média de 3.2 milissegundos.',
        contentParagraphs: [
          'Seu nome foi inscrito no topo da tabela de classificação de Engenheiros de Elite.',
        ],
        layout: 'monumental-card',
      },
    ],
  },

  {
    id: 'deck-socializer-agile-guild',
    title: 'A Guilda dos Times Ágeis e Comunicação Não-Violenta',
    subtitle: 'Como Orquestrar Sinergia, Confiança e Alinhamento em Equipes',
    subject: 'Liderança, Facilitação & Cultura de Equipe',
    targetProfile: 'Socializer',
    rankLevel: 'Guardião',
    themeConfig: BRAIN_HEX_PROFILES.Socializer,
    createdAt: '2026-08-14',
    author: 'TrailUp Guildmasters',
    estimatedMinutes: 8,
    tags: ['Comunicação', 'Equipes', 'Empatia', 'Agile'],
    slides: [
      {
        id: 'so1',
        type: 'cover',
        title: 'A Harmonia da Grande Taverna',
        subtitle: 'Trilha do Bardo: Criando Conexões e Vitórias Coletivas',
        narrativeText: 'Nenhum castelo é erguido por um único guerreiro. A magia mais poderosa é a colaboração sincera entre diferentes talentos.',
        contentParagraphs: [
          'Vamos explorar como transformar grupos de indivíduos em guildas de alta performance movidas por propósito compartilhado e segurança psicológica.',
        ],
        layout: 'monumental-card',
        rpgQuest: {
          questName: 'Pacto da Aliança dos Bardos',
          xpValue: 380,
          difficulty: 'Fácil',
        },
      },
      {
        id: 'so2',
        type: 'peer_collab',
        title: 'Segurança Psicológica: O Solo da Inovação',
        subtitle: 'O famoso estudo do Projeto Aristóteles',
        narrativeText: 'O que faz um time ter sucesso esmagador não é o QI individual dos membros, mas como eles se tratam no dia a dia.',
        contentParagraphs: [
          'Em ambientes onde membros não têm medo de expressar dúvidas, propor ideias ousadas ou admitir erros, a taxa de inovação multiplica.',
          'Quando há segurança psicológica, o feedback deixa de ser uma ameaça e torna-se um presente de crescimento mútuo.',
        ],
        keyTakeaways: [
          'Escuta ativa sem interrupções precipitadas.',
          'Normalização da vulnerabilidade pelo exemplo da liderança.',
          'Foco no problema e no processo, nunca em apontar culpados pessoais.',
        ],
        layout: 'split-character',
      },
      {
        id: 'so3',
        type: 'interactive_challenge',
        title: 'Dinâmica de Diálogo Empático',
        subtitle: 'Resolvendo um conflito de prioridades entre Engenharia e Design',
        contentParagraphs: [
          'Dois integrantes da sua guilda estão em desacordo sobre lançar uma funcionalidade com design simplificado ou adiar o prazo para refinar a experiência.',
        ],
        interactiveType: 'quiz',
        quiz: {
          question: 'Como líder facilitador, qual pergunta você faz para gerar alinhamento construtivo entre ambas as partes?',
          options: [
            {
              id: 'q1',
              text: '"Qual o impacto direto para o usuário final em cada uma dessas alternativas e como podemos fatiar em duas entregas incrementais com valor real?"',
              isCorrect: true,
              explanation: 'Excelente! Essa pergunta redireciona o foco para o cliente e incentiva a co-criação de um compromisso incremental positivo.',
            },
            {
              id: 'q2',
              text: '"Quem tiver mais tempo de casa decide e os outros acatam sem reclamar."',
              isCorrect: false,
              explanation: 'Argumento de autoridade prejudica a segurança psicológica e destrói o engajamento do time.',
            },
            {
              id: 'q3',
              text: '"Ignorem a conversa e façam um sorteio na moeda."',
              isCorrect: false,
              explanation: 'Falta de critério racional e empático gera frustração em ambos os lados.',
            },
          ],
        },
        layout: 'parchment-scroll',
      },
      {
        id: 'so4',
        type: 'epic_conclusion',
        title: 'A Celebração do Banquete Real',
        subtitle: 'Um brinde às amizades e aprendizados construídos juntos',
        narrativeText: 'A guilda agora compartilha uma linguagem comum de empatia, clareza e apoio mútuo.',
        contentParagraphs: [
          'Leve este espírito colaborativo para cada reunião de retrospectiva, pair programming e daily do seu time.',
        ],
        layout: 'monumental-card',
      },
    ],
  },

  {
    id: 'deck-daredevil-devops-fire',
    title: 'Deploy em Produção sem Medo: O Fogo do DevOps Ágil',
    subtitle: 'Pipelines Eletrizantes, Feature Flags e Chaos Engineering',
    subject: 'DevOps & Engenharia de Confiabilidade (SRE)',
    targetProfile: 'Daredevil',
    rankLevel: 'Guardião',
    themeConfig: BRAIN_HEX_PROFILES.Daredevil,
    createdAt: '2026-08-14',
    author: 'TrailUp Fire Squad',
    estimatedMinutes: 7,
    tags: ['DevOps', 'Ação', 'CI/CD', 'Chaos Engineering'],
    slides: [
      {
        id: 'dd1',
        type: 'cover',
        title: 'Deploy na Sexta-feira: A Dança com o Fogo',
        subtitle: 'Trilha do Piromante Ousado: Velocidade com Redes de Proteção Ativas',
        narrativeText: 'Quem tem medo de produção não conhece o poder dos canários e dos feature toggles automatizados!',
        contentParagraphs: [
          'Deploys não devem ser eventos solenes e aterrorizantes a cada 3 meses. Deploys devem ocorrer 30 vezes ao dia em minutos.',
          'Prepare-se para acelerar fundo no pipeline de entrega contínua.',
        ],
        layout: 'battle-arena',
        rpgQuest: {
          questName: 'Sobrevivência ao Fogo da Produção',
          xpValue: 450,
          difficulty: 'Difícil',
        },
      },
      {
        id: 'dd2',
        type: 'concept_breakdown',
        title: 'Estratégia Canário: Testando no Calor Real',
        subtitle: 'Roteamento de 2% do tráfego para a nova versão',
        conceptTitle: 'Arquitetura de Canary Release',
        contentParagraphs: [
          'Em vez de arriscar 100% dos usuários em uma virada brusca, o tráfego é direcionado gradualmente.',
          'Métricas de telemetria analisam a taxa de erro HTTP 5xx em tempo real.',
        ],
        keyTakeaways: [
          'Se a taxa de erro subir 0.1%, rollback automático em 15 segundos.',
          'Testes de carga sob tráfego real trazem insights impossíveis de simular em homologação.',
          'Feature flags permitem ligar e desligar módulos instantaneamente sem novo build.',
        ],
        layout: 'split-character',
      },
      {
        id: 'dd3',
        type: 'interactive_challenge',
        title: 'Decisão Relâmpago: Teste do Chaos Monkey',
        subtitle: 'Você acidentalmente desligou 30% dos pods de autenticação!',
        contentParagraphs: [
          'O alarme de saturação está tocando! O que você faz nos próximos 20 segundos?',
        ],
        interactiveType: 'decision',
        decisionChoices: [
          {
            id: 'c1',
            label: 'Ativar o Circuit Breaker no Gateway e permitir fallback com tokens JWT em cache local',
            description: 'Cortar a cascata de falhas e degradar graciosamente o serviço.',
            outcome: 'INCRÍVEL! Tempo de reação de 4 segundos! Os usuários continuam logados sem notar a falha.',
            xpReward: 350,
          },
          {
            id: 'c2',
            label: 'Reiniciar manualmente o servidor inteiro torcendo para subir rápido',
            description: 'Tentativa desesperada no escuro.',
            outcome: 'COLAPSO! O reboot em massa criou uma avalanche de reconexões que derrubou o banco de dados.',
            xpReward: 50,
          },
        ],
        layout: 'battle-arena',
      },
      {
        id: 'dd4',
        type: 'epic_conclusion',
        title: 'Mestre da Velocidade e do Fogo',
        subtitle: 'Você domou as labaredas da entrega contínua',
        narrativeText: 'Velocidade sem medo só é possível com automação impiedosa e monitoramento proativo.',
        contentParagraphs: [
          'Agora você está pronto para conduzir deploys com a ousadia e segurança de um verdadeiro piromante.',
        ],
        layout: 'monumental-card',
      },
    ],
  },

  {
    id: 'deck-survivor-resilience',
    title: 'A Fortaleza Inabalável: Resiliência e Prevenção de Crises',
    subtitle: 'Padrões de Sobrevivência para Sistemas e Pessoas',
    subject: 'Confiabilidade, Gestão de Riscos & Continuidade de Negócios',
    targetProfile: 'Survivor',
    rankLevel: 'Mestre',
    themeConfig: BRAIN_HEX_PROFILES.Survivor,
    createdAt: '2026-08-14',
    author: 'TrailUp Monks of the Shield',
    estimatedMinutes: 9,
    tags: ['Resiliência', 'Checkpoints', 'Prevenção', 'Backup'],
    slides: [
      {
        id: 'sv1',
        type: 'cover',
        title: 'A Rocha que Resiste à Tempestade',
        subtitle: 'Trilha do Monge Guardião: Construindo Escudos Inquebráveis',
        narrativeText: 'Tempestades virão. Falhas de disco ocorrerão. Servidores cairão. A vitória pertence aos que preparam a fortaleza com antecedência.',
        contentParagraphs: [
          'A verdadeira maestria não está em fingir que nada vai dar errado, mas em garantir que quando tudo falhar, seu sistema permaneça de pé.',
        ],
        layout: 'parchment-scroll',
        rpgQuest: {
          questName: 'Defesa da Fortaleza Eterna',
          xpValue: 420,
          difficulty: 'Médio',
        },
      },
      {
        id: 'sv2',
        type: 'concept_breakdown',
        title: 'Padrão Bulkhead (Compartimentalização Estanque)',
        subtitle: 'Inspirado nos cascos blindados dos navios antigos',
        conceptTitle: 'Isolamento de Recursos Críticos',
        contentParagraphs: [
          'Se um compartimento do navio for perfurado pela água, as comportas de aço selam apenas aquela área, impedindo o naufrágio completo.',
          'Em software, usamos pools de threads e limites de memória separados para cada serviço crítico.',
        ],
        keyTakeaways: [
          'A lentidão no módulo de recomendação de produtos nunca deve travar a finalização da compra no carrinho.',
          'Defina Timeouts rigorosos em todas as chamadas externas de rede.',
          'Use Retry com Exponential Backoff e Jitter para não sobrecarregar serviços em recuperação.',
        ],
        layout: 'split-character',
      },
      {
        id: 'sv3',
        type: 'checklist_quest',
        title: 'Checklist da Fortaleza: Plano de Contingência',
        subtitle: 'Validação passo a passo para proteção total',
        contentParagraphs: [
          'Confirme cada camada de salvaguarda da sua infraestrutura.',
        ],
        checklist: [
          { id: 's1', text: 'Backups diários automatizados com restauração testada mensalmente', completed: false, xp: 90 },
          { id: 's2', text: 'Circuit Breakers configurados com fallback gracioso para serviços terceiros', completed: false, xp: 100 },
          { id: 's3', text: 'Health checks com alertas proativos antes da saturação de disco ou CPU', completed: false, xp: 110 },
          { id: 's4', text: 'Procedimento documentado de Disaster Recovery (RTO e RPO claros)', completed: false, xp: 120 },
        ],
        layout: 'parchment-scroll',
      },
      {
        id: 'sv4',
        type: 'reward_certificate',
        title: 'Santuário Protegido com Sucesso',
        subtitle: 'Você conquistou o Escudo do Guardião Supremo',
        narrativeText: 'Nenhuma falha inesperada poderá romper as muralhas que você ergueu com prudência e rigor técnico.',
        contentParagraphs: [
          'Sua paciência e disciplina asseguram a perenidade do conhecimento e dos dados.',
        ],
        layout: 'monumental-card',
      },
    ],
  },
];

export const PRESET_DECKS: DeckData[] = RAW_PRESET_DECKS.map(enrichDeckWithInteractiveElements);

