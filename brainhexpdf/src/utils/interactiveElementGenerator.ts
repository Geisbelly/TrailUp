import {
  BrainHexType,
  DeckData,
  InteractiveElementType,
  SlideData,
  UniqueInteractiveElement,
  UniqueInteractiveOption,
  UniqueInteractiveDecisionChoice,
  UniqueInteractiveChecklistItem,
} from '../types';
import { hasNonQuizRichWidget } from './slidePagination';

/**
 * Extracts key sentences, terms and actionable items from slide text
 */
function extractSlideSemantics(slide: Partial<SlideData>) {
  const paragraphs = Array.isArray(slide.contentParagraphs)
    ? slide.contentParagraphs.filter((p) => typeof p === 'string' && p.trim().length > 0)
    : [];

  const rawText = [
    slide.title || '',
    slide.subtitle || '',
    slide.subtopic || '',
    ...paragraphs,
    ...(slide.keyTakeaways || []),
  ].join(' ');

  const words = rawText
    .replace(/[^\w\s\u00C0-\u00FF]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);

  const keywords = Array.from(new Set(words)).slice(0, 10);
  const mainTopic = slide.subtopic || slide.title || 'Fundamentos Técnicos';
  const firstPara = paragraphs[0] || 'Compreensão aprofundada dos conceitos estruturais.';
  const secondPara = paragraphs[1] || paragraphs[0] || 'Aplicação prática em cenários reais.';
  const takeaways = slide.keyTakeaways || [];

  return {
    mainTopic,
    firstPara,
    secondPara,
    keywords,
    takeaways,
  };
}

/**
 * Profile-specific vocabulary, focus and badges
 */
const PROFILE_INTERACTIVE_TRAITS: Record<
  BrainHexType,
  {
    reflectionBadge: string;
    quizBadge: string;
    actionBadge: string;
    decisionBadge: string;
    checklistBadge: string;
    codeBadge: string;
    tonePrefix: string;
    baseXp: number;
  }
> = {
  Achiever: {
    reflectionBadge: 'Ponto de Reflexão • Auditoria de Metas',
    quizBadge: 'Mini-Quiz • Validação de Competência',
    actionBadge: 'Prompt de Ação • Execução de Alto Rendimento',
    decisionBadge: 'Bifurcação Estratégica • Otimização de ROI',
    checklistBadge: 'Checklist de Maestria • 100% de Conformidade',
    codeBadge: 'Inspeção de Código • Padrões de Excelência',
    tonePrefix: 'Como especialista focado em metas e indicadores:',
    baseXp: 120,
  },
  Mastermind: {
    reflectionBadge: 'Ponto de Reflexão • Primeiros Princípios',
    quizBadge: 'Mini-Quiz • Teste de Raciocínio Lógico',
    actionBadge: 'Prompt de Ação • Modelagem Arquitetural',
    decisionBadge: 'Trade-off Crítico • Análise de Causa-Efeito',
    checklistBadge: 'Critérios de Integridade Sistêmica',
    codeBadge: 'Inspeção de Arquitetura • Análise Formal',
    tonePrefix: 'Ao analisar a causa-raiz e o mecanismo fundamental:',
    baseXp: 130,
  },
  Seeker: {
    reflectionBadge: 'Ponto de Reflexão • Descoberta de Padrões',
    quizBadge: 'Mini-Quiz • Revelação Conceitual',
    actionBadge: 'Prompt de Ação • Hipótese de Exploração',
    decisionBadge: 'Rota de Investigação • Escolha de Trilha',
    checklistBadge: 'Marcos de Exploração de Fronteira',
    codeBadge: 'Inspeção de Estruturas Ocultas',
    tonePrefix: 'Ao investigar as conexões mais profundas e padrões ocultos:',
    baseXp: 115,
  },
  Conqueror: {
    reflectionBadge: 'Ponto de Reflexão • Domínio Sob Pressão',
    quizBadge: 'Mini-Quiz • Prova de Fogo Tática',
    actionBadge: 'Prompt de Ação • Desafio de Campo',
    decisionBadge: 'Decisão de Comando • Postura Estratégica',
    checklistBadge: 'Critérios de Blindagem e Vitória',
    codeBadge: 'Inspeção Rigorosa • Tolerância Zero a Falhas',
    tonePrefix: 'Para garantir domínio absoluto e resiliência impecável:',
    baseXp: 140,
  },
  Socializer: {
    reflectionBadge: 'Ponto de Reflexão • Impacto no Time & Cultura',
    quizBadge: 'Mini-Quiz • Alinhamento Coletivo',
    actionBadge: 'Prompt de Ação • Dinâmica de Peer Review',
    decisionBadge: 'Consenso de Engenharia • Trade-off de Equipe',
    checklistBadge: 'Checklist de Governança e Colaboração',
    codeBadge: 'Inspeção Colaborativa de Padrões',
    tonePrefix: 'Pensando na sinergia da equipe e comunicação transparente:',
    baseXp: 110,
  },
  Daredevil: {
    reflectionBadge: 'Ponto de Reflexão • Postura Diante do Desconhecido',
    quizBadge: 'Mini-Quiz • Decisão Rápida em Tempo Real',
    actionBadge: 'Prompt de Ação • Teste de Estresse Extremo',
    decisionBadge: 'Aposta Técnica • Risco vs Recompensa',
    checklistBadge: 'Checklist Pré-Lançamento Crítico',
    codeBadge: 'Inspeção de Casos de Borda e Falhas',
    tonePrefix: 'Sob condições reais e alto impacto:',
    baseXp: 135,
  },
  Survivor: {
    reflectionBadge: 'Ponto de Reflexão • Mitigação Preventiva de Risco',
    quizBadge: 'Mini-Quiz • Verificação de Segurança e Falhas',
    actionBadge: 'Prompt de Ação • Protocolo de Resiliência',
    decisionBadge: 'Estratégia de Sobrevivência • Fallback Ativo',
    checklistBadge: 'Checklist de Blindagem e Continuidade',
    codeBadge: 'Inspeção de Vulnerabilidades e Defesas',
    tonePrefix: 'Considerando a proteção contra falhas e cenários catastróficos:',
    baseXp: 125,
  },
};

