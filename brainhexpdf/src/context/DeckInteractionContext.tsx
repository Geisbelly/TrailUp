import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { DeckData } from '../types';

export interface QuizSlideState {
  selectedOption: string | null;
  isSubmitted: boolean;
  isCorrect: boolean;
  attemptsCount: number;
  isLocked: boolean;
  explanation?: string;
}

export interface DecisionSlideState {
  choiceId: string;
  xpReward: number;
  outcome: string;
  isLocked: boolean;
}

export interface DeckInteractionData {
  deckId: string;
  totalXp: number;
  quizStates: Record<string, QuizSlideState>;
  checklistStates: Record<string, boolean>;
  decisionStates: Record<string, DecisionSlideState>;
  secretStates: Record<string, boolean>;
  bossHpStates: Record<string, number>;
  masteredTakeaways: Record<string, boolean>;
  activeTimelineSteps: Record<string, number>;
  guideAdviceRevealed: Record<string, boolean>;
}

export interface DeckInteractionContextValue {
  deckId: string;
  totalXp: number;
  accumulatedXp: number;
  quizStates: Record<string, QuizSlideState>;
  quizStatesBySlide: Record<string, QuizSlideState>;
  checklistStates: Record<string, boolean>;
  completedChecklistItems: Record<string, boolean>;
  decisionStates: Record<string, DecisionSlideState>;
  decisionsBySlide: Record<string, DecisionSlideState>;
  secretStates: Record<string, boolean>;
  secretsRevealedBySlide: Record<string, boolean>;
  bossHpStates: Record<string, number>;
  bossHpBySlide: Record<string, number>;
  masteredTakeaways: Record<string, boolean>;
  activeTimelineSteps: Record<string, number>;
  activeTimelineStepBySlide: Record<string, number>;
  guideAdviceRevealed: Record<string, boolean>;

  // Actions
  recordQuizAnswer: (
    slideKey: string,
    optId: string,
    isCorrect: boolean,
    xpReward?: number,
    explanation?: string
  ) => boolean;
  resetQuiz: (slideKey: string) => void;
  toggleChecklistItem: (itemId: string, xp?: number) => boolean;
  recordDecision: (
    slideKey: string,
    choiceId: string,
    xpReward?: number,
    outcome?: string
  ) => boolean;
  revealSecret: (slideKey: string, xpReward?: number) => boolean;
  recordBossAttack: (
    slideKey: string,
    damage: number,
    maxHp?: number,
    attackXp?: number
  ) => boolean;
  dealBossDamage: (
    slideKey: string,
    damage: number,
    maxHp?: number,
    attackXp?: number
  ) => { damageDealt: number; isDefeated: boolean };
  toggleTakeawayMastery: (takeawayId: string, xp?: number) => boolean;
  revealGuideAdvice: (slideKey: string, xp?: number) => boolean;
  toggleGuideAdvice: (slideKey: string, xp?: number) => boolean;
  setActiveTimelineStep: (slideKey: string, stepIndex: number) => void;
  resetDeckProgress: () => void;

  // Query helpers
  isQuizLocked: (slideKey: string) => boolean;
  isDecisionLocked: (slideKey: string) => boolean;
  isSecretLocked: (slideKey: string) => boolean;
  isBossDefeated: (slideKey: string, defaultMaxHp?: number) => boolean;
  getExportableState: () => DeckInteractionData;
}

const DeckInteractionContext = createContext<DeckInteractionContextValue | null>(null);

function getStorageKey(deck: DeckData): string {
  const safeId = deck.id || deck.title.replace(/[^a-zA-Z0-9]/g, '_');
  return `trailup_deck_state_${safeId}`;
}

function loadInitialState(deck: DeckData): DeckInteractionData {
  const storageKey = getStorageKey(deck);
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        deckId: deck.id || deck.title,
        totalXp: typeof parsed.totalXp === 'number' ? parsed.totalXp : 100,
        quizStates: parsed.quizStates || {},
        checklistStates: parsed.checklistStates || {},
        decisionStates: parsed.decisionStates || {},
        secretStates: parsed.secretStates || {},
        bossHpStates: parsed.bossHpStates || {},
        masteredTakeaways: parsed.masteredTakeaways || {},
        activeTimelineSteps: parsed.activeTimelineSteps || {},
        guideAdviceRevealed: parsed.guideAdviceRevealed || {},
      };
    }
  } catch (e) {
    console.warn('Error loading deck interaction state:', e);
  }

  return {
    deckId: deck.id || deck.title,
    totalXp: 100,
    quizStates: {},
    checklistStates: {},
    decisionStates: {},
    secretStates: {},
    bossHpStates: {},
    masteredTakeaways: {},
    activeTimelineSteps: {},
    guideAdviceRevealed: {},
  };
}

export interface DeckInteractionProviderProps {
  deck: DeckData;
  children: React.ReactNode;
}

