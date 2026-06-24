import { BrainHexProfile, getBrainHexConfig } from "@/constants/profileImages";
import { hasBrainHexProfileSignal } from "@/utils/brainHex";

type TrilhaGuideContext = {
  topicTitle: string;
  totalBlocks?: number | null;
  completedBlocks?: number | null;
  guideVariant?: "personalizado" | "mock_modulo" | "padrao_trilha" | null;
  visibleElements?: {
    visualMode?: "mapa" | "arvore" | "lista" | null;
    hasChat?: boolean;
    hasTimer?: boolean;
    hasBattle?: boolean;
    hasProgress?: boolean;
  };
  perfis?: { nome?: string | null; perfil?: string | null; afinidade?: number | null }[] | null;
};

type TrilhaGuideTone = {
  headline: string;
  summary: string;
  bullets: string[];
};

export type TrilhaGuideScope = "modulo" | "trilha";
export type TrilhaGuideTarget =
  | "guide_button"
  | "progress"
  | "timer"
  | "battle"
  | "chat"
  | "journey"
  | "map"
  | "tree"
  | "list";

export type TrilhaGuideTutorialStep = {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: TrilhaGuideTarget;
};

export type TrilhaGuideContent = {
  accentColor: string;
  borderColor: string;
  softColor: string;
  subtleColor: string;
  icon: string;
  profileLabel: string;
  badge: string;
  headline: string;
  summary: string;
  bullets: string[];
  personalizedDetails: string[];
  modeLabel?: string | null;
  tutorialTitle: string;
  tutorialSteps: TrilhaGuideTutorialStep[];
};

const PROFILE_GUIDE_COPY: Record<BrainHexProfile, TrilhaGuideTone> = {
  seeker: {
    headline: "Seu percurso foi montado para descoberta com contexto",
    summary:
      "A trilha favorece exploração guiada, com pistas visuais claras e explicações curtas para que você avance sem perder o sentido do caminho.",
    bullets: [
      "Observe o fluxo visual antes de entrar no próximo bloco.",
      "Os apoios personalizados entram no mesmo percurso do professor para manter contexto.",
      "Use o guia para entender decisões de personalização e conexões entre módulos.",
    ],
  },
  survivor: {
    headline: "Seu percurso destaca segurança, avanço e pressão quando necessário",
    summary:
      "Os elementos visuais priorizam leitura rápida de progresso, tempo e desafio, para deixar claro o que está ativo e o que exige resposta imediata.",
    bullets: [
      "Quando houver boss ou tempo, eles aparecem como suporte do módulo, não como ruído.",
      "O progresso oficial continua vindo dos blocos acadêmicos concluídos.",
      "Se sair da etapa ativa, os temporizadores param junto com ela.",
    ],
  },
  daredevil: {
    headline: "Seu percurso foi desenhado para manter ritmo sem perder direcao",
    summary:
      "A experiência privilegia movimento, checkpoints e leitura rápida das próximas ações, sem remover o controle sobre o estudo.",
    bullets: [
      "Os blocos deixam claro onde acelerar e onde vale revisar.",
      "O guia pode resumir rapidamente o melhor próximo passo.",
      "O retorno ao módulo preserva contexto para retomar sem atrito.",
    ],
  },
  mastermind: {
    headline: "Seu percurso favorece estrutura, regra e previsibilidade",
    summary:
      "A interface torna mais explícitos os estados do módulo, a sequência de blocos e o papel de cada apoio, reduzindo ambiguidade.",
    bullets: [
      "A barra superior mostra progresso mensurável e não apenas avanço visual.",
      "Cada apoio tem função clara: explicar, orientar ou retomar contexto.",
      "O tutorial destaca primeiro os elementos que afetam decisão e planejamento.",
    ],
  },
  conqueror: {
    headline: "Seu percurso enfatiza meta, dominio e desbloqueio real",
    summary:
      "A experiência coloca em destaque os marcos que mostram controle do módulo e o impacto direto disso no avanço da trilha.",
    bullets: [
      "O que aparece no topo sinaliza conquista, pressão e andamento real.",
      "Os blocos concluídos liberam avanço acadêmico e próximos módulos.",
      "O guia resume o que falta para dominar cada etapa com objetividade.",
    ],
  },
  socializer: {
    headline: "Seu percurso prioriza orientação conversada e continuidade",
    summary:
      "A trilha puxa mais comunicação pelo guia, explicações em formato de conversa e suporte contextual para manter engajamento sem quebrar o foco.",
    bullets: [
      "Quando houver espaco para conversar, o guia assume papel mais ativo.",
      "As explicações priorizam linguagem simples, contextual e próxima.",
      "O chat ajuda a entender personalização, progresso e estratégia sem entregar respostas.",
    ],
  },
  achiever: {
    headline: "Seu percurso foi afinado para mostrar entrega e fechamento",
    summary:
      "A organização visual destaca o que falta concluir, o quanto já foi fechado e quais passos têm impacto direto no progresso oficial.",
    bullets: [
      "Cada etapa deixa mais claro o que conta para avanco real.",
      "O tutorial destaca primeiro os elementos ligados a meta e execução.",
      "O guia ajuda a encurtar caminho sem quebrar a lógica pedagógica.",
    ],
  },
};

