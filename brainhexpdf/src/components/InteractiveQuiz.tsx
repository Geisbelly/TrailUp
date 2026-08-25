import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle,
  CheckCircle2,
  ShieldAlert,
  RotateCcw,
  Sparkles,
  Award,
  Zap,
  Brain,
  Compass,
  Shield,
  Swords,
  Users,
  Target,
  HelpCircle,
  Lightbulb,
  Check,
  Flame,
  Star,
  Lock,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { BrainHexType, QuizOption } from '../types';
import { BRAIN_HEX_QUIZ_CONFIGS } from '../data/brainHexProfiles';
import { playSoundEffect } from '../utils/audioSynth';

export interface QuizDataPayload {
  question: string;
  options: QuizOption[];
  explanation?: string;
}

export interface QuizInteractionState {
  selectedOption: string | null;
  isSubmitted: boolean;
  isCorrect: boolean;
  attemptsCount: number;
  isLocked?: boolean;
}

export interface InteractiveQuizProps {
  quiz: QuizDataPayload;
  profile: BrainHexType;
  slideId?: string;
  slideTitle?: string;
  onAnswerSelected?: (optId: string, isCorrect: boolean, xpEarned: number) => void;
  onScoreUpdate?: (points: number) => void;
  onReset?: () => void;
  initialState?: Partial<QuizInteractionState>;
  xpReward?: number;
  compact?: boolean;
  className?: string;
  hideHeader?: boolean;
  primaryColor?: string;
  accentColor?: string;
  allowResetAfterSuccess?: boolean;
}