export const DeckInteractionProvider: React.FC<DeckInteractionProviderProps> = ({
  deck,
  children,
}) => {
  const [state, setState] = useState<DeckInteractionData>(() => loadInitialState(deck));

  // Reload state whenever deck changes
  useEffect(() => {
    setState(loadInitialState(deck));
  }, [deck.id, deck.title]);

  // Persist to localStorage whenever state changes
  useEffect(() => {
    const storageKey = getStorageKey(deck);
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (e) {
      console.warn('Error persisting deck interaction state:', e);
    }
  }, [state, deck]);

  // Helper checks
  const isQuizLocked = useCallback(
    (slideKey: string): boolean => {
      const q = state.quizStates[slideKey];
      return !!(q && (q.isLocked || (q.isSubmitted && q.isCorrect)));
    },
    [state.quizStates]
  );

  const isDecisionLocked = useCallback(
    (slideKey: string): boolean => {
      const d = state.decisionStates[slideKey];
      return !!(d && (d.isLocked || d.choiceId));
    },
    [state.decisionStates]
  );

  const isSecretLocked = useCallback(
    (slideKey: string): boolean => {
      return !!state.secretStates[slideKey];
    },
    [state.secretStates]
  );

  const isBossDefeated = useCallback(
    (slideKey: string, defaultMaxHp: number = 1000): boolean => {
      const hp = state.bossHpStates[slideKey] !== undefined ? state.bossHpStates[slideKey] : defaultMaxHp;
      return hp <= 0;
    },
    [state.bossHpStates]
  );

  // 1. Record Quiz Answer (Blocks if already answered correctly / locked!)
  const recordQuizAnswer = useCallback(
    (
      slideKey: string,
      optId: string,
      isCorrect: boolean,
      xpReward: number = 150,
      explanation?: string
    ): boolean => {
      const current = state.quizStates[slideKey];
      if (current && (current.isLocked || (current.isSubmitted && current.isCorrect))) {
        // Already answered correctly, strictly block re-answering
        return false;
      }

      const prevAttempts = current?.attemptsCount || 0;
      const newAttempts = prevAttempts + 1;

      setState((prev) => {
        const nextQuizState: QuizSlideState = {
          selectedOption: optId,
          isSubmitted: true,
          isCorrect,
          attemptsCount: newAttempts,
          isLocked: isCorrect, // Lock permanently upon correct answer
          explanation,
        };

        const addedXp = isCorrect ? xpReward : 0;

        return {
          ...prev,
          totalXp: prev.totalXp + addedXp,
          quizStates: {
            ...prev.quizStates,
            [slideKey]: nextQuizState,
          },
        };
      });

      return true;
    },
    [state.quizStates]
  );

  // 2. Reset Quiz
  const resetQuiz = useCallback((slideKey: string) => {
    setState((prev) => {
      const newQuizStates = { ...prev.quizStates };
      delete newQuizStates[slideKey];
      return {
        ...prev,
        quizStates: newQuizStates,
      };
    });
  }, []);

  // 3. Toggle Checklist Item (Milestones)
  const toggleChecklistItem = useCallback((itemId: string, xp: number = 50): boolean => {
    let nextCompleted = false;
    setState((prev) => {
      const isNowCompleted = !prev.checklistStates[itemId];
      nextCompleted = isNowCompleted;
      const xpDelta = isNowCompleted ? xp : -xp;
      return {
        ...prev,
        totalXp: Math.max(0, prev.totalXp + xpDelta),
        checklistStates: {
          ...prev.checklistStates,
          [itemId]: isNowCompleted,
        },
      };
    });
    return nextCompleted;
  }, []);

  // 4. Record Decision Choice (Blocks if already chosen)
  const recordDecision = useCallback(
    (
      slideKey: string,
      choiceId: string,
      xpReward: number = 75,
      outcome: string = ''
    ): boolean => {
      const current = state.decisionStates[slideKey];
      if (current && (current.isLocked || current.choiceId)) {
        return false;
      }

      setState((prev) => ({
        ...prev,
        totalXp: prev.totalXp + xpReward,
        decisionStates: {
          ...prev.decisionStates,
          [slideKey]: {
            choiceId,
            xpReward,
            outcome,
            isLocked: true,
          },
        },
      }));
      return true;
    },
    [state.decisionStates]
  );

  // 5. Reveal Secret Lore (Blocks if already revealed)
  const revealSecret = useCallback(
    (slideKey: string, xpReward: number = 100): boolean => {
      if (state.secretStates[slideKey]) {
        return false;
      }

      setState((prev) => ({
        ...prev,
        totalXp: prev.totalXp + xpReward,
        secretStates: {
          ...prev.secretStates,
          [slideKey]: true,
        },
      }));
      return true;
    },
    [state.secretStates]
  );

  // 6. Record Boss Attack (Blocks if boss is already at 0 HP)
  const recordBossAttack = useCallback(
    (
      slideKey: string,
      damage: number,
      maxHp: number = 1000,
      attackXp: number = 200
    ): boolean => {
      const currentHp =
        state.bossHpStates[slideKey] !== undefined
          ? state.bossHpStates[slideKey]
          : maxHp;

      if (currentHp <= 0) {
        return false;
      }

      const nextHp = Math.max(0, currentHp - damage);

      setState((prev) => ({
        ...prev,
        totalXp: prev.totalXp + attackXp,
        bossHpStates: {
          ...prev.bossHpStates,
          [slideKey]: nextHp,
        },
      }));
      return true;
    },
    [state.bossHpStates]
  );

  // Deal Boss Damage with structured result
  const dealBossDamage = useCallback(
    (
      slideKey: string,
      damage: number,
      maxHp: number = 1000,
      attackXp: number = 200
    ): { damageDealt: number; isDefeated: boolean } => {
      const currentHp =
        state.bossHpStates[slideKey] !== undefined
          ? state.bossHpStates[slideKey]
          : maxHp;

      if (currentHp <= 0) {
        return { damageDealt: 0, isDefeated: true };
      }

      const nextHp = Math.max(0, currentHp - damage);
      const isDefeated = nextHp <= 0;

      setState((prev) => ({
        ...prev,
        totalXp: prev.totalXp + attackXp + (isDefeated ? 300 : 0),
        bossHpStates: {
          ...prev.bossHpStates,
          [slideKey]: nextHp,
        },
      }));

      return { damageDealt: damage, isDefeated };
    },
    [state.bossHpStates]
  );

  // 7. Toggle Takeaway Mastery
  const toggleTakeawayMastery = useCallback((takeawayId: string, xp: number = 25): boolean => {
    let nextMastered = false;
    setState((prev) => {
      const isNow = !prev.masteredTakeaways[takeawayId];
      nextMastered = isNow;
      const xpDelta = isNow ? xp : -xp;
      return {
        ...prev,
        totalXp: Math.max(0, prev.totalXp + xpDelta),
        masteredTakeaways: {
          ...prev.masteredTakeaways,
          [takeawayId]: isNow,
        },
      };
    });
    return nextMastered;
  }, []);

  // 8. Reveal / Toggle Guide Advice
  const revealGuideAdvice = useCallback((slideKey: string, xp: number = 15): boolean => {
    let nextRevealed = false;
    setState((prev) => {
      const isNow = !prev.guideAdviceRevealed[slideKey];
      nextRevealed = isNow;
      const xpDelta = isNow ? xp : 0;
      return {
        ...prev,
        totalXp: prev.totalXp + xpDelta,
        guideAdviceRevealed: {
          ...prev.guideAdviceRevealed,
          [slideKey]: isNow,
        },
      };
    });
    return nextRevealed;
  }, []);

  // 9. Set Active Timeline Step
  const setActiveTimelineStep = useCallback((slideKey: string, stepIndex: number) => {
    setState((prev) => ({
      ...prev,
      activeTimelineSteps: {
        ...prev.activeTimelineSteps,
        [slideKey]: stepIndex,
      },
    }));
  }, []);

  // 10. Reset All Progress
  const resetDeckProgress = useCallback(() => {
    const freshState: DeckInteractionData = {
      deckId: deck.id || deck.title,
      totalXp: 100,
      quizStates: {},
      checklistStates: {},
      decisionStates: {},
      secretStates: {},
      bossHpStates: {},
      masteredTakeaways: {},
      activeTimelineSteps: {},
      guideAdviceRevealed: {},
    };
    setState(freshState);
    const storageKey = getStorageKey(deck);
    try {
      localStorage.removeItem(storageKey);
    } catch (e) {
      console.warn('Error clearing deck state:', e);
    }
  }, [deck]);

  // 11. Snapshot for HTML export
  const getExportableState = useCallback((): DeckInteractionData => {
    return { ...state };
  }, [state]);

  const value: DeckInteractionContextValue = {
    deckId: deck.id || deck.title,
    totalXp: state.totalXp,
    accumulatedXp: state.totalXp,
    quizStates: state.quizStates,
    quizStatesBySlide: state.quizStates,
    checklistStates: state.checklistStates,
    completedChecklistItems: state.checklistStates,
    decisionStates: state.decisionStates,
    decisionsBySlide: state.decisionStates,
    secretStates: state.secretStates,
    secretsRevealedBySlide: state.secretStates,
    bossHpStates: state.bossHpStates,
    bossHpBySlide: state.bossHpStates,
    masteredTakeaways: state.masteredTakeaways,
    activeTimelineSteps: state.activeTimelineSteps,
    activeTimelineStepBySlide: state.activeTimelineSteps,
    guideAdviceRevealed: state.guideAdviceRevealed,

    recordQuizAnswer,
    resetQuiz,
    toggleChecklistItem,
    recordDecision,
    revealSecret,
    recordBossAttack,
    dealBossDamage,
    toggleTakeawayMastery,
    revealGuideAdvice,
    toggleGuideAdvice: revealGuideAdvice,
    setActiveTimelineStep,
    resetDeckProgress,

    isQuizLocked,
    isDecisionLocked,
    isSecretLocked,
    isBossDefeated,
    getExportableState,
  };

  return (
    <DeckInteractionContext.Provider value={value}>
      {children}
    </DeckInteractionContext.Provider>
  );
};

export const useDeckInteraction = (): DeckInteractionContextValue => {
  const context = useContext(DeckInteractionContext);
  if (!context) {
    throw new Error('useDeckInteraction must be used within a DeckInteractionProvider');
  }
  return context;
};