const DEFAULT_TRAIL_GUIDE_COPY: TrilhaGuideTone = {
  headline: "Esta trilha organiza sua jornada em uma progressão clara",
  summary:
    "O guia da trilha resume a navegação geral, os estados dos módulos e os elementos visíveis da interface para orientar sua leitura.",
  bullets: [
    "O progresso no topo mostra o avanço acadêmico real da turma.",
    "O visual da trilha muda a forma de leitura, mas não muda a ordem oficial dos módulos.",
    "Use o tutorial para entender os elementos da tela antes de escolher o próximo módulo.",
  ],
};

function withAlpha(color: string, alphaHex: string) {
  const normalized = String(color).trim();
  if (/^#[0-9a-fA-F]{8}$/.test(normalized)) return `${normalized.slice(0, 7)}${alphaHex}`;
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) return `${normalized}${alphaHex}`;
  return normalized;
}

function buildTrailSteps(
  profile: BrainHexProfile,
  context: TrilhaGuideContext
): TrilhaGuideTutorialStep[] {
  const visualMode = context.visibleElements?.visualMode ?? "lista";
  const hasChat = context.visibleElements?.hasChat ?? true;
  const steps: TrilhaGuideTutorialStep[] = [
    {
      id: "trilha-progress",
      title: "Progresso da trilha",
      description:
        "O topo resume quanto da jornada já foi concluído com base no progresso acadêmico real da classe.",
      icon: "chart-line",
      target: "progress",
    },
  ];

  if (visualMode === "mapa") {
    steps.push({
      id: "trilha-map",
      title: "Mapa de reinos",
      description:
        "Cada módulo aparece como um ponto navegável no mapa. Os caminhos ajudam a entender ordem, dependências e o próximo destino recomendado.",
      icon: "map-search-outline",
      target: "map",
    });
  } else if (visualMode === "arvore") {
    steps.push({
      id: "trilha-tree",
      title: "Árvore de progressão",
      description:
        "A árvore organiza os módulos em uma leitura vertical, deixando desbloqueios e conexões mais visíveis durante a navegação.",
      icon: "source-branch",
      target: "tree",
    });
  } else {
    steps.push({
      id: "trilha-list",
      title: "Lista de módulos",
      description:
        "A lista mostra os módulos em sequência direta, ideal para leitura rápida de status, retomada e próximas entregas.",
      icon: "format-list-bulleted",
      target: "list",
    });
  }

  steps.push({
    id: "trilha-journey",
    title: "Jornada personalizada",
    description:
      profile === "socializer"
        ? "A trilha prioriza explicações mais conversadas e organização pensada para manter continuidade e troca com o guia."
        : "A organização da trilha considera seu perfil, histórico e métricas para definir ritmo, formato e apoios visuais.",
    icon: "compass-outline",
    target: "journey",
  });

  if (hasChat) {
    steps.push({
      id: "trilha-chat",
      title: profile === "socializer" ? "Canal principal do guia" : "Chat do guia",
      description:
        profile === "socializer"
          ? "Neste perfil, o guia usa mais o chat para explicar personalização, progresso e próximos passos. Ele só abre quando você tocar no ícone."
          : "O ícone de conversa abre o guia quando você quiser. Ele explica personalização, métricas e estratégia de navegação.",
      icon: "chat-processing-outline",
      target: "chat",
    });
  }

  return steps;
}

