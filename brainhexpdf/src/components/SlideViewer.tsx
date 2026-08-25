import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  CheckCircle,
  HelpCircle,
  Shield,
  Swords,
  Compass,
  Trophy,
  Code,
  Code2,
  Lock,
  Unlock,
  Lightbulb,
  Maximize2,
  Check,
  RotateCcw,
  Zap,
  Target,
  Star,
  Flame,
  ArrowRight,
  Network,
  TrendingUp,
  Award,
  BookOpen,
  Layers,
  Sparkle,
  CheckCircle2,
  Wand2,
  SlidersHorizontal,
  Brain,
  Users,
  ShieldAlert,
  ListChecks,
  FileText,
  Image as ImageIcon,
  Sliders,
  Eye,
  RefreshCw,
  Trash2,
  NotebookPen,
  PenLine,
  StickyNote,
  X,
  Copy,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  BrainHexType,
  DeckData,
  SlideData,
  ViewportMode,
  MagicalEffectType,
  MagicalEffectIntensity,
} from '../types';
import { BrainHexAvatar } from './BrainHexAvatars';
import {
  BRAIN_HEX_GUIDE_INFOS,
  BRAIN_HEX_GUIDE_NAMES,
  BRAIN_HEX_QUIZ_CONFIGS,
} from '../data/brainHexProfiles';
import {
  TrailUpGemLogo,
  TrailUpArchetypeSigil,
  TrailUpHeraldicBanner,
  TrailUpNatureVector,
} from './TrailUpThematicGraphics';
import {
  ThematicFrameContainer,
  ThematicBackgroundScene,
  ThematicQuoteBanner,
  ThematicStickyNote,
  ThematicSectionHeaderBadge,
  ThematicTimelineRoadmap,
  AiThematicIcon,
  AiMedievalDivider,
  AiMedievalPromptBadge,
  AiThematicSlideFrame,
  BrainHexDecorativeBorderOverlay,
  generateThematicSvgIcon,
  generateThematicSvgBorder,
  generateMedievalSvgDivider,
} from './ThematicDecorations';
import { MagicalParticleCanvas } from './MagicalParticleCanvas';
import { playSoundEffect } from '../utils/audioSynth';
import { Palette, Download } from 'lucide-react';
import { generateInteractiveHtml } from '../utils/deckExportUtils';
import {
  getBrainHexBorderClassName,
  getBrainHexBorderCss,
} from '../utils/brainHexBorderStyles';
import { InteractiveQuiz } from './InteractiveQuiz';
import { UniqueInteractiveCard } from './UniqueInteractiveCard';
import { generateUniqueInteractiveElement } from '../utils/interactiveElementGenerator';
import { InteractiveVisualRenderer } from './InteractiveVisualRenderer';
import { analyzeAndGenerateVisualDiagram } from '../utils/visualReferenceAnalyzer';
import { ContentVisualRepresentation } from './ContentVisualRepresentation';
import { SmartConceptVisualizer } from './SmartConceptVisualizer';

interface SlideViewerProps {
  deck: DeckData;
  viewportMode: ViewportMode;
  currentSlideIndex: number;
  onSlideChange: (index: number) => void;
  onOpenPresenter?: () => void;
  onUpdateDeck?: (updatedDeck: DeckData) => void;
  onOpenKnowledgeGraph?: () => void;
}

