export type BrainHexType =
  | 'Achiever'
  | 'Seeker'
  | 'Mastermind'
  | 'Conqueror'
  | 'Socializer'
  | 'Daredevil'
  | 'Survivor';

export interface ThematicStorytelling {
  storyArcPhase: string;       // e.g. "Fase 1: Chamado & Desafio Inicial", "Fase 2: Imersão no Domínio", "Fase 3: Revelação do Padrão Oculto"
  environmentSetting: string;  // e.g. "Observatório Astral & Cúpula dos Tomos Cósmicos", "Cidadela Solar & Salão dos Estandartes"
  voiceTone: string;           // e.g. "Idris - Analítico, rigoroso e oracular", "Kwame - Focado em métricas e resoluto"
  narrativeBeat: string;       // Ponte narrativa imersiva de 1 a 2 frases conectando o tema técnico ao universo do perfil
}

export interface PerfilTema {
  perfil: BrainHexType;
  nomePt: string;
  archetype: string;
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };
  tom: string;
  voiceDescription?: string;
  environmentDescription?: string;
  diretrizes: string[];
  mote: string;
  elemento: string;
  simbolo: string;
  soundArchetype: string;
  characterImg: string;
  badgeName: string;
  description: string;
  strengths: string[];
  learningTriggers: string[];
}

export type ThemeConfig = PerfilTema;

export type SlideType =
  | 'cover'
  | 'story_intro'
  | 'concept_breakdown'
  | 'timeline_process'
  | 'stats_metrics'
  | 'comparison_grid'
  | 'bento_cards'
  | 'interactive_challenge'
  | 'decision_branch'
  | 'checklist_quest'
  | 'boss_battle'
  | 'deep_lore'
  | 'peer_collab'
  | 'epic_conclusion'
  | 'reward_certificate'
  | 'reflection_checkpoint'
  | 'pre_conclusion_reflection';

export type SlideLayout =
  | 'split-character'
  | 'full-banner'
  | 'parchment-scroll'
  | 'arcane-codex'
  | 'battle-arena'
  | 'discovery-map'
  | 'monumental-card'
  | 'bento-grid'
  | 'timeline-flow'
  | 'metric-dashboard'
  | 'versus-split';

export interface QuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
  explanation: string;
}

export interface DecisionChoice {
  id: string;
  label: string;
  description: string;
  outcome: string;
  xpReward: number;
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed?: boolean;
  xp: number;
}

export interface TimelineStepItem {
  stepNumber: string | number;
  title: string;
  description: string;
  badge?: string;
  highlight?: boolean;
}

export interface MetricCardItem {
  value: string;
  label: string;
  sublabel?: string;
  trend?: string;
  iconType?: 'trophy' | 'zap' | 'shield' | 'target' | 'star' | 'flame';
}

export interface ComparisonColumnItem {
  title: string;
  subtitle?: string;
  highlight?: boolean;
  badge?: string;
  items: string[];
}

export interface BentoCardItem {
  title: string;
  description: string;
  tag?: string;
  stat?: string;
  highlight?: boolean;
  iconType?: 'code' | 'sparkles' | 'shield' | 'compass' | 'swords' | 'layers' | 'book';
}

export type VisualThematicArchetype =
  | 'medieval-rpg'
  | 'cyber-tech'
  | 'nature-eco'
  | 'scrapbook-stickers'
  | 'celestial-palace'
  | 'royal-luxury'
  | 'indian-heritage'
  | 'islamic-ramadan'
  | 'trailup-astral';

export interface ThematicSticker {
  id: string;
  type: 'star' | 'lantern' | 'leaf' | 'tape' | 'crown' | 'sparkle' | 'pin' | 'planet' | 'shield' | 'flower' | 'note' | 'crescent' | 'flame' | 'trophy' | 'bird';
  label?: string;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'inline';
}

export type ThematicFrameType =
  | 'islamic-arch'
  | 'indian-palace-arch'
  | 'scrapbook-tape'
  | 'eco-nature'
  | 'cyber-hud'
  | 'royal-luxury'
  | 'notched-ticket'
  | 'parchment-scroll'
  | 'trailup-sigil'
  | 'minimal-glass';