/**
 * Generates a unique, content-aware interactive element tailored to a slide
 */
export function generateUniqueInteractiveElement(
  slide: Partial<SlideData>,
  targetProfile: BrainHexType = 'Achiever',
  slideIndex: number = 0,
  totalSlides: number = 1
): UniqueInteractiveElement {
  const profileKey = targetProfile in PROFILE_INTERACTIVE_TRAITS ? targetProfile : 'Achiever';
  const traits = PROFILE_INTERACTIVE_TRAITS[profileKey];
  const semantics = extractSlideSemantics(slide);
  const isFirstSlide = slideIndex === 0;
  const isLastSlide = slideIndex === totalSlides - 1;
  const slideId = slide.id || `slide-${slideIndex + 1}`;

  // 1. If the slide explicitly contains quiz data, build a high-fidelity mini_quiz element
  if (slide.quiz && Array.isArray(slide.quiz.options) && slide.quiz.options.length > 0) {
    return {
      id: `interactive-${slideId}-quiz`,
      type: 'mini_quiz',
      title: `Desafio de Maestria: ${semantics.mainTopic}`,
      badge: traits.quizBadge,
      prompt: slide.quiz.question || `Qual é a melhor abordagem para ${semantics.mainTopic}?`,
      contextHint: 'Selecione a alternativa correta para validar sua compreensão e conquistar XP.',
      xpReward: traits.baseXp + 25,
      quizOptions: slide.quiz.options.map((opt, i) => ({
        id: opt.id || `opt-${i}`,
        text: opt.text,
        isCorrect: !!opt.isCorrect,
        explanation: opt.explanation || (opt.isCorrect ? 'Correto! Esta é a prática recomendada.' : 'Incorreto. Esta opção viola as boas práticas.'),
      })),
    };
  }

  // 2. If the slide contains decision choices, build a decision_choice element
  if (slide.decisionChoices && Array.isArray(slide.decisionChoices) && slide.decisionChoices.length > 0) {
    return {
      id: `interactive-${slideId}-decision`,
      type: 'decision_choice',
      title: `Dilema Estratégico: ${semantics.mainTopic}`,
      badge: traits.decisionBadge,
      prompt: `Diante do cenário apresentado em ${semantics.mainTopic}, qual estratégia você adota?`,
      contextHint: 'Avalie os trade-offs de cada caminho e tome sua decisão de engenharia.',
      xpReward: traits.baseXp + 35,
      decisionChoices: slide.decisionChoices.map((c, i) => ({
        id: c.id || `choice-${i}`,
        label: c.label,
        description: c.description,
        outcome: c.outcome,
        xpReward: c.xpReward || traits.baseXp,
      })),
    };
  }

  // 3. If the slide contains a checklist, build a mastery_checklist element
  if (slide.checklist && Array.isArray(slide.checklist) && slide.checklist.length > 0) {
    return {
      id: `interactive-${slideId}-checklist`,
      type: 'mastery_checklist',
      title: `Critérios de Conclusão: ${semantics.mainTopic}`,
      badge: traits.checklistBadge,
      prompt: `Valide cada critério essencial de ${semantics.mainTopic} para consolidar o domínio deste módulo.`,
      contextHint: 'Marque os itens à medida que revisar e validar cada ponto no seu fluxo de trabalho.',
      xpReward: traits.baseXp + 20,
      checklistItems: slide.checklist.map((item, i) => ({
        id: item.id || `check-${i}`,
        text: item.text,
        xp: item.xp || 30,
      })),
    };
  }

  // 4. If the slide has codeSnippet and is code-heavy, build a code_inspect element
  if (slide.codeSnippet && slide.codeSnippet.code) {
    return {
      id: `interactive-${slideId}-code`,
      type: 'code_inspect',
      title: `Inspeção Técnica de Código: ${semantics.mainTopic}`,
      badge: traits.codeBadge,
      prompt: `Analise a implementação em ${slide.codeSnippet.language || 'código'}. Como você garantiria sua resiliência e clareza?`,
      contextHint: 'Examine a estrutura do código e identifique pontos de refatoração ou garantias de tipo.',
      xpReward: traits.baseXp + 30,
      codeSnippet: {
        language: slide.codeSnippet.language || 'typescript',
        code: slide.codeSnippet.code,
        inspectionHint: 'Observe o acoplamento, a nomenclatura e a segurança de tratamento de erros.',
      },
      guidingQuestions: [
        'Quais invariantes de integridade este código protege?',
        'Existe algum efeito colateral oculto que pode ser isolado?',
      ],
      sampleReflection: `Uma refatoração focada em contratos claros e desacoplamento eleva a testabilidade do módulo ${semantics.mainTopic}.`,
    };
  }

  // 5. Context-based generation for standard slides:
  // Decide element type based on slide position, type and content structure:
  let selectedType: InteractiveElementType = 'reflection_point';

  if (isFirstSlide) {
    selectedType = 'action_prompt';
  } else if (isLastSlide) {
    selectedType = 'reflection_point';
  } else if (slide.type === 'timeline_process' || slide.type === 'concept_breakdown') {
    selectedType = slideIndex % 2 === 0 ? 'action_prompt' : 'reflection_point';
  } else if (slide.type === 'comparison_grid' || slide.type === 'stats_metrics') {
    selectedType = 'decision_choice';
  } else if (slide.type === 'interactive_challenge' || slide.type === 'boss_battle') {
    selectedType = 'mini_quiz';
  } else {
    // Round-robin variety across remaining slides
    const typesPattern: InteractiveElementType[] = [
      'reflection_point',
      'mini_quiz',
      'action_prompt',
      'decision_choice',
      'mastery_checklist',
    ];
    selectedType = typesPattern[slideIndex % typesPattern.length];
  }

  // ----------------------------------------------------
  // Builder: REFLECTION POINT
  // ----------------------------------------------------
  if (selectedType === 'reflection_point') {
    const keyInsight = semantics.takeaways[0] || semantics.firstPara;
    const guidingQuestions = isLastSlide
      ? [
          `Qual foi o conceito de ${semantics.mainTopic} que mais impactou sua visão técnica?`,
          'Como você aplicará os princípios aprendidos nas suas entregas nas próximas 48 horas?',
          'Quais salvaguardas adicionais você implementará para evitar regressões?',
        ]
      : [
          `${traits.tonePrefix} Como o conceito de ${semantics.mainTopic} altera a tomada de decisão no seu projeto?`,
          `Quais são os principais riscos de negligenciar a regra de "${semantics.keywords.slice(0, 2).join(' ')}"?`,
          `De que forma a aplicação prática de ${semantics.mainTopic} melhora a sustentabilidade da solução?`,
        ];

    return {
      id: `interactive-${slideId}-reflect`,
      type: 'reflection_point',
      title: isLastSlide ? 'Síntese de Maestria & Autoavaliação' : `Ponto de Reflexão: ${semantics.mainTopic}`,
      badge: traits.reflectionBadge,
      prompt: isLastSlide
        ? `Reflita sobre toda a jornada pedagógica e sintetize suas principais transformações técnicas.`
        : `${traits.tonePrefix} Considere a premissa de que "${keyInsight.slice(0, 140)}...". Como isso se manifesta na sua prática?`,
      contextHint: 'Escreva suas reflexões ou pondere sobre as perguntas orientadoras abaixo para desbloquear XP.',
      xpReward: traits.baseXp + (isLastSlide ? 50 : 20),
      guidingQuestions,
      sampleReflection: `Na prática, ${semantics.mainTopic} permite manter previsibilidade técnica e mitigar falhas antes que cheguem a estágios críticos.`,
      suggestedAction: `Revise a arquitetura atual verificando a aderência aos padrões de ${semantics.mainTopic}.`,
      userNotePlaceholder: 'Registre suas percepções técnicas, ideias de aplicação ou dúvidas para fixação...',
    };
  }

  // ----------------------------------------------------
  // Builder: ACTION PROMPT / CHALLENGE
  // ----------------------------------------------------
  if (selectedType === 'action_prompt') {
    return {
      id: `interactive-${slideId}-action`,
      type: 'action_prompt',
      title: isFirstSlide ? `Alinhamento de Intenção: ${semantics.mainTopic}` : `Desafio Prático: ${semantics.mainTopic}`,
      badge: traits.actionBadge,
      prompt: isFirstSlide
        ? `Estabeleça seus objetivos de maestria e critérios de validação para esta trilha sobre ${semantics.mainTopic}.`
        : `Execute uma simulação de aplicação imediata dos conceitos de ${semantics.mainTopic} no seu fluxo de trabalho.`,
      contextHint: 'Siga os passos de execução orientada para validar e fixar a competência.',
      xpReward: traits.baseXp + 25,
      actionInstructions: [
        `1. Identifique um gargalo ou oportunidade de melhoria no seu contexto relacionado a ${semantics.mainTopic}.`,
        `2. Aplique a diretriz técnica fundamental discutida: "${semantics.firstPara.slice(0, 90)}...".`,
        `3. Valide o resultado garantindo que os critérios de qualidade e métricas estabelecidas sejam atendidos.`,
      ],
      expectedDeliverable: `Plano de ação claro para aplicar ${semantics.mainTopic} com mitigação de erros e conformidade técnica.`,
      userNotePlaceholder: 'Descreva a ação prática executada ou o resultado da sua simulação...',
    };
  }

  // ----------------------------------------------------
  // Builder: MINI QUIZ
  // ----------------------------------------------------
  if (selectedType === 'mini_quiz') {
    const correctConcept = semantics.takeaways[0] || semantics.firstPara;
    const kw1 = semantics.keywords[0] || 'módulo';
    const kw2 = semantics.keywords[1] || 'sistema';

    return {
      id: `interactive-${slideId}-quiz`,
      type: 'mini_quiz',
      title: `Checagem Ativa: ${semantics.mainTopic}`,
      badge: traits.quizBadge,
      prompt: `Em relação aos fundamentos de ${semantics.mainTopic}, qual é a abordagem técnica correta?`,
      contextHint: 'Selecione a resposta fundamentada nos princípios ensinados neste slide.',
      xpReward: traits.baseXp + 30,
      quizOptions: [
        {
          id: 'opt-1',
          text: `Priorizar ${kw1} estruturado com validação contínua e separação explícita de responsabilidades.`,
          isCorrect: true,
          explanation: `Exato! ${correctConcept.slice(0, 120)}... Esta é a conduta de excelência recomendada.`,
        },
        {
          id: 'opt-2',
          text: `Ignorar restrições de ${kw2} e acoplar regras de negócio em camadas de infraestrutura sem testes.`,
          isCorrect: false,
          explanation: 'Incorreto. Essa prática quebra o princípio de modularidade e compromete a manutenibilidade.',
        },
        {
          id: 'opt-3',
          text: `Postergar a validação de dados para a camada final de apresentação do usuário.`,
          isCorrect: false,
          explanation: 'Incorreto. A validação deve ocorrer o mais cedo possível para proteger a integridade dos dados.',
        },
      ],
    };
  }

  // ----------------------------------------------------
  // Builder: DECISION CHOICE
  // ----------------------------------------------------
  if (selectedType === 'decision_choice') {
    return {
      id: `interactive-${slideId}-decision`,
      type: 'decision_choice',
      title: `Decisão de Engenharia: ${semantics.mainTopic}`,
      badge: traits.decisionBadge,
      prompt: `Ao desenhar a estratégia para ${semantics.mainTopic}, qual trade-off você escolhe priorizar?`,
      contextHint: 'Escolha a opção que melhor se alinha aos objetivos estratégicos do seu arquétipo.',
      xpReward: traits.baseXp + 35,
      decisionChoices: [
        {
          id: 'd-1',
          label: 'Estratégia A: Rigor & Blindagem Preventiva',
          description: `Garantir isolamento total de ${semantics.keywords[0] || 'componentes'} com validações estritas em tempo de compilação.`,
          outcome: 'Excelente escolha para cenários de alta criticidade e tolerância zero a falhas em produção.',
          xpReward: traits.baseXp + 15,
        },
        {
          id: 'd-2',
          label: 'Estratégia B: Agilidade & Evolução Iterativa',
          description: `Implementar arquitetura enxuta com monitoramento em tempo real e adaptação incremental.`,
          outcome: 'Ótima decisão para iterações rápidas com feedbacks imediatos e ciclos curtos de entrega.',
          xpReward: traits.baseXp + 15,
        },
      ],
    };
  }

  // ----------------------------------------------------
  // Builder: MASTERY CHECKLIST (Default Fallback)
  // ----------------------------------------------------
  return {
    id: `interactive-${slideId}-checklist`,
    type: 'mastery_checklist',
    title: `Marcos de Domínio: ${semantics.mainTopic}`,
    badge: traits.checklistBadge,
    prompt: `Certifique-se de validar os critérios de qualidade estabelecidos para ${semantics.mainTopic}.`,
    contextHint: 'Confirme a conclusão de cada etapa de validação para receber a pontuação de maestria.',
    xpReward: traits.baseXp + 20,
    checklistItems: [
      {
        id: `chk-1-${slideIndex}`,
        text: `Compreensão do mecanismo central de ${semantics.mainTopic}.`,
        xp: 30,
      },
      {
        id: `chk-2-${slideIndex}`,
        text: `Mapeamento dos trade-offs e potenciais causas de erro.`,
        xp: 35,
      },
      {
        id: `chk-3-${slideIndex}`,
        text: `Validação prática dos critérios de entrega e conformidade.`,
        xp: 35,
      },
    ],
  };
}

