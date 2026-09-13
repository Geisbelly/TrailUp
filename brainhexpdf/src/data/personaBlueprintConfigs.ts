import { BrainHexType } from '../types';

export interface PersonaBlueprintPreset {
  id: string;
  label: string;
  desc: string;
  specificDirective: string;
}

export interface PersonaBlueprintConfig {
  profile: BrainHexType;
  title: string;
  badge: string;
  focusHighlight: string;
  pedagogicalModel: string;
  structureSummary: string[];
  endingVariations: string[];
  presets: PersonaBlueprintPreset[];
  geminiPersonaPrompt: string;
}

export const PERSONA_BLUEPRINT_CONFIGS: Record<BrainHexType, PersonaBlueprintConfig> = {
  Daredevil: {
    profile: 'Daredevil',
    title: 'Operação Tática & Drills de Crise',
    badge: 'Missões Críticas & Ação Imediata',
    focusHighlight: 'Drills de Resposta a Incidentes, Missões Táticas de Campo e Decisões Rápidas sob Fogo',
    pedagogicalModel: 'Scenario-Based Immersion & Rapid Tactical Drills',
    structureSummary: [
      'Capa Operacional com Alerta de Risco, Nível de Ameaça & Regras de Engajamento',
      'Telemetria Crítica & Indicadores Iminentes (Métricas de Gatilho e Choque)',
      'Missão de Campo #1: Protocolo de Intervenção Rápida (Checklist Quest com XP)',
      'Missão de Campo #2: Dilema Tático sob Fogo / Bifurcação de Incidente (Decision Branch)',
      'Regras de Ouro & Táticas de Sobrevivência Operacional (Concept Breakdown Direto)',
      'Missão de Campo #3: Drill de Teste de Reflexos e Diagnóstico de Precisão (Interactive Challenge)',
      'Cadeia de Reação Tática & Cronômetro de Contenção (Timeline Process de Velocidade)',
      'Missão de Campo #4: Protocolo de Encerramento e Debriefing Tático de Pós-Incidente (Checklist Quest)',
      'Desfecho Dinâmico: Condecoração de Prontidão Operacional, Protocolo de Emergência ou Debriefing Pós-Crise (Epic Conclusion / Reward Certificate)',
    ],
    endingVariations: [
      'Condecoração de Prontidão Operacional com Diretrizes de Ação Contínua',
      'Protocolo de Resposta de Emergência Gravado no Manual de Campo',
      'Debriefing Tático Pós-Crise com Métricas de Tempo de Resposta',
      'Certificado de Intervenção de Choque e Domínio sob Pressão',
    ],
    presets: [
      {
        id: 'daredevil-incident-drill',
        label: 'Missão Tática Zero-Hour: Resposta a Incidentes & Drills de Crise',
        desc: 'Foco total em simulações de alta pressão, múltiplas missões práticas de campo e tomadas de decisão imediatas.',
        specificDirective: 'Gere pelo menos 4 missões práticas desafiadoras (checklist_quest, decision_branch, interactive_challenge) simulando cenários de crise e incidentes reais baseados nos termos técnicos do conteúdo. Zero teoria passiva.',
      },
      {
        id: 'daredevil-rapid-action',
        label: 'Desafio de Alta Velocidade & Ação Prática Direta',
        desc: 'Ritmo acelerado com tarefas acionáveis, checklists de execução tática e regras de ouro de implementação imediata.',
        specificDirective: 'Estruture o conteúdo como um manual de campo de intervenção rápida, com alta recompensa de XP e missões operacionais acionáveis extraídas da matéria.',
      },
      {
        id: 'daredevil-field-missions',
        label: 'Gauntlet de Missões de Campo & Reflexos Críticos',
        desc: 'Múltiplas bifurcações de decisão tática e testes de reflexo com penalidades e recompensas instantâneas.',
        specificDirective: 'Foque em dilemas de bifurcação sob estresse (decision_branch) e desafios de diagnóstico relâmpago (interactive_challenge).',
      },
    ],
    geminiPersonaPrompt: `
DIRETRIZ RESTRITA PARA O PERFIL DAREDEVIL (OUSADO):
1. ESTRUTURA DE MISSÕES E AÇÃO IMEDIATA:
   - Proibido qualquer parágrafo de teoria passiva abstrata ou introduções burocráticas.
   - A apresentação DEVE conter múltiplos slides de missões e desafios acionáveis (> 8 slides: no mínimo 9 a 12 slides com pura prática e imersão).
   - Use linguagem eletrizante de comando tático ("Alerta Código Vermelho", "Protocolo de Intervenção", "Regras de Engajamento", "Debriefing de Campo").
   - Todos os conceitos devem ser ensinados através da resolução direta de incidentes e tarefas práticas conectadas aos dados do conteúdo.
   - Encerramento dinâmico adaptado ao enredo (sem repetir sempre o mesmo desfecho).
`,
  },

  Mastermind: {
    profile: 'Mastermind',
    title: 'Códice de Axiomas & Lore Sistêmico',
    badge: 'Lore Contemplativo & Primeiros Princípios',
    focusHighlight: 'Engenharia de Sistemas a partir de Primeiros Princípios, Axiomas Fundamentais, Códices de Lore e Trade-Offs Complexos',
    pedagogicalModel: 'First-Principles Systems Engineering & Mental Models',
    structureSummary: [
      'Capa com Tese Central, Axioma Primário do Sistema e Diagramação Estrutural de Camadas',
      'Códice Arcano #1: O Lore Filosófico e Leis Invariantes que Regem o Sistema (Deep Lore com Secret Lore)',
      'Decomposição Anatômica e Taxonomia de Módulos (Bento Grid com Interfaces e Contratos)',
      'Engenharia de Primeiros Princípios & Formalismo Lógico (Concept Breakdown com Code Snippets)',
      'Matriz Rigorosa de Trade-Offs (Comparison Grid: Latência vs Consistência, Acoplamento vs Complexidade)',
      'Códice Arcano #2: Casos de Borda, Segredos Ocultos da Infraestrutura e Invariantes (Deep Lore com Secret Lore)',
      'Árvore de Decisão Estratégica & Impactos Sistêmicos Colaterais (Decision Branch com Ramificações)',
      'Desafio de Raciocínio Sistêmico & Decisão Arquitetural (Interactive Challenge com Justificativas)',
      'Desfecho Dinâmico: Síntese de Princípios Imutáveis, Matriz de Teoremas do Futuro ou Desafio Aberto de Otimização (Epic Conclusion / Bento Cards)',
    ],
    endingVariations: [
      'Síntese de Leis Fundamentais Imutáveis para Arquiteturas Duradouras',
      'Epílogo Arquitetural com Teoremas e Axiomas do Futuro',
      'Matriz de Trade-Offs Estruturais de Longo Prazo',
      'Desafio Aberto de Otimização e Refatoração Sistêmica',
    ],
    presets: [
      {
        id: 'mastermind-deep-lore',
        label: 'Códice de Axiomas & Lore Arquitetural Profundo',
        desc: 'Foco em seções contemplativas de lore, axiomas fundamentais, desconstrução teórica rigorosa e segredos de sistema.',
        specificDirective: 'Gere seções contemplativas de lore profundo (deep_lore com secretLore), desconstruindo o problema a partir de primeiros princípios e teoremas fundamentais do conteúdo.',
      },
      {
        id: 'mastermind-tradeoffs-matrix',
        label: 'Análise Rigorosa de Trade-Offs & Modelos Mentais',
        desc: 'Foco em matrizes de comparação técnica minuciosa, árvores de decisão arquiteturais e análise de custo-benefício sistêmico.',
        specificDirective: 'Enfatize matrizes comparativas detalhadas (comparison_grid) e ramificações arquiteturais complexas (decision_branch).',
      },
      {
        id: 'mastermind-systemic-laws',
        label: 'Decifração de Leis Fundamentais & Invariantes de Engenharia',
        desc: 'Foco em código de baixo nível, algoritmos, fluxogramas de dados e padrões avançados de escalabilidade.',
        specificDirective: 'Inclua snippets de código técnicos e fluxos formais de dados em concept_breakdown, com keyTakeaways aprofundados extraídos da matéria.',
      },
    ],
    geminiPersonaPrompt: `
DIRETRIZ RESTRITA PARA O PERFIL MASTERMIND (ESTRATEGISTA):
1. ESTRUTURA DE LORE CONTEMPLATIVO E MODELOS MENTAIS:
   - Proibido abordagens superficiais ou tutoriais operacionais rasos.
   - A apresentação DEVE conter seções de lore profundo e contemplativo (> 8 slides: no mínimo 9 a 13 slides densos com deep_lore e secretLore revelável contendo verdades conceituais ocultas).
   - Ensine através de primeiros princípios, teoremas e relações rigorosas de causa-efeito.
   - Forneça matrizes aprofundadas de trade-offs (comparison_grid) e árvores de decisão estratégica (decision_branch).
   - Encerramento dinâmico adaptado ao enredo filosófico do sistema.
`,
  },

  Seeker: {
    profile: 'Seeker',
    title: 'Expedição Investigativa & Segredos Arcanos',
    badge: 'Investigação, Origens & Easter Eggs',
    focusHighlight: 'Dossiês de Origens Históricas, Mapas de Exploração, Curiosidades Fascinantes e Pistas Arcanas',
    pedagogicalModel: 'Inquiry-Based Discovery & Epistemological Dossiers',
    structureSummary: [
      'Capa com Enigma Central da Expedição e Cartografia Inicial do Saber',
      'As Origens Ocultas e Dossiê Histórico da Gênese do Problema (Deep Lore com Secret Lore)',
      'A Trilha da Evolução e Grandes Descobertas Históricas (Timeline Process Cronológica)',
      'Cartografia do Saber, Curiosidades Fascinantes & Territórios Inexplorados (Bento Cards)',
      'Desconstrução Anatômica do Mecanismo Revelado (Concept Breakdown com Analogias)',
      'O Conhecido Tradicional vs As Novas Fronteiras e Paradigmas Emergentes (Comparison Grid)',
      'Trilha de Pistas Arcanas e Revelação de Segredos Ocultos da Infraestrutura (Deep Lore)',
      'Desafio Investigativo: Decifração de Enigma de Campo & Easter Eggs (Interactive Challenge)',
      'Desfecho Dinâmico: Epílogo da Grande Expedição, Cartografia de Novos Horizontes ou Manifesto do Explorador (Epic Conclusion / Bento Cards)',
    ],
    endingVariations: [
      'Epílogo da Grande Expedição e Horizontes Inexplorados',
      'Cartografia de Novos Territórios com Dossiê de Recursos Ocultos',
      'Manifesto do Conhecimento Contínuo e Espírito Investigativo',
      'Dossiê de Próximos Mistérios a Decifrar no Campo',
    ],
    presets: [
      {
        id: 'seeker-investigation-lore',
        label: 'Expedição Investigativa & Descoberta de Lore Oculto',
        desc: 'Foco em investigar as origens, evolução histórica e fatos surpreendentes por trás dos conceitos.',
        specificDirective: 'Estruture como uma expedição de descobertas com dossiês históricos (deep_lore), pistas enigmáticas e revelação de mecanismos ocultos.',
      },
      {
        id: 'seeker-archeology-dossier',
        label: 'Dossiê Arqueológico & Origens Históricas dos Conceitos',
        desc: 'Linhas do tempo evolutivas e desconstrução das motivações que deram origem a cada padrão.',
        specificDirective: 'Enfatize a linha do tempo histórica (timeline_process) e as curiosidades fascinantes em bento_cards.',
      },
      {
        id: 'seeker-clues-trail',
        label: 'Trilha de Pistas, Enigmas & Descoberta de Easter Eggs',
        desc: 'Desafios investigativos onde o usuário desvenda segredos conectando pontos aparentemente desconexos.',
        specificDirective: 'Inclua quizzes investigativos com easter eggs (interactive_challenge) e segredos reveláveis (secretLore).',
      },
    ],
    geminiPersonaPrompt: `
DIRETRIZ RESTRITA PARA O PERFIL SEEKER (EXPLORADOR):
1. ESTRUTURA DE INVESTIGAÇÃO E DESCOBERTA:
   - Estruture como uma grande expedição investigativa de conhecimento (> 8 slides: no mínimo 9 a 12 slides).
   - Inclua dossiês de origens históricas em 'deep_lore', linhas do tempo evolutivas em 'timeline_process' e pistas com easter eggs em 'interactive_challenge'.
   - Desperte a curiosidade intelectual com fatos ocultos e conexões interdisciplinares do material.
   - Encerramento dinâmico variado de acordo com o mistério explorado.
`,
  },

  Conqueror: {
    profile: 'Conqueror',
    title: 'Gauntlet de Combate & Boss Battle',
    badge: 'Alta Intensidade & Superação de Gargalos',
    focusHighlight: 'Combate a Gargalos Críticos, Arsenal Tático, Benchmarks de Alta Performance e Batalha contra Boss',
    pedagogicalModel: 'Deliberate Practice & High-Stakes Combat Gauntlets',
    structureSummary: [
      'Capa com Alerta de Missão de Guerra, Boss da Trilha e Declaração de Supremacia',
      'Análise do Adversário e Métricas Críticas de Gargalo (Stats Metrics com KPIs de Pressão)',
      'Arsenal Tático: Fraquezas dos Concorrentes vs Armas e Contramedidas de Domínio (Comparison Grid)',
      'Táticas de Ataque e Manobras de Domínio Operacional (Concept Breakdown)',
      'Fases de Cerco & Estratégia de Avanço Inabalável (Timeline Process de Ofensiva)',
      'Protocolo de Superação e Blitzkrieg Operacional (Checklist Quest com XP Alto)',
      'Gauntlet de Domínio Tático & Eliminação de Gargalos (Interactive Challenge)',
      'Confronto Final contra o Chefe de Conhecimento (Boss Battle com 1000+ HP e Cálculo de Dano)',
      'Desfecho Dinâmico: Celebração da Vitória e Troféu Imperial, Estandarte de Conquista ou Debriefing de Combate (Epic Conclusion / Reward Certificate)',
    ],
    endingVariations: [
      'Troféu Imperial de Domínio com Estandarte de Vitória Incontestável',
      'Ordem de Marcha e Expansão de Território Conquistado',
      'Debriefing de Combate de Alta Performance e Eficiência Máxima',
      'Condecoração Militar de Supremacia Técnica',
    ],
    presets: [
      {
        id: 'conqueror-boss-battle',
        label: 'Gauntlet de Combate & Batalha Épica contra Boss',
        desc: 'Foco em superação de gargalos extremos e confronto épico com Boss Battle interativa.',
        specificDirective: 'Inclua um slide dedicado de Boss Battle (boss_battle) com bossHp de 1000 a 1500 HP, ataques táticos e cálculo de dano.',
      },
      {
        id: 'conqueror-performance-benchmarks',
        label: 'Superação de Gargalos Críticos & Benchmarks de Alta Performance',
        desc: 'Foco em métricas comparativas agressivas, eliminação de gargalos e dominância de mercado.',
        specificDirective: 'Enfatize métricas de alta performance (stats_metrics) e arsenal tático de ataque (comparison_grid).',
      },
      {
        id: 'conqueror-tactical-arsenal',
        label: 'Arsenal Tático & Duelo de Otimização Extrema',
        desc: 'Mapeamento de fraquezas de sistemas concorrentes e táticas de domínio técnico irrefutável.',
        specificDirective: 'Foque em contramedidas estratégicas e checklists de alta intensidade operacional.',
      },
    ],
    geminiPersonaPrompt: `
DIRETRIZ RESTRITA PARA O PERFIL CONQUEROR (CONQUISTADOR):
1. ESTRUTURA DE COMBATE E ALTA PERFORMANCE:
   - Tom épico, competitivo, enérgico e focado em superação de limites (> 8 slides: no mínimo 9 a 12 slides).
   - OBRIGATÓRIO conter um confronto épico [boss_battle] com bossHp de 1000 a 1500 HP e desafios táticos.
   - Mapeie fraquezas e gargalos técnicos reais do conteúdo como adversários a serem esmagados com maestria.
   - Encerramento dinâmico com celebração de conquista e troféu temático.
`,
  },

  Achiever: {
    profile: 'Achiever',
    title: 'Trilha de Metas 100% & Certificação de Maestria',
    badge: 'Scorecards de KPIs & Marcos Conclusivos',
    focusHighlight: 'Roadmaps Metódicos de Execução, Scorecards Quantitativos, Checklists com XP e Certificado de Excelência',
    pedagogicalModel: 'Goal-Driven Progression & Competency-Based Milestones',
    structureSummary: [
      'Capa de Alto Impacto com Missão Estratégica, Metas Mensuráveis e XP Total',
      'Painel de Indicadores e Scorecard de KPIs (Stats Metrics com Metas Quantitativas)',
      'Roadmap Metódico de Execução em Fases Sequenciais (Timeline Process Numerada)',
      'Pilares Fundamentais e Entregáveis Tangíveis (Bento Cards com Critérios de Aceitação)',
      'Decomposição Modular e Padrões de Qualidade (Concept Breakdown com Key Takeaways)',
      'Matriz de Eficiência e Boas Práticas vs Desvios de Metas (Comparison Grid)',
      'Checklist de Execução Prática e Validação no Mundo Real (Checklist Quest com XP por Item)',
      'Simulação de Validação de Competência e Precisão (Interactive Challenge com Feedback)',
      'Desfecho Dinâmico: Certificado Formal de Maestria 100%, Scorecard de Validação Prática ou Plano de Ação Imediato (Reward Certificate / Epic Conclusion)',
    ],
    endingVariations: [
      'Certificado Formal de Maestria 100% com Selo de Honra do Cavaleiro Solar',
      'Scorecard Final de Validação Prática e Entrega de Competências',
      'Plano de Ação Tático para Aplicação Imediata no Trabalho',
      'Selo de Excelência e Conformidade Operacional',
    ],
    presets: [
      {
        id: 'achiever-mastery-certification',
        label: 'Trilha de Metas 100% & Certificação de Maestria',
        desc: 'Foco em progressão clara, 100% de conclusão, badges de progresso e emissão de certificado final.',
        specificDirective: 'Estruture como uma trilha metódica de competências com scorecard de KPIs (stats_metrics), checklist com XP e certificado formal (reward_certificate).',
      },
      {
        id: 'achiever-kpi-roadmap',
        label: 'Scorecard de KPIs & Roadmap Metódico de Execução',
        desc: 'Foco em métricas quantificáveis, cronograma passo-a-passo e critérios rigorosos de aceitação.',
        specificDirective: 'Enfatize o roadmap cronológico de execução (timeline_process) e os marcos de entrega tangíveis.',
      },
      {
        id: 'achiever-structured-checklist',
        label: 'Checklists Estruturados & Validação de Competências',
        desc: 'Múltiplas listas de checagem práticas e simulação de validação de entregas com pontuação.',
        specificDirective: 'Foque em checklists granulares (checklist_quest) com pontuações detalhadas de XP para cada tarefa.',
      },
    ],
    geminiPersonaPrompt: `
DIRETRIZ RESTRITA PARA O PERFIL ACHIEVER (REALIZADOR):
1. ESTRUTURA DE METAS E PROGRESSO 100%:
   - Tom estruturado, objetivo, altamente organizado e focado em metas tangíveis (> 8 slides: no mínimo 9 a 13 slides).
   - OBRIGATÓRIO incluir painel de KPIs [stats_metrics], roadmap sequencial de etapas [timeline_process], checklist com XP [checklist_quest] e desfecho conclusivo de maestria.
   - Encerramento dinâmico com variação de formato (certificado, scorecard ou plano de ação).
`,
  },

  Socializer: {
    profile: 'Socializer',
    title: 'Assembleia da Guilda & Casos Humanos',
    badge: 'Inteligência Coletiva & Estudos de Caso',
    focusHighlight: 'Histórias Centradas em Pessoas, Casos de Estudo com Personagens, Mural de Notas Adesivas e Pactos de Guilda',
    pedagogicalModel: 'Collaborative Constructivism & Narrative Case Studies',
    structureSummary: [
      'Capa da Assembleia da Guilda, Chamado à Cooperação e Propósito Compartilhado',
      'O Fator Humano e Estudos de Caso com Personagens Reais (Concept Breakdown Narrativo)',
      'Mural Colaborativo de Ideias e Destaques Coletivos (Scrapbook Tape com Sticky Notes)',
      'Jornada da Construção Coletiva e Rituais de Equipe (Timeline Process)',
      'Decisão Individualista Isolada vs Inteligência Coletiva da Guilda (Comparison Grid)',
      'Práticas de Comunicação Transparente, Escuta Ativa e Inclusão (Concept Breakdown)',
      'Dilema Ético e Consenso de Equipe (Decision Branch Focado em Pessoas e Cultura)',
      'Desafio Coletivo de Guilda e Decisão Ético-Colaborativa (Interactive Challenge)',
      'Desfecho Dinâmico: Pacto de Aliança da Guilda e Honraria Formal, Roda de Saberes ou Mural de Legado (Reward Certificate / Epic Conclusion / Bento Cards)',
    ],
    endingVariations: [
      'Pacto de Aliança da Guilda e Honraria aos Membros Colaboradores',
      'Manifesto da Comunidade de Aprendizes e Cultura Coletiva',
      'Mural de Legado Coletivo com Compromissos Compartilhados',
      'Roda de Saberes e Troca de Experiências Práticas',
    ],
    presets: [
      {
        id: 'socializer-guild-assembly',
        label: 'Assembleia da Guilda & Mural de Casos Humanos',
        desc: 'Foco em empatia, histórias com personagens reais, mural de notas adesivas e construção coletiva.',
        specificDirective: 'Estruture como uma assembleia colaborativa com estudos de caso humanos, notas adesivas (scrapbook-tape, stickyNote) e pacto de guilda.',
      },
      {
        id: 'socializer-team-decision',
        label: 'Dinâmica Coletiva & Tomada de Decisão Ética em Equipe',
        desc: 'Foco em alinhamento cultural, inteligência interpessoal e resolução conjunta de dilemas complexos.',
        specificDirective: 'Enfatize tomadas de decisão orientadas a pessoas (decision_branch) e papéis complementares no time (bento_cards).',
      },
      {
        id: 'socializer-collaborative-wall',
        label: 'Mural Colaborativo de Ideias & Sinergia de Talentos',
        desc: 'Mural visual com notas de brainstorming, reflexões compartilhadas e rituais de aprendizado em grupo.',
        specificDirective: 'Foque no mural de notas adesivas e na jornada de construção mútua de soluções.',
      },
    ],
    geminiPersonaPrompt: `
DIRETRIZ RESTRITA PARA O PERFIL SOCIALIZER (SOCIÁVEL):
1. ESTRUTURA DE COLABORAÇÃO E HISTÓRIAS HUMANAS:
   - Tom caloroso, acolhedor, dialógico e centrado nas pessoas (> 8 slides: no mínimo 9 a 12 slides).
   - OBRIGATÓRIO incluir estudos de caso com personagens reais, mural de notas adesivas colaborativas [thematicFrame: 'scrapbook-tape', stickyNote] e dilemas éticos de equipe [decision_branch].
   - Encerramento dinâmico celebrando a força coletiva e o impacto humano.
`,
  },

  Survivor: {
    profile: 'Survivor',
    title: 'Manual de Sobrevivência & Blindagem Antifrágil',
    badge: 'Engenharia de Resiliência & Mitigação de Riscos',
    focusHighlight: 'Manuais de Sobrevivência, Mapeamento de Vetores de Falha, Protocolos de Contenção e Blindagem Antifrágil',
    pedagogicalModel: 'Resilience Engineering & Antifragile Risk-Mitigation',
    structureSummary: [
      'Capa com Manual de Sobrevivência e Diretriz de Blindagem Operacional',
      'Mapeamento de Vetores de Falha e Vulnerabilidades Críticas (Bento Cards de Riscos e SPOF)',
      'Protocolo Passo a Passo de Contenção e Mitigação de Incidentes (Timeline Process)',
      'Engenharia de Resiliência, Defesa em Profundidade e Circuit Breakers (Concept Breakdown)',
      'Sistema Frágil vs Sistema Resiliente e Antifrágil (Comparison Grid)',
      'Checklist de Auditoria de Continuidade e Salvaguardas Protegidas (Checklist Quest)',
      'Simulação de Falha Catastrófica e Rota Segura de Contingência (Decision Branch)',
      'Quiz de Auditoria de Vulnerabilidade & Blindagem de Risco (Interactive Challenge)',
      'Desfecho Dinâmico: Certificado de Fortaleza Blindada, Livro de Salvaguardas ou Plano de Continuidade Inquebrável (Reward Certificate / Epic Conclusion)',
    ],
    endingVariations: [
      'Certificado de Fortaleza Blindada com Selo de Antifragilidade Eterna',
      'Livro de Salvaguardas Permanentes e Defesas Ativas',
      'Matriz de Tolerância a Falhas e Recuperação Instantânea',
      'Plano de Continuidade Operacional Inquebrável para Produção',
    ],
    presets: [
      {
        id: 'survivor-resilience-manual',
        label: 'Manual de Sobrevivência & Blindagem Antifrágil',
        desc: 'Foco em mapeamento de riscos, salvaguardas redundantes, eliminação de pontos únicos de falha e continuidade.',
        specificDirective: 'Estruture como um manual de sobrevivência operacional com mapeamento de vetores de falha, matrizes antifrágeis e planos de contingência baseados no conteúdo.',
      },
      {
        id: 'survivor-containment-protocols',
        label: 'Protocolo de Contenção de Falhas & Rotas de Contingência',
        desc: 'Foco em passos metódicos de resposta a desastres, isolamento de problemas e recuperação segura.',
        specificDirective: 'Enfatize procedimentos passo-a-passo de contenção (timeline_process) e árvores seguras de contingência (decision_branch).',
      },
      {
        id: 'survivor-defense-in-depth',
        label: 'Defesa em Profundidade & Eliminação de Pontos Únicos de Falha',
        desc: 'Análise minuciosa de resiliência estrutural, redundâncias ativas e auditorias contínuas de segurança.',
        specificDirective: 'Foque em comparações de fragilidade vs antifragilidade (comparison_grid) e checklists de auditoria de continuidade.',
      },
    ],
    geminiPersonaPrompt: `
DIRETRIZ RESTRITA PARA O PERFIL SURVIVOR (SOBREVIVENTE):
1. ESTRUTURA DE RESILIÊNCIA E BLINDAGEM OPERACIONAL:
   - Tom vigilante, cauteloso, encorajador e focado em segurança duradoura (> 8 slides: no mínimo 9 a 12 slides).
   - OBRIGATÓRIO incluir mapeamento de vetores de falha [bento_cards], protocolos de contenção de incidentes [timeline_process], comparação frágil vs antifrágil [comparison_grid] e salvaguardas protegidas.
   - Encerramento dinâmico com certificado de blindagem ou livro de salvaguardas.
`,
  },
};

export function getPersonaBlueprint(profile: BrainHexType): PersonaBlueprintConfig {
  return PERSONA_BLUEPRINT_CONFIGS[profile] || PERSONA_BLUEPRINT_CONFIGS.Achiever;
}
