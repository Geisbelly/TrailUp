import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BrainHexType,
  UniqueInteractiveElement,
  UniqueInteractiveOption,
  UniqueInteractiveDecisionChoice,
} from '../types';
import {
  Sparkles,
  HelpCircle,
  Lightbulb,
  CheckCircle2,
  Check,
  RotateCcw,
  Zap,
  Target,
  Shield,
  Compass,
  Brain,
  Code2,
  ListChecks,
  ArrowRight,
  Flame,
  Star,
  Award,
  Send,
  BookOpen,
  Lock,
  Unlock,
  Sliders,
  CheckCircle,
  NotebookPen,
  PenLine,
  X,
  Trash2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { playSoundEffect } from '../utils/audioSynth';

interface UniqueInteractiveCardProps {
  element: UniqueInteractiveElement;
  profile: BrainHexType;
  slideId: string;
  slideTitle?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  onXpEarned?: (xp: number, reason: string) => void;
  className?: string;
}

export const UniqueInteractiveCard: React.FC<UniqueInteractiveCardProps> = ({
  element,
  profile,
  slideId,
  slideTitle,
  primaryColor = '#F59E0B',
  secondaryColor = '#78350F',
  accentColor = '#FDE68A',
  backgroundColor = '#0C0A09',
  onXpEarned,
  className = '',
}) => {
  const storageKey = `trailup_interactive_${slideId}_${element.id}`;

  // Local interaction state
  const [selectedQuizOption, setSelectedQuizOption] = useState<string | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState<boolean>(false);
  const [selectedDecision, setSelectedDecision] = useState<string | null>(null);
  const [completedChecks, setCompletedChecks] = useState<Record<string, boolean>>({});
  const [userNote, setUserNote] = useState<string>('');
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [reflectionRating, setReflectionRating] = useState<number>(0);
  const [showSampleInsight, setShowSampleInsight] = useState<boolean>(false);
  const [savedSuccessMsg, setSavedSuccessMsg] = useState<string | null>(null);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState<boolean>(false);

  // Load persisted state from localStorage on mount/slide change
  useEffect(() => {
    try {
      const savedRaw = localStorage.getItem(storageKey);
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        if (saved.selectedQuizOption !== undefined) setSelectedQuizOption(saved.selectedQuizOption);
        if (saved.quizSubmitted !== undefined) setQuizSubmitted(saved.quizSubmitted);
        if (saved.selectedDecision !== undefined) setSelectedDecision(saved.selectedDecision);
        if (saved.completedChecks !== undefined) setCompletedChecks(saved.completedChecks);
        if (saved.userNote !== undefined) setUserNote(saved.userNote);
        if (saved.isCompleted !== undefined) setIsCompleted(saved.isCompleted);
        if (saved.reflectionRating !== undefined) setReflectionRating(saved.reflectionRating);
        return;
      }
    } catch {
      // Fallback
    }

    // Reset default if no saved state
    setSelectedQuizOption(null);
    setQuizSubmitted(false);
    setSelectedDecision(null);
    setCompletedChecks({});
    setUserNote('');
    setIsCompleted(false);
    setReflectionRating(0);
    setShowSampleInsight(false);
  }, [storageKey]);

  // Helper to persist state
  const persistState = (updates: Record<string, any>) => {
    try {
      const currentRaw = localStorage.getItem(storageKey);
      const current = currentRaw ? JSON.parse(currentRaw) : {};
      const next = { ...current, ...updates };
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Ignore
    }
  };

  // Trigger celebratory FX
  const triggerSuccessCelebration = (xp: number, label: string) => {
    playSoundEffect('level_up');
    confetti({
      particleCount: 35,
      spread: 60,
      origin: { y: 0.8 },
      colors: [primaryColor, accentColor, '#10B981', '#F59E0B'],
    });
    if (onXpEarned) {
      onXpEarned(xp, label);
    }
  };

  // 1. Mini-Quiz Handler
  const handleQuizAnswer = (opt: UniqueInteractiveOption) => {
    if (quizSubmitted) return;
    setSelectedQuizOption(opt.id);
    setQuizSubmitted(true);

    if (opt.isCorrect) {
      setIsCompleted(true);
      triggerSuccessCelebration(element.xpReward, `Quiz: ${element.title}`);
      persistState({ selectedQuizOption: opt.id, quizSubmitted: true, isCompleted: true });
    } else {
      playSoundEffect('error');
      persistState({ selectedQuizOption: opt.id, quizSubmitted: true });
    }
  };

  const handleResetQuiz = () => {
    setSelectedQuizOption(null);
    setQuizSubmitted(false);
    setIsCompleted(false);
    playSoundEffect('ambient_bell');
    persistState({ selectedQuizOption: null, quizSubmitted: false, isCompleted: false });
  };

  // 2. Decision Choice Handler
  const handleSelectDecision = (choice: UniqueInteractiveDecisionChoice) => {
    setSelectedDecision(choice.id);
    if (!isCompleted) {
      setIsCompleted(true);
      triggerSuccessCelebration(choice.xpReward || element.xpReward, `Decisão: ${choice.label}`);
    } else {
      playSoundEffect('quest_check');
    }
    persistState({ selectedDecision: choice.id, isCompleted: true });
  };

  // 3. Mastery Checklist Handler
  const handleToggleCheck = (itemId: string, itemXp: number) => {
    const isNowChecked = !completedChecks[itemId];
    const next = { ...completedChecks, [itemId]: isNowChecked };
    setCompletedChecks(next);

    if (isNowChecked) {
      playSoundEffect('quest_check');
      if (onXpEarned) onXpEarned(itemXp || 25, 'Marco de Maestria');
    }

    // Check if all are completed
    const totalItems = element.checklistItems?.length || 1;
    const completedCount = Object.values(next).filter(Boolean).length;
    const allDone = completedCount >= totalItems;

    if (allDone && !isCompleted) {
      setIsCompleted(true);
      triggerSuccessCelebration(50, `Checklist Completo: ${element.title}`);
    }

    persistState({ completedChecks: next, isCompleted: allDone });
  };

  // 4. Reflection & Action Submit Handler
  const handleSaveReflectionOrAction = () => {
    if (!isCompleted) {
      setIsCompleted(true);
      triggerSuccessCelebration(element.xpReward, element.title);
    } else {
      playSoundEffect('quest_check');
    }
    setSavedSuccessMsg('Reflexão & Resposta salvas com sucesso!');
    setTimeout(() => setSavedSuccessMsg(null), 3500);
    persistState({
      userNote,
      reflectionRating,
      isCompleted: true,
    });
  };

  // Icon by element type
  const getHeaderIcon = () => {
    switch (element.type) {
      case 'mini_quiz':
        return <HelpCircle className="w-4 h-4 text-amber-400" />;
      case 'reflection_point':
        return <Brain className="w-4 h-4 text-cyan-400" />;
      case 'action_prompt':
        return <Zap className="w-4 h-4 text-amber-300" />;
      case 'decision_choice':
        return <Compass className="w-4 h-4 text-emerald-400" />;
      case 'mastery_checklist':
        return <ListChecks className="w-4 h-4 text-emerald-400" />;
      case 'code_inspect':
        return <Code2 className="w-4 h-4 text-amber-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div
      id={`interactive-card-${element.id}`}
      className={`my-3 p-4 sm:p-5 rounded-2xl border backdrop-blur-md shadow-xl transition-all relative overflow-hidden ${className}`}
      style={{
        borderColor: isCompleted ? `${primaryColor}80` : `${primaryColor}45`,
        backgroundColor: `${backgroundColor}D5`,
      }}
    >
      {/* Top Ambient Glow Gradient */}
      <div
        className="absolute top-0 left-0 right-0 h-1 pointer-events-none opacity-80"
        style={{
          background: `linear-gradient(90deg, transparent, ${primaryColor}, transparent)`,
        }}
      />

      {/* Header with Badges & XP Award */}
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3 pb-2.5 border-b border-white/10">
        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="p-1.5 rounded-lg border shadow-sm flex items-center justify-center"
            style={{
              backgroundColor: `${primaryColor}20`,
              borderColor: `${primaryColor}60`,
            }}
          >
            {getHeaderIcon()}
          </div>
          <div>
            <span
              className="text-[10px] font-mono font-bold uppercase tracking-wider block"
              style={{ color: accentColor }}
            >
              {element.badge || 'Elemento Interativo de Maestria'}
            </span>
            <h3 className="text-sm sm:text-base font-cinzel font-bold text-white leading-tight">
              {element.title}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isCompleted ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 shadow-sm animate-pulse">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Concluído (+{element.xpReward} XP)
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full border shadow-sm"
              style={{
                borderColor: `${primaryColor}60`,
                backgroundColor: `${primaryColor}15`,
                color: accentColor,
              }}
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              +{element.xpReward} XP
            </span>
          )}
        </div>
      </div>

      {/* Main Prompt Text */}
      <div className="mb-4">
        <p className="text-xs sm:text-sm font-medium text-stone-100 leading-relaxed">
          {element.prompt}
        </p>
        {element.contextHint && (
          <p className="text-[11px] text-stone-400 mt-1 italic">
            {element.contextHint}
          </p>
        )}
      </div>

      {/* RENDER BY TYPE */}

      {/* 1. MINI QUIZ */}
      {element.type === 'mini_quiz' && element.quizOptions && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 gap-2">
            {element.quizOptions.map((opt, idx) => {
              const isSelected = selectedQuizOption === opt.id;
              const isCorrectOpt = !!opt.isCorrect;

              let btnBorder = 'border-stone-800 hover:border-stone-600 bg-stone-900/60';
              let btnText = 'text-stone-200';
              let indicatorBg = 'bg-stone-800 text-stone-400';

              if (quizSubmitted) {
                if (isCorrectOpt) {
                  btnBorder = 'border-emerald-500/80 bg-emerald-950/40 text-emerald-100 shadow-md';
                  indicatorBg = 'bg-emerald-500 text-black';
                } else if (isSelected && !isCorrectOpt) {
                  btnBorder = 'border-rose-500/80 bg-rose-950/40 text-rose-100';
                  indicatorBg = 'bg-rose-500 text-white';
                } else {
                  btnBorder = 'border-stone-900 bg-stone-950/40 opacity-50';
                }
              } else if (isSelected) {
                btnBorder = 'border-amber-400 bg-amber-950/40 text-amber-100';
                indicatorBg = 'bg-amber-500 text-black';
              }

              return (
                <motion.button
                  key={opt.id}
                  type="button"
                  whileHover={!quizSubmitted ? { scale: 1.01, x: 2 } : {}}
                  whileTap={!quizSubmitted ? { scale: 0.99 } : {}}
                  onClick={() => handleQuizAnswer(opt)}
                  disabled={quizSubmitted}
                  className={`w-full p-3 rounded-xl border text-left transition-all flex items-start gap-3 select-none ${btnBorder} ${btnText} ${
                    quizSubmitted ? 'cursor-default' : 'cursor-pointer'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-xs font-mono font-bold transition-colors ${indicatorBg}`}
                  >
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm font-medium">{opt.text}</p>
                    {quizSubmitted && (isSelected || isCorrectOpt) && opt.explanation && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className={`mt-2 p-2 rounded-lg text-xs leading-relaxed ${
                          isCorrectOpt
                            ? 'bg-emerald-900/40 text-emerald-200 border border-emerald-700/40'
                            : 'bg-rose-900/40 text-rose-200 border border-rose-700/40'
                        }`}
                      >
                        <div className="flex items-start gap-1.5">
                          {isCorrectOpt ? (
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          ) : (
                            <HelpCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                          )}
                          <span>{opt.explanation}</span>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>

          {quizSubmitted && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] font-mono text-stone-400">
                {selectedQuizOption &&
                element.quizOptions.find((o) => o.id === selectedQuizOption)?.isCorrect
                  ? '✦ Resposta correta validada com louvor!'
                  : 'Reveja a justificativa e tente novamente.'}
              </span>
              <button
                type="button"
                onClick={handleResetQuiz}
                className="flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 px-3 py-1 rounded-lg bg-stone-900 border border-stone-800 hover:border-amber-500/50 transition-all cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Refazer Teste
              </button>
            </div>
          )}
        </div>
      )}

      {/* 2. REFLECTION POINT */}
      {element.type === 'reflection_point' && (
        <div className="space-y-3">
          {element.guidingQuestions && element.guidingQuestions.length > 0 && (
            <div className="p-3 rounded-xl bg-stone-950/80 border border-white/10 space-y-1.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1">
                <Brain className="w-3.5 h-3.5" />
                Perguntas Orientadoras de Pensamento:
              </span>
              <ul className="space-y-1 text-xs text-stone-300">
                {element.guidingQuestions.map((q, qidx) => (
                  <li key={qidx} className="flex items-start gap-2">
                    <span className="text-cyan-400 font-bold mt-0.5">•</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Self-Assessment Mastery Rating */}
          <div className="flex items-center justify-between flex-wrap gap-2 py-1 px-1">
            <span className="text-xs font-medium text-stone-300">
              Autoavaliação de Domínio deste Conceito:
            </span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => {
                    setReflectionRating(star);
                    playSoundEffect('quest_check');
                    persistState({ reflectionRating: star });
                  }}
                  className="p-1 text-stone-600 hover:text-amber-400 transition-colors cursor-pointer"
                  title={`${star} de 5 estrelas de maestria`}
                >
                  <Star
                    className={`w-4 h-4 ${
                      reflectionRating >= star
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-stone-700'
                    }`}
                  />
                </button>
              ))}
              <span className="text-[10px] font-mono text-stone-400 ml-1">
                ({reflectionRating > 0 ? `${reflectionRating}/5` : 'Não avaliado'})
              </span>
            </div>
          </div>

          {/* Compact Note Action Bar (Icon + Trigger for Modal) */}
          <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-stone-950/70 border border-stone-800 hover:border-amber-500/40 transition-colors">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div
                className={`p-1.5 rounded-lg shrink-0 ${
                  userNote.trim() ? 'bg-amber-500/20 text-amber-300' : 'bg-stone-800 text-stone-400'
                }`}
              >
                <NotebookPen className="w-3.5 h-3.5" />
              </div>
              <div className="truncate">
                <span className="text-[10px] font-bold font-mono uppercase tracking-wider block text-stone-300">
                  {userNote.trim() ? 'Anotação Registrada' : 'Anotação & Reflexão'}
                </span>
                <p className="text-[11px] text-stone-400 truncate italic">
                  {userNote.trim()
                    ? `"${userNote.slice(0, 45)}..."`
                    : element.userNotePlaceholder || 'Clique no botão para abrir o modal de anotação...'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsNoteModalOpen(true)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 transition-transform active:scale-95 shadow cursor-pointer"
              style={{
                backgroundColor: userNote.trim() ? `${primaryColor}25` : primaryColor,
                color: userNote.trim() ? accentColor : '#000000',
                border: userNote.trim() ? `1px solid ${primaryColor}70` : undefined,
              }}
              title="Abrir modal para escrever/editar anotações"
            >
              <PenLine className="w-3.5 h-3.5" />
              <span>{userNote.trim() ? 'Editar Anotação' : 'Anotar (+XP)'}</span>
            </button>
          </div>

          {/* Sample Insight Reveal */}
          {element.sampleReflection && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowSampleInsight(!showSampleInsight)}
                className="text-[11px] font-medium text-stone-400 hover:text-stone-200 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                <span>{showSampleInsight ? 'Ocultar Insight Modelo' : 'Ver Insight do Guardião'}</span>
              </button>
              {showSampleInsight && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-2 p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs text-amber-200 leading-relaxed"
                >
                  <strong className="text-amber-300 font-semibold block mb-1">
                    Insight Síntese do Guardião:
                  </strong>
                  <p>{element.sampleReflection}</p>
                </motion.div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. ACTION PROMPT / CHALLENGE */}
      {element.type === 'action_prompt' && (
        <div className="space-y-3">
          {element.actionInstructions && element.actionInstructions.length > 0 && (
            <div className="p-3.5 rounded-xl bg-stone-950/80 border border-white/10 space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Roteiro de Execução Técnica:
              </span>
              <div className="space-y-1.5 text-xs text-stone-200">
                {element.actionInstructions.map((inst, iidx) => (
                  <div key={iidx} className="flex items-start gap-2">
                    <span className="text-amber-400 font-mono font-bold">{iidx + 1}.</span>
                    <span>{inst.replace(/^\d+\.\s*/, '')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {element.expectedDeliverable && (
            <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-xs text-emerald-200 flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-emerald-300 font-semibold">Entregável Esperado: </strong>
                <span>{element.expectedDeliverable}</span>
              </div>
            </div>
          )}

          {/* Compact Action Note Bar (Icon + Trigger for Modal) */}
          <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-stone-950/70 border border-stone-800 hover:border-amber-500/40 transition-colors">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div
                className={`p-1.5 rounded-lg shrink-0 ${
                  userNote.trim() ? 'bg-amber-500/20 text-amber-300' : 'bg-stone-800 text-stone-400'
                }`}
              >
                <NotebookPen className="w-3.5 h-3.5" />
              </div>
              <div className="truncate">
                <span className="text-[10px] font-bold font-mono uppercase tracking-wider block text-stone-300">
                  {userNote.trim() ? 'Execução Registrada' : 'Registro de Execução'}
                </span>
                <p className="text-[11px] text-stone-400 truncate italic">
                  {userNote.trim()
                    ? `"${userNote.slice(0, 45)}..."`
                    : element.userNotePlaceholder || 'Clique no botão para abrir o modal e registrar a ação...'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsNoteModalOpen(true)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 transition-transform active:scale-95 shadow cursor-pointer"
              style={{
                backgroundColor: userNote.trim() ? `${primaryColor}25` : primaryColor,
                color: userNote.trim() ? accentColor : '#000000',
                border: userNote.trim() ? `1px solid ${primaryColor}70` : undefined,
              }}
              title="Abrir modal para registrar execução prática"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{userNote.trim() ? 'Editar Registro' : 'Registrar (+XP)'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. DECISION CHOICE */}
      {element.type === 'decision_choice' && element.decisionChoices && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {element.decisionChoices.map((choice) => {
              const isChosen = selectedDecision === choice.id;
              return (
                <motion.div
                  key={choice.id}
                  whileHover={{ scale: 1.015, y: -2 }}
                  whileTap={{ scale: 0.985 }}
                  onClick={() => handleSelectDecision(choice)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                    isChosen
                      ? 'border-amber-400 bg-amber-950/40 text-amber-100 shadow-md ring-1 ring-amber-400/50'
                      : 'border-stone-800 bg-stone-900/60 text-stone-300 hover:border-stone-600'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-xs sm:text-sm text-white">
                        {choice.label}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-amber-400 bg-stone-950 px-1.5 py-0.5 rounded border border-stone-800">
                        +{choice.xpReward || 50} XP
                      </span>
                    </div>
                    <p className="text-xs text-stone-400 leading-relaxed mb-2">
                      {choice.description}
                    </p>
                  </div>

                  {isChosen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-2 pt-2 border-t border-amber-500/30 text-xs text-amber-200 font-medium flex items-start gap-1.5"
                    >
                      <ArrowRight className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span>{choice.outcome}</span>
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. MASTERY CHECKLIST */}
      {element.type === 'mastery_checklist' && element.checklistItems && (
        <div className="space-y-2">
          {element.checklistItems.map((item, cidx) => {
            const isChecked = !!completedChecks[item.id];
            return (
              <motion.div
                key={item.id}
                whileHover={{ scale: 1.01, x: 2 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => handleToggleCheck(item.id, item.xp)}
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3 select-none ${
                  isChecked
                    ? 'border-emerald-500/70 bg-emerald-950/30 text-emerald-100 shadow-sm'
                    : 'border-stone-800 bg-stone-900/60 text-stone-300 hover:border-stone-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-md text-xs font-mono font-bold transition-colors ${
                      isChecked
                        ? 'bg-emerald-500 text-black shadow'
                        : 'bg-stone-800 text-stone-400 border border-stone-700'
                    }`}
                  >
                    {isChecked ? <Check className="w-3 h-3 stroke-[3]" /> : String(cidx + 1)}
                  </div>
                  <span className={`text-xs sm:text-sm font-medium ${isChecked ? 'line-through opacity-80' : ''}`}>
                    {item.text}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="text-[10px] font-mono font-bold px-2 py-0.5 rounded shadow-sm"
                    style={{
                      backgroundColor: isChecked ? `${primaryColor}40` : `${primaryColor}15`,
                      color: accentColor,
                    }}
                  >
                    +{item.xp || 30} XP
                  </span>
                  {isChecked && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* 6. CODE INSPECT */}
      {element.type === 'code_inspect' && (
        <div className="space-y-3">
          {element.codeSnippet && (
            <div className="rounded-xl border border-stone-800 bg-stone-950 p-3 font-mono text-[11px] sm:text-xs text-amber-200 overflow-x-auto shadow-inner">
              <div className="flex items-center justify-between border-b border-stone-800 pb-1 mb-2 text-stone-400 text-[10px]">
                <span className="flex items-center gap-1 text-amber-400">
                  <Code2 className="w-3 h-3" />
                  {element.codeSnippet.language}
                </span>
                {element.codeSnippet.inspectionHint && (
                  <span className="text-stone-400 italic">
                    {element.codeSnippet.inspectionHint}
                  </span>
                )}
              </div>
              <pre className="whitespace-pre">{element.codeSnippet.code}</pre>
            </div>
          )}

          {element.guidingQuestions && element.guidingQuestions.length > 0 && (
            <div className="p-3 rounded-xl bg-stone-950/80 border border-white/10 space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-300">
                Critérios de Diagnóstico Arquitetural:
              </span>
              <ul className="space-y-1 text-xs text-stone-300">
                {element.guidingQuestions.map((q, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-amber-400 font-bold">•</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Compact Code Diagnosis Note Bar (Icon + Trigger for Modal) */}
          <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-stone-950/70 border border-stone-800 hover:border-amber-500/40 transition-colors">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div
                className={`p-1.5 rounded-lg shrink-0 ${
                  userNote.trim() ? 'bg-amber-500/20 text-amber-300' : 'bg-stone-800 text-stone-400'
                }`}
              >
                <NotebookPen className="w-3.5 h-3.5" />
              </div>
              <div className="truncate">
                <span className="text-[10px] font-bold font-mono uppercase tracking-wider block text-stone-300">
                  {userNote.trim() ? 'Diagnóstico Registrado' : 'Diagnóstico Arquitetural'}
                </span>
                <p className="text-[11px] text-stone-400 truncate italic">
                  {userNote.trim()
                    ? `"${userNote.slice(0, 45)}..."`
                    : element.userNotePlaceholder || 'Clique no botão para abrir o modal e redigir o diagnóstico...'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsNoteModalOpen(true)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 transition-transform active:scale-95 shadow cursor-pointer"
              style={{
                backgroundColor: userNote.trim() ? `${primaryColor}25` : primaryColor,
                color: userNote.trim() ? accentColor : '#000000',
                border: userNote.trim() ? `1px solid ${primaryColor}70` : undefined,
              }}
              title="Abrir modal para diagnóstico técnico"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>{userNote.trim() ? 'Editar Diagnóstico' : 'Diagnosticar (+XP)'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Success Notification Toast */}
      {savedSuccessMsg && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="mt-3 p-2 rounded-lg bg-emerald-950/80 border border-emerald-500/60 text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5 shadow"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>{savedSuccessMsg}</span>
        </motion.div>
      )}

      {/* Interactive Note Modal (Dedicated Dialog) */}
      <AnimatePresence>
        {isNoteModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() => setIsNoteModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="relative w-full max-w-lg bg-stone-950/95 border border-stone-700 rounded-2xl shadow-2xl p-5 text-stone-100 flex flex-col gap-4 overflow-hidden"
              style={{
                borderColor: `${primaryColor}70`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div
                    className="p-2 rounded-xl text-black font-bold shadow"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <NotebookPen className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 block">
                      {element.type === 'reflection_point'
                        ? '✦ Reflexão Guiada do Aluno'
                        : element.type === 'action_prompt'
                        ? '✦ Registro de Execução Prática'
                        : '✦ Diagnóstico Técnico Arquitetural'}
                    </span>
                    <h3 className="text-sm font-bold text-white truncate max-w-xs sm:max-w-sm">
                      {element.title || slideTitle || 'Anotações & Resposta'}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNoteModalOpen(false)}
                  className="p-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-white transition-colors cursor-pointer"
                  title="Fechar modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Context Prompt */}
              <div className="p-3 rounded-xl bg-stone-900/80 border border-stone-800 text-xs text-stone-300 leading-relaxed max-h-32 overflow-y-auto">
                <p className="font-semibold text-white mb-1">{element.prompt}</p>
                {element.type === 'reflection_point' && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-stone-800 flex-wrap">
                    <span className="text-[11px] text-stone-400">Autoavaliação de Domínio:</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => {
                            setReflectionRating(star);
                            playSoundEffect('quest_check');
                            persistState({ reflectionRating: star });
                          }}
                          className="p-0.5 text-stone-600 hover:text-amber-400 transition-colors cursor-pointer"
                        >
                          <Star
                            className={`w-3.5 h-3.5 ${
                              reflectionRating >= star
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-stone-700'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Note Textarea */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono text-stone-400">
                  <span>Suas Anotações Técnicas / Resposta:</span>
                  <span>{userNote.length} caracteres</span>
                </div>
                <textarea
                  value={userNote}
                  onChange={(e) => setUserNote(e.target.value)}
                  placeholder={
                    element.userNotePlaceholder ||
                    'Escreva suas reflexões técnicas, notas de aplicação prática ou dúvidas de aprofundamento...'
                  }
                  rows={5}
                  autoFocus
                  className="w-full rounded-xl border border-stone-700 bg-stone-900/90 p-3.5 text-xs sm:text-sm text-stone-100 placeholder-stone-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none transition-all resize-none shadow-inner"
                />
              </div>

              {/* Modal Footer Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-white/10 gap-2">
                {userNote ? (
                  <button
                    type="button"
                    onClick={() => {
                      setUserNote('');
                      persistState({ userNote: '' });
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs text-stone-400 hover:text-rose-400 hover:bg-stone-900 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpar</span>
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setIsNoteModalOpen(false)}
                    className="px-3.5 py-1.5 rounded-xl text-xs text-stone-300 hover:text-white bg-stone-900 hover:bg-stone-800 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleSaveReflectionOrAction();
                      setIsNoteModalOpen(false);
                    }}
                    className="px-4 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow transition-transform active:scale-95 cursor-pointer"
                    style={{
                      backgroundColor: primaryColor,
                      color: '#000000',
                    }}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isCompleted ? 'Salvar Anotação' : `Consolidar (+${element.xpReward} XP)`}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
