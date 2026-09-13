import React, { useState } from 'react';
import {
  X,
  BookOpen,
  Sparkles,
  Shield,
  Compass,
  Trophy,
  Swords,
  Users,
  Flame,
  CheckCircle2,
} from 'lucide-react';
import { BrainHexType } from '../types';
import { BRAIN_HEX_PROFILES, BRAIN_HEX_GUIDE_INFOS } from '../data/brainHexProfiles';
import { BrainHexAvatar } from './BrainHexAvatars';
import { TrailUpGemLogo, TrailUpArchetypeSigil } from './TrailUpThematicGraphics';
import { playSoundEffect } from '../utils/audioSynth';

interface BrainHexGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProfile: (profile: BrainHexType) => void;
}

export const BrainHexGuideModal: React.FC<BrainHexGuideModalProps> = ({
  isOpen,
  onClose,
  onSelectProfile,
}) => {
  const [selectedTab, setSelectedTab] = useState<BrainHexType>('Achiever');

  if (!isOpen) return null;

  const currentInfo = BRAIN_HEX_PROFILES[selectedTab];
  const guideInfo = BRAIN_HEX_GUIDE_INFOS[selectedTab];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl border border-purple-500/30 bg-stone-950 p-5 sm:p-7 shadow-2xl my-6 bg-trailup-hex-grid">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-white/10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-6 border-b border-stone-800 pb-4">
          <TrailUpGemLogo size={44} glow={true} />
          <div>
            <h3 className="font-cinzel text-xl sm:text-2xl font-extrabold text-white">
              Os 7 Guardiões da Trilha (BrainHex & TrailUp)
            </h3>
            <p className="text-xs text-stone-300">
              Adaptação pedagógica e cognitiva fundamentada no TrailUp: cada herói possui seu tom, elementos e construções temáticas.
            </p>
          </div>
        </div>

        {/* Profiles Horizontal Tabs */}
        <div className="flex overflow-x-auto gap-2 pb-3 mb-5 border-b border-stone-800">
          {(Object.keys(BRAIN_HEX_PROFILES) as BrainHexType[]).map((p) => {
            const isSelected = selectedTab === p;
            const pInfo = BRAIN_HEX_PROFILES[p];
            const gInfo = BRAIN_HEX_GUIDE_INFOS[p];

            return (
              <button
                key={p}
                id={`guide-tab-${p}`}
                onClick={() => {
                  setSelectedTab(p);
                  playSoundEffect('slide_next');
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  isSelected
                    ? 'shadow-md text-black ring-1 ring-white/40'
                    : 'text-stone-300 bg-stone-900/60 hover:bg-stone-800'
                }`}
                style={{
                  backgroundColor: isSelected ? pInfo.palette.primary : undefined,
                }}
              >
                <TrailUpArchetypeSigil profile={p} size={20} glow={isSelected} />
                <span>{gInfo?.name || pInfo.perfil}</span>
                <span className="opacity-75 text-[10px] hidden sm:inline">({pInfo.nomePt})</span>
              </button>
            );
          })}
        </div>

        {/* Selected Profile Detailed Card */}
        <div
          className="rounded-2xl border p-5 sm:p-6 mb-5 backdrop-blur-md shadow-xl"
          style={{
            backgroundColor: `${currentInfo.palette.background}F5`,
            borderColor: currentInfo.palette.secondary,
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            {/* Left Avatar & Archetype */}
            <div className="md:col-span-4 flex flex-col items-center text-center border-b md:border-b-0 md:border-r pb-4 md:pb-0 md:pr-4 border-stone-800">
              <div className="relative mb-3">
                <BrainHexAvatar profile={selectedTab} size="hero" className="w-32 h-32" />
                <div className="absolute -top-2 -right-2">
                  <TrailUpArchetypeSigil profile={selectedTab} size={36} glow={true} />
                </div>
              </div>
              <h4 className="font-cinzel text-xl font-bold text-white">{guideInfo?.name || currentInfo.perfil}</h4>
              <p className="text-xs text-amber-300 font-semibold mb-1">{guideInfo?.title || currentInfo.archetype}</p>
              <p className="text-[11px] text-stone-400 font-medium mb-2">{currentInfo.nomePt} · {currentInfo.perfil}</p>
              
              {/* Traits Badges */}
              {guideInfo?.traits && (
                <div className="flex flex-wrap justify-center gap-1.5 mb-3">
                  {guideInfo.traits.map((t, tidx) => (
                    <span
                      key={tidx}
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold border"
                      style={{
                        borderColor: `${currentInfo.palette.primary}80`,
                        color: currentInfo.palette.accent,
                        backgroundColor: `${currentInfo.palette.primary}20`,
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}

              <span
                className="px-2.5 py-1 rounded-full text-[11px] font-bold text-black shadow"
                style={{ backgroundColor: currentInfo.palette.accent }}
              >
                ✦ {currentInfo.badgeName}
              </span>
            </div>

            {/* Right Details */}
            <div className="md:col-span-8 space-y-3.5">
              {/* Quote */}
              {guideInfo?.quote && (
                <div className="p-3 rounded-xl border-l-4" style={{ borderLeftColor: currentInfo.palette.primary, backgroundColor: `${currentInfo.palette.secondary}35` }}>
                  <p className="italic text-xs sm:text-sm text-stone-100 font-medium">
                    &ldquo;{guideInfo.quote}&rdquo;
                  </p>
                </div>
              )}

              {/* Story / Description */}
              {guideInfo?.description && (
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                    História do Guardião
                  </span>
                  <p className="text-xs sm:text-sm text-stone-200 leading-relaxed">
                    {guideInfo.description}
                  </p>
                </div>
              )}

              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                  Tom de Comunicação & Narrativa
                </span>
                <p className="text-xs sm:text-sm font-semibold capitalize text-white">
                  "{currentInfo.tom}"
                </p>
              </div>

              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                  Diretrizes Pedagógicas
                </span>
                <ul className="mt-1 space-y-1.5 text-xs text-stone-300">
                  {currentInfo.diretrizes.map((dir, didx) => (
                    <li key={didx} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{dir}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Palette Hex codes display */}
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400 block mb-1">
                  Paleta Oficial da Assinatura Visual (TrailUp)
                </span>
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 bg-stone-900 px-2 py-1 rounded border border-stone-800 text-[10px]">
                    <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: currentInfo.palette.primary }} />
                    <span className="font-mono text-stone-300">{currentInfo.palette.primary} (Primary)</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-stone-900 px-2 py-1 rounded border border-stone-800 text-[10px]">
                    <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: currentInfo.palette.accent }} />
                    <span className="font-mono text-stone-300">{currentInfo.palette.accent} (Accent)</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-stone-900 px-2 py-1 rounded border border-stone-800 text-[10px]">
                    <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: currentInfo.palette.secondary }} />
                    <span className="font-mono text-stone-300">{currentInfo.palette.secondary} (Secondary)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer with Select Profile button */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-stone-700 text-xs font-semibold text-stone-300 hover:bg-stone-800"
          >
            Fechar
          </button>

          <button
            id="btn-apply-guide-profile"
            onClick={() => {
              onSelectProfile(selectedTab);
              onClose();
              playSoundEffect('level_up');
            }}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold text-black shadow transition-transform hover:scale-105"
            style={{ backgroundColor: currentInfo.palette.primary }}
          >
            <Sparkles className="w-4 h-4" />
            <span>Carregar Apresentação Modelo de {currentInfo.perfil}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