export type ThematicIllustrationType =
  | 'earth_mascot'
  | 'islamic_mosque_moon'
  | 'scrapbook_stickers'
  | 'cyber_sphere'
  | 'lantern_chandelier'
  | 'nature_foliage'
  | 'royal_crest'
  | 'trailup_guardians'
  | 'dunes_sunset'
  | 'indian_oriental_skyline'
  | 'hanging_lanterns_gold'
  | 'tech_radar_globe'
  | 'washi_paper_notes'
  | 'celestial_astrolabe'
  | 'ancient_pillars';

export interface CharacterGuideInfo {
  name: string;
  title?: string;
  avatarIcon?: string;
  speechText?: string;
  analogy?: string;
  tone?: string;
}

export interface WrittenExampleInfo {
  title: string;
  explanation: string;
  codeOrDiagram?: string;
  visualIcon?: string;
  visualType?: 'code' | 'diagram' | 'analogy' | 'real_case';
}

export interface AiVisualDecorations {
  customBorderSvg?: string;          // AI-generated unique SVG border / decorative frame path or ornate corner motifs
  customDividerSvg?: string;         // AI-generated unique SVG medieval decorative divider / ribbon / alchemical separator
  customIconSvg?: string;            // AI-generated unique custom contextual SVG vector icon for this slide topic
  medievalPromptDescription?: string;// The generated AI prompt / visual art direction for this medieval ornament
  medievalClassArchetype?: string;   // E.g. 'Paladino da Honra', 'Arquimago Hermético', 'Cartógrafo Místico', 'Guardião de Bastilha', 'Berserker Flamejante', 'Senhor da Guerra', 'Bardo da Távola'
  borderDescription?: string;        // Specific description of the border aesthetics
  dividerDescription?: string;       // Specific description of the divider motif
  iconDescription?: string;          // Specific description of the heraldic/thematic icon
  cornerOrnamentType?: 'rune' | 'gem' | 'circuit' | 'leaf' | 'arabesque' | 'shield' | 'flame' | 'star' | 'geometric' | 'custom';
  borderStylePreset?: 'ornate_gold' | 'cyber_neon' | 'eco_vine' | 'runic_magic' | 'astral_geometric' | 'ramadan_arch' | 'palace_mandala';
  accentGradient?: string;
  motifDescription?: string;         // Description of the unique visual concept generated
}

export type VisualDiagramType =
  | 'system_topology'
  | 'flow_roadmap'
  | 'comparison_matrix'
  | 'metric_radar'
  | 'state_machine'
  | 'concept_tree'
  | 'code_pipeline'
  | 'domain_map';

export interface VisualDiagramNode {
  id: string;
  label: string;
  sublabel?: string;
  icon?: string;
  status?: 'active' | 'success' | 'warning' | 'critical' | 'highlight';
  details?: string;
  layer?: string;
  x?: number;
  y?: number;
}

export interface VisualDiagramConnection {
  from: string;
  to: string;
  label?: string;
  flowType?: 'solid' | 'dashed' | 'bidirectional' | 'pulse';
}

export interface VisualDiagramData {
  id: string;
  type: VisualDiagramType;
  title: string;
  badge?: string;
  caption?: string;
  nodes?: VisualDiagramNode[];
  connections?: VisualDiagramConnection[];
  layers?: Array<{ id: string; name: string; color?: string; items: string[] }>;
  metrics?: Array<{ label: string; value: string | number; change?: string; unit?: string; status?: string }>;
  codeVisual?: {
    language: string;
    title?: string;
    code: string;
    annotations?: Array<{ line: number; text: string }>;
  };
  comparisonMatrix?: {
    headers: string[];
    rows: Array<{ criteria: string; values: string[]; rating?: number }>;
  };
}

export interface VisualCaseExample {
  id: string;
  title: string;
  context: string;
  solutionVisual: string;
  impactMetrics: Array<{ label: string; value: string }>;
  archetypeTakeaway: string;
}

export type InteractiveElementType =
  | 'mini_quiz'
  | 'reflection_point'
  | 'action_prompt'
  | 'decision_choice'
  | 'mastery_checklist'
  | 'code_inspect';

export interface UniqueInteractiveOption {
  id: string;
  text: string;
  isCorrect?: boolean;
  explanation?: string;
  feedback?: string;
}

