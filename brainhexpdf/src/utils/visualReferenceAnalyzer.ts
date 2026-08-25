import {
  BrainHexType,
  DeckData,
  SlideData,
  VisualDiagramData,
  VisualDiagramNode,
  VisualDiagramConnection,
  VisualCaseExample,
} from '../types';

/**
 * Intelligent Visual Reference Analyzer & Customizer
 * Extracts, adapts, and designs high-impact visual architectures, topologies,
 * flow roadmaps, comparative matrices, and metric visualizers from base and extended content.
 */

interface VisualAnalysisContext {
  topic: string;
  subtopic: string;
  title: string;
  paragraphs: string[];
  keyTakeaways: string[];
  extendedContent?: string;
  targetProfile: BrainHexType;
  slideIndex: number;
  totalSlides: number;
}

export function analyzeAndGenerateVisualDiagram(
  ctx: VisualAnalysisContext
): VisualDiagramData {
  const combinedText = `${ctx.topic} ${ctx.subtopic} ${ctx.title} ${ctx.paragraphs.join(' ')} ${ctx.keyTakeaways.join(' ')} ${ctx.extendedContent || ''}`.toLowerCase();

  // Pattern detection for domain-specific visual reference
  const isArchitectureOrTopology =
    combinedText.includes('arquitetura') ||
    combinedText.includes('microserviço') ||
    combinedText.includes('sistema') ||
    combinedText.includes('servidor') ||
    combinedText.includes('api') ||
    combinedText.includes('banco de dados') ||
    combinedText.includes('cache') ||
    combinedText.includes('rede') ||
    combinedText.includes('topologia') ||
    combinedText.includes('infraestrutura') ||
    combinedText.includes('cloud') ||
    combinedText.includes('distributed');

  const isProcessOrFlow =
    combinedText.includes('pipeline') ||
    combinedText.includes('fluxo') ||
    combinedText.includes('etapa') ||
    combinedText.includes('passo') ||
    combinedText.includes('fase') ||
    combinedText.includes('ciclo') ||
    combinedText.includes('processamento') ||
    combinedText.includes('execução') ||
    combinedText.includes('deploy') ||
    combinedText.includes('ingestão');

  const isComparisonOrTradeoff =
    combinedText.includes('compar') ||
    combinedText.includes('trade-off') ||
    combinedText.includes('vantag') ||
    combinedText.includes('desvantag') ||
    combinedText.includes('versus') ||
    combinedText.includes('vs') ||
    combinedText.includes('diferença') ||
    combinedText.includes('escolha') ||
    combinedText.includes('prós');

  const isPerformanceOrMetrics =
    combinedText.includes('métrica') ||
    combinedText.includes('performance') ||
    combinedText.includes('latência') ||
    combinedText.includes('throughput') ||
    combinedText.includes('benchmark') ||
    combinedText.includes('escala') ||
    combinedText.includes('carga') ||
    combinedText.includes('otimiza') ||
    combinedText.includes('velocidade');

  const isCodeOrAlgorithm =
    combinedText.includes('código') ||
    combinedText.includes('algoritmo') ||
    combinedText.includes('função') ||
    combinedText.includes('classe') ||
    combinedText.includes('método') ||
    combinedText.includes('implementação') ||
    combinedText.includes('sintaxe') ||
    combinedText.includes('padrão de projeto');

  // Assign diagram type based on content analysis and profile preference
  let diagramType: VisualDiagramData['type'] = 'system_topology';

  if (ctx.targetProfile === 'Mastermind') {
    diagramType = isComparisonOrTradeoff ? 'comparison_matrix' : isProcessOrFlow ? 'state_machine' : 'concept_tree';
  } else if (ctx.targetProfile === 'Achiever') {
    diagramType = isPerformanceOrMetrics ? 'metric_radar' : isProcessOrFlow ? 'flow_roadmap' : 'system_topology';
  } else if (ctx.targetProfile === 'Daredevil') {
    diagramType = isPerformanceOrMetrics ? 'metric_radar' : isCodeOrAlgorithm ? 'code_pipeline' : 'flow_roadmap';
  } else if (ctx.targetProfile === 'Seeker') {
    diagramType = isArchitectureOrTopology ? 'domain_map' : 'concept_tree';
  } else if (ctx.targetProfile === 'Conqueror') {
    diagramType = isArchitectureOrTopology ? 'system_topology' : 'metric_radar';
  } else if (ctx.targetProfile === 'Survivor') {
    diagramType = isArchitectureOrTopology ? 'system_topology' : 'state_machine';
  } else {
    // Socializer
    diagramType = isProcessOrFlow ? 'flow_roadmap' : 'domain_map';
  }

  // Fallback to detected content nature if strong match
  if (isArchitectureOrTopology && (ctx.slideIndex % 3 === 0 || ctx.slideIndex === 1)) {
    diagramType = 'system_topology';
  } else if (isProcessOrFlow && ctx.slideIndex % 2 === 1) {
    diagramType = 'flow_roadmap';
  } else if (isComparisonOrTradeoff) {
    diagramType = 'comparison_matrix';
  }

  return buildThematicDiagram(diagramType, ctx);
}