function buildModuleSteps(
  profile: BrainHexProfile,
  context: TrilhaGuideContext
): TrilhaGuideTutorialStep[] {
  const perfis = context.perfis ?? [];
  const hasTimer =
    context.visibleElements?.hasTimer ??
    (hasBrainHexProfileSignal(perfis, "survivor") ||
      hasBrainHexProfileSignal(perfis, "mastermind") ||
      hasBrainHexProfileSignal(perfis, "achiever") ||
      hasBrainHexProfileSignal(perfis, "conqueror") ||
      hasBrainHexProfileSignal(perfis, "daredevil"));
  const hasBattle =
    context.visibleElements?.hasBattle ?? hasBrainHexProfileSignal(perfis, "survivor");
  const hasChat = context.visibleElements?.hasChat ?? true;

  const steps: TrilhaGuideTutorialStep[] = [
    {
      id: "modulo-guide",
      title: "Guia do topo",
      description:
        "O botão com interrogação abre este tutorial e resume como os elementos do módulo funcionam para o seu perfil.",
      icon: "help-circle-outline",
      target: "guide_button",
    },
    {
      id: "modulo-progress",
      title: "Barra de progresso",
      description:
        "A barra horizontal mostra quanto do módulo foi concluído na sequência atual e quantos blocos já foram fechados.",
      icon: "chart-timeline-variant",
      target: "progress",
    },
  ];

  if (hasTimer) {
    steps.push({
      id: "modulo-timer",
      title: "Tempo da etapa",
      description:
        "O contador só aparece quando a etapa ativa realmente usa essa mecânica. Em conteúdo, ele acompanha permanência; em atividade, pode virar contagem regressiva.",
      icon: "timer-outline",
      target: "timer",
    });
  }

  if (hasBattle) {
    steps.push({
      id: "modulo-battle",
      title: "Boss do módulo",
      description:
        "Quando esse desafio fizer sentido para o seu perfil, o boss aparece no topo com estado do confronto, dano e histórico da batalha.",
      icon: "sword-cross",
      target: "battle",
    });
  }

  if (hasChat) {
    steps.push({
      id: "modulo-chat",
      title: profile === "socializer" ? "Conversa com prioridade" : "Conversa com o guia",
      description:
        profile === "socializer"
          ? "Neste perfil, o guia prioriza a comunicação por conversa. Você pode responder, pedir contexto e receber orientação sem sair do módulo."
          : "O guia aparece como personagem de conversa no módulo. Você pode responder para pedir contexto, estratégia e explicações da personalização.",
      icon: "message-text-outline",
      target: "chat",
    });
  }

  return steps;
}