export const SlideViewer: React.FC<SlideViewerProps> = ({
  deck,
  viewportMode,
  currentSlideIndex,
  onSlideChange,
  onUpdateDeck,
  onOpenKnowledgeGraph,
}) => {
  const currentSlide: SlideData = deck.slides[currentSlideIndex] || deck.slides[0];
  const theme = deck.themeConfig;

  // Visual archetype defined strictly by the deck's content and BrainHex profile
  const activeArchetype = deck.visualThematicArchetype || 'trailup-astral';

  // Slide-indexed persistent interactive states so users never lose their responses
  const slideKey = currentSlide?.id || `slide-${currentSlideIndex}`;
  const deckStorageKey = `trailup_slideviewer_save_${deck.id || deck.title.replace(/[^a-zA-Z0-9]/g, '_')}`;

  const [quizStatesBySlide, setQuizStatesBySlide] = useState<Record<string, { selectedOption: string | null; isSubmitted: boolean; isCorrect: boolean }>>(() => {
    try {
      const raw = localStorage.getItem(`${deckStorageKey}_quiz`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [completedChecklistItems, setCompletedChecklistItems] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(`${deckStorageKey}_checklist`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [decisionsBySlide, setDecisionsBySlide] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(`${deckStorageKey}_decisions`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [secretsRevealedBySlide, setSecretsRevealedBySlide] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(`${deckStorageKey}_secrets`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [bossHpBySlide, setBossHpBySlide] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(`${deckStorageKey}_bossHp`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [masteredTakeaways, setMasteredTakeaways] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(`${deckStorageKey}_takeaways`);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [activeTimelineStepBySlide, setActiveTimelineStepBySlide] = useState<Record<string, number>>({});
  const [guideAdviceRevealed, setGuideAdviceRevealed] = useState<Record<string, boolean>>({});
  const [accumulatedXp, setAccumulatedXp] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(`${deckStorageKey}_xp`);
      return raw ? Number(raw) : 100;
    } catch {
      return 100;
    }
  });
  const [showDamageAnimation, setShowDamageAnimation] = useState<string | null>(null);

  // Sync state changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(`${deckStorageKey}_quiz`, JSON.stringify(quizStatesBySlide));
      localStorage.setItem(`${deckStorageKey}_checklist`, JSON.stringify(completedChecklistItems));
      localStorage.setItem(`${deckStorageKey}_decisions`, JSON.stringify(decisionsBySlide));
      localStorage.setItem(`${deckStorageKey}_secrets`, JSON.stringify(secretsRevealedBySlide));
      localStorage.setItem(`${deckStorageKey}_bossHp`, JSON.stringify(bossHpBySlide));
      localStorage.setItem(`${deckStorageKey}_takeaways`, JSON.stringify(masteredTakeaways));
      localStorage.setItem(`${deckStorageKey}_xp`, String(accumulatedXp));
    } catch (e) {
      console.warn('Could not persist viewer state:', e);
    }
  }, [quizStatesBySlide, completedChecklistItems, decisionsBySlide, secretsRevealedBySlide, bossHpBySlide, masteredTakeaways, accumulatedXp, deckStorageKey]);

  // Current Slide resolved interaction states
  const currentQuizState = quizStatesBySlide[slideKey] || {
    selectedOption: null,
    isSubmitted: false,
    isCorrect: false,
  };
  const currentDecision = decisionsBySlide[slideKey] || null;
  const isSecretRevealed = !!secretsRevealedBySlide[slideKey];
  const bossMaxHp = currentSlide?.rpgQuest?.bossHp || 1000;
  const currentBossHp = bossHpBySlide[slideKey] !== undefined ? bossHpBySlide[slideKey] : bossMaxHp;

  // Magical Particle System state
  const [magicalEffectType, setMagicalEffectType] = useState<MagicalEffectType>('auto');
  const [magicalIntensity, setMagicalIntensity] = useState<MagicalEffectIntensity>('epic');
  const [burstTrigger, setBurstTrigger] = useState<number>(0);
  const [showMagicalMenu, setShowMagicalMenu] = useState<boolean>(false);
  const [downloadedSuccess, setDownloadedSuccess] = useState<boolean>(false);

  // AI-Generated Visual Elements State
  const [isGeneratingDecorations, setIsGeneratingDecorations] = useState<boolean>(false);
  const [decorationSuccessMsg, setDecorationSuccessMsg] = useState<string | null>(null);

  // Ambient Background Image Generation State
  const [isGeneratingAmbientBg, setIsGeneratingAmbientBg] = useState<boolean>(false);
  const [isBatchGeneratingBg, setIsBatchGeneratingBg] = useState<boolean>(false);
  const [batchBgProgress, setBatchBgProgress] = useState<{ current: number; total: number } | null>(null);
  const [showAmbientMenu, setShowAmbientMenu] = useState<boolean>(false);
  const [ambientOpacity, setAmbientOpacity] = useState<number>(0.38);
  const [ambientBlur, setAmbientBlur] = useState<number>(0);
  const [ambientCustomPrompt, setAmbientCustomPrompt] = useState<string>('');
  const [ambientSuccessMsg, setAmbientSuccessMsg] = useState<string | null>(null);
  const [ambientErrorMsg, setAmbientErrorMsg] = useState<string | null>(null);

  // Study Visual Illustrations State (Exemplos Visuais Didáticos)
  const [isGeneratingIllustration, setIsGeneratingIllustration] = useState<boolean>(false);
  const [isBatchGeneratingIllustration, setIsBatchGeneratingIllustration] = useState<boolean>(false);
  const [batchIllustrationProgress, setBatchIllustrationProgress] = useState<{ current: number; total: number } | null>(null);
  const [illustrationSuccessMsg, setIllustrationSuccessMsg] = useState<string | null>(null);
  const [selectedZoomImage, setSelectedZoomImage] = useState<string | null>(null);

  // Slide Notes Modal State (Anotações do Slide em Ícone + Modal)
  const [isSlideNotesModalOpen, setIsSlideNotesModalOpen] = useState<boolean>(false);
  const [slideUserNotes, setSlideUserNotes] = useState<Record<number, string>>(() => {
    try {
      const saved = localStorage.getItem(`slide_notes_${deck.id}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handleUpdateSlideNote = (noteText: string) => {
    setSlideUserNotes((prev) => {
      const updated = { ...prev, [currentSlideIndex]: noteText };
      try {
        localStorage.setItem(`slide_notes_${deck.id}`, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  };

  // Sync ambient opacity/blur when current slide changes
  useEffect(() => {
    if (currentSlide) {
      if (currentSlide.ambientOverlayOpacity !== undefined) {
        setAmbientOpacity(currentSlide.ambientOverlayOpacity);
      }
      if (currentSlide.ambientBlur !== undefined) {
        setAmbientBlur(currentSlide.ambientBlur);
      }
    }
  }, [currentSlideIndex, currentSlide]);

  const handleGenerateAmbientBackgroundForSlide = async (slideIndex: number = currentSlideIndex, customPrompt?: string) => {
    const targetSlide = deck.slides[slideIndex];
    if (!targetSlide || isGeneratingAmbientBg) return;

    setIsGeneratingAmbientBg(true);
    setAmbientErrorMsg(null);
    playSoundEffect('action');

    try {
      const res = await fetch('/api/generate-ambient-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slideId: targetSlide.id,
          slideTitle: targetSlide.title,
          slideTopic: targetSlide.subtopic || targetSlide.title,
          targetProfile: deck.targetProfile,
          environmentSetting: targetSlide.thematicStorytelling?.environmentSetting,
          storyArcPhase: targetSlide.thematicStorytelling?.storyArcPhase,
          narrativeBeat: targetSlide.thematicStorytelling?.narrativeBeat,
          customPrompt: customPrompt && customPrompt.trim() ? customPrompt.trim() : undefined,
          aspectRatio: '16:9',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erro ao gerar cenário de fundo ambiente.');
      }

      const updatedSlides = deck.slides.map((s, idx) => {
        if (idx === slideIndex) {
          return {
            ...s,
            backgroundImage: data.imageUrl,
            ambientPrompt: data.prompt,
            ambientEnvironmentSetting: data.environmentSetting,
            ambientOverlayOpacity: ambientOpacity,
            ambientBlur: ambientBlur,
          };
        }
        return s;
      });

      const updatedDeck = { ...deck, slides: updatedSlides };
      if (onUpdateDeck) {
        onUpdateDeck(updatedDeck);
      }

      playSoundEffect('level_up');
      setBurstTrigger((b) => b + 2);
      try {
        confetti({
          particleCount: 40,
          spread: 80,
          origin: { y: 0.6 },
          colors: [theme.palette.primary, theme.palette.accent, '#38BDF8'],
        });
      } catch (e) {
        // ignore
      }
      setAmbientSuccessMsg('Cenário Ambiente Gerado com Sucesso!');
      setTimeout(() => setAmbientSuccessMsg(null), 3500);
    } catch (err: any) {
      console.error('Ambient background generation error:', err);
      setAmbientErrorMsg(err.message || 'Falha ao gerar imagem.');
    } finally {
      setIsGeneratingAmbientBg(false);
    }
  };

  const handleBatchGenerateAmbientBackgrounds = async () => {
    if (isBatchGeneratingBg || isGeneratingAmbientBg) return;
    setIsBatchGeneratingBg(true);
    setAmbientErrorMsg(null);
    playSoundEffect('action');

    try {
      let currentDeckState = { ...deck };
      const total = currentDeckState.slides.length;

      for (let i = 0; i < total; i++) {
        setBatchBgProgress({ current: i + 1, total });
        const slide = currentDeckState.slides[i];
        
        try {
          const res = await fetch('/api/generate-ambient-background', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              slideId: slide.id,
              slideTitle: slide.title,
              slideTopic: slide.subtopic || slide.title,
              targetProfile: currentDeckState.targetProfile,
              environmentSetting: slide.thematicStorytelling?.environmentSetting,
              storyArcPhase: slide.thematicStorytelling?.storyArcPhase,
              narrativeBeat: slide.thematicStorytelling?.narrativeBeat,
              aspectRatio: '16:9',
            }),
          });
          const data = await res.json();
          if (data.success && data.imageUrl) {
            currentDeckState = {
              ...currentDeckState,
              slides: currentDeckState.slides.map((s, idx) =>
                idx === i
                  ? {
                      ...s,
                      backgroundImage: data.imageUrl,
                      ambientPrompt: data.prompt,
                      ambientEnvironmentSetting: data.environmentSetting,
                      ambientOverlayOpacity: ambientOpacity,
                      ambientBlur: ambientBlur,
                    }
                  : s
              ),
            };
            if (onUpdateDeck) {
              onUpdateDeck(currentDeckState);
            }
          }
        } catch (subErr) {
          console.warn(`[Batch Ambient] Slide ${i + 1} fallback:`, subErr);
        }
      }

      playSoundEffect('level_up');
      setBurstTrigger((b) => b + 3);
      setAmbientSuccessMsg(`Cenários gerados para todos os ${total} slides!`);
      setTimeout(() => setAmbientSuccessMsg(null), 4000);
    } catch (err: any) {
      setAmbientErrorMsg(err.message || 'Falha na geração em lote.');
    } finally {
      setIsBatchGeneratingBg(false);
      setBatchBgProgress(null);
    }
  };

  const handleRemoveAmbientBackground = (slideIndex: number = currentSlideIndex) => {
    const updatedSlides = deck.slides.map((s, idx) => {
      if (idx === slideIndex) {
        const { backgroundImage, ambientPrompt, ...rest } = s;
        return rest as SlideData;
      }
      return s;
    });
    const updatedDeck = { ...deck, slides: updatedSlides };
    if (onUpdateDeck) {
      onUpdateDeck(updatedDeck);
    }
    playSoundEffect('action');
    setAmbientSuccessMsg('Cenário removido.');
    setTimeout(() => setAmbientSuccessMsg(null), 2500);
  };

  const handleUpdateAmbientSettings = (opacityVal: number, blurVal: number) => {
    setAmbientOpacity(opacityVal);
    setAmbientBlur(blurVal);
    const updatedSlides = deck.slides.map((s, idx) => {
      if (idx === currentSlideIndex) {
        return {
          ...s,
          ambientOverlayOpacity: opacityVal,
          ambientBlur: blurVal,
        };
      }
      return s;
    });
    if (onUpdateDeck) {
      onUpdateDeck({ ...deck, slides: updatedSlides });
    }
  };

  const handleGenerateIllustrationForSlide = async (slideIndex: number = currentSlideIndex) => {
    const targetSlide = deck.slides[slideIndex];
    if (!targetSlide || isGeneratingIllustration) return;

    setIsGeneratingIllustration(true);
    setIllustrationSuccessMsg(null);
    playSoundEffect('action');

    try {
      const res = await fetch('/api/generate-slide-illustration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slideTitle: targetSlide.title,
          slideSubtopic: targetSlide.subtopic || targetSlide.title,
          targetProfile: deck.targetProfile,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success || !data.imageDataUri) {
        throw new Error(data.error || 'Erro ao gerar ilustração didática.');
      }

      const updatedSlides = deck.slides.map((s, idx) => {
        if (idx === slideIndex) {
          return {
            ...s,
            referenceImageDataUri: data.imageDataUri,
          };
        }
        return s;
      });

      const updatedDeck = { ...deck, slides: updatedSlides };
      if (onUpdateDeck) {
        onUpdateDeck(updatedDeck);
      }

      playSoundEffect('level_up');
      setIllustrationSuccessMsg('Exemplo Visual Didático Gerado com Sucesso!');
      setTimeout(() => setIllustrationSuccessMsg(null), 3500);
    } catch (err: any) {
      console.error('Illustration generation error:', err);
    } finally {
      setIsGeneratingIllustration(false);
    }
  };

  const handleBatchGenerateIllustrations = async () => {
    if (isBatchGeneratingIllustration || isGeneratingIllustration) return;
    setIsBatchGeneratingIllustration(true);
    playSoundEffect('action');

    try {
      let currentDeckState = { ...deck };
      const total = currentDeckState.slides.length;

      for (let i = 0; i < total; i++) {
        setBatchIllustrationProgress({ current: i + 1, total });
        const slide = currentDeckState.slides[i];
        if (slide.referenceImageDataUri) continue; // Pula se já tem

        try {
          const res = await fetch('/api/generate-slide-illustration', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              slideTitle: slide.title,
              slideSubtopic: slide.subtopic || slide.title,
              targetProfile: currentDeckState.targetProfile,
            }),
          });
          const data = await res.json();
          if (data.success && data.imageDataUri) {
            currentDeckState = {
              ...currentDeckState,
              slides: currentDeckState.slides.map((s, idx) =>
                idx === i ? { ...s, referenceImageDataUri: data.imageDataUri } : s
              ),
            };
            if (onUpdateDeck) {
              onUpdateDeck(currentDeckState);
            }
          }
        } catch (e) {
          console.warn(`[Batch Illustration] Slide ${i + 1} falhou:`, e);
        }
      }

      playSoundEffect('level_up');
      setIllustrationSuccessMsg('Todas as ilustrações didáticas foram geradas!');
      setTimeout(() => setIllustrationSuccessMsg(null), 4000);
    } finally {
      setIsBatchGeneratingIllustration(false);
      setBatchIllustrationProgress(null);
    }
  };

  const handleRemoveIllustration = (slideIndex: number = currentSlideIndex) => {
    const updatedSlides = deck.slides.map((s, idx) => {
      if (idx === slideIndex) {
        const { referenceImageDataUri, ...rest } = s;
        return rest as SlideData;
      }
      return s;
    });
    if (onUpdateDeck) {
      onUpdateDeck({ ...deck, slides: updatedSlides });
    }
    playSoundEffect('action');
  };

  const handleGenerateAiDecorationsForSlide = async () => {
    if (isGeneratingDecorations || !currentSlide) return;
    setIsGeneratingDecorations(true);
    playSoundEffect('action');

    try {
      const res = await fetch('/api/generate-slide-decorations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slideTitle: currentSlide.title,
          slideConcept: currentSlide.conceptTitle || currentSlide.title,
          slideSubtopic: currentSlide.subtopic || '',
          targetProfile: deck.targetProfile,
          archetype: activeArchetype,
          primaryColor: theme.palette.primary,
          accentColor: theme.palette.accent,
        }),
      });

      const data = await res.json();
      if (data.success && data.decorations) {
        currentSlide.aiDecorations = data.decorations;
        playSoundEffect('level_up');
        confetti({
          particleCount: 30,
          spread: 70,
          origin: { y: 0.6 },
          colors: [theme.palette.primary, theme.palette.accent, '#FFFFFF'],
        });
        setDecorationSuccessMsg('Decoração IA Gerada!');
        setTimeout(() => setDecorationSuccessMsg(null), 3000);
      }
    } catch (err) {
      console.error('Error generating slide decorations:', err);
      currentSlide.aiDecorations = {
        customIconSvg: generateThematicSvgIcon(currentSlide.title, deck.targetProfile),
        customBorderSvg: generateThematicSvgBorder(activeArchetype, deck.targetProfile),
        customDividerSvg: generateMedievalSvgDivider(deck.targetProfile),
        motifDescription: `Arte Medieval Heráldica para ${currentSlide.title}`,
        medievalClassArchetype: theme.archetype || deck.targetProfile,
        medievalPromptDescription: `Borda heráldica, divisor gótico ornamentado e ícone de glória para ${theme.archetype}`,
      };
      setDecorationSuccessMsg('Decoração Atualizada!');
      setTimeout(() => setDecorationSuccessMsg(null), 3000);
    } finally {
      setIsGeneratingDecorations(false);
    }
  };

  const handleQuickDownloadHtml = () => {
    const htmlContent = generateInteractiveHtml(deck, activeArchetype);
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `TrailUp_${deck.targetProfile}_${activeArchetype}_Slides.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    playSoundEffect('level_up');
    setDownloadedSuccess(true);
    setTimeout(() => setDownloadedSuccess(false), 2500);
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  const guideProfile = deck.targetProfile || 'Achiever';
  const guideInfo = BRAIN_HEX_GUIDE_INFOS[guideProfile] || BRAIN_HEX_GUIDE_INFOS.Achiever;
  const guideName = deck.characterGuideName || currentSlide?.characterGuide?.name || guideInfo.name;

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['input', 'textarea'].includes((e.target as HTMLElement).tagName.toLowerCase())) {
        return;
      }
      if (e.key === 'ArrowRight' || e.key === ' ') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSlideIndex, deck.slides.length]);

  const handleNext = () => {
    if (currentSlideIndex < deck.slides.length - 1) {
      playSoundEffect('slide_next');
      onSlideChange(currentSlideIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentSlideIndex > 0) {
      playSoundEffect('slide_prev');
      onSlideChange(currentSlideIndex - 1);
    }
  };

  // Touch Swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (diff > 50) {
      handleNext();
    } else if (diff < -50) {
      handlePrev();
    }
    touchStartX.current = null;
  };

  // Quiz Interaction Handler
  const handleQuizSelect = (optionId: string, isCorrect: boolean) => {
    const wasAlreadyCorrect = currentQuizState.isSubmitted && currentQuizState.isCorrect;

    setQuizStatesBySlide((prev) => ({
      ...prev,
      [slideKey]: {
        selectedOption: optionId,
        isSubmitted: true,
        isCorrect,
      },
    }));

    if (isCorrect) {
      playSoundEffect('quiz_correct');
      if (!wasAlreadyCorrect) {
        setAccumulatedXp((prev) => prev + 150);
        setBurstTrigger((prev) => prev + 1);
        try {
          confetti({ particleCount: 60, spread: 60, origin: { y: 0.7 } });
        } catch (e) {
          // ignored
        }
      }
    } else {
      playSoundEffect('quiz_wrong');
    }
  };

  const handleResetQuiz = () => {
    setQuizStatesBySlide((prev) => {
      const copy = { ...prev };
      delete copy[slideKey];
      return copy;
    });
    playSoundEffect('action');
  };

  // Checklist Item Toggle Handler
  const toggleChecklistItem = (id: string, xp?: number) => {
    setCompletedChecklistItems((prev) => {
      const isNowCompleted = !prev[id];
      if (isNowCompleted) {
        playSoundEffect('quest_check');
        setAccumulatedXp((x) => x + (xp || 50));
        setBurstTrigger((prev) => prev + 1);
      } else {
        playSoundEffect('action');
      }
      return { ...prev, [id]: isNowCompleted };
    });
  };

  // Decision Choice Handler
  const handleDecision = (decisionId: string, xp?: number) => {
    setDecisionsBySlide((prev) => ({
      ...prev,
      [slideKey]: decisionId,
    }));
    playSoundEffect('quest_check');
    setAccumulatedXp((prev) => prev + (xp || 75));
    setBurstTrigger((prev) => prev + 1);
  };

  // Secret Lore Reveal Handler
  const handleRevealSecret = () => {
    setSecretsRevealedBySlide((prev) => ({
      ...prev,
      [slideKey]: true,
    }));
    playSoundEffect('chime');
    setAccumulatedXp((prev) => prev + 100);
    setBurstTrigger((prev) => prev + 1);
  };

  // Boss Battle Attack Handler
  const handleBossAttack = (damage: number, label: string) => {
    playSoundEffect('wardrum');
    setShowDamageAnimation(`-${damage} HP! (${label})`);
    setBurstTrigger((prev) => prev + 1);
    const nextHp = Math.max(0, currentBossHp - damage);
    setBossHpBySlide((prev) => ({
      ...prev,
      [slideKey]: nextHp,
    }));

    if (nextHp === 0 && currentBossHp > 0) {
      playSoundEffect('level_up');
      setBurstTrigger((prev) => prev + 2);
      try {
        confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 } });
      } catch (e) {
        // ignore
      }
    }
    setAccumulatedXp((prev) => prev + 200);
    setTimeout(() => setShowDamageAnimation(null), 2000);
  };

  // Key Takeaway Mastery Toggle
  const toggleTakeawayMastery = (takeawayId: string) => {
    setMasteredTakeaways((prev) => {
      const isNow = !prev[takeawayId];
      if (isNow) {
        playSoundEffect('quest_check');
        setAccumulatedXp((x) => x + 25);
        setBurstTrigger((b) => b + 1);
      } else {
        playSoundEffect('action');
      }
      return { ...prev, [takeawayId]: isNow };
    });
  };

  // Character Guide Advice Reveal Toggle
  const handleHearGuideAdvice = () => {
    const isNow = !guideAdviceRevealed[slideKey];
    setGuideAdviceRevealed((prev) => ({
      ...prev,
      [slideKey]: isNow,
    }));
    if (isNow) {
      playSoundEffect('chime');
      setAccumulatedXp((x) => x + 15);
      setBurstTrigger((b) => b + 1);
    }
  };

  // Viewport Container Styles with zero unwanted scrolling
  const getViewportWrapperStyle = () => {
    switch (viewportMode) {
      case 'mobile-portrait':
        return 'w-full max-w-[440px] h-[calc(100vh-140px)] max-h-[760px] min-h-[500px] rounded-3xl border-4 border-stone-800 shadow-2xl shadow-black/80 my-2 flex flex-col justify-between overflow-hidden';
      case 'mobile-landscape':
        return 'w-full max-w-[820px] h-[calc(100vh-90px)] max-h-[520px] min-h-[380px] rounded-2xl border-4 border-stone-800 shadow-2xl shadow-black/80 my-2 flex flex-col justify-between overflow-hidden';
      case 'web-desktop':
      default:
        return 'w-full max-w-6xl h-[calc(100vh-130px)] max-h-[820px] min-h-[540px] rounded-2xl border border-stone-700/80 shadow-2xl my-1 flex flex-col justify-between overflow-hidden';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center w-full px-1.5 sm:px-3 py-1 select-none">
      {/* Top Deck Info Bar */}
      <div className="flex items-center justify-between w-full max-w-6xl px-3 py-1 mb-1 text-xs text-stone-300">
        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-1 font-bold px-2 py-0.5 rounded text-[11px] text-black"
            style={{ backgroundColor: theme.palette.primary }}
          >
            <Shield className="w-3 h-3" />
            {theme.perfil} ({theme.nomePt})
          </span>
          <span className="text-stone-400 hidden sm:inline">•</span>
          <span className="font-semibold text-stone-200 truncate max-w-[200px] sm:max-w-md">
            {deck.title}
          </span>
        </div>

        {/* XP Tracker, Magic Effects & Slide Number */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Content-defined Thematic Archetype Badge (derived strictly from content & BrainHex profile) */}
          <div
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-bold shadow-sm"
            style={{
              borderColor: `${theme.palette.primary}60`,
              backgroundColor: `${theme.palette.primary}15`,
              color: theme.palette.accent || '#FBBF24',
            }}
            title={`Tema Visual Definido pelo Conteúdo: ${activeArchetype}`}
          >
            <Palette className="w-3 h-3" style={{ color: theme.palette.primary }} />
            <span className="hidden sm:inline">
              Tema: {activeArchetype === 'indian-heritage' ? 'Indian Palace' : activeArchetype === 'islamic-ramadan' ? 'Ramadan Blue & Gold' : activeArchetype === 'nature-eco' ? 'Eco Planet' : activeArchetype === 'scrapbook-stickers' ? 'Pastel Scrapbook' : activeArchetype === 'cyber-tech' ? 'Cyber Tech' : activeArchetype === 'royal-luxury' ? 'Royal Luxury' : 'TrailUp Astral'}
            </span>
          </div>

          {/* Magic Effects Control Menu */}
          <div className="relative">
            <button
              id="btn-magic-particles-menu"
              onClick={() => setShowMagicalMenu(!showMagicalMenu)}
              className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-bold transition-all ${
                magicalIntensity !== 'off'
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 shadow-sm shadow-amber-500/20'
                  : 'border-stone-700 bg-stone-800/80 text-stone-400 hover:text-stone-200'
              }`}
              title="Configurar Efeitos Mágicos e Partículas"
            >
              <Wand2 className={`w-3 h-3 ${magicalIntensity !== 'off' ? 'text-amber-400 animate-pulse' : ''}`} />
              <span className="hidden sm:inline">
                {magicalIntensity === 'off' ? 'Magia: Off' : `Magia: ${magicalEffectType === 'auto' ? 'Auto' : magicalEffectType}`}
              </span>
            </button>

            {showMagicalMenu && (
              <div className="absolute right-0 top-full mt-2 w-72 p-3 bg-stone-950/95 backdrop-blur-xl border border-stone-700 rounded-xl shadow-2xl z-50 text-xs text-stone-200">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-800">
                  <span className="font-cinzel font-bold text-amber-300 flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                    Partículas Mágicas
                  </span>
                  <button
                    onClick={() => setShowMagicalMenu(false)}
                    className="text-stone-400 hover:text-white text-xs px-1"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-stone-400 mb-1 block">
                      Estilo Mágico
                    </label>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { id: 'auto', label: '✦ Auto (Perfil)', desc: 'Por arquétipo & slide' },
                        { id: 'sparks', label: '✦ Centelhas', desc: 'Poeira dourada de vitória' },
                        { id: 'runes', label: 'ᚱ Runas Arcanas', desc: 'Glifos ancestrais' },
                        { id: 'swirling_energy', label: '✦ Vórtice', desc: 'Energia cósmica astral' },
                        { id: 'embers', label: '✦ Brasas', desc: 'Chamas de combate' },
                        { id: 'shield_aura', label: '✦ Barreira', desc: 'Escudo esmeralda' },
                        { id: 'matrix_nodes', label: '01 Matriz', desc: 'Nós de código & lógica' },
                        { id: 'lightning_plasma', label: '✦ Plasma', desc: 'Arcos elétricos' },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => {
                            setMagicalEffectType(opt.id as MagicalEffectType);
                            setBurstTrigger((prev) => prev + 1);
                          }}
                          className={`px-2 py-1.5 rounded text-left transition-all ${
                            magicalEffectType === opt.id
                              ? 'bg-amber-500/20 border border-amber-500 text-amber-300 font-bold'
                              : 'bg-stone-900 border border-stone-800 text-stone-300 hover:bg-stone-800'
                          }`}
                        >
                          <div className="text-[11px] leading-tight">{opt.label}</div>
                          <div className="text-[9px] text-stone-400">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-stone-400 mb-1 block">
                      Intensidade
                    </label>
                    <div className="flex gap-1">
                      {(['subtle', 'epic', 'dazzling', 'off'] as const).map((lvl) => (
                        <button
                          key={lvl}
                          onClick={() => setMagicalIntensity(lvl)}
                          className={`flex-1 py-1 rounded text-[10px] font-bold uppercase transition-all ${
                            magicalIntensity === lvl
                              ? 'bg-amber-600 text-white shadow'
                              : 'bg-stone-800 text-stone-400 hover:bg-stone-700'
                          }`}
                        >
                          {lvl === 'subtle' ? 'Sutil' : lvl === 'epic' ? 'Épico' : lvl === 'dazzling' ? 'Máx' : 'Off'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      playSoundEffect('chime');
                      setBurstTrigger((prev) => prev + 1);
                    }}
                    className="w-full py-1.5 px-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-black font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Lançar Pulso de Energia
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Quick HTML Standalone Microservice Download */}
          <button
            id="btn-quick-download-html"
            onClick={handleQuickDownloadHtml}
            className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-bold transition-all shadow-sm ${
              downloadedSuccess
                ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                : 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20'
            }`}
            title="Baixar Arquivo HTML Standalone Interativo com o Tema Visual Selecionado"
          >
            {downloadedSuccess ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="hidden sm:inline">HTML Baixado!</span>
              </>
            ) : (
              <>
                <Download className="w-3 h-3 text-cyan-400" />
                <span className="hidden sm:inline">Baixar HTML</span>
              </>
            )}
          </button>

          {/* D3 Knowledge Graph Button */}
          {onOpenKnowledgeGraph && (
            <button
              id="btn-viewer-knowledge-graph"
              onClick={onOpenKnowledgeGraph}
              className="flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-purple-500/50 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 text-[11px] font-bold transition-all shadow-sm"
              title="Abrir Grafo Visual de Conhecimento D3 do Deck"
            >
              <Network className="w-3 h-3 text-purple-400 animate-pulse" />
              <span className="hidden sm:inline">Grafo D3</span>
            </button>
          )}

          {/* Slide Notes & Study Annotations Modal Trigger */}
          <button
            id="btn-slide-notes-modal"
            onClick={() => setIsSlideNotesModalOpen(true)}
            className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-bold transition-all shadow-sm cursor-pointer ${
              slideUserNotes[currentSlideIndex] || currentSlide?.stickyNote || currentSlide?.presenterNotes
                ? 'border-amber-500/70 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                : 'border-stone-700 bg-stone-900/60 text-stone-300 hover:text-white hover:bg-stone-800'
            }`}
            title="Abrir Anotações, Sticky Notes e Guias de Estudo deste Slide"
          >
            <NotebookPen className="w-3 h-3 text-amber-400" />
            <span className="hidden sm:inline">Anotações</span>
            {(slideUserNotes[currentSlideIndex] || currentSlide?.stickyNote) && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            )}
          </button>

          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold"
            style={{
              borderColor: theme.palette.primary,
              backgroundColor: `${theme.palette.background}CC`,
              color: theme.palette.accent,
            }}
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>{accumulatedXp} XP</span>
          </div>

          <span className="text-stone-400">
            {currentSlideIndex + 1} / {deck.slides.length}
          </span>
        </div>
      </div>

      {/* Main Slide Card Container with Dynamic BrainHex Profile Decorative Border */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`relative overflow-hidden transition-all duration-300 flex flex-col justify-between bg-trailup-hex-grid shadow-2xl ${getBrainHexBorderClassName(deck.targetProfile)} ${getViewportWrapperStyle()}`}
        style={{
          backgroundColor: theme.palette.background,
          borderColor: theme.palette.secondary,
        }}
      >
        {/* Dynamic BrainHex Profile CSS Stylesheet Injection */}
        <style dangerouslySetInnerHTML={{ __html: getBrainHexBorderCss(theme) }} />

        {/* Magical Particle Canvas Layer */}
        <MagicalParticleCanvas
          profile={deck.targetProfile}
          slide={currentSlide}
          effectType={magicalEffectType}
          intensity={magicalIntensity}
          burstTrigger={burstTrigger}
          interactive={true}
        />

        {/* Slidesgo Thematic Full-Bleed Atmospheric Background Scene */}
        <ThematicBackgroundScene
          archetype={activeArchetype}
          illustrationType={currentSlide?.illustrationType}
          primaryColor={theme.palette.primary}
          secondaryColor={theme.palette.secondary}
          accentColor={theme.palette.accent}
        />

        {/* AI-Generated Ambient Environment Background Image Layer */}
        {currentSlide?.backgroundImage && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 select-none">
            <img
              src={currentSlide.backgroundImage}
              alt="Cenário do Ambiente BrainHex"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover transition-opacity duration-700 pointer-events-none"
              style={{
                opacity: currentSlide.ambientOverlayOpacity ?? ambientOpacity,
                filter: (currentSlide.ambientBlur ?? ambientBlur) > 0 ? `blur(${currentSlide.ambientBlur ?? ambientBlur}px)` : 'none',
              }}
            />
            {/* Darkening Gradient & Contrast Enhancer to guarantee WCAG compliance */}
            <div
              className="absolute inset-0 pointer-events-none transition-colors duration-500"
              style={{
                backgroundColor: `${theme.palette.background}99`,
                backgroundImage: `radial-gradient(circle at 50% 30%, transparent 10%, ${theme.palette.background}F2 85%)`,
              }}
            />
          </div>
        )}

        {/* Dynamic BrainHex Decorative Border Overlays & Corner Ornaments (Vines, Runes, Filigree, Rivets, Brackets) */}
        <BrainHexDecorativeBorderOverlay
          profile={deck.targetProfile}
          primaryColor={theme.palette.primary}
          accentColor={theme.palette.accent}
        />

        {/* TrailUp Ornate Corner Accents */}
        <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 opacity-60 pointer-events-none" style={{ borderColor: theme.palette.accent }} />
        <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 opacity-60 pointer-events-none" style={{ borderColor: theme.palette.accent }} />
        <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 opacity-60 pointer-events-none" style={{ borderColor: theme.palette.accent }} />
        <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 opacity-60 pointer-events-none" style={{ borderColor: theme.palette.accent }} />

        {/* Top Decorative TrailUp Header */}
        <div
          className="relative z-10 flex items-center justify-between px-4 sm:px-6 py-2.5 border-b backdrop-blur-md"
          style={{
            borderColor: `${theme.palette.secondary}60`,
            backgroundColor: `${theme.palette.background}95`,
          }}
        >
          <div className="flex items-center gap-2.5">
            <TrailUpArchetypeSigil profile={deck.targetProfile} size={28} glow={true} />
            <div>
              <div className="flex items-center gap-1.5">
                <p
                  className="font-cinzel text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: theme.palette.accent }}
                >
                  {theme.archetype} • Rank {deck.rankLevel}
                </p>
                <span
                  className="hidden sm:inline-block text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded border"
                  style={{
                    borderColor: `${theme.palette.primary}60`,
                    backgroundColor: `${theme.palette.primary}20`,
                    color: theme.palette.accent,
                  }}
                >
                  {deck.targetProfile === 'Achiever'
                    ? '✦ Metas & KPIs'
                    : deck.targetProfile === 'Mastermind'
                    ? '✦ Arquitetura & Sistemas'
                    : deck.targetProfile === 'Seeker'
                    ? '✦ Exploração & Lore'
                    : deck.targetProfile === 'Conqueror'
                    ? '✦ Gauntlet & Boss'
                    : deck.targetProfile === 'Socializer'
                    ? '✦ Mural Colaborativo'
                    : deck.targetProfile === 'Daredevil'
                    ? '✦ Ação Imediata'
                    : '✦ Contingência & Defesa'}
                </span>
              </div>
              <p className="text-[10px] text-stone-400 font-sans truncate max-w-[200px] sm:max-w-xs">
                {deck.title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick HTML Download Button */}
            <button
              id="btn-quick-download-html"
              onClick={handleQuickDownloadHtml}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all shadow-sm hover:scale-105 active:scale-95 bg-stone-900/90 text-amber-300 border-amber-500/40 hover:bg-stone-800"
              title="Baixar Arquivo HTML Interativo com todas as interações e efeitos sonoros"
            >
              <Code className="w-3 h-3 text-amber-400" />
              <span className="hidden sm:inline">
                {downloadedSuccess ? 'Baixado!' : 'Baixar HTML Interativo'}
              </span>
            </button>

            {/* AI Vector Decoration Generator Button */}
            <button
              onClick={handleGenerateAiDecorationsForSlide}
              disabled={isGeneratingDecorations}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all shadow-sm hover:scale-105 active:scale-95 disabled:opacity-50"
              style={{
                borderColor: `${theme.palette.accent}70`,
                backgroundColor: `${theme.palette.primary}25`,
                color: theme.palette.accent,
              }}
              title="Gerar/refinar decorações vetoriais exclusivas (ícone e moldura SVG) para este slide via IA"
            >
              <Wand2 className={`w-3 h-3 ${isGeneratingDecorations ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">
                {isGeneratingDecorations ? 'Gerando Vetor IA...' : 'Decoração IA'}
              </span>
            </button>

            {/* AI Ambient Background Generator Menu & Button */}
            <div className="relative">
              <button
                id="btn-ambient-background-menu"
                onClick={() => setShowAmbientMenu(!showAmbientMenu)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all shadow-sm hover:scale-105 active:scale-95 ${
                  currentSlide?.backgroundImage
                    ? 'border-emerald-500/70 bg-emerald-950/60 text-emerald-300 shadow-emerald-900/30'
                    : 'border-indigo-500/50 bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/50'
                }`}
                title="Gerar e Ajustar Cenário de Fundo Ambiente com IA para o Perfil BrainHex"
              >
                <ImageIcon className={`w-3 h-3 ${isGeneratingAmbientBg || isBatchGeneratingBg ? 'animate-spin text-amber-400' : currentSlide?.backgroundImage ? 'text-emerald-400' : 'text-indigo-400'}`} />
                <span className="hidden sm:inline">
                  {isGeneratingAmbientBg
                    ? 'Gerando Fundo...'
                    : isBatchGeneratingBg
                    ? `Gerando (${batchBgProgress?.current}/${batchBgProgress?.total})...`
                    : currentSlide?.backgroundImage
                    ? 'Cenário Ativo'
                    : 'Cenário IA'}
                </span>
              </button>

              {/* Ambient Background Popover Modal */}
              {showAmbientMenu && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 p-3.5 bg-stone-950/95 backdrop-blur-xl border border-stone-700 rounded-2xl shadow-2xl z-50 text-xs text-stone-200 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-stone-800">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-lg bg-indigo-500/20 text-indigo-300">
                        <ImageIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-cinzel font-bold text-amber-300 text-xs leading-none">
                          Cenário de Fundo Ambiente
                        </h4>
                        <span className="text-[10px] text-stone-400 font-mono">
                          BrainHex: {theme.nomePt} ({theme.perfil})
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowAmbientMenu(false)}
                      className="text-stone-400 hover:text-white text-xs p-1 rounded hover:bg-stone-800"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Feedback Messages */}
                  {ambientSuccessMsg && (
                    <div className="mb-2 p-2 rounded-lg bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 text-[11px] flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                      <span>{ambientSuccessMsg}</span>
                    </div>
                  )}
                  {ambientErrorMsg && (
                    <div className="mb-2 p-2 rounded-lg bg-rose-950/70 border border-rose-500/50 text-rose-300 text-[11px] flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                      <span>{ambientErrorMsg}</span>
                    </div>
                  )}

                  {/* BrainHex Environment Definition */}
                  <div className="p-2.5 rounded-xl bg-stone-900/90 border border-stone-800 space-y-1.5 mb-3 text-left">
                    <div className="flex items-center justify-between text-[10px] text-stone-400 font-mono uppercase">
                      <span>Ambiente do Perfil</span>
                      <span className="text-amber-400 font-bold">16:9 Imersivo</span>
                    </div>
                    <p className="text-xs font-semibold text-stone-200">
                      {currentSlide?.thematicStorytelling?.environmentSetting || theme.archetype || 'Observatório Astral e Biblioteca dos Guardiões'}
                    </p>
                    {currentSlide?.thematicStorytelling?.storyArcPhase && (
                      <p className="text-[10px] text-amber-300/80 italic font-mono">
                        Arco: {currentSlide.thematicStorytelling.storyArcPhase}
                      </p>
                    )}
                  </div>

                  {/* Controls if Slide has a generated background */}
                  {currentSlide?.backgroundImage ? (
                    <div className="space-y-3 mb-3">
                      {/* Thumbnail Preview & Status */}
                      <div className="relative rounded-xl overflow-hidden border border-stone-700 h-24 bg-stone-900 group">
                        <img
                          src={currentSlide.backgroundImage}
                          alt="Thumbnail Preview"
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                          style={{
                            opacity: ambientOpacity,
                            filter: ambientBlur > 0 ? `blur(${ambientBlur}px)` : 'none',
                          }}
                        />
                        <div className="absolute inset-0 bg-stone-950/40 backdrop-blur-[0.5px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[10px] font-mono text-white bg-black/70 px-2 py-0.5 rounded">
                            Preview do Slide
                          </span>
                        </div>
                      </div>

                      {/* Sliders: Opacity & Blur */}
                      <div className="space-y-2 text-left bg-stone-900/60 p-2.5 rounded-xl border border-stone-800/80">
                        <div>
                          <div className="flex justify-between text-[10px] font-mono text-stone-300 mb-1">
                            <span>Opacidade da Imagem:</span>
                            <span className="font-bold text-amber-300">{Math.round(ambientOpacity * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="0.8"
                            step="0.05"
                            value={ambientOpacity}
                            onChange={(e) => handleUpdateAmbientSettings(parseFloat(e.target.value), ambientBlur)}
                            className="w-full h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between text-[10px] font-mono text-stone-300 mb-1">
                            <span>Desfoque / Profundidade:</span>
                            <span className="font-bold text-amber-300">{ambientBlur}px</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="8"
                            step="1"
                            value={ambientBlur}
                            onChange={(e) => handleUpdateAmbientSettings(ambientOpacity, parseInt(e.target.value, 10))}
                            className="w-full h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                          />
                        </div>
                      </div>

                      {/* Action Buttons for Existing Background */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleGenerateAmbientBackgroundForSlide(currentSlideIndex)}
                          disabled={isGeneratingAmbientBg}
                          className="flex-1 py-2 px-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingAmbientBg ? 'animate-spin' : ''}`} />
                          <span>{isGeneratingAmbientBg ? 'Regerando...' : 'Regerar Cenário'}</span>
                        </button>

                        <button
                          onClick={() => handleRemoveAmbientBackground(currentSlideIndex)}
                          className="py-2 px-2.5 rounded-xl bg-stone-800 hover:bg-rose-900/60 border border-stone-700 hover:border-rose-500 text-stone-300 hover:text-rose-200 text-xs flex items-center justify-center gap-1 transition-all cursor-pointer"
                          title="Remover imagem deste slide"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Generate New Background Options */
                    <div className="space-y-3 mb-3">
                      <div>
                        <label className="text-[10px] uppercase font-bold text-stone-400 mb-1 block text-left">
                          Instrução Visual Específica (Opcional)
                        </label>
                        <input
                          type="text"
                          value={ambientCustomPrompt}
                          onChange={(e) => setAmbientCustomPrompt(e.target.value)}
                          placeholder="Ex: Sala de mapas estelares com névoa mística..."
                          className="w-full px-2.5 py-1.5 bg-stone-900 border border-stone-800 rounded-xl text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <button
                        onClick={() => handleGenerateAmbientBackgroundForSlide(currentSlideIndex, ambientCustomPrompt)}
                        disabled={isGeneratingAmbientBg || isBatchGeneratingBg}
                        className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400 hover:from-amber-500 hover:to-amber-300 text-black font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
                      >
                        <Wand2 className={`w-4 h-4 ${isGeneratingAmbientBg ? 'animate-spin' : ''}`} />
                        <span>
                          {isGeneratingAmbientBg ? 'Gerando Cenário com IA...' : 'Gerar Imagem de Fundo para Este Slide'}
                        </span>
                      </button>
                    </div>
                  )}

                  {/* Batch Deck Background Generation */}
                  <div className="pt-2.5 border-t border-stone-800 flex flex-col gap-1.5">
                    <button
                      onClick={handleBatchGenerateAmbientBackgrounds}
                      disabled={isBatchGeneratingBg || isGeneratingAmbientBg}
                      className="w-full py-1.5 px-2.5 rounded-xl bg-stone-900 hover:bg-stone-850 border border-indigo-500/40 text-indigo-300 hover:text-indigo-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${isBatchGeneratingBg ? 'animate-spin text-amber-400' : 'text-indigo-400'}`} />
                      <span>
                        {isBatchGeneratingBg
                          ? `Processando (${batchBgProgress?.current}/${batchBgProgress?.total})...`
                          : `Gerar Cenários para Todo o Deck (${deck.slides.length} slides)`}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {currentSlide?.rpgQuest && (
              <div
                className="flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold shadow-sm"
                style={{
                  borderColor: `${theme.palette.primary}80`,
                  backgroundColor: `${theme.palette.secondary}60`,
                  color: theme.palette.accent,
                }}
              >
                <Trophy className="w-3 h-3" />
                <span>+{currentSlide.rpgQuest.xpValue} XP</span>
              </div>
            )}
            <TrailUpGemLogo size={22} glow={false} className="opacity-90" />
          </div>
        </div>

        {/* AI-Generated Vector Thematic Frame Overlay */}
        <div
          className="absolute inset-0 pointer-events-none z-0 select-none opacity-30 [&>svg]:w-full [&>svg]:h-full [&_*]:pointer-events-none"
          style={{ color: theme.palette.primary }}
          dangerouslySetInnerHTML={{
            __html:
              currentSlide?.aiDecorations?.customBorderSvg && currentSlide.aiDecorations.customBorderSvg.includes('<svg')
                ? currentSlide.aiDecorations.customBorderSvg
                : generateThematicSvgBorder(activeArchetype, deck.targetProfile),
          }}
        />

        {/* Slide Body - Zero unwanted scrolling and balanced homogeneous distribution */}
        <div className="relative z-20 flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4 lg:px-6 lg:py-4 flex flex-col justify-between pointer-events-auto min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlide?.id || currentSlideIndex}
              initial={{ opacity: 0, y: 8, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="w-full flex flex-col flex-1 min-h-0 justify-between space-y-2.5"
            >
              {/* Slide Compact Header with Contextual Vector Icon */}
              <div className="text-center sm:text-left flex items-start gap-2.5 shrink-0">
                <div className="shrink-0 pt-0.5">
                  <AiThematicIcon
                    svgCode={currentSlide?.aiDecorations?.customIconSvg}
                    seedText={currentSlide?.title}
                    profile={deck.targetProfile}
                    size="sm"
                    primaryColor={theme.palette.primary}
                    accentColor={theme.palette.accent}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    {currentSlide?.subtopic && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.2 rounded-full border shadow-sm"
                        style={{
                          borderColor: `${theme.palette.primary}90`,
                          backgroundColor: `${theme.palette.primary}20`,
                          color: theme.palette.accent,
                        }}
                      >
                        <BookOpen className="w-2.5 h-2.5" />
                        Módulo: {currentSlide.subtopic}
                      </span>
                    )}
                    {currentSlide?.subtitle && (
                      <span
                        className="font-cinzel text-[11px] font-bold uppercase tracking-wider flex items-center gap-1"
                        style={{ color: theme.palette.accent }}
                      >
                        <Sparkle className="w-2.5 h-2.5 text-amber-400" />
                        {currentSlide.subtitle}
                      </span>
                    )}
                    {currentSlide?.aiDecorations && (
                      <AiMedievalPromptBadge
                        decorations={currentSlide.aiDecorations}
                        profile={deck.targetProfile}
                        primaryColor={theme.palette.primary}
                        accentColor={theme.palette.accent}
                      />
                    )}
                    {decorationSuccessMsg && (
                      <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/80 px-1.5 py-0.2 rounded border border-emerald-500/50 animate-pulse">
                        ✦ {decorationSuccessMsg}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h2 className="font-cinzel text-lg sm:text-xl lg:text-2xl font-extrabold tracking-tight text-white drop-shadow-md leading-tight">
                      {currentSlide?.title}
                    </h2>
                    {currentSlide?.pedagogicalObjective && (
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-emerald-950/50 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono">
                        <span className="font-bold">OBJETIVO:</span>
                        <span className="text-stone-200 truncate max-w-xs">{currentSlide.pedagogicalObjective}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Dynamic Content Layout based on slide type */}
              <ThematicFrameContainer
                frameType={
                  currentSlide?.thematicFrame ||
                  (activeArchetype === 'indian-heritage'
                    ? 'indian-palace-arch'
                    : activeArchetype === 'islamic-ramadan' || activeArchetype === 'celestial-palace'
                    ? 'islamic-arch'
                    : activeArchetype === 'nature-eco'
                    ? 'eco-nature'
                    : activeArchetype === 'scrapbook-stickers'
                    ? 'scrapbook-tape'
                    : activeArchetype === 'cyber-tech'
                    ? 'cyber-hud'
                    : activeArchetype === 'royal-luxury'
                    ? 'notched-ticket'
                    : 'trailup-sigil')
                }
                primaryColor={theme.palette.primary}
                secondaryColor={theme.palette.secondary}
                accentColor={theme.palette.accent}
                className="flex-1 min-h-0 flex flex-col justify-between"
              >
                <div className="flex-1 min-h-0 flex flex-col justify-between">
                  {/* Ornate Quote Banner if specified in slide */}
                  {currentSlide?.quote && (
                    <ThematicQuoteBanner
                      quote={currentSlide.quote.text}
                      author={currentSlide.quote.author}
                      archetype={activeArchetype}
                    />
                  )}

                  {/* 1. Cover Hero Layout */}
                  {currentSlide?.type === 'cover' && (
                    <div className="py-1 space-y-3 flex-1 flex flex-col justify-around">
                      <TrailUpHeraldicBanner
                        profile={deck.targetProfile}
                        title={deck.title}
                        subtitle={`Jornada de Aprendizado Gamificado • Perfil ${theme.nomePt}`}
                        rank={deck.rankLevel}
                      />

                      <TrailUpNatureVector
                        primaryColor={theme.palette.primary}
                        secondaryColor={theme.palette.secondary}
                        accentColor={theme.palette.accent}
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                        <div className="p-2.5 rounded-xl border border-stone-800 bg-stone-950/70 backdrop-blur-sm flex items-center gap-2.5 shadow">
                          <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${theme.palette.primary}25` }}>
                            <Award className="w-4 h-4" style={{ color: theme.palette.accent }} />
                          </div>
                          <div>
                            <p className="text-[9px] uppercase font-bold text-stone-400">Rank Desejado</p>
                            <p className="text-xs font-bold text-white">{deck.rankLevel}</p>
                          </div>
                        </div>

                        <div className="p-2.5 rounded-xl border border-stone-800 bg-stone-950/70 backdrop-blur-sm flex items-center gap-2.5 shadow">
                          <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${theme.palette.primary}25` }}>
                            <Zap className="w-4 h-4 text-amber-400" />
                          </div>
                          <div>
                            <p className="text-[9px] uppercase font-bold text-stone-400">XP Estimado</p>
                            <p className="text-xs font-bold text-amber-300">+{deck.slides.length * 150} XP</p>
                          </div>
                        </div>

                        <div className="p-2.5 rounded-xl border border-stone-800 bg-stone-950/70 backdrop-blur-sm flex items-center gap-2.5 shadow">
                          <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${theme.palette.primary}25` }}>
                            <Compass className="w-4 h-4 text-emerald-400" />
                          </div>
                          <div>
                            <p className="text-[9px] uppercase font-bold text-stone-400">Foco Psicológico</p>
                            <p className="text-xs font-bold text-emerald-300">{theme.nomePt}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 2. Epic Conclusion Layout */}
                  {(currentSlide?.type === 'epic_conclusion' || currentSlide?.type === 'reward_certificate') && (
                    <div className="p-3 sm:p-4 rounded-2xl border border-white/15 bg-gradient-to-b from-stone-900/90 via-stone-950/90 to-black/95 text-center space-y-2.5 shadow-2xl backdrop-blur-md relative overflow-hidden flex-1 flex flex-col justify-around">
                      <div className="relative z-10 flex flex-col items-center">
                        <div className="relative mb-1">
                          <TrailUpArchetypeSigil profile={deck.targetProfile} size={42} glow={true} />
                          <div className="absolute -bottom-1 -right-1 p-0.5 rounded-full bg-amber-500 text-black shadow-lg">
                            <Trophy className="w-3 h-3" />
                          </div>
                        </div>

                        <span className="font-cinzel text-[10px] sm:text-xs font-bold uppercase tracking-widest text-amber-400">
                          ✦ Síntese de Maestria & Próximos Passos ✦
                        </span>
                        <h3 className="font-cinzel text-base sm:text-lg font-extrabold text-white mt-0.5">
                          {currentSlide.title || 'Síntese de Aprendizados & Conclusão'}
                        </h3>
                        <p className="text-[11px] sm:text-xs text-stone-300 max-w-md mx-auto mt-0.5 leading-relaxed">
                          {currentSlide.subtitle || `Você completou com excelência a trilha pedagógica alinhada ao perfil ${theme.nomePt}.`}
                        </p>
                      </div>

                      {currentSlide?.contentParagraphs && currentSlide.contentParagraphs.length > 0 && (
                        <div className="relative z-10 text-left bg-black/40 rounded-xl p-2.5 border border-white/10 space-y-1 max-h-36 overflow-y-auto">
                          {currentSlide.contentParagraphs.map((p, idx) => (
                            <div key={idx} className="flex items-start gap-1.5 text-xs text-stone-200">
                              <span className="text-amber-400 font-bold shrink-0 mt-0.5">✦</span>
                              <span className="leading-relaxed">{p}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="relative z-10 inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full bg-stone-900/90 border border-amber-500/40 text-amber-300 text-xs font-bold shadow-lg self-center">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        <span>Total de XP Conquistado: {accumulatedXp} XP</span>
                      </div>
                    </div>
                  )}

                  {/* 3. Standard Educational Slides: Balanced 2-Column Responsive Layout */}
                  {currentSlide?.type !== 'cover' && currentSlide?.type !== 'epic_conclusion' && currentSlide?.type !== 'reward_certificate' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 items-stretch flex-1 min-h-0">
                      {/* Left Column (lg:col-span-5): Concepts, Character Guide & Key Takeaways */}
                      <div className="lg:col-span-5 flex flex-col justify-between space-y-2.5 overflow-y-auto pr-1">
                        {/* Character Guide 2D Speech Box (Compact) */}
                        {(currentSlide?.characterGuide || currentSlide?.narrativeText) && (
                          <div
                            className="p-2.5 rounded-xl border backdrop-blur-md shadow-md relative overflow-hidden transition-all hover:border-amber-400/50"
                            style={{
                              borderColor: `${theme.palette.primary}60`,
                              backgroundColor: `${theme.palette.background}90`,
                            }}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className="shrink-0 relative">
                                <div className="w-9 h-9 rounded-lg overflow-hidden border border-amber-400/60 shadow bg-stone-950 p-0.5 flex items-center justify-center">
                                  <BrainHexAvatar profile={deck.targetProfile} size="sm" />
                                </div>
                                <span className="absolute -bottom-1 -right-1 px-1 py-0.2 bg-amber-500 text-black text-[8px] font-bold rounded-full shadow">
                                  2D
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1 mb-0.5 flex-wrap">
                                  <span className="font-cinzel text-[11px] font-bold uppercase tracking-wider text-amber-300">
                                    {currentSlide?.characterGuide?.name || guideName} ({guideInfo.title})
                                  </span>
                                  <button
                                    type="button"
                                    onClick={handleHearGuideAdvice}
                                    className="px-2 py-0.5 rounded text-[9px] font-bold transition-all flex items-center gap-1 shadow cursor-pointer"
                                    style={{
                                      backgroundColor: guideAdviceRevealed[slideKey] ? `${theme.palette.primary}40` : theme.palette.primary,
                                      color: guideAdviceRevealed[slideKey] ? theme.palette.accent : '#000000',
                                    }}
                                  >
                                    <Sparkles className="w-2.5 h-2.5" />
                                    <span>{guideAdviceRevealed[slideKey] ? 'Ativo' : '+15 XP'}</span>
                                  </button>
                                </div>
                                <p className="text-[11px] sm:text-xs text-stone-200 italic leading-relaxed">
                                  "{currentSlide?.characterGuide?.speechText || currentSlide?.narrativeText}"
                                </p>
                                {(currentSlide?.characterGuide?.analogy || guideAdviceRevealed[slideKey]) && (
                                  <div className="p-1.5 rounded-lg bg-amber-950/20 border border-amber-500/30 flex items-start gap-1.5 text-[10px] text-amber-200 mt-1.5">
                                    <Lightbulb className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                                    <div>
                                      <strong className="text-amber-300 font-semibold">Analogia: </strong>
                                      <span>{currentSlide?.characterGuide?.analogy || `Mantenha foco na execução estratégica e absorva cada conceito com maestria.`}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Content Synthesized Concept Cards or Paragraphs */}
                        {currentSlide?.contentParagraphs && currentSlide.contentParagraphs.length > 0 && (
                          <div className="space-y-1.5">
                            {currentSlide.contentParagraphs.map((para, idx) => (
                              <div
                                key={idx}
                                className="p-2 rounded-lg bg-stone-900/60 border border-stone-800/80 text-[11px] sm:text-xs text-stone-200 leading-relaxed flex items-start gap-2"
                              >
                                <span
                                  className="w-4 h-4 rounded-full flex items-center justify-center font-bold text-[9px] shrink-0 mt-0.5"
                                  style={{ backgroundColor: `${theme.palette.primary}30`, color: theme.palette.accent }}
                                >
                                  {idx + 1}
                                </span>
                                <span>{para}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Key Takeaways (Interactive with Mastery Toggle) */}
                        {currentSlide?.keyTakeaways && currentSlide.keyTakeaways.length > 0 && (
                          <div
                            className="p-2.5 rounded-xl border shadow-inner"
                            style={{
                              borderColor: `${theme.palette.secondary}80`,
                              backgroundColor: `${theme.palette.background}90`,
                            }}
                          >
                            <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-stone-800">
                              <p
                                className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
                                style={{ color: theme.palette.accent }}
                              >
                                <Sparkles className="w-3 h-3" />
                                Pontos de Maestria
                              </p>
                              <span className="text-[9px] text-stone-400">
                                {currentSlide.keyTakeaways.filter((_, idx) => !!masteredTakeaways[`${slideKey}-takeaway-${idx}`]).length}/{currentSlide.keyTakeaways.length}
                              </span>
                            </div>
                            <ul className="space-y-1.5 text-xs text-stone-300">
                              {currentSlide.keyTakeaways.map((takeaway, tidx) => {
                                const takeawayId = `${slideKey}-takeaway-${tidx}`;
                                const isMastered = !!masteredTakeaways[takeawayId];
                                return (
                                  <motion.li
                                    key={tidx}
                                    id={`takeaway-${tidx}`}
                                    whileHover={{ scale: 1.01, x: 2 }}
                                    whileTap={{ scale: 0.99 }}
                                    transition={{ duration: 0.1 }}
                                    onClick={() => toggleTakeawayMastery(takeawayId)}
                                    className={`p-1.5 rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition-all ${
                                      isMastered
                                        ? 'border-emerald-500/60 bg-emerald-950/30 text-emerald-100'
                                        : 'border-stone-800 bg-stone-950/50 text-stone-300 hover:border-stone-700'
                                    }`}
                                  >
                                    <div className="flex items-start gap-1.5 min-w-0">
                                      <span
                                        className={`mt-0.5 flex h-3.5 w-3.5 rounded-full shrink-0 items-center justify-center transition-colors ${
                                          isMastered ? 'bg-emerald-500 text-black' : 'bg-stone-800 text-stone-400'
                                        }`}
                                      >
                                        {isMastered ? <Check className="w-2 h-2" /> : String(tidx + 1)}
                                      </span>
                                      <span className={`text-[11px] leading-tight truncate ${isMastered ? 'font-medium' : ''}`}>
                                        {takeaway}
                                      </span>
                                    </div>
                                    <span
                                      className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded shrink-0 ${
                                        isMastered ? 'bg-emerald-900/60 text-emerald-300' : 'bg-stone-800 text-stone-400'
                                      }`}
                                    >
                                      {isMastered ? '✓' : '+25'}
                                    </span>
                                  </motion.li>
                                );
                              })}
                            </ul>
                          </div>
                        )}

                        {/* Contextual Sticky Note trigger */}
                        {currentSlide?.stickyNote && (
                          <div className="flex items-center justify-start pt-1">
                            <button
                              type="button"
                              onClick={() => setIsSlideNotesModalOpen(true)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-500/40 bg-stone-950/80 hover:bg-stone-900 text-[11px] text-stone-200 hover:text-white transition-all shadow-sm cursor-pointer group"
                            >
                              <span className="flex h-3.5 w-3.5 rounded-full items-center justify-center bg-amber-500/20 text-amber-300">
                                <StickyNote className="w-2 h-2" />
                              </span>
                              <span className="font-bold text-[10px] text-amber-300">
                                {currentSlide.stickyNote.badge || 'Nota'}:
                              </span>
                              <span className="text-[10px] text-stone-300 truncate max-w-[160px] italic">
                                "{currentSlide.stickyNote.text.slice(0, 30)}..."
                              </span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Right Column (lg:col-span-7): Visual Representations, Diagrams & Interactive Graphics */}
                      <div className="lg:col-span-7 flex flex-col justify-between space-y-2.5 overflow-y-auto pl-1">
                        {/* 1. Core Visual Content & Profile Illustration */}
                        <ContentVisualRepresentation
                          slide={currentSlide}
                          profile={deck.targetProfile}
                          primaryColor={theme.palette.primary}
                          secondaryColor={theme.palette.secondary}
                          accentColor={theme.palette.accent}
                        />

                        {/* 2. Timeline Process Flow if available */}
                        {currentSlide?.timelineSteps && currentSlide.timelineSteps.length > 0 && (
                          <div className="p-2.5 rounded-xl border border-stone-800 bg-stone-950/70">
                            <p
                              className="text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1"
                              style={{ color: theme.palette.accent }}
                            >
                              <TrendingUp className="w-3 h-3" />
                              Fluxo de Execução & Etapas
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                              {currentSlide.timelineSteps.map((step, sidx) => {
                                const isInspected = activeTimelineStepBySlide[slideKey] === sidx || step.highlight;
                                return (
                                  <div
                                    key={sidx}
                                    id={`timeline-step-${sidx}`}
                                    onClick={() => {
                                      setActiveTimelineStepBySlide(prev => ({ ...prev, [slideKey]: sidx }));
                                      playSoundEffect('quest_check');
                                      setBurstTrigger(b => b + 1);
                                    }}
                                    className={`p-2 rounded-lg border cursor-pointer transition-all ${
                                      isInspected
                                        ? 'border-amber-400/80 bg-amber-950/30'
                                        : 'border-stone-800 bg-stone-900/60 hover:border-stone-700'
                                    }`}
                                  >
                                    <span
                                      className="px-1.5 py-0.2 rounded text-[8px] font-mono font-bold text-black shadow"
                                      style={{ backgroundColor: theme.palette.primary }}
                                    >
                                      {step.stepNumber}
                                    </span>
                                    <h5 className="font-bold text-[10px] text-white mt-1 line-clamp-1">{step.title}</h5>
                                    <p className="text-[9px] text-stone-300 line-clamp-2 mt-0.5">{step.description}</p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* 3. Metric Cards if available */}
                        {currentSlide?.metricCards && currentSlide.metricCards.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {currentSlide.metricCards.map((metric, midx) => (
                              <div
                                key={midx}
                                className="p-2.5 rounded-xl border border-stone-800 bg-stone-900/70 shadow-sm flex flex-col justify-between"
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span
                                    className="text-lg font-extrabold tracking-tight"
                                    style={{ color: theme.palette.accent }}
                                  >
                                    {metric.value}
                                  </span>
                                  <Sparkle className="w-3 h-3 text-amber-400" />
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold text-white leading-tight">{metric.label}</p>
                                  {metric.sublabel && (
                                    <p className="text-[8px] text-stone-400 mt-0.5 truncate">{metric.sublabel}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* 4. Comparison Columns if available */}
                        {currentSlide?.comparisonColumns && currentSlide.comparisonColumns.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {currentSlide.comparisonColumns.map((col, cidx) => (
                              <div
                                key={cidx}
                                className={`p-2.5 rounded-xl border transition-all ${
                                  col.highlight
                                    ? 'border-amber-400/80 bg-amber-950/25 shadow-md'
                                    : 'border-stone-800 bg-stone-900/60'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-stone-800">
                                  <h5 className="font-bold text-[11px] text-white">{col.title}</h5>
                                  {col.badge && (
                                    <span
                                      className="text-[8px] font-bold px-1.5 py-0.2 rounded text-black"
                                      style={{ backgroundColor: theme.palette.primary }}
                                    >
                                      {col.badge}
                                    </span>
                                  )}
                                </div>
                                <ul className="space-y-1 text-[10px] text-stone-300">
                                  {col.items.slice(0, 3).map((item, iidx) => (
                                    <li key={iidx} className="flex items-start gap-1">
                                      <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 shrink-0 mt-0.5" />
                                      <span className="truncate">{item}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* 5. Bento Modular Cards if available */}
                        {currentSlide?.bentoCards && currentSlide.bentoCards.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {currentSlide.bentoCards.map((bento, bidx) => (
                              <div
                                key={bidx}
                                className={`p-2.5 rounded-xl border transition-all flex flex-col justify-between ${
                                  bento.highlight
                                    ? 'border-amber-400/70 bg-amber-950/30 shadow'
                                    : 'border-stone-800 bg-stone-900/60'
                                }`}
                              >
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    {bento.tag && (
                                      <span
                                        className="text-[8px] font-bold px-1.5 py-0.2 rounded text-black"
                                        style={{ backgroundColor: theme.palette.primary }}
                                      >
                                        {bento.tag}
                                      </span>
                                    )}
                                    {bento.stat && (
                                      <span className="text-[10px] font-mono font-bold text-amber-300">
                                        {bento.stat}
                                      </span>
                                    )}
                                  </div>
                                  <h5 className="font-bold text-[11px] text-white mb-0.5 line-clamp-1">{bento.title}</h5>
                                  <p className="text-[9px] text-stone-300 line-clamp-2 leading-relaxed">{bento.description}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* 6. Reference Didactic Image with Zoom */}
                        {currentSlide?.referenceImageDataUri && (
                          <div className="p-2.5 rounded-xl border border-stone-800 bg-stone-950/85 shadow relative overflow-hidden">
                            <div className="flex items-center justify-between gap-1 pb-1.5 mb-1.5 border-b border-white/10">
                              <div className="flex items-center gap-1.5">
                                <ImageIcon className="w-3 h-3 text-amber-400" />
                                <span className="text-[10px] font-bold text-white truncate max-w-[180px]">
                                  {currentSlide.subtopic || currentSlide.title}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setSelectedZoomImage(currentSlide.referenceImageDataUri || null)}
                                className="p-1 rounded bg-stone-900 hover:bg-stone-800 border border-stone-700 text-stone-300 hover:text-white transition-all cursor-pointer"
                                title="Expandir Imagem"
                              >
                                <Maximize2 className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="relative rounded-lg overflow-hidden bg-black/50 border border-stone-900 flex items-center justify-center">
                              <img
                                src={currentSlide.referenceImageDataUri}
                                alt={currentSlide.subtopic || currentSlide.title}
                                className="w-full max-h-36 sm:max-h-44 object-contain rounded-lg transition-transform duration-300 hover:scale-[1.01] cursor-pointer"
                                onClick={() => setSelectedZoomImage(currentSlide.referenceImageDataUri || null)}
                              />
                            </div>
                          </div>
                        )}

                        {/* 7. Written Example / Code Snippet */}
                        {currentSlide?.writtenExample && (
                          <div
                            className="p-2.5 rounded-xl border shadow-md backdrop-blur-sm"
                            style={{
                              borderColor: `${theme.palette.primary}70`,
                              backgroundColor: `${theme.palette.background}B0`,
                            }}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-white/10">
                              <div className="flex items-center gap-1.5">
                                <FileText className="w-3 h-3 text-amber-400" />
                                <span className="text-[10px] font-bold text-white">{currentSlide.writtenExample.title}</span>
                              </div>
                              <span
                                className="text-[8px] font-mono font-bold px-1.5 py-0.2 rounded text-black"
                                style={{ backgroundColor: theme.palette.accent }}
                              >
                                Prática
                              </span>
                            </div>
                            <p className="text-[10px] text-stone-200 leading-relaxed mb-1.5 line-clamp-2">
                              {currentSlide.writtenExample.explanation}
                            </p>
                            {currentSlide.writtenExample.codeOrDiagram && (
                              <div className="rounded bg-stone-950 border border-stone-800 p-2 font-mono text-[10px] text-amber-200 overflow-x-auto max-h-28">
                                <pre className="whitespace-pre">{currentSlide.writtenExample.codeOrDiagram}</pre>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 8. Interactive Element Card Unique for the Slide */}
                        {(() => {
                          const activeElement =
                            currentSlide?.interactiveElement ||
                            (currentSlide
                              ? generateUniqueInteractiveElement(
                                  currentSlide,
                                  deck.targetProfile,
                                  currentSlideIndex,
                                  deck.slides.length
                                )
                              : null);

                          if (!activeElement) return null;

                          return (
                            <div>
                              <UniqueInteractiveCard
                                element={activeElement}
                                profile={deck.targetProfile}
                                slideId={slideKey}
                                slideTitle={currentSlide?.title}
                                primaryColor={theme.palette.primary}
                                secondaryColor={theme.palette.secondary}
                                accentColor={theme.palette.accent}
                                backgroundColor={theme.palette.background}
                                onXpEarned={(earnedXp) => {
                                  setAccumulatedXp((prev) => prev + earnedXp);
                                  setBurstTrigger((prev) => prev + 1);
                                }}
                              />
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}

                  {/* Secret Lore Reveal (Seeker style) */}
                {currentSlide?.secretLore && (
                  <div
                    className="p-3.5 rounded-lg border my-3 transition-all"
                    style={{
                      borderColor: `${theme.palette.secondary}90`,
                      backgroundColor: `${theme.palette.background}BB`,
                    }}
                  >
                    {!isSecretRevealed ? (
                      <button
                        type="button"
                        id="btn-reveal-secret"
                        onClick={handleRevealSecret}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-md text-xs font-bold text-black shadow transition-transform hover:scale-[1.02] cursor-pointer"
                        style={{ backgroundColor: theme.palette.primary }}
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>{currentSlide.secretLore.hint || 'Revelar Pergaminho Arcano (+100 XP)'}</span>
                      </button>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                          <Unlock className="w-3.5 h-3.5" />
                          <span>Segredo Revelado (+100 XP):</span>
                        </div>
                        <p className="text-xs sm:text-sm text-stone-200 italic leading-relaxed">
                          {currentSlide.secretLore.revealedContent}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Boss Battle HP & Arena (Conqueror style) */}
                {currentSlide?.type === 'boss_battle' && (
                  <div className="my-3 p-4 rounded-xl border border-rose-900/60 bg-gradient-to-b from-rose-950/30 to-black/60">
                    <div className="flex items-center justify-between mb-2">
                      <span className="flex items-center gap-1.5 font-bold text-xs text-rose-300">
                        <Swords className="w-4 h-4 text-rose-500" />
                        HP DO GUARDIÃO ADVERSÁRIO
                      </span>
                      <span className="text-xs font-mono font-bold text-rose-400">
                        {currentBossHp} / {bossMaxHp} HP
                      </span>
                    </div>

                    {/* Health Bar */}
                    <div className="w-full h-3 bg-stone-900 rounded-full overflow-hidden border border-rose-950 mb-3">
                      <div
                        className="h-full bg-gradient-to-r from-rose-600 to-amber-500 transition-all duration-300"
                        style={{ width: `${(currentBossHp / bossMaxHp) * 100}%` }}
                      />
                    </div>

                    {/* Battle Action Buttons */}
                    {currentBossHp > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          id="btn-boss-hit-1"
                          onClick={() => handleBossAttack(350, 'Golpe Técnico')}
                          className="flex-1 py-2 px-3 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow cursor-pointer transition-transform active:scale-95"
                        >
                          ✦ Golpe Técnico (-350 HP)
                        </button>
                        <button
                          type="button"
                          id="btn-boss-hit-2"
                          onClick={() => handleBossAttack(650, 'Crítico Arquitetural')}
                          className="flex-1 py-2 px-3 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow cursor-pointer transition-transform active:scale-95"
                        >
                          ✦ Crítico Arquitetural (-650 HP)
                        </button>
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-500/60 text-center text-xs font-bold text-emerald-300">
                        ✦ GUARDIÃO DERROTADO! CONQUISTA SUPREMA DESBLOQUEADA!
                      </div>
                    )}

                    {showDamageAnimation && (
                      <p className="mt-2 text-center text-xs font-bold text-amber-300 animate-bounce">
                        {showDamageAnimation}
                      </p>
                    )}
                  </div>
                )}

                {/* Quote / Mote at bottom */}
                {currentSlide?.quote && (
                  <div className="mt-4 pt-3 border-t border-stone-800/80 text-center">
                    <p className="font-serif italic text-xs text-stone-300">
                      "{currentSlide.quote.text}"
                    </p>
                    <p className="text-[10px] text-stone-500 mt-0.5">— {currentSlide.quote.author}</p>
                  </div>
                )}
                </div>
              </ThematicFrameContainer>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom Slide Navigation Bar */}
        <div
          className="relative z-10 flex items-center justify-between px-4 sm:px-6 py-2.5 border-t"
          style={{
            borderColor: `${theme.palette.secondary}60`,
            backgroundColor: `${theme.palette.background}B0`,
          }}
        >
          {/* Previous Button */}
          <button
            id="btn-slide-prev"
            disabled={currentSlideIndex === 0}
            onClick={handlePrev}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              currentSlideIndex === 0
                ? 'opacity-40 cursor-not-allowed text-stone-600'
                : 'text-stone-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Anterior</span>
          </button>

          {/* Dots Indicator */}
          <div className="flex items-center gap-1.5">
            {deck.slides.map((_, idx) => {
              const isActive = idx === currentSlideIndex;
              return (
                <button
                  key={idx}
                  id={`btn-dot-slide-${idx}`}
                  onClick={() => {
                    playSoundEffect('slide_next');
                    onSlideChange(idx);
                  }}
                  className={`h-2 rounded-full transition-all ${
                    isActive ? 'w-6' : 'w-2 bg-stone-700 hover:bg-stone-500'
                  }`}
                  style={{
                    backgroundColor: isActive ? theme.palette.primary : undefined,
                  }}
                  title={`Slide ${idx + 1}`}
                />
              );
            })}
          </div>

          {/* Next Button */}
          <button
            id="btn-slide-next"
            disabled={currentSlideIndex === deck.slides.length - 1}
            onClick={handleNext}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              currentSlideIndex === deck.slides.length - 1
                ? 'opacity-40 cursor-not-allowed text-stone-600'
                : 'shadow text-black hover:scale-105'
            }`}
            style={{
              backgroundColor:
                currentSlideIndex === deck.slides.length - 1
                  ? 'transparent'
                  : theme.palette.primary,
            }}
          >
            <span className="hidden sm:inline">
              {currentSlideIndex === deck.slides.length - 1 ? 'Concluído' : 'Próximo'}
            </span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Lightbox Modal for Visual Illustration */}
      {selectedZoomImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
          onClick={() => setSelectedZoomImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelectedZoomImage(null)}
              className="absolute -top-10 right-0 p-1.5 rounded-full bg-stone-800 text-stone-200 hover:text-white transition-all cursor-pointer"
            >
              ✕ Fechar
            </button>
            <img
              src={selectedZoomImage}
              alt="Visual de Referência Expandido"
              className="max-w-full max-h-[82vh] object-contain rounded-xl border border-stone-800 shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* Illustration Success Toast */}
      {illustrationSuccessMsg && (
        <div className="fixed bottom-16 right-4 z-50 px-4 py-2 rounded-xl bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 text-xs font-bold shadow-2xl backdrop-blur-md flex items-center gap-2 animate-bounce">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>{illustrationSuccessMsg}</span>
        </div>
      )}

      {/* Slide Notes & Study Annotations Modal */}
      {isSlideNotesModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setIsSlideNotesModalOpen(false)}
        >
          <div
            className="relative w-full max-w-xl bg-stone-950/95 border border-stone-700 rounded-2xl shadow-2xl p-5 text-stone-100 flex flex-col gap-4 overflow-hidden max-h-[85vh]"
            style={{ borderColor: `${theme.palette.primary}80` }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div
                  className="p-2 rounded-xl text-black font-bold shadow"
                  style={{ backgroundColor: theme.palette.primary }}
                >
                  <NotebookPen className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 block">
                    ✦ Caderno de Anotações • Slide {currentSlideIndex + 1}/{deck.slides.length}
                  </span>
                  <h3 className="text-sm font-bold text-white truncate max-w-xs sm:max-w-sm">
                    {currentSlide?.title || 'Anotações do Slide'}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSlideNotesModalOpen(false)}
                className="p-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-white transition-colors cursor-pointer"
                title="Fechar anotações"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto pr-1">
              {/* Sticky Note if attached */}
              {currentSlide?.stickyNote && (
                <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/40 text-xs space-y-1.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded bg-amber-500 text-black font-bold text-[10px] uppercase font-mono">
                      {currentSlide.stickyNote.badge || 'Nota de Destaque'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(currentSlide.stickyNote?.text || '');
                        playSoundEffect('quest_check');
                      }}
                      className="text-[10px] text-stone-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                      title="Copiar texto da nota"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copiar</span>
                    </button>
                  </div>
                  <p className="text-stone-200 leading-relaxed italic">{currentSlide.stickyNote.text}</p>
                </div>
              )}

              {/* Presenter Notes / Professor Tips if attached */}
              {currentSlide?.presenterNotes && (
                <div className="p-3.5 rounded-xl bg-stone-900/80 border border-stone-800 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-cyan-400">
                      💡 Notas do Instrutor / Apresentador
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(currentSlide.presenterNotes || '');
                        playSoundEffect('quest_check');
                      }}
                      className="text-[10px] text-stone-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                      title="Copiar notas do instrutor"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copiar</span>
                    </button>
                  </div>
                  <p className="text-stone-300 leading-relaxed whitespace-pre-line">{currentSlide.presenterNotes}</p>
                </div>
              )}

              {/* Personal Student Study Notes */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono text-stone-400">
                  <span className="flex items-center gap-1 font-bold text-stone-300">
                    <PenLine className="w-3.5 h-3.5 text-amber-400" />
                    Suas Anotações Pessoais de Estudo:
                  </span>
                  <span>{(slideUserNotes[currentSlideIndex] || '').length} caracteres</span>
                </div>
                <textarea
                  value={slideUserNotes[currentSlideIndex] || ''}
                  onChange={(e) => handleUpdateSlideNote(e.target.value)}
                  placeholder="Escreva suas anotações, insights-chave, dúvidas de revisão ou sínteses deste slide..."
                  rows={5}
                  className="w-full rounded-xl border border-stone-700 bg-stone-900/90 p-3.5 text-xs sm:text-sm text-stone-100 placeholder-stone-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none transition-all resize-none shadow-inner"
                />
                <p className="text-[10px] text-stone-400 italic">
                  ✓ Suas anotações são salvas automaticamente no navegador para este deck.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              {slideUserNotes[currentSlideIndex] ? (
                <button
                  type="button"
                  onClick={() => handleUpdateSlideNote('')}
                  className="px-3 py-1.5 rounded-lg text-xs text-stone-400 hover:text-rose-400 hover:bg-stone-900 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpar Anotação</span>
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => {
                  playSoundEffect('quest_check');
                  setIsSlideNotesModalOpen(false);
                }}
                className="px-4 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow transition-transform active:scale-95 cursor-pointer ml-auto"
                style={{
                  backgroundColor: theme.palette.primary,
                  color: '#000000',
                }}
              >
                <Check className="w-3.5 h-3.5" />
                <span>Concluir</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