function buildThematicDiagram(
  type: VisualDiagramData['type'],
  ctx: VisualAnalysisContext
): VisualDiagramData {
  const { subtopic, title, paragraphs, targetProfile, topic } = ctx;

  switch (type) {
    case 'system_topology': {
      const nodes: VisualDiagramNode[] = [
        {
          id: 'node-client',
          label: 'Client / Interface',
          sublabel: 'Consumo & Interação',
          icon: 'Monitor',
          status: 'highlight',
          layer: 'Borda (Edge)',
          details: 'Camada de apresentação que despacha comandos e recebe dados otimizados.',
        },
        {
          id: 'node-gateway',
          label: 'API Gateway & Auth',
          sublabel: 'Roteamento & Validação',
          icon: 'ShieldCheck',
          status: 'active',
          layer: 'Ingress',
          details: 'Ponto único de entrada com rate-limiting, autenticação e telemetria.',
        },
        {
          id: 'node-core',
          label: `Core: ${subtopic.slice(0, 24)}`,
          sublabel: 'Domínio & Regras de Negócio',
          icon: 'Cpu',
          status: 'success',
          layer: 'Processamento',
          details: `Implementa os fluxos fundamentais de ${topic} com isolamento e alta coesão.`,
        },
        {
          id: 'node-cache',
          label: 'Cache L2 / Memória',
          sublabel: 'Baixa Latência (<2ms)',
          icon: 'Zap',
          status: 'active',
          layer: 'Aceleração',
          details: 'Garante respostas ultrarrápidas para leituras frequentes sem sobrecarregar o storage.',
        },
        {
          id: 'node-storage',
          label: 'Data Store Resiliente',
          sublabel: 'Persistência & ACID',
          icon: 'Database',
          status: 'highlight',
          layer: 'Persistência',
          details: 'Armazenamento distribuído com réplicas e garantia de integridade transacional.',
        },
      ];

      const connections: VisualDiagramConnection[] = [
        { from: 'node-client', to: 'node-gateway', label: 'gRPC / HTTPS', flowType: 'pulse' },
        { from: 'node-gateway', to: 'node-core', label: 'Comando Validado', flowType: 'solid' },
        { from: 'node-core', to: 'node-cache', label: 'Query Cache', flowType: 'bidirectional' },
        { from: 'node-core', to: 'node-storage', label: 'Commit Transacional', flowType: 'solid' },
      ];

      return {
        id: `diag-topology-${ctx.slideIndex}`,
        type: 'system_topology',
        title: `Mapa Topológico: Arquitetura de ${subtopic || topic}`,
        badge: `Topologia ${targetProfile}`,
        caption: 'Visão sistêmica da distribuição de responsabilidades e fluxo transacional de dados.',
        nodes,
        connections,
        layers: [
          { id: 'l1', name: 'Camada de Borda & Ingress', color: '#38BDF8', items: ['Client / Interface', 'API Gateway'] },
          { id: 'l2', name: 'Camada de Processamento & Regras', color: '#A855F7', items: [`Core: ${subtopic.slice(0, 20)}`, 'Cache L2'] },
          { id: 'l3', name: 'Camada de Persistência & Resiliência', color: '#10B981', items: ['Data Store Resiliente'] },
        ],
      };
    }

    case 'flow_roadmap': {
      const p1 = paragraphs[0] || 'Análise de contexto e ingestão de requisitos técnicos.';
      const p2 = paragraphs[1] || 'Processamento das estruturas e validação de invariantes.';
      const p3 = paragraphs[2] || 'Persistência, feedback e consolidação dos resultados.';

      const nodes: VisualDiagramNode[] = [
        {
          id: 'flow-1',
          label: '1. Ingestão & Entrada',
          sublabel: 'Recebimento de Dados',
          icon: 'FileInput',
          status: 'success',
          details: p1.slice(0, 110) + '...',
        },
        {
          id: 'flow-2',
          label: '2. Processamento Central',
          sublabel: 'Aplicação de Regras',
          icon: 'Layers',
          status: 'highlight',
          details: p2.slice(0, 110) + '...',
        },
        {
          id: 'flow-3',
          label: '3. Validação & Teste',
          sublabel: 'Checagem de Conformidade',
          icon: 'CheckSquare',
          status: 'active',
          details: 'Verificação contínua contra regressões e validação das regras essenciais.',
        },
        {
          id: 'flow-4',
          label: '4. Consolidação & Saída',
          sublabel: 'Entrega de Valor',
          icon: 'Award',
          status: 'highlight',
          details: p3.slice(0, 110) + '...',
        },
      ];

      const connections: VisualDiagramConnection[] = [
        { from: 'flow-1', to: 'flow-2', label: 'Payload Pronto', flowType: 'pulse' },
        { from: 'flow-2', to: 'flow-3', label: 'Resultado Preliminar', flowType: 'solid' },
        { from: 'flow-3', to: 'flow-4', label: 'Aprovado 100%', flowType: 'solid' },
      ];

      return {
        id: `diag-flow-${ctx.slideIndex}`,
        type: 'flow_roadmap',
        title: `Pipeline de Execução: ${title}`,
        badge: 'Fluxo Passo a Passo',
        caption: 'Sequência cronológica orientada a resultados técnicos claros e mensuráveis.',
        nodes,
        connections,
      };
    }

    case 'comparison_matrix': {
      return {
        id: `diag-matrix-${ctx.slideIndex}`,
        type: 'comparison_matrix',
        title: `Matriz Comparativa & Trade-offs: ${subtopic || title}`,
        badge: 'Análise de Decisão',
        caption: 'Avaliação multidimensional de arquiteturas e padrões para fundamentar a escolha técnica ideal.',
        comparisonMatrix: {
          headers: ['Critério Avaliado', 'Abordagem Convencional', 'Padrão Recomendado (TrailUp)'],
          rows: [
            {
              criteria: 'Resiliência a Falhas',
              values: ['Acoplamento rígido com risco de falha em cascata', 'Isolamento de falhas com Circuit Breaker e Fallbacks'],
              rating: 5,
            },
            {
              criteria: 'Velocidade & Latência',
              values: ['Consultas repetitivas a disco (>120ms)', 'Cache inteligente multicamadas (<5ms)'],
              rating: 5,
            },
            {
              criteria: 'Manutenibilidade',
              values: ['Lógica dispersa e dependências ocultas', 'Separação de conceitos em módulos coesos e tipados'],
              rating: 4,
            },
            {
              criteria: 'Escalabilidade Horizontal',
              values: ['Estado preso na sessão do nó', 'Serviços Stateless com auto-scaling elástico'],
              rating: 5,
            },
          ],
        },
      };
    }

    case 'metric_radar': {
      return {
        id: `diag-radar-${ctx.slideIndex}`,
        type: 'metric_radar',
        title: `Indicadores de Eficiência e Desempenho: ${title}`,
        badge: 'KPIs & Telemetria',
        caption: 'Métricas quantitativas que comprovam a superioridade e estabilidade da solução.',
        metrics: [
          { label: 'Throughput (Vazão)', value: '18.5k', unit: 'req/seg', change: '+240%', status: 'success' },
          { label: 'Latência P99', value: '4.2', unit: 'ms', change: '-75%', status: 'success' },
          { label: 'Disponibilidade (SLA)', value: '99.99', unit: '%', change: 'Uptime Real', status: 'highlight' },
          { label: 'Consumo de Recursos', value: '-35', unit: '% CPU/RAM', change: 'Otimizado', status: 'success' },
        ],
      };
    }

    case 'concept_tree': {
      const nodes: VisualDiagramNode[] = [
        {
          id: 'tree-root',
          label: `${subtopic.slice(0, 22)}`,
          sublabel: 'Pilar Central',
          icon: 'Compass',
          status: 'highlight',
          details: 'Conceito orientador que sustenta todas as ramificações técnicas.',
        },
        {
          id: 'tree-b1',
          label: 'Fundamentos & Tipagem',
          sublabel: 'Garantias em Tempo de Compilação',
          icon: 'Shield',
          status: 'active',
          details: 'Estruturação rígida que impede estados inválidos.',
        },
        {
          id: 'tree-b2',
          label: 'Padrões de Comunicação',
          sublabel: 'Protocolos & Contratos',
          icon: 'Share2',
          status: 'active',
          details: 'Contratos de API bem definidos e versionados.',
        },
        {
          id: 'tree-b3',
          label: 'Mecanismos de Segurança',
          sublabel: 'Isolamento & Zero-Trust',
          icon: 'Lock',
          status: 'success',
          details: 'Políticas restritivas e auditoria contínua de acessos.',
        },
      ];

      const connections: VisualDiagramConnection[] = [
        { from: 'tree-root', to: 'tree-b1', label: 'Especialização', flowType: 'solid' },
        { from: 'tree-root', to: 'tree-b2', label: 'Implementação', flowType: 'solid' },
        { from: 'tree-root', to: 'tree-b3', label: 'Governança', flowType: 'solid' },
      ];

      return {
        id: `diag-tree-${ctx.slideIndex}`,
        type: 'concept_tree',
        title: `Árvore de Conceitos: ${title}`,
        badge: 'Mapa Mental Estruturado',
        caption: 'Hierarquia das relações semânticas e desdobramentos operacionais do tópico.',
        nodes,
        connections,
      };
    }

    case 'code_pipeline': {
      return {
        id: `diag-code-${ctx.slideIndex}`,
        type: 'code_pipeline',
        title: `Pipeline de Código & Inspeção de Arquitetura`,
        badge: 'Implementação Prática',
        caption: 'Trecho representativo com validações críticas e pontos de atenção arquitetural.',
        codeVisual: {
          language: 'typescript',
          title: `${subtopic.replace(/\s+/g, '_').toLowerCase()}.ts`,
          code: `// Implementação de Referência: ${subtopic}
export async function executeEngineStep<T>(context: PipelineContext): Promise<Result<T>> {
  const telemetry = startSpan("${subtopic}");
  
  // 1. Validação de Invariantes e Contrato
  if (!context.isValid()) {
    throw new ValidationError("Payload inválido para processamento");
  }

  // 2. Execução com Isolamento e Fallback Seguro
  try {
    const data = await processWithCircuitBreaker(context.payload);
    telemetry.recordSuccess({ items: data.length });
    return Result.ok(data);
  } catch (err) {
    telemetry.recordError(err);
    return Result.fallback(getDefaultSafeValue());
  }
}`,
          annotations: [
            { line: 5, text: 'Validação preventiva de estado antes de alocar recursos' },
            { line: 10, text: 'Proteção via Circuit Breaker contra lentidão do downstream' },
            { line: 14, text: 'Recuperação transparente via fallback gracioso' },
          ],
        },
      };
    }

    default: {
      return {
        id: `diag-domain-${ctx.slideIndex}`,
        type: 'domain_map',
        title: `Mapa de Domínio: ${title}`,
        badge: 'Visão de Domínio',
        caption: 'Mapeamento visual dos blocos funcionais e interfaces essenciais.',
        nodes: [
          { id: 'dm-1', label: 'Interface Externa', icon: 'Globe', status: 'active' },
          { id: 'dm-2', label: 'Núcleo de Negócio', icon: 'Cpu', status: 'highlight' },
          { id: 'dm-3', label: 'Integração de Dados', icon: 'Database', status: 'success' },
        ],
        connections: [
          { from: 'dm-1', to: 'dm-2', label: 'Solicitação', flowType: 'pulse' },
          { from: 'dm-2', to: 'dm-3', label: 'Sincronização', flowType: 'solid' },
        ],
      };
    }
  }
}

