import {
  Map,
  Shield,
  Sword,
  Compass,
  Crown,
  Drama,
  Box,
} from "lucide-react";

// src/features/signup/brainhex.ts

export type BrainHexAxis =
  | "curiosity"     // Seeker
  | "challenge"     // Survivor
  | "risk"          // Daredevil
  | "mastery"       // Mastermind
  | "competition"   // Conqueror
  | "social"        // Socializer
  | "completion"    // Achiever
  | "immersion";    // apoio (narrativa/imersão)

export type BrainHexProfileKey =
  | "seeker"
  | "survivor"
  | "daredevil"
  | "mastermind"
  | "conqueror"
  | "socializer"
  | "achiever";

export const PROFILE_LABEL: Record<BrainHexProfileKey, string> = {
  seeker: "Seeker (Explorador)",
  survivor: "Survivor (Desafiador)",
  daredevil: "Daredevil (Aventureiro)",
  mastermind: "Mastermind (Estrategista)",
  conqueror: "Conqueror (Competidor)",
  socializer: "Socializer (Colaborador)",
  achiever: "Achiever (Completionista)",
};

export interface BrainHexQuestion {
  id: string;
  text: string;
  axis: BrainHexAxis;
  weight?: number; // default 1
}

/**
 * Escala: 0..5 (0 = nada verdadeiro, 5 = extremamente verdadeiro)
 * Você pediu "diminuir a escala" mas "mais questões".
 * Aqui tem mais itens e escala menor.
 */
export const SCALE_MAX = 5;

export type BrainHexAnswers = Record<string, number>; // qid -> 0..SCALE_MAX
export type AxisScores = Record<BrainHexAxis, number>;
export type ProfileRawScores = Record<BrainHexProfileKey, number>;
export type ProfilePercentages = Record<BrainHexProfileKey, number>;

/**
 * IMPORTANTE:
 * BrainHex "oficial" tem nuances e subcomponentes (e não é só 7 eixos).
 * Aqui o resultado fica "real" no sentido de:
 * - eixos separados e coerentes
 * - Daredevil não vira "survivor 0.7"
 * - perfis combinam eixos de forma lógica
 */
export const BRAINHEX_QUESTIONS: BrainHexQuestion[] = [
  // curiosity (Seeker)
  { id: "c1", axis: "curiosity", text: "Gosto de explorar caminhos diferentes para chegar ao mesmo objetivo." },
  { id: "c2", axis: "curiosity", text: "Me empolgo quando encontro conteúdos extras ou “segredos”." },
  { id: "c3", axis: "curiosity", text: "Costumo investigar além do necessário só por curiosidade." },
  { id: "c4", axis: "curiosity", text: "Prefiro ter liberdade para explorar em vez de seguir sempre um roteiro fixo." },

  // challenge (Survivor)
  { id: "ch1", axis: "challenge", text: "Desafios difíceis me motivam mais do que tarefas fáceis." },
  { id: "ch2", axis: "challenge", text: "Eu continuo tentando mesmo depois de errar várias vezes." },
  { id: "ch3", axis: "challenge", text: "Sinto satisfação real ao superar algo que parecia impossível." },
  { id: "ch4", axis: "challenge", text: "Eu consigo manter foco mesmo sob pressão (prazo curto, dificuldade alta)." },

  // risk (Daredevil) — separa de challenge
  { id: "r1", axis: "risk", text: "Eu gosto de testar na prática antes de ler todas as instruções." },
  { id: "r2", axis: "risk", text: "Me animo com situações intensas, rápidas e cheias de ação." },
  { id: "r3", axis: "risk", text: "Eu não travo com a chance de errar; eu prefiro experimentar." },
  { id: "r4", axis: "risk", text: "Eu tomo decisões mais ousadas quando estou empolgado com o desafio." },

  // mastery (Mastermind)
  { id: "m1", axis: "mastery", text: "Prefiro entender a lógica e a teoria antes de executar." },
  { id: "m2", axis: "mastery", text: "Gosto de planejar etapas e estratégias para fazer melhor." },
  { id: "m3", axis: "mastery", text: "Eu curto sistemas complexos e otimizar soluções." },
  { id: "m4", axis: "mastery", text: "Me sinto bem quando consigo prever resultados por entender o funcionamento." },

  // competition (Conqueror)
  { id: "cp1", axis: "competition", text: "Rankings e classificações aumentam meu esforço." },
  { id: "cp2", axis: "competition", text: "Eu gosto de comparar meu desempenho com o de outras pessoas." },
  { id: "cp3", axis: "competition", text: "Eu me motivo ao tentar ser melhor que ontem (ou que outros)." },
  { id: "cp4", axis: "competition", text: "Competição me deixa mais focado e produtivo." },

  // social (Socializer)
  { id: "s1", axis: "social", text: "Aprendo melhor quando posso discutir ideias com outras pessoas." },
  { id: "s2", axis: "social", text: "Trabalhar em grupo me dá mais energia para continuar." },
  { id: "s3", axis: "social", text: "Gosto de ajudar colegas e trocar feedback." },
  { id: "s4", axis: "social", text: "Interação social aumenta meu engajamento nas atividades." },

  // completion (Achiever)
  { id: "cc1", axis: "completion", text: "Me incomoda deixar tarefas pela metade." },
  { id: "cc2", axis: "completion", text: "Ver progresso (percentual/checklist) me incentiva bastante." },
  { id: "cc3", axis: "completion", text: "Eu gosto de completar tudo (100%) antes de passar adiante." },
  { id: "cc4", axis: "completion", text: "Eu me sinto bem quando concluo coleções, metas e objetivos." },

  // immersion (apoio) — entra como tempero no Seeker/Daredevil/Mastermind (leve)
  { id: "i1", axis: "immersion", text: "Um contexto/história torna a experiência muito mais interessante." },
  { id: "i2", axis: "immersion", text: "Eu me envolvo mais quando existe um propósito claro por trás do que faço." },
  { id: "i3", axis: "immersion", text: "Narrativa/estética influenciam minha motivação." },
];

