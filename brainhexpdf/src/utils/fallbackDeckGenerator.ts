import { DeckData, SlideData, BrainHexType, ThemeConfig } from '../types';
import { BRAIN_HEX_PROFILES } from '../data/brainHexProfiles';
import { enrichDeckWithInteractiveElements } from './interactiveElementGenerator';

/**
 * Intelligent content extractor to pull real paragraphs, keywords, concepts and code
 * from source text so that even local fallback decks are deeply aligned with the source.
 */
function extractContentSnippets(sourceText: string, topic: string) {
  const clean = (sourceText || '').trim();
  const paragraphs = clean
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\r/g, '').trim())
    .filter((p) => p.length > 20);

  const lines = clean
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 10 && !l.startsWith('#'));

  const words = clean
    .replace(/[^\w\s\u00C0-\u00FF]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 5);

  const uniqueKeywords = Array.from(new Set(words)).slice(0, 15);

  return {
    hasSource: clean.length > 30,
    paragraphs: paragraphs.length > 0 ? paragraphs : [clean || `Estudo aprofundado sobre ${topic}.`],
    lines: lines.length > 0 ? lines : [`Fundamentos essenciais de ${topic}.`],
    keywords: uniqueKeywords.length > 0 ? uniqueKeywords : [topic, 'Arquitetura', 'Metodologia', 'Inovação', 'Prática'],
  };
}

/**
 * Generates an immersive, pedagogical deck with at least 9 to 11 slides
 * tailored to each BrainHex profile and directly grounded in the provided content.
 */