/**
 * Generates rich tangible visual case examples
 */
export function generateVisualExamples(
  slide: SlideData,
  profile: BrainHexType
): VisualCaseExample[] {
  const exTitle = slide.writtenExample?.title || `Caso Prático: ${slide.subtopic || slide.title}`;
  const exExpl = slide.writtenExample?.explanation || slide.contentParagraphs[0] || 'Aplicação prática em ambiente de missão crítica.';

  return [
    {
      id: `ex-${slide.id || Math.random()}`,
      title: exTitle,
      context: exExpl,
      solutionVisual: 'Arquitetura modular orientada a eventos com filas de mensagens e réplicas de leitura.',
      impactMetrics: [
        { label: 'Ganho de Resiliência', value: '99.99%' },
        { label: 'Tempo de Recuperação', value: '< 350ms' },
      ],
      archetypeTakeaway: `Para o perfil ${profile}: Priorize o controle preciso das fronteiras de cada componente para eliminar pontos únicos de falha.`,
    },
  ];
}

/**
 * Enriches an entire deck with customized visual references, maps, diagrams, and examples
 */
export function enrichDeckWithVisualReferences(
  deck: DeckData,
  extendedContent?: string
): DeckData {
  if (!deck || !Array.isArray(deck.slides)) return deck;

  const enrichedSlides = deck.slides.map((slide, idx) => {
    // If the slide doesn't already have a visual diagram, generate a rich tailored one
    const visualDiagram =
      slide.visualDiagram ||
      analyzeAndGenerateVisualDiagram({
        topic: deck.subject || deck.title || 'Tecnologia',
        subtopic: slide.subtopic || slide.title,
        title: slide.title,
        paragraphs: slide.contentParagraphs || [],
        keyTakeaways: slide.keyTakeaways || [],
        extendedContent: extendedContent || deck.fullMarkdownText,
        targetProfile: deck.targetProfile || 'Mastermind',
        slideIndex: idx,
        totalSlides: deck.slides.length,
      });

    const visualExamples =
      slide.visualExamples && slide.visualExamples.length > 0
        ? slide.visualExamples
        : generateVisualExamples(slide, deck.targetProfile);

    return {
      ...slide,
      visualDiagram,
      visualExamples,
    };
  });

  return {
    ...deck,
    slides: enrichedSlides,
  };
}