/**
 * Guarantees that every slide in a deck has a unique, high-quality interactive element
 */
export function enrichDeckWithInteractiveElements(deck: DeckData): DeckData {
  if (!deck || !Array.isArray(deck.slides)) {
    return deck;
  }

  const profile = deck.targetProfile || 'Achiever';
  const total = deck.slides.length;

  const enrichedSlides = deck.slides.map((slide, index) => {
    // Slide ja tem um componente estrutural rico (timeline/metricas/
    // comparacao/bento/checklist/decisao) - um interactiveElement completo
    // por cima disso e redundante: dois blocos de conteudo pesados
    // empilhados no mesmo slide, causa raiz de excesso de informacao/scroll
    // reportado pelo usuario num deck real. Mutuamente exclusivos por
    // decisao do usuario - nunca os dois juntos, mesmo quando o Gemini ja
    // mandou os dois prontos.
    if (hasNonQuizRichWidget(slide)) {
      const { interactiveElement, ...rest } = slide;
      return rest as SlideData;
    }

    // If it already has a complete interactiveElement, keep it or enrich missing fields
    if (
      slide.interactiveElement &&
      slide.interactiveElement.id &&
      slide.interactiveElement.type &&
      slide.interactiveElement.prompt
    ) {
      return slide;
    }

    const generatedInteractive = generateUniqueInteractiveElement(slide, profile, index, total);

    return {
      ...slide,
      interactiveElement: generatedInteractive,
    };
  });

  return {
    ...deck,
    slides: enrichedSlides,
  };
}