export function clampScale(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(SCALE_MAX, n));
}

export function calculateAxisScores(answers: BrainHexAnswers): AxisScores {
  const scores: AxisScores = {
    curiosity: 0,
    challenge: 0,
    risk: 0,
    mastery: 0,
    competition: 0,
    social: 0,
    completion: 0,
    immersion: 0,
  };

  for (const q of BRAINHEX_QUESTIONS) {
    const v = clampScale(answers[q.id] ?? 0);
    const w = q.weight ?? 1;
    scores[q.axis] += v * w;
  }

  return scores;
}

/**
 * Mapeamento por eixos (coerente):
 * - Seeker: Curiosity + um pouco de Immersion (descoberta narrativa)
 * - Survivor: Challenge (persistência sob pressão)
 * - Daredevil: Risk + um pouco de Challenge (ação + insistência)
 * - Mastermind: Mastery + um pouco de Curiosity (entender + explorar)
 * - Conqueror: Competition + um pouco de Challenge (competir exige resiliência)
 * - Socializer: Social (+ pitada de Immersion, pela conexão)
 * - Achiever: Completion + um pouco de Mastery (organização/controle)
 *
 * Os pesos aqui são a "parte realista": não deixa perfis colarem demais.
 */
export function mapAxisToProfiles(axis: AxisScores): ProfileRawScores {
  const seeker = axis.curiosity * 1.0 + axis.immersion * 0.25;

  const survivor = axis.challenge * 1.0;

  const daredevil = axis.risk * 1.0 + axis.challenge * 0.35 + axis.immersion * 0.15;

  const mastermind = axis.mastery * 1.0 + axis.curiosity * 0.25;

  const conqueror = axis.competition * 1.0 + axis.challenge * 0.25;

  const socializer = axis.social * 1.0 + axis.immersion * 0.15;

  const achiever = axis.completion * 1.0 + axis.mastery * 0.2;

  return { seeker, survivor, daredevil, mastermind, conqueror, socializer, achiever };
}

export function normalizeToPercent(raw: ProfileRawScores): ProfilePercentages {
  const total = Object.values(raw).reduce((a, b) => a + b, 0);

  const out = {} as ProfilePercentages;
  (Object.keys(raw) as BrainHexProfileKey[]).forEach((k) => {
    out[k] = total > 0 ? Math.round((raw[k] / total) * 100) : 0;
  });

  // garante 100% somando exatamente (ajuste no maior)
  const sum = (Object.keys(out) as BrainHexProfileKey[]).reduce((a, k) => a + out[k], 0);
  if (sum !== 100) {
    const sorted = (Object.keys(out) as BrainHexProfileKey[])
      .map((k) => ({ k, v: out[k] }))
      .sort((a, b) => b.v - a.v);
    if (sorted[0]) out[sorted[0].k] += 100 - sum;
  }

  return out;
}

export function computeBrainHexResult(answers: BrainHexAnswers) {
  const axis = calculateAxisScores(answers);
  const raw = mapAxisToProfiles(axis);
  const percent = normalizeToPercent(raw);

  const sorted = (Object.keys(percent) as BrainHexProfileKey[])
    .map((k) => ({ key: k, label: PROFILE_LABEL[k], percent: percent[k], raw: raw[k] }))
    .sort((a, b) => b.percent - a.percent);

  return { axis, raw, percent, sorted };
}

export function isAllAnswered(answers: BrainHexAnswers) {
  return BRAINHEX_QUESTIONS.every((q) => typeof answers[q.id] === "number");
}


