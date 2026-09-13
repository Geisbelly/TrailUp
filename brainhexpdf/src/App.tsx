/**
 * TrailUp BrainHex - Gerador de Slides e PDFs Temáticos Personalizados
 * Real Medieval Mágico • 7 Perfis BrainHex • Mobile Vertical/Horizontal & Web • Supabase Storage
 */

import React, { useState } from 'react';
import {
  Sparkles,
  Smartphone,
  Monitor,
  RotateCw,
  Plus,
  Play,
  Edit3,
  FileDown,
  Cloud,
  BookOpen,
  Volume2,
  VolumeX,
  Shield,
  Layers,
  ChevronRight,
  Maximize2,
  Network,
} from 'lucide-react';
import { BrainHexType, DeckData, ViewportMode } from './types';
import { BRAIN_HEX_PROFILES } from './data/brainHexProfiles';
import { PRESET_DECKS } from './data/presetDecks';
import { DeckInteractionProvider } from './context/DeckInteractionContext';
import { Navbar } from './components/Navbar';
import { SlideViewer } from './components/SlideViewer';
import { GeneratorModal } from './components/GeneratorModal';
import { DeckEditorModal } from './components/DeckEditorModal';
import { PresenterModal } from './components/PresenterModal';
import { PdfExportModal } from './components/PdfExportModal';
import { SupabaseModal } from './components/SupabaseModal';
import { BrainHexGuideModal } from './components/BrainHexGuideModal';
import { MicroserviceDocsModal } from './components/MicroserviceDocsModal';
import { KnowledgeGraphModal } from './components/KnowledgeGraphModal';
import { BrainHexAvatar } from './components/BrainHexAvatars';
import { toggleMute, playSoundEffect, getIsMuted } from './utils/audioSynth';