export const InteractiveQuiz: React.FC<InteractiveQuizProps> = ({
  quiz,
  profile,
  slideId = 'quiz-default',
  slideTitle,
  onAnswerSelected,
  onScoreUpdate,
  onReset,
  initialState,
  xpReward = 150,
  compact = false,
  className = '',
  hideHeader = false,
  primaryColor,
  accentColor,
  allowResetAfterSuccess = false,
}) => {
  const [state, setState] = useState<QuizInteractionState>({
    selectedOption: initialState?.selectedOption ?? null,
    isSubmitted: initialState?.isSubmitted ?? false,
    isCorrect: initialState?.isCorrect ?? false,
    attemptsCount: initialState?.attemptsCount ?? 0,
    isLocked: initialState?.isLocked ?? (initialState?.isSubmitted && initialState?.isCorrect) ?? false,
  });

  // Sync state when slideId or initialState changes
  useEffect(() => {
    setState({
      selectedOption: initialState?.selectedOption ?? null,
      isSubmitted: initialState?.isSubmitted ?? false,
      isCorrect: initialState?.isCorrect ?? false,
      attemptsCount: initialState?.attemptsCount ?? 0,
      isLocked: initialState?.isLocked ?? (initialState?.isSubmitted && initialState?.isCorrect) ?? false,
    });
  }, [slideId, initialState?.selectedOption, initialState?.isSubmitted, initialState?.isCorrect, initialState?.isLocked]);

  const isCompletedAndLocked = (state.isSubmitted && state.isCorrect) || state.isLocked;

  const quizConfig = BRAIN_HEX_QUIZ_CONFIGS[profile] || BRAIN_HEX_QUIZ_CONFIGS.Achiever;

  const getArchetypeIcon = () => {
    switch (profile) {
      case 'Mastermind':
        return <Brain className="w-4 h-4 text-cyan-400" />;
      case 'Seeker':
        return <Compass className="w-4 h-4 text-emerald-400" />;
      case 'Survivor':
        return <Shield className="w-4 h-4 text-stone-400" />;
      case 'Conqueror':
        return <Swords className="w-4 h-4 text-rose-400" />;
      case 'Socializer':
        return <Users className="w-4 h-4 text-purple-400" />;
      case 'Daredevil':
        return <Flame className="w-4 h-4 text-amber-400" />;
      case 'Achiever':
      default:
        return <Target className="w-4 h-4 text-amber-400" />;
    }
  };

  const handleSelectOption = (optionId: string, isOptionCorrect: boolean) => {
    // If the quiz is already answered correctly and locked, block interaction!
    if (isCompletedAndLocked) {
      return;
    }

    const wasAlreadyCorrect = state.isSubmitted && state.isCorrect;
    const newAttempts = state.attemptsCount + 1;

    setState({
      selectedOption: optionId,
      isSubmitted: true,
      isCorrect: isOptionCorrect,
      attemptsCount: newAttempts,
      isLocked: isOptionCorrect, // Permanently lock upon correct response
    });

    if (isOptionCorrect) {
      playSoundEffect('quiz_correct');
      const awardedXp = wasAlreadyCorrect ? 0 : xpReward;

      if (!wasAlreadyCorrect) {
        try {
          confetti({
            particleCount: 50,
            spread: 55,
            origin: { y: 0.7 },
            colors: ['#F59E0B', '#10B981', '#6366F1', '#EC4899', '#38BDF8'],
          });
        } catch {
          // confetti fallback
        }
      }

      onAnswerSelected?.(optionId, true, awardedXp);
      if (awardedXp > 0) {
        onScoreUpdate?.(awardedXp);
      }
    } else {
      playSoundEffect('quiz_wrong');
      onAnswerSelected?.(optionId, false, 0);
    }
  };

  const handleResetQuiz = () => {
    if (isCompletedAndLocked && !allowResetAfterSuccess) {
      return;
    }
    setState({
      selectedOption: null,
      isSubmitted: false,
      isCorrect: false,
      attemptsCount: 0,
      isLocked: false,
    });
    playSoundEffect('portal_open');
    onReset?.();
  };

  if (!quiz || !Array.isArray(quiz.options) || quiz.options.length === 0) {
    return null;
  }

  const selectedOptObj = quiz.options.find(
    (o, idx) => String(o.id || `opt-${idx}`) === state.selectedOption
  );

  return (
    <div
      id={`interactive-quiz-${slideId}`}
      className={`rounded-2xl border bg-stone-950/85 backdrop-blur-md shadow-2xl transition-all duration-300 relative overflow-hidden ${
        state.isSubmitted && state.isCorrect
          ? 'border-emerald-500/60 shadow-[0_0_25px_rgba(16,185,129,0.15)]'
          : state.isSubmitted && !state.isCorrect
          ? 'border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.15)]'
          : 'border-stone-800 hover:border-stone-700'
      } ${compact ? 'p-3.5 space-y-3' : 'p-4 sm:p-6 space-y-4'} ${className}`}
      style={{
        borderTopColor: accentColor || undefined,
      }}
    >
      {/* Decorative Glow on Top */}
      <div
        className="absolute top-0 left-0 right-0 h-1 opacity-80"
        style={{
          background: state.isSubmitted
            ? state.isCorrect
              ? 'linear-gradient(90deg, #10B981, #34D399, #10B981)'
              : 'linear-gradient(90deg, #F43F5E, #FB7185, #F43F5E)'
            : primaryColor
            ? `linear-gradient(90deg, transparent, ${primaryColor}, transparent)`
            : 'linear-gradient(90deg, transparent, #F59E0B, transparent)',
        }}
      />

      {/* Header section with BrainHex Archetype and XP Progression */}
      {!hideHeader && (
        <div className="flex items-center justify-between gap-2 border-b border-stone-800/80 pb-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-stone-900 border border-stone-700/80 flex items-center justify-center shadow-inner">
              {getArchetypeIcon()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  ✦ {quizConfig.badgeLabel} • Perfil {profile}
                </span>
                {state.isSubmitted && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                      state.isCorrect
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                        : 'bg-rose-950/80 text-rose-300 border-rose-500/50'
                    }`}
                  >
                    {isCompletedAndLocked ? (
                      <>
                        <Lock className="w-2.5 h-2.5" />
                        <span>Validado & Bloqueado</span>
                      </>
                    ) : state.isCorrect ? (
                      '✦ Validado'
                    ) : (
                      '✦ Tentativa Pendente'
                    )}
                  </span>
                )}
              </div>
              <h4 className="font-cinzel text-xs sm:text-sm font-bold text-stone-100">
                {quizConfig.archetypeTitle}
              </h4>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {state.isSubmitted && (
              <button
                type="button"
                id={`btn-reset-quiz-${slideId}`}
                onClick={handleResetQuiz}
                className="px-2.5 py-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-200 text-[11px] font-semibold flex items-center gap-1.5 transition-all border border-stone-700 hover:border-stone-500 shadow active:scale-95 cursor-pointer"
                title="Limpar seleção e refazer o quiz"
              >
                <RotateCcw className="w-3 h-3 text-amber-400" />
                <span>Refazer</span>
              </button>
            )}

            <div className="px-2.5 py-1 rounded-xl bg-amber-950/40 border border-amber-500/40 flex items-center gap-1.5 text-amber-300 shadow-inner">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-mono text-xs font-bold">+{xpReward} XP</span>
            </div>
          </div>
        </div>
      )}

      {/* Cognitive Pedagogical Focus Banner */}
      <div className="bg-stone-900/60 rounded-xl p-2.5 border border-stone-800/80 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-stone-300">
          <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-[11px] font-medium text-stone-300">
            <strong className="text-stone-100 font-semibold">Foco Cognitivo:</strong>{' '}
            {quizConfig.cognitiveFocus}
          </span>
        </div>
        {state.attemptsCount > 0 && (
          <span className="font-mono text-[10px] text-stone-400 shrink-0">
            {state.attemptsCount} {state.attemptsCount === 1 ? 'tentativa' : 'tentativas'}
          </span>
        )}
      </div>

      {/* Question Text */}
      <div className="space-y-1.5">
        <p className="text-xs sm:text-sm font-semibold text-stone-100 leading-relaxed">
          {quiz.question}
        </p>
        {quiz.explanation && !state.isSubmitted && (
          <p className="text-[11px] text-stone-400 italic">
            Dica: {quiz.explanation}
          </p>
        )}
      </div>

      {/* Multiple Choice Options List */}
      <div className="space-y-2 pt-1" role="radiogroup">
        {quiz.options.map((opt, oidx) => {
          const optId = String(opt.id || `opt-${oidx}`);
          const isOptCorrect =
            opt.isCorrect === true ||
            (opt as any).isCorrect === 'true' ||
            (opt as any).correct === true ||
            (opt as any).is_correct === true;
          const isSelected = state.selectedOption === optId;
          const letter = String.fromCharCode(65 + oidx);

          let optionStyle =
            'border-stone-800 bg-stone-900/80 text-stone-200 hover:border-amber-400/60 hover:bg-stone-800/90 cursor-pointer shadow-sm';

          if (isCompletedAndLocked) {
            if (isOptCorrect) {
              optionStyle =
                'border-emerald-500 bg-emerald-950/80 text-emerald-100 font-bold shadow-lg shadow-emerald-950/60 ring-2 ring-emerald-400/50 cursor-default opacity-100';
            } else {
              optionStyle =
                'border-stone-800/40 bg-stone-950/40 text-stone-500 cursor-not-allowed opacity-45 select-none';
            }
          } else if (state.isSubmitted) {
            if (isOptCorrect && isSelected) {
              optionStyle =
                'border-emerald-500 bg-emerald-950/80 text-emerald-100 font-bold shadow-lg shadow-emerald-950/60 ring-2 ring-emerald-400/50';
            } else if (isSelected && !isOptCorrect) {
              optionStyle =
                'border-rose-500 bg-rose-950/80 text-rose-200 font-medium ring-2 ring-rose-400/50';
            } else if (isOptCorrect) {
              optionStyle =
                'border-emerald-500/70 bg-emerald-950/40 text-emerald-300 ring-1 ring-emerald-500/30';
            } else {
              optionStyle =
                'border-stone-800/60 bg-stone-950/40 text-stone-400 hover:border-stone-600 hover:bg-stone-900/70 cursor-pointer';
            }
          }

          return (
            <div key={optId} className="space-y-1.5">
              <button
                type="button"
                id={`quiz-${slideId}-opt-${optId}`}
                disabled={isCompletedAndLocked}
                aria-disabled={isCompletedAndLocked}
                onClick={() => handleSelectOption(optId, isOptCorrect)}
                className={`w-full text-left p-3 sm:p-3.5 rounded-xl border text-xs sm:text-sm transition-all flex items-start justify-between gap-3 group ${
                  isCompletedAndLocked ? '' : 'active:scale-[0.99]'
                } ${optionStyle}`}
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-mono font-bold transition-all shadow ${
                      isCompletedAndLocked && isOptCorrect
                        ? 'bg-emerald-500 text-black shadow-emerald-500/50'
                        : state.isSubmitted && isOptCorrect
                        ? 'bg-emerald-500 text-black shadow-emerald-500/50'
                        : isSelected
                        ? isOptCorrect
                          ? 'bg-emerald-500 text-black'
                          : 'bg-rose-500 text-white'
                        : isCompletedAndLocked
                        ? 'bg-stone-900 text-stone-600'
                        : 'bg-stone-800 text-stone-300 group-hover:bg-amber-400 group-hover:text-black'
                    }`}
                  >
                    {letter}
                  </span>
                  <span className="leading-relaxed break-words">{opt.text}</span>
                </div>

                {isCompletedAndLocked && isOptCorrect && (
                  <div className="flex items-center gap-1 shrink-0 text-emerald-400 text-[11px] font-bold">
                    <CheckCircle className="w-4 h-4" />
                    <span className="hidden sm:inline font-mono">Bloqueado</span>
                  </div>
                )}
                {!isCompletedAndLocked && state.isSubmitted && isOptCorrect && (
                  <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5 animate-bounce" />
                )}
              </button>

              {/* Specific Explanation Dropdown Feedback for the chosen option */}
              <AnimatePresence>
                {state.isSubmitted && isSelected && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, height: 'auto' }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className={`p-3.5 rounded-xl border text-xs leading-relaxed transition-all ${
                      isOptCorrect
                        ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-200 shadow-md'
                        : 'bg-rose-950/70 border-rose-500/50 text-rose-200 shadow-md'
                    }`}
                  >
                    <div className="font-bold text-[11px] uppercase tracking-wider mb-1.5 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        {isOptCorrect ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span className="font-mono">{quizConfig.feedbackSuccess} (+{xpReward} XP)</span>
                          </>
                        ) : (
                          <>
                            <ShieldAlert className="w-4 h-4 text-rose-400" />
                            <span className="font-mono">{quizConfig.feedbackReview}</span>
                          </>
                        )}
                      </div>
                      {!isOptCorrect && (
                        <span className="text-[10px] text-amber-300 font-mono flex items-center gap-1">
                          <RotateCcw className="w-2.5 h-2.5" />
                          Clique em outra alternativa para tentar novamente
                        </span>
                      )}
                    </div>
                    <p className="text-stone-200">
                      {opt.explanation ||
                        (isOptCorrect
                          ? 'Excelente raciocínio conceitual alinhado aos padrões da disciplina.'
                          : 'Esta resposta não atende aos requisitos ideais para a solução.')}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Footer / Progression Summary */}
      {state.isSubmitted && (
        <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between text-xs text-stone-400 flex-wrap gap-2">
          <span className="flex items-center gap-1 text-[11px]">
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span>Papel Pedagógico: {quizConfig.pedagogicalRole}</span>
          </span>

          <span
            className={`font-mono text-[11px] font-bold ${
              state.isCorrect ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {state.isCorrect ? '✦ XP Integrado à Trilha' : '✦ Revise e reescolha'}
          </span>
        </div>
      )}
    </div>
  );
};
