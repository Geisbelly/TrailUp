import React from 'react';
import {
  Sparkles,
  Smartphone,
  Monitor,
  FileDown,
  Cloud,
  Volume2,
  VolumeX,
  Play,
  Edit3,
  BookOpen,
  RotateCw,
  Layers,
  Server,
  Network,
} from 'lucide-react';
import { BrainHexType, DeckData, ViewportMode } from '../types';
import { BRAIN_HEX_PROFILES, BRAIN_HEX_GUIDE_NAMES } from '../data/brainHexProfiles';
import { BrainHexAvatar } from './BrainHexAvatars';
import { TrailUpGemLogo, TrailUpArchetypeSigil } from './TrailUpThematicGraphics';

interface NavbarProps {
  currentDeck: DeckData;
  viewportMode: ViewportMode;
  onSelectViewport: (mode: ViewportMode) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onOpenGenerator: () => void;
  onOpenEditor: () => void;
  onOpenPresenter: () => void;
  onOpenPdfExport: () => void;
  onOpenSupabase: () => void;
  onOpenGuide: () => void;
  onOpenMicroserviceDocs?: () => void;
  onOpenKnowledgeGraph?: () => void;
  onSelectProfilePreset: (profile: BrainHexType) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentDeck,
  viewportMode,
  onSelectViewport,
  isMuted,
  onToggleMute,
  onOpenGenerator,
  onOpenEditor,
  onOpenPresenter,
  onOpenPdfExport,
  onOpenSupabase,
  onOpenGuide,
  onOpenMicroserviceDocs,
  onOpenKnowledgeGraph,
  onSelectProfilePreset,
}) => {
  const activeProfile = currentDeck.themeConfig;

  return (
    <header
      className="sticky top-0 z-40 w-full border-b backdrop-blur-md transition-colors duration-300 shadow-lg"
      style={{
        backgroundColor: `${activeProfile.palette.background}F0`,
        borderColor: `${activeProfile.palette.secondary}80`,
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-2.5 sm:px-6">
        {/* Left: Brand & Profile Aura */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <TrailUpGemLogo size={36} glow={true} className="animate-float-gem" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-cinzel text-lg font-extrabold tracking-wider text-white">
                  TRAILUP
                </span>
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black shadow"
                  style={{ backgroundColor: activeProfile.palette.accent }}
                >
                  {activeProfile.archetype}
                </span>
              </div>
              <p className="text-[10px] text-stone-300 hidden sm:block">
                Aprendizado Gamificado & Adaptativo
              </p>
            </div>
          </div>

          {/* Quick Profile Selector Dropdown */}
          <div className="hidden lg:flex items-center gap-1 border-l pl-3" style={{ borderColor: `${activeProfile.palette.secondary}80` }}>
            <span className="text-[11px] text-stone-400 mr-1">Guardião:</span>
            <div className="flex gap-1">
              {(Object.keys(BRAIN_HEX_PROFILES) as BrainHexType[]).map((p) => {
                const isSelected = currentDeck.targetProfile === p;
                const pInfo = BRAIN_HEX_PROFILES[p];
                const guideName = BRAIN_HEX_GUIDE_NAMES[p] || pInfo.perfil;
                return (
                  <button
                    key={p}
                    id={`btn-nav-profile-${p}`}
                    onClick={() => onSelectProfilePreset(p)}
                    title={`${guideName} · ${pInfo.perfil} (${pInfo.nomePt}) - ${pInfo.tom}`}
                    className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-all ${
                      isSelected
                        ? 'shadow-md text-black font-bold ring-1 ring-white/40'
                        : 'text-stone-300 hover:text-white hover:bg-white/10'
                    }`}
                    style={{
                      backgroundColor: isSelected ? pInfo.palette.primary : 'transparent',
                    }}
                  >
                    <TrailUpArchetypeSigil profile={p} size={18} glow={false} />
                    <span>{guideName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Center: Viewport Mode Switcher */}
        <div
          className="flex items-center rounded-lg border p-0.5"
          style={{
            backgroundColor: 'rgba(0,0,0,0.4)',
            borderColor: `${activeProfile.palette.secondary}90`,
          }}
        >
          <button
            id="btn-viewport-portrait"
            onClick={() => onSelectViewport('mobile-portrait')}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              viewportMode === 'mobile-portrait'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
            title="Visualização Mobile Vertical (9:16 Stories/Reels)"
          >
            <Smartphone className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Mobile 9:16</span>
          </button>

          <button
            id="btn-viewport-landscape"
            onClick={() => onSelectViewport('mobile-landscape')}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              viewportMode === 'mobile-landscape'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
            title="Visualização Mobile Horizontal (16:9)"
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Mobile Horiz.</span>
          </button>

          <button
            id="btn-viewport-desktop"
            onClick={() => onSelectViewport('web-desktop')}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              viewportMode === 'web-desktop'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
            title="Visualização Web Desktop Fullscreen"
          >
            <Monitor className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Web Desktop</span>
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Audio toggle */}
          <button
            id="btn-toggle-audio"
            onClick={onToggleMute}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
              isMuted
                ? 'border-stone-700 bg-stone-900 text-stone-500 hover:text-stone-300'
                : 'border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
            }`}
            title={isMuted ? 'Ativar Efeitos Sonoros Medievais' : 'Silenciar Áudio'}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>

          {/* Presenter Mode */}
          <button
            id="btn-open-presenter"
            onClick={onOpenPresenter}
            className="hidden sm:flex items-center gap-1.5 rounded-lg border border-stone-700 bg-stone-900/80 px-2.5 py-1.5 text-xs font-medium text-stone-200 hover:bg-stone-800 transition-colors"
            title="Modo Apresentador com Notas e Cronômetro"
          >
            <Play className="h-3.5 w-3.5 text-emerald-400" />
            <span>Apresentar</span>
          </button>

          {/* Edit Slides */}
          <button
            id="btn-open-editor"
            onClick={onOpenEditor}
            className="flex items-center gap-1.5 rounded-lg border border-stone-700 bg-stone-900/80 px-2.5 py-1.5 text-xs font-medium text-stone-200 hover:bg-stone-800 transition-colors"
            title="Editar Conteúdo e Layout dos Slides"
          >
            <Edit3 className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden sm:inline">Editar</span>
          </button>

          {/* AI Generator */}
          <button
            id="btn-open-generator"
            onClick={onOpenGenerator}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-black shadow-md transition-transform hover:scale-105 active:scale-95"
            style={{
              backgroundColor: activeProfile.palette.primary,
              borderColor: activeProfile.palette.accent,
            }}
          >
            <Sparkles className="h-3.5 w-3.5 text-black" />
            <span>Novo com IA</span>
          </button>

          {/* Export PDF */}
          <button
            id="btn-export-pdf"
            onClick={onOpenPdfExport}
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/20 transition-colors"
            title="Gerar PDF / Exportar HTML Interativo"
          >
            <FileDown className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Exportar PDF</span>
          </button>

          {/* Supabase Storage */}
          <button
            id="btn-supabase-storage"
            onClick={onOpenSupabase}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/50 transition-colors"
            title="Salvar no Bucket do Supabase"
          >
            <Cloud className="h-3.5 w-3.5 text-emerald-400" />
            <span className="hidden lg:inline">Supabase</span>
          </button>

          {/* Microservice API Docs */}
          {onOpenMicroserviceDocs && (
            <button
              id="btn-microservice-api"
              onClick={onOpenMicroserviceDocs}
              className="flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-950/40 px-2.5 py-1.5 text-xs font-semibold text-blue-300 hover:bg-blue-900/50 transition-colors"
              title="Microserviço RESTful: Endpoints, Testador e OpenAPI"
            >
              <Server className="h-3.5 w-3.5 text-blue-400" />
              <span className="hidden xl:inline">API Microserviço</span>
            </button>
          )}

          {/* Knowledge Graph Modal */}
          {onOpenKnowledgeGraph && (
            <button
              id="btn-knowledge-graph"
              onClick={onOpenKnowledgeGraph}
              className="flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-950/40 px-2.5 py-1.5 text-xs font-semibold text-purple-300 hover:bg-purple-900/50 transition-colors shadow-sm"
              title="Grafo de Conhecimento D3: Mapeamento Conceitual e Topologia dos Slides"
            >
              <Network className="h-3.5 w-3.5 text-purple-400" />
              <span className="hidden sm:inline">Grafo D3</span>
            </button>
          )}

          {/* BrainHex Guide */}
          <button
            id="btn-brainhex-guide"
            onClick={onOpenGuide}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-700 bg-stone-900 text-stone-300 hover:text-white transition-colors"
            title="Guia dos 7 Perfis BrainHex & TrailUp"
          >
            <BookOpen className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
