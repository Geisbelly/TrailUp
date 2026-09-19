import React, { useState, useEffect } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  Clock,
  BookOpen,
} from 'lucide-react';
import { DeckData } from '../types';
import { BrainHexAvatar } from './BrainHexAvatars';
import { playSoundEffect } from '../utils/audioSynth';

interface PresenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  deck: DeckData;
  initialSlideIndex: number;
  onSlideChange: (index: number) => void;
}

export const PresenterModal: React.FC<PresenterModalProps> = ({
  isOpen,
  onClose,
  deck,
  initialSlideIndex,
  onSlideChange,
}) => {
  const [slideIndex, setSlideIndex] = useState(initialSlideIndex);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(true);

  useEffect(() => {
    setSlideIndex(initialSlideIndex);
  }, [initialSlideIndex]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isOpen && isTimerRunning) {
      interval = setInterval(() => {
        setSecondsElapsed((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isOpen, isTimerRunning]);

  if (!isOpen) return null;

  const currentSlide = deck.slides[slideIndex] || deck.slides[0];
  const nextSlide = deck.slides[slideIndex + 1];
  const theme = deck.themeConfig;

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleNext = () => {
    if (slideIndex < deck.slides.length - 1) {
      const nextIdx = slideIndex + 1;
      setSlideIndex(nextIdx);
      onSlideChange(nextIdx);
      playSoundEffect('slide_next');
    }
  };

  const handlePrev = () => {
    if (slideIndex > 0) {
      const prevIdx = slideIndex - 1;
      setSlideIndex(prevIdx);
      onSlideChange(prevIdx);
      playSoundEffect('slide_prev');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-stone-950 text-white select-none">
      {/* Top Bar: Title, Timer, Close */}
      <div className="flex items-center justify-between border-b border-stone-800 bg-stone-900/90 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <BrainHexAvatar profile={deck.targetProfile} size="sm" className="w-7 h-7" />
          <div>
            <h2 className="text-sm font-bold text-white truncate max-w-md">
              {deck.title}
            </h2>
            <p className="text-[11px] text-stone-400">
              Modo Apresentador • Perfil: {theme.perfil} ({theme.tom})
            </p>
          </div>
        </div>

        {/* Stopwatch Timer */}
        <div className="flex items-center gap-2 bg-stone-950 px-3 py-1.5 rounded-lg border border-stone-800">
          <Clock className="w-4 h-4 text-amber-400" />
          <span className="font-mono text-sm font-bold text-amber-200">
            {formatTime(secondsElapsed)}
          </span>
          <button
            onClick={() => setIsTimerRunning(!isTimerRunning)}
            className="p-1 text-stone-400 hover:text-white"
            title={isTimerRunning ? 'Pausar Cronômetro' : 'Iniciar Cronômetro'}
          >
            {isTimerRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
          </button>
          <button
            onClick={() => setSecondsElapsed(0)}
            className="p-1 text-stone-400 hover:text-white"
            title="Zerar Cronômetro"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Slide Counter & Close */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-stone-400 font-mono">
            Slide {slideIndex + 1} de {deck.slides.length}
          </span>
          <button
            id="btn-close-presenter"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-stone-800 text-stone-300 hover:text-white hover:bg-stone-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Dual Pane Content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 overflow-hidden">
        {/* Left: Main Current Slide Preview */}
        <div
          className="relative lg:col-span-8 flex flex-col justify-between rounded-xl border p-6 overflow-y-auto"
          style={{
            backgroundColor: theme.palette.background,
            borderColor: theme.palette.secondary,
          }}
        >
          {currentSlide.backgroundImage && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 select-none">
              <img
                src={currentSlide.backgroundImage}
                alt="Cenário Ambiente"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover pointer-events-none"
                style={{
                  opacity: currentSlide.ambientOverlayOpacity ?? 0.35,
                  filter: (currentSlide.ambientBlur ?? 0) > 0 ? `blur(${currentSlide.ambientBlur}px)` : 'none',
                }}
              />
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundColor: `${theme.palette.background}99`,
                }}
              />
            </div>
          )}
          <div className="relative z-10">
            <div className="flex items-center justify-between border-b pb-2 mb-4" style={{ borderColor: `${theme.palette.secondary}60` }}>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.palette.accent }}>
                {currentSlide.subtitle || theme.archetype}
              </span>
              <span className="text-xs px-2 py-0.5 rounded font-bold" style={{ backgroundColor: theme.palette.primary, color: '#000' }}>
                {currentSlide.type}
              </span>
            </div>

            <h1 className="font-serif text-2xl sm:text-3xl font-extrabold text-white mb-3">
              {currentSlide.title}
            </h1>

            {currentSlide.narrativeText && (
              <p className="italic text-sm text-stone-300 p-3 rounded-lg border-l-4 mb-4" style={{ borderLeftColor: theme.palette.primary, backgroundColor: `${theme.palette.secondary}30` }}>
                "{currentSlide.narrativeText}"
              </p>
            )}

            <div className="space-y-3">
              {currentSlide.contentParagraphs.map((p, idx) => (
                <p key={idx} className="text-sm sm:text-base text-stone-200 leading-relaxed">
                  {p}
                </p>
              ))}

              {currentSlide.referenceImageDataUri && (
                <div className="p-3 rounded-lg border border-stone-800 bg-stone-950/80 my-3">
                  <div className="flex items-center gap-1.5 mb-2 pb-1 border-b border-white/10 text-[10px] font-mono text-amber-300 font-bold uppercase">
                    <span>✦ Exemplo Visual Didático • Guia do Aluno</span>
                  </div>
                  <img
                    src={currentSlide.referenceImageDataUri}
                    alt={currentSlide.subtopic || currentSlide.title}
                    className="max-h-48 w-full object-contain rounded bg-black/40"
                  />
                </div>
              )}

              {currentSlide.keyTakeaways && (
                <div className="p-3 rounded-lg border my-3" style={{ borderColor: `${theme.palette.secondary}80`, backgroundColor: `${theme.palette.background}90` }}>
                  <p className="text-xs font-bold uppercase mb-1.5" style={{ color: theme.palette.accent }}>
                    Destaques de Maestria:
                  </p>
                  <ul className="space-y-1 text-xs sm:text-sm text-stone-300">
                    {currentSlide.keyTakeaways.map((t, tidx) => (
                      <li key={tidx} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: theme.palette.primary }} />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between pt-4 border-t border-stone-800 mt-4">
            <button
              disabled={slideIndex === 0}
              onClick={handlePrev}
              className="flex items-center gap-1 px-4 py-2 rounded-lg bg-stone-800 text-xs font-semibold text-stone-200 hover:bg-stone-700 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>

            <div className="flex gap-1.5">
              {deck.slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setSlideIndex(i);
                    onSlideChange(i);
                  }}
                  className={`w-2.5 h-2.5 rounded-full ${
                    i === slideIndex ? 'bg-amber-400 w-6' : 'bg-stone-700'
                  } transition-all`}
                />
              ))}
            </div>

            <button
              disabled={slideIndex === deck.slides.length - 1}
              onClick={handleNext}
              className="flex items-center gap-1 px-5 py-2 rounded-lg text-xs font-bold text-black shadow disabled:opacity-40"
              style={{ backgroundColor: theme.palette.primary }}
            >
              <span>Próximo</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right: Speaker Notes & Next Slide Preview */}
        <div className="lg:col-span-4 flex flex-col gap-4 overflow-y-auto">
          {/* Speaker Notes */}
          <div className="p-4 rounded-xl border border-stone-800 bg-stone-900/90 flex-1">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">
              <BookOpen className="w-4 h-4" />
              <span>Notas do Apresentador & Dicas de Tom</span>
            </div>

            <div className="p-2.5 rounded-lg bg-stone-950 border border-stone-800 mb-3 text-xs text-stone-300">
              <p className="font-bold text-white mb-1">Diretriz para Perfil {theme.perfil}:</p>
              <ul className="list-disc pl-4 space-y-1 text-stone-400">
                {theme.diretrizes.map((dir, didx) => (
                  <li key={didx}>{dir}</li>
                ))}
              </ul>
            </div>

            <div className="text-xs text-stone-300 leading-relaxed">
              {currentSlide.presenterNotes ? (
                <p className="whitespace-pre-line">{currentSlide.presenterNotes}</p>
              ) : (
                <p className="italic text-stone-500">
                  Nenhuma nota customizada para este slide. Dica: Enfatize o gancho de engajamento do perfil {theme.nomePt}.
                </p>
              )}
            </div>
          </div>

          {/* Next Slide Mini Preview */}
          <div className="p-4 rounded-xl border border-stone-800 bg-stone-900/90">
            <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400 block mb-2">
              Próximo Slide:
            </span>
            {nextSlide ? (
              <div
                onClick={handleNext}
                className="p-3 rounded-lg border border-stone-800 bg-stone-950 cursor-pointer hover:border-amber-500/50 transition-all"
              >
                <p className="text-xs font-bold text-white truncate">{nextSlide.title}</p>
                <p className="text-[10px] text-stone-400 uppercase mt-0.5">{nextSlide.type}</p>
              </div>
            ) : (
              <p className="text-xs italic text-stone-500">Fim da apresentação.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