export function generateClientFallbackDeck(
  topic: string,
  profile: BrainHexType,
  rank: 'Novato' | 'Aprendiz' | 'Guardião' | 'Mestre' | 'Ancião',
  count: number = 9,
  sourceTextSnippet: string = ''
): DeckData {
  const theme: ThemeConfig = BRAIN_HEX_PROFILES[profile] || BRAIN_HEX_PROFILES.Achiever;
  const content = extractContentSnippets(sourceTextSnippet, topic);
  const p = content.paragraphs;
  const kw = content.keywords;

  const getP = (idx: number, fallback: string) => p[idx % p.length] || fallback;
  const effectiveTopic = topic || kw[0] || 'Material Educacional';

  let slides: SlideData[] = [];

  switch (profile) {
    case 'Achiever':
      slides = [
        {
          id: 's1',
          type: 'cover',
          subtopic: 'Alinhamento Estratégico',
          layout: 'monumental-card',
          title: `${effectiveTopic}: Plano de Metas & Maestria Total`,
          subtitle: `Trilha de Competências • Rank ${rank} • Arquétipo ${theme.archetype}`,
          narrativeText: `Jornada de conquista estruturada para 100% de maestria com progresso mensurável e validação contínua.`,
          contentParagraphs: [
            `Esta expedição transforma os fundamentos de ${effectiveTopic} em metas acionáveis, métricas de resultado e competências técnicas comprovadas.`,
            getP(0, `Todo o conteúdo foi mapeado em fases claras para garantir 100% de absorção e execução prática sem lacunas.`),
          ],
          rpgQuest: { questName: `Missão: Maestria em ${effectiveTopic}`, xpValue: 500, difficulty: 'Médio' },
          characterGuide: { name: 'Sir Auron', speechText: 'Mantenha o foco nos indicadores de entrega. Cada marco conquistado é uma vitória tangível!', analogy: 'Como um mapa de cerco medieval: meça cada centímetro para garantir o sucesso.' },
        },
        {
          id: 's2',
          type: 'stats_metrics',
          subtopic: 'Scorecard de KPIs',
          layout: 'metric-dashboard',
          title: `Painel de Indicadores & KPIs de Sucesso`,
          subtitle: 'Métricas Quantificáveis e Critérios de Impacto',
          narrativeText: 'O que não pode ser medido não pode ser aperfeiçoado com excelência.',
          contentParagraphs: [
            `O domínio pleno de ${effectiveTopic} exige o monitoramento constante dos indicadores de performance e eficácia operacional.`,
            getP(1, `Estabelecemos metas claras para cada etapa de execução, garantindo que o aprendizado se traduza em resultados práticos no mundo real.`),
          ],
          metricCards: [
            { value: '100%', label: 'Conformidade Técnica', sublabel: 'Alinhamento com padrões de mercado', trend: '+35% benchmark', iconType: 'target' },
            { value: '< 150ms', label: 'Eficiência Operacional', sublabel: 'Tempo médio de ciclo de execução', trend: 'Otimização alta', iconType: 'zap' },
            { value: '0 Desvios', label: 'Margem de Erro Crítico', sublabel: 'Tolerância zero a falhas estruturais', trend: 'Blindagem ativa', iconType: 'shield' },
          ],
        },
        {
          id: 's3',
          type: 'timeline_process',
          subtopic: 'Roadmap de Fases',
          layout: 'timeline-flow',
          title: `Roadmap de Execução & Marcos de Progresso`,
          subtitle: 'Etapas Sequenciais para Implementação',
          contentParagraphs: [
            `Siga a sequência metódica abaixo para implementar as soluções de ${effectiveTopic} sem pular validações críticas.`,
            getP(2, `A progressão faseada reduz riscos e assegura estabilidade operacional em cada entrega.`),
          ],
          timelineSteps: [
            { stepNumber: '1', title: 'Fundamentação & Taxonomia', description: `Definição da arquitetura básica e escopo de ${effectiveTopic}.`, badge: 'Base', highlight: false },
            { stepNumber: '2', title: 'Implementação Modular', description: 'Construção iterativa dos componentes principais com testes.', badge: 'Construção', highlight: true },
            { stepNumber: '3', title: 'Auditoria & Otimização', description: 'Refatoração de gargalos de desempenho e validação de segurança.', badge: 'Refino', highlight: false },
            { stepNumber: '4', title: 'Certificação & Deploy', description: 'Validação final de 100% dos requisitos e entrega oficial.', badge: 'Conclusão', highlight: true },
          ],
        },
        {
          id: 's4',
          type: 'bento_cards',
          subtopic: 'Pilares Estruturais',
          layout: 'bento-grid',
          title: `Pilares Fundamentais & Entregáveis Tangíveis`,
          subtitle: 'Decomposição de Entregas e Requisitos',
          contentParagraphs: [
            `Cada módulo abaixo representa um bloco de competência indispensável para a maestria integral de ${effectiveTopic}.`,
          ],
          bentoCards: [
            { title: `${kw[1] || 'Estrutura Base'}`, description: `Padronização arquitetural e eliminação de acoplamentos em ${effectiveTopic}.`, tag: 'Essencial', highlight: true, iconType: 'layers' },
            { title: `${kw[2] || 'Consistência'}`, description: 'Garantia de integridade transacional e tratamento rigoroso de exceções.', tag: 'Crítico', highlight: false, iconType: 'shield' },
            { title: `${kw[3] || 'Escalabilidade'}`, description: 'Capacidade de expansão elástica e suporte a alto volume de operações.', tag: 'Performance', highlight: false, iconType: 'sparkles' },
          ],
        },
        {
          id: 's5',
          type: 'concept_breakdown',
          subtopic: 'Aplicação Prática',
          layout: 'split-character',
          title: `Padrões de Engenharia & Boas Práticas`,
          subtitle: 'Formalismo Lógico e Especificação Técnica',
          contentParagraphs: [
            getP(3, `A implementação rigorosa das diretrizes de ${effectiveTopic} elimina redundâncias e acelera a entrega de valor sustentável.`),
            getP(4, `Validamos cada especificação técnica com evidências empíricas e testes automatizados.`),
          ],
          writtenExample: {
            title: `Caso de Aplicação: Pipeline de ${effectiveTopic}`,
            explanation: `Exemplo estruturado demonstrando a cadeia de execução com tratamento defensivo de erros.`,
            codeOrDiagram: `// Pipeline de Execução Padrão\nexecuteStep({ topic: "${effectiveTopic}", status: "CERTIFIED", score: 100 });`,
            visualIcon: 'target',
          },
          keyTakeaways: [
            'Metas explícitas reduzem o retrabalho em até 70%',
            'Testes automatizados contínuos garantem regressão zero',
            'Documentação viva mantém o alinhamento da equipe',
          ],
        },
        {
          id: 's6',
          type: 'comparison_grid',
          subtopic: 'Conformidade vs Desvios',
          layout: 'versus-split',
          title: `Padrão de Excelência vs Desvios de Conformidade`,
          subtitle: 'Análise de Riscos e Melhores Práticas',
          contentParagraphs: [
            `Compare os resultados de uma execução com 100% de conformidade com os riscos de uma implementação descuidada em ${effectiveTopic}.`,
          ],
          comparisonColumns: [
            {
              title: 'Implementação com Desvios',
              subtitle: 'Processo informal e sem métricas',
              badge: 'Alto Risco',
              items: ['Falta de testes automatizados', 'Métricas vagas e não mensuráveis', 'Gargalos ocultos em produção'],
              highlight: false,
            },
            {
              title: 'Padrão Ouro de Excelência',
              subtitle: 'Processo estruturado com 100% de auditoria',
              badge: 'Conformidade',
              items: ['Cobertura completa de testes', 'Telemetria em tempo real com alertas', 'Recuperação determinística'],
              highlight: true,
            },
          ],
        },
        {
          id: 's7',
          type: 'checklist_quest',
          subtopic: 'Auditoria de Campo',
          layout: 'parchment-scroll',
          title: `Checklist de Execução & Validação de Campo`,
          subtitle: 'Ações Práticas com Pontuação de XP',
          contentParagraphs: [
            `Marque cada item conforme avança para validar suas entregas e coletar o XP total da expedição de ${effectiveTopic}.`,
          ],
          checklist: [
            { id: 'c1', text: `Definir a taxonomia e os limites de contexto de ${effectiveTopic}`, completed: false, xp: 100 },
            { id: 'c2', text: `Configurar testes automatizados de integração e estresse`, completed: false, xp: 120 },
            { id: 'c3', text: `Documentar métricas de SLA e procedimentos operacionais`, completed: false, xp: 130 },
            { id: 'c4', text: `Validar critérios de 100% de conformidade com a equipe`, completed: false, xp: 150 },
          ],
        },
        {
          id: 's8',
          type: 'interactive_challenge',
          subtopic: 'Desafio Cognitivo',
          layout: 'monumental-card',
          title: `Desafio de Maestria: Teste de Conformidade`,
          subtitle: 'Validação de Conceitos Fundamentais',
          contentParagraphs: [
            `Demonstre sua precisão técnica respondendo à questão de auditoria sobre ${effectiveTopic}.`,
          ],
          quiz: {
            question: `Qual é o fator determinante para garantir a consistência e escalabilidade em ${effectiveTopic}?`,
            options: [
              { id: 'o1', text: 'Padronização arquitetural com contratos de dados estritos e testes automatizados.', isCorrect: true, explanation: 'Exato! A padronização com contratos bem definidos elimina ambiguidade e permite expansão segura.' },
              { id: 'o2', text: 'Desenvolver sem especificações e ajustar apenas quando surgirem reclamações.', isCorrect: false, explanation: 'Incorreto: essa abordagem gera débito técnico crítico e instabilidade em larga escala.' },
            ],
          },
        },
        {
          id: 's9',
          type: 'reward_certificate',
          subtopic: 'Certificação Final',
          layout: 'monumental-card',
          title: `Certificado de Maestria Absoluta em ${effectiveTopic}`,
          subtitle: `Ordem da Vitória Perfeita • 100% Concluído • Rank ${rank}`,
          contentParagraphs: [
            `Parabéns, ${theme.archetype}! Você completou todas as etapas do roadmap, validou cada métrica de entrega e conquistou o rank ${rank}.`,
            `Sua dedicação metódica estabelece um novo padrão de excelência técnica e operacional em ${effectiveTopic}.`,
          ],
          quote: {
            text: `A maestria não é um destino estático, mas o hábito diário de superar cada meta com precisão cirúrgica.`,
            author: `Sir Auron, Mestre ${theme.archetype}`,
          },
        },
      ];
      break;

    case 'Mastermind':
      slides = [
        {
          id: 's1',
          type: 'cover',
          subtopic: 'Tese Central',
          layout: 'split-character',
          title: `${effectiveTopic}: Arquitetura de Sistemas & Primeiros Princípios`,
          subtitle: `Modelos Mentais & Raciocínio Lógico • Perfil ${theme.archetype}`,
          narrativeText: `Uma análise profunda dos axiomas, trade-offs estruturais e padrões algorítmicos que governam o tema.`,
          contentParagraphs: [
            `Esta apresentação descontrói a anatomia de ${effectiveTopic} a partir de primeiros princípios, explorando causas, efeitos e tomadas de decisão sistêmicas.`,
            getP(0, `Examinamos cada camada arquitetural para compreender os trade-offs críticos de escalabilidade e consistência.`),
          ],
          rpgQuest: { questName: `Códice Arcano: Decifração de ${effectiveTopic}`, xpValue: 600, difficulty: 'Difícil' },
          characterGuide: { name: 'Leo', speechText: 'Observe as forças invisíveis que sustentam a estrutura. Quando os axiomas estão corretos, o sistema resiste a qualquer tempestade.', analogy: 'Como as fundações de uma abóbada gótica: a distribuição simétrica das forças gera equilíbrio eterno.' },
        },
        {
          id: 's2',
          type: 'deep_lore',
          subtopic: 'Axiomas Fundamentais',
          layout: 'arcane-codex',
          title: `Códice Arcano #1: O Lore Filosófico & Leis Invariantes`,
          subtitle: 'Os Axiomas Fundamentais que Regem o Sistema',
          narrativeText: 'Toda arquitetura é a manifestação física de premissas teóricas fundamentais.',
          contentParagraphs: [
            `Para dominar verdadeiramente ${effectiveTopic}, não basta conhecer a sintaxe ou ferramentas passageiras. É preciso compreender as forças invariantes que moldam suas decisões de design.`,
            getP(1, `Sistemas complexos evoluem a partir de subsistemas simples que funcionavam perfeitamente. A introdução de complexidade acidental é o maior inimigo da longevidade arquitetural.`),
          ],
          secretLore: {
            hint: 'Axioma central de integridade sistêmica',
            revealedContent: `Em ${effectiveTopic}, a consistência forte tem como preço a latência e a disponibilidade. A elegância reside em escolher exatamente onde o relaxamento da consistência não compromete o domínio de negócio.`,
          },
        },
        {
          id: 's3',
          type: 'bento_cards',
          subtopic: 'Decomposição Anatômica',
          layout: 'bento-grid',
          title: `Decomposição Anatômica & Taxonomia de Módulos`,
          subtitle: 'Módulos Interconectados e Contratos de Interface',
          contentParagraphs: [
            `Compreender ${effectiveTopic} exige enxergar o sistema como uma rede de subsistemas desacoplados com contratos formais estritos.`,
          ],
          bentoCards: [
            { title: `${kw[0] || 'Camada de Domínio'}`, description: `Regras de negócio puras, invariantes de dados e lógica central de ${effectiveTopic}.`, tag: 'Core', highlight: true, iconType: 'code' },
            { title: `${kw[1] || 'Camada de Aplicação'}`, description: 'Orquestração de casos de uso, controle transacional e despachantes assíncronos.', tag: 'Orquestração', highlight: false, iconType: 'layers' },
            { title: `${kw[2] || 'Infraestrutura'}`, description: 'Persistência, gateways de rede, filas de mensageria e telemetria.', tag: 'I/O', highlight: false, iconType: 'shield' },
          ],
        },
        {
          id: 's4',
          type: 'concept_breakdown',
          subtopic: 'Formalismo Lógico',
          layout: 'split-character',
          title: `Engenharia de Primeiros Princípios & Formalismo Lógico`,
          subtitle: 'Desconstrução Matemática e Algorítmica',
          contentParagraphs: [
            getP(2, `Ao aplicar o raciocínio de primeiros princípios em ${effectiveTopic}, decompomos o problema em suas verdades mais fundamentais e deduzimos a solução a partir delas.`),
            getP(3, `Evitamos analogias superficiais e priorizamos a análise rigorosa de invariantes e limites assintóticos.`),
          ],
          writtenExample: {
            title: `Contrato de Domínio & Tipagem Nominal`,
            explanation: `Formalização matemática do estado do sistema com invariantes verificáveis em tempo de compilação.`,
            codeOrDiagram: `type SystemState = 'STABLE' | 'DEGRADED' | 'RECOVERING';\ninterface DomainEngine {\n  readonly state: SystemState;\n  enforceInvariant(): boolean;\n}`,
            visualIcon: 'code',
          },
          keyTakeaways: [
            'Tipagem estrita e imutabilidade reduzem o espaço de estados de erro',
            'Idempotência em todas as operações garante recuperação determinística',
            'Complexidade ciclomática deve ser mantida estritamente abaixo do limiar',
          ],
        },
        {
          id: 's5',
          type: 'comparison_grid',
          subtopic: 'Matriz de Trade-offs',
          layout: 'versus-split',
          title: `Matriz Rigorosa de Trade-Offs & Decisões Técnicas`,
          subtitle: 'Análise Crítica de Alternativas Arquiteturais',
          contentParagraphs: [
            `Em engenharia de sistemas não existem soluções perfeitas, apenas trade-offs ponderados entre diferentes vetores de custo, latência e complexidade em ${effectiveTopic}.`,
          ],
          comparisonColumns: [
            {
              title: 'Abordagem Acoplada / Síncrona',
              subtitle: 'Rápida no início, frágil em escala',
              badge: 'Baixa Latência',
              items: ['Simplicidade inicial de depuração', 'Comunicação in-memory de alta velocidade', 'Risco elevado de efeito cascata sob falhas'],
              highlight: false,
            },
            {
              title: 'Abordagem Orientada a Eventos',
              subtitle: 'Robusta e desacoplada, maior complexidade conceitual',
              badge: 'Alta Resiliência',
              items: ['Isolamento total de falhas entre domínios', 'Escalabilidade horizontal independente', 'Exige tratamento formal de consistência eventual'],
              highlight: true,
            },
          ],
        },
        {
          id: 's6',
          type: 'deep_lore',
          subtopic: 'Invariantes Avançadas',
          layout: 'arcane-codex',
          title: `Códice Arcano #2: Segredos Ocultos da Infraestrutura`,
          subtitle: 'Casos de Borda e Heurísticas Avançadas',
          contentParagraphs: [
            getP(4, `Os arquitetos mais experientes se diferenciam pela capacidade de antecipar como o sistema se comporta sob condições extremas de saturação e falhas parciais.`),
            `Ao dominar os fundamentos de ${effectiveTopic}, o código torna-se autoexplicativo e resiliente por design.`,
          ],
          secretLore: {
            hint: 'Princípio de resiliência sob partição de rede',
            revealedContent: 'Em sistemas distribuídos modernos, o tempo não é uma fonte confiável de verdade absoluta. Padrões baseados em relógios lógicos superam timestamps físicos suscetíveis a drift de NTP.',
          },
        },
        {
          id: 's7',
          type: 'decision_branch',
          subtopic: 'Árvore de Decisão',
          layout: 'parchment-scroll',
          title: `Árvore de Decisão Estratégica: Dilema Arquitetural`,
          subtitle: 'Escolha o Padrão de Engenharia mais Adequado',
          contentParagraphs: [
            `Diante de um requisito de alto throughput com tolerância zero a perda de dados em ${effectiveTopic}, qual topologia preserva a integridade sistêmica?`,
          ],
          decisionChoices: [
            {
              id: 'd1',
              label: 'Event Sourcing com Log Append-Only & CQRS',
              description: 'Separar modelos de leitura e escrita, gravando cada mutação como um evento imutável.',
              outcome: 'Decisão impecável! Auditabilidade total, recuperação ponto-a-ponto e performance desacoplada.',
              xpReward: 350,
            },
            {
              id: 'd2',
              label: 'Atualizações Diretas com Mutação In-Place e Lock Pessimista',
              description: 'Travar o registro inteiro no banco para cada transação.',
              outcome: 'Garante consistência imediata, mas cria gargalos severos de concorrência sob carga.',
              xpReward: 160,
            },
          ],
        },
        {
          id: 's8',
          type: 'interactive_challenge',
          subtopic: 'Desafio Sistêmico',
          layout: 'monumental-card',
          title: `Gauntlet Lógico: Decifrando o Teorema Central`,
          subtitle: 'Análise de Causa-Raiz e Raciocínio Dedutivo',
          contentParagraphs: [
            `Avalie o cenário e escolha a intervenção arquitetural com melhor relação custo-benefício em ${effectiveTopic}.`,
          ],
          quiz: {
            question: `Ao projetar a topologia de ${effectiveTopic}, qual princípio minimiza a propagação de falhas em cascata?`,
            options: [
              { id: 'o1', text: 'Circuit Breakers com Fallback Gracioso e Isolamento de Recursos (Bulkheads).', isCorrect: true, explanation: 'Excelente! Bulkheads isolam pools de recursos, impedindo que a degradação de um serviço sature os vizinhos.' },
              { id: 'o2', text: 'Retentativas infinitas imediatas sem backoff exponencial em caso de erro.', isCorrect: false, explanation: 'Incorreto: retentativas sem backoff provocam tempestade de requisições e derrubam de vez o serviço degradado.' },
            ],
          },
        },
        {
          id: 's9',
          type: 'epic_conclusion',
          subtopic: 'Epílogo Sistêmico',
          layout: 'monumental-card',
          title: `Síntese de Princípios Imutáveis: ${effectiveTopic}`,
          subtitle: `Ordem da Arquitetura Superior • Rank ${rank}`,
          contentParagraphs: [
            `Parabéns, ${theme.archetype}! Você desvendou a estrutura ontológica e os padrões matemáticos fundamentais de ${effectiveTopic}.`,
            `Com esses modelos mentais em seu repertório, você está capacitado para projetar arquiteturas duradouras, escaláveis e imunes ao envelhecimento tecnológico.`,
          ],
          quote: {
            text: `A verdadeira elegância de uma arquitetura está na simplicidade de seus contratos e na previsibilidade de seu comportamento sob estresse.`,
            author: `Leo, Grão-Estrategista ${theme.archetype}`,
          },
        },
      ];
      break;

    default: // Seeker, Conqueror, Socializer, Survivor, Daredevil (unified standard rich sequence)
      slides = [
        {
          id: 's1',
          type: 'cover',
          subtopic: 'Abertura & Enredo',
          layout: 'monumental-card',
          title: `${effectiveTopic}: Expedição & Maestria ${theme.archetype}`,
          subtitle: `Jornada Pedagógica • Perfil ${theme.perfil} • Rank ${rank}`,
          narrativeText: `Imersão temática completa construída sobre os conceitos fundamentais do material fornecido.`,
          contentParagraphs: [
            `Esta trilha foi forjada especificamente para a psicologia cognitiva do perfil ${theme.perfil}, transformando o conteúdo em uma experiência memorável.`,
            getP(0, `Aprofunde-se nos mecanismos, técnicas e desafios reais extraídos do material de estudo.`),
          ],
          rpgQuest: { questName: `Expedição: ${effectiveTopic}`, xpValue: 600, difficulty: 'Médio' },
          characterGuide: { name: theme.archetype, speechText: `Bem-vindo à trilha! Cada conceito de ${effectiveTopic} aqui apresentado é uma ferramenta poderosa para sua evolução.`, analogy: 'O conhecimento organizado é como uma bússola mágica: orienta mesmo na maior escuridão.' },
        },
        {
          id: 's2',
          type: 'stats_metrics',
          subtopic: 'Telemetria & Dados',
          layout: 'metric-dashboard',
          title: `Métricas & Indicadores Fundamentais de ${effectiveTopic}`,
          subtitle: 'Dados Quantificáveis e Critérios de Impacto',
          narrativeText: 'Compreender o volume e o impacto dos dados é o primeiro passo para o domínio pleno.',
          contentParagraphs: [
            getP(1, `Análise detalhada das variáveis que governam o comportamento e a eficiência em ${effectiveTopic}.`),
          ],
          metricCards: [
            { value: '99.9%', label: 'Disponibilidade Alvo', sublabel: 'Nível de serviço desejado', trend: '+18% ganho', iconType: 'target' },
            { value: '< 50ms', label: 'Latência de Processamento', sublabel: 'Tempo de resposta em tempo real', trend: 'Ultra rápido', iconType: 'zap' },
            { value: '100%', label: 'Aderência às Regras', sublabel: 'Conformidade de negócio', trend: 'Blindado', iconType: 'shield' },
          ],
        },
        {
          id: 's3',
          type: 'timeline_process',
          subtopic: 'Fluxo Operacional',
          layout: 'timeline-flow',
          title: `Fluxo Sequencial de Execução & Etapas Práticas`,
          subtitle: 'Linha do Tempo e Procedimentos Metódicos',
          contentParagraphs: [
            `Acompanhe a progressão ordenada das etapas necessárias para a aplicação consistente de ${effectiveTopic}.`,
            getP(2, `Cada fase estabelece os pré-requisitos para a etapa seguinte, garantindo previsibilidade.`),
          ],
          timelineSteps: [
            { stepNumber: '1', title: 'Diagnóstico Inicial', description: `Mapeamento dos requisitos de ${effectiveTopic}.`, badge: 'Diagnóstico', highlight: false },
            { stepNumber: '2', title: 'Estruturação Modular', description: 'Desenvolvimento das regras centrais e isolamento.', badge: 'Construção', highlight: true },
            { stepNumber: '3', title: 'Validação & Testes', description: 'Simulação de cenários de estresse e casos de borda.', badge: 'Validação', highlight: false },
            { stepNumber: '4', title: 'Consolidação Final', description: 'Implementação contínua e monitoramento em tempo real.', badge: 'Sucesso', highlight: true },
          ],
        },
        {
          id: 's4',
          type: 'bento_cards',
          subtopic: 'Componentes Chave',
          layout: 'bento-grid',
          title: `Decomposição Modular: Pilares de ${effectiveTopic}`,
          subtitle: 'Módulos Interconectados e Funcionalidades',
          contentParagraphs: [
            `Visão holística dos componentes que constituem a espinha dorsal de ${effectiveTopic}.`,
          ],
          bentoCards: [
            { title: `${kw[0] || 'Núcleo Central'}`, description: `Lógica fundamental e regras de validação em ${effectiveTopic}.`, tag: 'Essencial', highlight: true, iconType: 'layers' },
            { title: `${kw[1] || 'Orquestrador'}`, description: 'Coordenação de eventos, filas e fluxos de informação.', tag: 'Fluxo', highlight: false, iconType: 'sparkles' },
            { title: `${kw[2] || 'Salvaguardas'}`, description: 'Mecanismos de redundância, cache e proteção contra anomalias.', tag: 'Segurança', highlight: false, iconType: 'shield' },
          ],
        },
        {
          id: 's5',
          type: 'concept_breakdown',
          subtopic: 'Exemplo Aplicado',
          layout: 'split-character',
          title: `Princípios de Aplicação & Caso Concreto`,
          subtitle: 'Estudo Detalhado com Demonstração Prática',
          contentParagraphs: [
            getP(3, `Ao aplicar estes princípios em ${effectiveTopic}, transformamos conceitos teóricos em resultados mensuráveis.`),
            getP(4, `A documentação detalhada e a clareza nos contratos de interface eliminam ambiguidades.`),
          ],
          writtenExample: {
            title: `Exemplo de Implementação de ${effectiveTopic}`,
            explanation: `Estrutura com tratamento de exceções e telemetria integrada.`,
            codeOrDiagram: `// Inicialização com Tratamento de Erros\nconst runner = initModule("${effectiveTopic}", { timeout: 3000 });\nrunner.start();`,
            visualIcon: 'layers',
          },
          keyTakeaways: [
            'Simplicidade no design reduz custos operacionais no longo prazo',
            'Telemetria preventiva identifica anomalias antes que afetem o usuário',
            'A evolução contínua supera grandes refatorações arriscadas',
          ],
        },
        {
          id: 's6',
          type: 'comparison_grid',
          subtopic: 'Análise Comparativa',
          layout: 'versus-split',
          title: `Cenário Tradicional vs Padrão Moderno Otimizado`,
          subtitle: 'Análise Crítica de Ganhos e Eficiência',
          contentParagraphs: [
            `Avalie o impacto das abordagens modernas em comparação aos modelos legados de ${effectiveTopic}.`,
          ],
          comparisonColumns: [
            {
              title: 'Modelo Convencional',
              subtitle: 'Processamento síncrono e acoplado',
              badge: 'Legado',
              items: ['Alta latência sob carga', 'Dificuldade de manutenção', 'Gargalos em cascata'],
              highlight: false,
            },
            {
              title: 'Modelo Otimizado TrailUp',
              subtitle: 'Desacoplado, resiliente e auditado',
              badge: 'Moderno',
              items: ['Escala elástica sob demanda', 'Isolamento de falhas por módulo', 'Recuperação automática'],
              highlight: true,
            },
          ],
        },
        {
          id: 's7',
          type: 'checklist_quest',
          subtopic: 'Missão de Campo',
          layout: 'parchment-scroll',
          title: `Checklist de Verificação & Validação Prática`,
          subtitle: 'Passos Críticos com Concessão de XP',
          contentParagraphs: [
            `Confirme cada etapa para certificar a absorção dos conhecimentos de ${effectiveTopic}.`,
          ],
          checklist: [
            { id: 'ck1', text: `Verificar conformidade dos dados de entrada em ${effectiveTopic}`, completed: false, xp: 120 },
            { id: 'ck2', text: `Implementar salvaguardas de circuit breaker e retentativas`, completed: false, xp: 140 },
            { id: 'ck3', text: `Validar relatórios de métricas e observabilidade`, completed: false, xp: 160 },
          ],
        },
        {
          id: 's8',
          type: 'interactive_challenge',
          subtopic: 'Desafio Interativo',
          layout: 'monumental-card',
          title: `Desafio Cognitivo: Decisão Tática em ${effectiveTopic}`,
          subtitle: 'Teste de Aplicação Prática de Conhecimento',
          contentParagraphs: [
            `Analise o cenário e selecione a melhor alternativa para resolver o problema de campo.`,
          ],
          quiz: {
            question: `Qual é a melhor prática recomendada para garantir alta resiliência em ${effectiveTopic}?`,
            options: [
              { id: 'o1', text: 'Adotar comunicação assíncrona desacoplada com filas protegidas e circuit breakers.', isCorrect: true, explanation: 'Correto! Essa arquitetura isola falhas e preserva a continuidade operacional mesmo sob estresse.' },
              { id: 'o2', text: 'Depender exclusivamente de um servidor único sem backups ou redundância.', isCorrect: false, explanation: 'Incorreto: isso cria um ponto único de falha crítico.' },
            ],
          },
        },
        {
          id: 's9',
          type: profile === 'Conqueror' ? 'boss_battle' : profile === 'Daredevil' ? 'decision_branch' : 'epic_conclusion',
          subtopic: 'Clímax da Trilha',
          layout: 'monumental-card',
          title: profile === 'Conqueror' ? `Batalha Épica contra o Guardião de ${effectiveTopic}` : `Conclusão da Trilha & Vitória: ${effectiveTopic}`,
          subtitle: `Ordem dos Guardiões TrailUp • Rank ${rank}`,
          contentParagraphs: [
            `Parabéns, ${theme.archetype}! Você completou a jornada de aprendizado com dedicação, rigor e maestria.`,
            `Os conceitos de ${effectiveTopic} agora fazem parte do seu arsenal técnico para aplicações reais de alto impacto.`,
          ],
          quote: {
            text: `O conhecimento não é uma meta que se atinge, mas uma força contínua que transforma a realidade ao nosso redor.`,
            author: `Conselho dos Mestres ${theme.archetype}`,
          },
        },
      ];
      break;
  }

  const rawDeck: DeckData = {
    id: `deck-${Date.now()}-${profile}`,
    title: `${effectiveTopic}: Trilha ${theme.archetype}`,
    subtitle: `Apresentação Adaptada para ${theme.perfil}`,
    subject: effectiveTopic,
    targetProfile: profile,
    rankLevel: rank,
    themeConfig: theme,
    createdAt: new Date().toISOString().split('T')[0],
    author: 'TrailUp AI Master',
    estimatedMinutes: slides.length * 2,
    tags: [effectiveTopic, profile, 'TrailUp', 'BrainHex'],
    slides,
  };

  return enrichDeckWithInteractiveElements(rawDeck);
}