// Cores amostradas diretamente da arte de cada guardiao
// (frontend/src/assets/guardioes/*.webp — poster "Os Guardioes da Trilha"
// fornecido pela usuaria), nao mais da cor-assinatura oficial abstrata de
// microservice/src/constants/brainHex.ts. As duas divergem bastante: a arte
// comissionada usa paleta propria por personagem (ex.: Conqueror de roxo,
// Survivor de azul) que nao bate com o hex "oficial" do sistema de perfis —
// e como a arte e o que o usuario realmente ve na secao "Guardioes da
// Trilha" e no resultado do quiz, a cor da UI segue a arte, nao o hex
// abstrato. Extraida a cor dominante da roupa/manto (script com sharp,
// histograma de matiz por contagem de pixel, ignorando pele/cabelo/fundo
// transparente) e depois só a luminosidade HSL foi elevada até ~4.5:1 de
// contraste contra o fundo escuro do site — matiz e saturação da cor
// original ficam intactos (mesmo principio de _ensure_min_contrast em api/,
// documentado no CLAUDE.md: nunca misturar com branco). Ainda assim é uma
// variante própria desta superfície — não é o mesmo valor nem o mesmo
// algoritmo do accent computado em api/app/api/v1/personalizacao.py ou do
// "accent" estático em src/lib/personalizacao-theme-guide.ts (esses dois
// continuam na cor-assinatura oficial do brainHex.ts).
export const PROFILES = {
  seeker: {
    key: "seeker",
    title: "Seeker (Explorador)",
    icon: Map,
    color: "text-[#3c9428] bg-[#3c9428]/10 border-[#3c9428]/20",
    textColor: "text-[#3c9428]",
    bgColor: "bg-[#3c9428]",
    cardStyle: "bg-[#3c9428]/10 border-[#3c9428]/20",
    text: "Motivado pela curiosidade. Gosta de explorar possibilidades, achar conteúdos extras e entender conexões além do básico.",
  },
  survivor: {
    key: "survivor",
    title: "Survivor (Desafiador)",
    icon: Shield,
    color: "text-[#1286de] bg-[#1286de]/10 border-[#1286de]/20",
    textColor: "text-[#1286de]",
    bgColor: "bg-[#1286de]",
    cardStyle: "bg-[#1286de]/10 border-[#1286de]/20",
    text: "Prospera sob pressão. Curte prazos, intensidade e a sensação de superar limites difíceis.",
  },
  daredevil: {
    key: "daredevil",
    title: "Daredevil (Aventureiro)",
    icon: Sword,
    color: "text-[#ec3c04] bg-[#ec3c04]/10 border-[#ec3c04]/20",
    textColor: "text-[#ec3c04]",
    bgColor: "bg-[#ec3c04]",
    cardStyle: "bg-[#ec3c04]/10 border-[#ec3c04]/20",
    text: "Gosta de ação e risco. Prefere aprender por tentativa e erro, com exploração rápida e sem medo de falhar.",
  },
  mastermind: {
    key: "mastermind",
    title: "Mastermind (Estrategista)",
    icon: Compass,
    color: "text-[#367af4] bg-[#367af4]/10 border-[#367af4]/20",
    textColor: "text-[#367af4]",
    bgColor: "bg-[#367af4]",
    cardStyle: "bg-[#367af4]/10 border-[#367af4]/20",
    text: "Curte planejar e entender o porquê. Aprende melhor com estrutura, lógica e visão geral do sistema.",
  },
  conqueror: {
    key: "conqueror",
    title: "Conqueror (Competidor)",
    icon: Crown,
    color: "text-[#ab60df] bg-[#ab60df]/10 border-[#ab60df]/20",
    textColor: "text-[#ab60df]",
    bgColor: "bg-[#ab60df]",
    cardStyle: "bg-[#ab60df]/10 border-[#ab60df]/20",
    text: "Motivado por performance. Gosta de rankings, metas claras e superar desafios comparativos.",
  },
  socializer: {
    key: "socializer",
    title: "Socializer (Colaborador)",
    icon: Drama,
    color: "text-[#d9505c] bg-[#d9505c]/10 border-[#d9505c]/20",
    textColor: "text-[#d9505c]",
    bgColor: "bg-[#d9505c]",
    cardStyle: "bg-[#d9505c]/10 border-[#d9505c]/20",
    text: "Valoriza interação. Aprende melhor em grupo, com troca de ideias e atividades cooperativas.",
  },
  achiever: {
    key: "achiever",
    title: "Achiever (Completionista)",
    icon: Box,
    color: "text-[#ba863f] bg-[#ba863f]/10 border-[#ba863f]/20",
    textColor: "text-[#ba863f]",
    bgColor: "bg-[#ba863f]",
    cardStyle: "bg-[#ba863f]/10 border-[#ba863f]/20",
    text: "Focado em completar tudo. Se motiva com checklists, badges e concluir 100% do conteúdo.",
  },
};
