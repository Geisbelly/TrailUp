import type { SlideData } from '../types';

// Rede de seguranca pos-geracao: mesmo com maxLength no schema Gemini e
// limite explicito no prompt, producao real mostrou o modelo entrar em loop
// de repeticao e devolver milhares de caracteres pra uma unica pergunta/
// alternativa de quiz (slide inteiro virava um bloco de texto repetitivo,
// com scroll e fonte espremida). maxLength do schema estruturado nao e
// garantido pelo SDK/modelo em toda chamada - truncar aqui garante o piso
// visual independente do que a IA de fato devolveu.
export const MAX_QUIZ_QUESTION_CHARS = 220;
export const MAX_QUIZ_OPTION_TEXT_CHARS = 140;
export const MAX_QUIZ_OPTION_EXPLANATION_CHARS = 260;

function truncate(value: string | undefined, maxChars: number): string | undefined {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  // Reserva 1 char pra reticencias - sem isso o resultado final (texto +
  // "…") passava do maxChars por 1 caractere. Corta na ultima quebra de
  // palavra antes do limite, pra nao truncar no meio de uma palavra.
  const budget = Math.max(1, maxChars - 1);
  const cut = trimmed.slice(0, budget);
  const lastSpace = cut.lastIndexOf(' ');
  const safeCut = lastSpace > budget * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${safeCut.trimEnd()}…`;
}

/**
 * Trunca question/options[].text/options[].explanation de slide.quiz e de
 * interactiveElement.quizOptions[] para os limites acima. Nao rejeita nem
 * regenera - so garante que o texto renderizado nunca vira uma parede
 * ilegivel, mesmo quando o modelo ignora o limite pedido no prompt/schema.
 */
export function sanitizeQuizContent(slides: SlideData[]): SlideData[] {
  if (!Array.isArray(slides)) return slides;

  return slides.map((slide) => {
    let changed = false;
    const next: SlideData = { ...slide };

    if (slide.quiz) {
      const truncatedQuestion = truncate(slide.quiz.question, MAX_QUIZ_QUESTION_CHARS);
      const truncatedOptions = (slide.quiz.options || []).map((option) => ({
        ...option,
        text: truncate(option.text, MAX_QUIZ_OPTION_TEXT_CHARS) ?? option.text,
        explanation: truncate(option.explanation, MAX_QUIZ_OPTION_EXPLANATION_CHARS) ?? option.explanation,
      }));
      next.quiz = { question: truncatedQuestion ?? slide.quiz.question, options: truncatedOptions };
      changed = true;
    }

    if (slide.interactiveElement?.quizOptions?.length) {
      next.interactiveElement = {
        ...slide.interactiveElement,
        quizOptions: slide.interactiveElement.quizOptions.map((option) => ({
          ...option,
          text: truncate(option.text, MAX_QUIZ_OPTION_TEXT_CHARS) ?? option.text,
          explanation: truncate(option.explanation, MAX_QUIZ_OPTION_EXPLANATION_CHARS),
          feedback: truncate(option.feedback, MAX_QUIZ_OPTION_EXPLANATION_CHARS),
        })),
      };
      changed = true;
    }

    return changed ? next : slide;
  });
}

// Hash simples (djb2) da string pra derivar uma seed numerica estavel a
// partir do slide.id. Precisa ser deterministico entre chamadas (o HTML
// exportado e gerado uma vez e reutilizado por todos os alunos do mesmo
// perfil/topico) - Math.random() faria a ordem mudar a cada re-render da
// mesma pagina, pior experiencia que a ordem fixa atual.
function stringToSeed(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return hash >>> 0;
}

// PRNG determinístico (mulberry32) a partir da seed - simples, sem
// dependencia externa, suficiente pra embaralhar uma lista de poucas opcoes.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  const random = mulberry32(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Embaralha a ordem de slide.quiz.options e de
 * interactiveElement.quizOptions[] de forma deterministica (seed derivada de
 * slide.id) - corrige o vies de a resposta certa vir sempre na primeira
 * posicao, sem fazer a ordem mudar entre re-renders do mesmo deck ja
 * exportado.
 */
export function shuffleQuizOptions(slides: SlideData[]): SlideData[] {
  if (!Array.isArray(slides)) return slides;

  return slides.map((slide) => {
    let changed = false;
    const next: SlideData = { ...slide };
    const seed = stringToSeed(String(slide.id ?? ''));

    if (slide.quiz?.options?.length) {
      next.quiz = { ...slide.quiz, options: shuffleWithSeed(slide.quiz.options, seed) };
      changed = true;
    }

    if (slide.interactiveElement?.quizOptions?.length) {
      next.interactiveElement = {
        ...slide.interactiveElement,
        quizOptions: shuffleWithSeed(slide.interactiveElement.quizOptions, seed + 1),
      };
      changed = true;
    }

    return changed ? next : slide;
  });
}