export default function App() {
  const [currentDeck, setCurrentDeck] = useState<DeckData>(PRESET_DECKS[0]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0);
  const [viewportMode, setViewportMode] = useState<ViewportMode>('web-desktop');
  const [isMutedState, setIsMutedState] = useState<boolean>(false);

  // Modals state
  const [isGeneratorOpen, setIsGeneratorOpen] = useState<boolean>(false);
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [isPresenterOpen, setIsPresenterOpen] = useState<boolean>(false);
  const [isPdfExportOpen, setIsPdfExportOpen] = useState<boolean>(false);
  const [isSupabaseOpen, setIsSupabaseOpen] = useState<boolean>(false);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [isMicroserviceDocsOpen, setIsMicroserviceDocsOpen] = useState<boolean>(false);
  const [isKnowledgeGraphOpen, setIsKnowledgeGraphOpen] = useState<boolean>(false);

  const activeTheme = currentDeck.themeConfig;

  const handleToggleMute = () => {
    const updated = toggleMute();
    setIsMutedState(updated);
    if (!updated) {
      playSoundEffect('quest_check');
    }
  };

  const handleSelectProfilePreset = (profile: BrainHexType) => {
    const preset = PRESET_DECKS.find((d) => d.targetProfile === profile) || PRESET_DECKS[0];
    setCurrentDeck(preset);
    setCurrentSlideIndex(0);
    playSoundEffect(preset.themeConfig.soundArchetype || 'slide_next');
  };

  const handleDeckGenerated = (newDeck: DeckData) => {
    setCurrentDeck(newDeck);
    setCurrentSlideIndex(0);
  };

  const handleSaveDeckFromEditor = (updatedDeck: DeckData) => {
    setCurrentDeck(updatedDeck);
    if (currentSlideIndex >= updatedDeck.slides.length) {
      setCurrentSlideIndex(0);
    }
  };

  return (
    <DeckInteractionProvider deck={currentDeck}>
      <div
        className="min-h-screen flex flex-col transition-colors duration-500 font-sans"
        style={{
          backgroundColor: activeTheme.palette.background,
          color: '#F9FAFB',
        }}
      >
      {/* Top Navbar */}
      <Navbar
        currentDeck={currentDeck}
        viewportMode={viewportMode}
        onSelectViewport={setViewportMode}
        isMuted={isMutedState}
        onToggleMute={handleToggleMute}
        onOpenGenerator={() => setIsGeneratorOpen(true)}
        onOpenEditor={() => setIsEditorOpen(true)}
        onOpenPresenter={() => setIsPresenterOpen(true)}
        onOpenPdfExport={() => setIsPdfExportOpen(true)}
        onOpenSupabase={() => setIsSupabaseOpen(true)}
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenMicroserviceDocs={() => setIsMicroserviceDocsOpen(true)}
        onOpenKnowledgeGraph={() => setIsKnowledgeGraphOpen(true)}
        onSelectProfilePreset={handleSelectProfilePreset}
      />

      {/* Main Interactive Stage */}
      <main className="flex-1 flex flex-col items-center justify-center p-2 sm:p-4 max-w-7xl w-full mx-auto">
        <SlideViewer
          deck={currentDeck}
          viewportMode={viewportMode}
          currentSlideIndex={currentSlideIndex}
          onSlideChange={setCurrentSlideIndex}
          onOpenPresenter={() => setIsPresenterOpen(true)}
          onOpenKnowledgeGraph={() => setIsKnowledgeGraphOpen(true)}
          onUpdateDeck={setCurrentDeck}
        />

        {/* Bottom Slide Strip Bar */}
        <div className="w-full max-w-5xl mt-2 px-3 py-2 rounded-xl border border-stone-800/80 bg-stone-950/70 backdrop-blur-md flex items-center justify-between gap-3 overflow-x-auto">
          {/* Quick Deck Info */}
          <div className="flex items-center gap-2 shrink-0">
            <span
              className="px-2 py-0.5 rounded text-[10px] font-bold text-black uppercase"
              style={{ backgroundColor: activeTheme.palette.accent }}
            >
              {currentDeck.rankLevel}
            </span>
            <span className="text-xs font-semibold text-stone-300 hidden md:inline">
              {currentDeck.subject}
            </span>
          </div>

          {/* Slide Thumbnails */}
          <div className="flex items-center gap-2 overflow-x-auto py-1">
            {currentDeck.slides.map((s, idx) => {
              const isCurrent = idx === currentSlideIndex;
              return (
                <button
                  key={s.id || idx}
                  id={`btn-strip-slide-${idx}`}
                  onClick={() => {
                    playSoundEffect('slide_next');
                    setCurrentSlideIndex(idx);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium whitespace-nowrap transition-all ${
                    isCurrent
                      ? 'border-amber-400 bg-white/10 text-white font-bold shadow'
                      : 'border-stone-800 bg-stone-900/50 text-stone-400 hover:text-stone-200 hover:border-stone-700'
                  }`}
                >
                  <span className="font-mono text-[10px] opacity-70">#{idx + 1}</span>
                  <span className="truncate max-w-[120px]">{s.title}</span>
                </button>
              );
            })}
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              id="btn-bottom-graph"
              onClick={() => setIsKnowledgeGraphOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-purple-500/40 bg-purple-950/40 text-purple-300 text-xs font-bold hover:bg-purple-900/50 transition-colors shadow-sm"
              title="Visualizar Grafo de Conhecimento D3"
            >
              <Network className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Grafo D3</span>
            </button>
            <button
              id="btn-bottom-export-pdf"
              onClick={() => setIsPdfExportOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs font-bold hover:bg-amber-500/20 transition-colors"
              title="Exportar PDF / Imprimir"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">PDF</span>
            </button>
            <button
              id="btn-bottom-supabase"
              onClick={() => setIsSupabaseOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-emerald-300 text-xs font-bold hover:bg-emerald-900/50 transition-colors"
              title="Salvar no Bucket do Supabase"
            >
              <Cloud className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Supabase</span>
            </button>
          </div>
        </div>
      </main>

      {/* Modals */}
      <GeneratorModal
        isOpen={isGeneratorOpen}
        onClose={() => setIsGeneratorOpen(false)}
        onDeckGenerated={handleDeckGenerated}
      />

      <DeckEditorModal
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        deck={currentDeck}
        onSaveDeck={handleSaveDeckFromEditor}
      />

      <PresenterModal
        isOpen={isPresenterOpen}
        onClose={() => setIsPresenterOpen(false)}
        deck={currentDeck}
        initialSlideIndex={currentSlideIndex}
        onSlideChange={setCurrentSlideIndex}
      />

      <PdfExportModal
        isOpen={isPdfExportOpen}
        onClose={() => setIsPdfExportOpen(false)}
        deck={currentDeck}
      />

      <SupabaseModal
        isOpen={isSupabaseOpen}
        onClose={() => setIsSupabaseOpen(false)}
        deck={currentDeck}
      />

      <BrainHexGuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        onSelectProfile={handleSelectProfilePreset}
      />

      <MicroserviceDocsModal
        isOpen={isMicroserviceDocsOpen}
        onClose={() => setIsMicroserviceDocsOpen(false)}
      />

      <KnowledgeGraphModal
        isOpen={isKnowledgeGraphOpen}
        onClose={() => setIsKnowledgeGraphOpen(false)}
        deck={currentDeck}
        currentSlideIndex={currentSlideIndex}
        onSelectSlide={(idx) => {
          setCurrentSlideIndex(idx);
          setIsKnowledgeGraphOpen(false);
        }}
      />
    </div>
    </DeckInteractionProvider>
  );
}