export interface UniqueInteractiveDecisionChoice {
  id: string;
  label: string;
  description: string;
  outcome: string;
  xpReward: number;
}

export interface UniqueInteractiveChecklistItem {
  id: string;
  text: string;
  xp: number;
}

export interface UniqueInteractiveElement {
  id: string;
  type: InteractiveElementType;
  title: string;
  badge?: string;
  prompt: string;
  contextHint?: string;
  xpReward: number;
  quizOptions?: UniqueInteractiveOption[];
  guidingQuestions?: string[];
  sampleReflection?: string;
  suggestedAction?: string;
  userNotePlaceholder?: string;
  actionInstructions?: string[];
  expectedDeliverable?: string;
  decisionChoices?: UniqueInteractiveDecisionChoice[];
  checklistItems?: UniqueInteractiveChecklistItem[];
  codeSnippet?: {
    language: string;
    code: string;
    inspectionHint?: string;
  };
}

export interface SlideData {
  id: string;
  type: SlideType;
  title: string;
  subtitle?: string;
  subtopic?: string;
  narrativeText?: string;
  thematicStorytelling?: ThematicStorytelling;
  pedagogicalObjective?: string;
  characterGuide?: CharacterGuideInfo;
  writtenExample?: WrittenExampleInfo;
  audioScript?: string;
  conceptTitle?: string;
  contentParagraphs: string[];
  keyTakeaways?: string[];
  quote?: {
    text: string;
    author: string;
  };
  
  // AI-Generated Unique Thematic Visual Elements
  aiDecorations?: AiVisualDecorations;
  
  // Thematic Design & Illustration Attributes (Slidesgo / Reference grade)
  thematicFrame?: ThematicFrameType;
  thematicStickers?: ThematicSticker[];
  illustrationType?: ThematicIllustrationType;
  stickyNote?: {
    badge: string;
    text: string;
    color?: 'yellow' | 'pink' | 'purple' | 'cyan';
  };
  
  // Unique Interactive Element (Every slide generated has a dedicated interactive component)
  interactiveElement?: UniqueInteractiveElement;

  // Rich Thematic Visual Reference & Diagrams (Maps, Topologies, Flowcharts, Matrices, Radars)
  visualDiagram?: VisualDiagramData;
  visualExamples?: VisualCaseExample[];

  // Real reference image from the professor's source material, resolved from
  // Gemini's `referenceImageIndex` pick — a data URI, ready to render.
  referenceImageDataUri?: string;

  // Professor attachments left over after every slide got its primary
  // referenceImageDataUri (deck has more images than image-eligible slides)
  // - distributed here instead of being silently dropped, see
  // resolveSlideIllustrations in slideIllustrations.ts. Rendered as a small
  // grid alongside referenceImageDataUri, never generated/restyled by AI.
  additionalReferenceImageDataUris?: string[];

  // Guiding questions for a 'reflection_checkpoint' slide (only meaningful
  // for that slide type — see src/utils/reflectionCheckpoints.ts).
  guidingQuestions?: string[];

  // Interactive gamified payload
  interactiveType?: 'quiz' | 'checklist' | 'decision' | 'secret_reveal' | 'code_inspect' | 'none';
  quiz?: {
    question: string;
    options: QuizOption[];
  };
  checklist?: ChecklistItem[];
  decisionChoices?: DecisionChoice[];
  secretLore?: {
    hint: string;
    revealedContent: string;
  };
  codeSnippet?: {
    language: string;
    code: string;
    highlightLine?: number;
  };
  
  // Slidesgo-Style Rich Visual Elements
  timelineSteps?: TimelineStepItem[];
  metricCards?: MetricCardItem[];
  comparisonColumns?: ComparisonColumnItem[];
  bentoCards?: BentoCardItem[];
  
  // RPG attributes
  rpgQuest?: {
    questName: string;
    xpValue: number;
    difficulty: 'Fácil' | 'Médio' | 'Difícil' | 'Épico';
    bossHp?: number;
  };
  
  layout: SlideLayout;
  bgAtmosphere?: string;
  backgroundImage?: string;
  ambientPrompt?: string;
  ambientEnvironmentSetting?: string;
  ambientOverlayOpacity?: number;
  ambientBlur?: number;
  presenterNotes?: string;
  customVisualAccent?: string;
}