function buildPersonalizedDetails(
  profile: BrainHexProfile,
  context: TrilhaGuideContext,
  scope: TrilhaGuideScope
) {
  const details: string[] = [];
  const totalBlocks = Math.max(0, Number(context.totalBlocks ?? 0));
  const completedBlocks = Math.max(0, Number(context.completedBlocks ?? 0));
  const hasChat = context.visibleElements?.hasChat ?? true;
  const hasTimer = Boolean(context.visibleElements?.hasTimer);
  const hasBattle = Boolean(context.visibleElements?.hasBattle);
  const visualMode = context.visibleElements?.visualMode ?? "lista";
  const guideVariant =
    context.guideVariant ?? (scope === "trilha" ? "padrao_trilha" : "mock_modulo");

  if (scope === "trilha") {
    if (guideVariant === "padrao_trilha") {
      details.push("Sem dados personalizados da API, a trilha usa um guia padrão de navegação para manter a orientação geral.");
    }

    if (visualMode === "mapa") {
      details.push("A sua trilha aparece em formato de mapa para destacar percurso, exploração e próximos destinos.");
    } else if (visualMode === "arvore") {
      details.push("A sua trilha aparece em árvore para deixar dependências, desbloqueios e avanço vertical mais claros.");
    } else {
      details.push("A sua trilha aparece em lista para priorizar leitura rápida de status, retomada e sequência direta.");
    }

    if (totalBlocks > 0) {
      details.push(`Hoje você já concluiu ${completedBlocks} de ${totalBlocks} módulos, então o guia prioriza continuidade e próximos passos.`);
    }
  } else {
    if (guideVariant === "mock_modulo") {
      details.push("Sem resposta da API, este módulo usa um mock local baseado no seu perfil para manter a orientação personalizada.");
    }

    if (totalBlocks > 0) {
      details.push(`Neste módulo, você concluiu ${completedBlocks} de ${totalBlocks} blocos, então o guia ajusta a leitura para retomada e avanço.`);
    }

    if (hasTimer) {
      details.push("Como o tempo está visível no seu contexto, o guia explica quando ele é permanência e quando vira pressão de atividade.");
    }

    if (hasBattle) {
      details.push("Como o boss está habilitado para o seu perfil, o guia também considera confronto, ameaça e estado da batalha.");
    }
  }

  if (hasChat) {
    details.push(
      profile === "socializer"
        ? "No seu perfil, a comunicação com o guia recebe prioridade, então o chat vira um apoio central de orientação."
        : "O chat do guia fica disponível como apoio contextual para explicar personalização, progresso e estratégia sem entregar respostas."
    );
  }

  if (!details.length) {
    details.push("Este guia resume os elementos mais importantes que estão visíveis para o seu perfil nesta etapa.");
  }

  return details;
}

export function buildTrilhaGuideContent(
  profile: BrainHexProfile,
  context: TrilhaGuideContext,
  scope: TrilhaGuideScope = "modulo"
): TrilhaGuideContent {
  const config = getBrainHexConfig(profile);
  const guideVariant =
    context.guideVariant ?? (scope === "trilha" ? "padrao_trilha" : "mock_modulo");
  const copy =
    scope === "trilha" && guideVariant === "padrao_trilha"
      ? DEFAULT_TRAIL_GUIDE_COPY
      : PROFILE_GUIDE_COPY[profile];
  const totalBlocks = Math.max(0, Number(context.totalBlocks ?? 0));
  const completedBlocks = Math.max(0, Number(context.completedBlocks ?? 0));
  const tutorialSteps =
    scope === "trilha"
      ? buildTrailSteps(profile, context)
      : buildModuleSteps(profile, context);

  const summary =
    guideVariant === "mock_modulo"
      ? `${copy.summary} Mesmo sem conexão com a API, ${context.topicTitle} recebe uma leitura local baseada no seu perfil e nos elementos visíveis do módulo.`
      : guideVariant === "padrao_trilha"
      ? `${copy.summary} ${context.topicTitle} segue a organização oficial da trilha com um guia padrão de navegação.`
      : `${copy.summary} ${context.topicTitle} segue a lógica acadêmica real da trilha e do módulo.`;

  return {
    accentColor: config.color,
    borderColor: withAlpha(config.color, "55"),
    softColor: withAlpha(config.color, "18"),
    subtleColor: withAlpha(config.color, "14"),
    icon: config.icon_focus,
    profileLabel: config.label,
    badge:
      totalBlocks > 0
        ? `${completedBlocks} de ${totalBlocks} blocos concluídos`
        : scope === "trilha"
        ? "Guia da trilha"
        : "Guia do módulo",
    headline: copy.headline,
    summary,
    bullets: copy.bullets,
    personalizedDetails: buildPersonalizedDetails(profile, context, scope),
    modeLabel:
      guideVariant === "mock_modulo"
        ? "Mock local do módulo"
        : guideVariant === "padrao_trilha"
        ? "Guia padrão da trilha"
        : null,
    tutorialTitle:
      scope === "trilha" ? "Tutorial interativo da trilha" : "Tutorial interativo do módulo",
    tutorialSteps,
  };
}