export interface DeckData {
  id: string;
  title: string;
  subtitle: string;
  description?: string;
  subject: string;
  classe?: string;
  targetProfile: BrainHexType;
  secondaryProfile?: BrainHexType;
  rankLevel: 'Novato' | 'Aprendiz' | 'Guardião' | 'Mestre' | 'Ancião';
  visualThematicArchetype?: VisualThematicArchetype;
  slides: SlideData[];
  themeConfig: PerfilTema;
  createdAt: string;
  author: string;
  estimatedMinutes: number;
  tags: string[];
  fullMarkdownText?: string;
  audioScriptComplete?: string;
  subtopicsList?: string[];
  characterGuideName?: string;
}

export type ViewportMode = 'mobile-portrait' | 'mobile-landscape' | 'web-desktop' | 'print-pdf';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  bucketName: string;
}

export interface SupabaseFileItem {
  name: string;
  id?: string;
  updated_at?: string;
  created_at?: string;
  last_accessed_at?: string;
  metadata?: {
    size?: number;
    mimetype?: string;
  };
  publicUrl?: string;
}

export interface UploadedSourceAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  fileTypeCategory: 'document' | 'audio' | 'video' | 'presentation' | 'text' | 'pdf' | 'other';
  textContent?: string;
  dataBase64?: string;
  previewSnippet?: string;
}

export interface GenerationSettings {
  preferredModel: 'gemini-2.5-flash' | 'gemini-2.5-flash-lite' | 'gemini-3.7-flash' | 'gemini-3.1-flash-lite' | 'gemini-flash-latest' | string;
  rotateModels: boolean;
  delaySeconds: number; // Interval between generations (e.g. 2 to 10s)
  autoSaveSupabase: boolean;
  customApiKeys: string[]; // Up to 8 keys
  slideCountMode: 'auto' | 'custom';
}

export interface ProfileBatchItemState {
  profile: BrainHexType;
  status: 'idle' | 'generating' | 'waiting_delay' | 'uploading_supabase' | 'completed' | 'error';
  deck?: DeckData;
  error?: string;
  modelUsed?: string;
  keyIndexUsed?: number;
  supabasePublicUrl?: string;
  progressPercent: number;
}

export type MagicalEffectType =
  | 'auto'
  | 'sparks'
  | 'runes'
  | 'swirling_energy'
  | 'embers'
  | 'shield_aura'
  | 'matrix_nodes'
  | 'lightning_plasma';

export type MagicalEffectIntensity = 'subtle' | 'epic' | 'dazzling' | 'off';

export interface MagicalParticleOptions {
  effectType?: MagicalEffectType;
  intensity?: MagicalEffectIntensity;
  enableMouseTrail?: boolean;
  enableClickBursts?: boolean;
}

export type KnowledgeGraphNodeType =
  | 'slide'
  | 'concept'
  | 'module'
  | 'archetype'
  | 'challenge'
  | 'takeaway';

export type KnowledgeGraphLinkType =
  | 'sequential'
  | 'contains_concept'
  | 'prerequisite'
  | 'cross_reference'
  | 'archetype_lens'
  | 'tests_concept';

export interface KnowledgeGraphNode {
  id: string;
  label: string;
  type: KnowledgeGraphNodeType;
  slideIndex?: number;
  subtopic?: string;
  description?: string;
  color?: string;
  radius?: number;
  rankLevel?: string;
  interactiveType?: string;
  group?: string;
  importance?: number; // 1-10
  tags?: string[];
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  vx?: number;
  vy?: number;
}

export interface KnowledgeGraphLink {
  source: string | KnowledgeGraphNode;
  target: string | KnowledgeGraphNode;
  type: KnowledgeGraphLinkType;
  label?: string;
  weight?: number;
  color?: string;
  strength?: number;
}

export interface KnowledgeGraphData {
  nodes: KnowledgeGraphNode[];
  links: KnowledgeGraphLink[];
  archetype: BrainHexType;
  deckTitle: string;
  subject: string;
  clusters: { id: string; name: string; color: string; count: number }[];
}
