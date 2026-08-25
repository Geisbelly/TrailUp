import React from 'react';
import {
  ThematicFrameType,
  ThematicIllustrationType,
  ThematicSticker,
  VisualThematicArchetype,
  BrainHexType,
  AiVisualDecorations,
} from '../types';

interface ThematicBackgroundProps {
  archetype?: VisualThematicArchetype | string;
  illustrationType?: ThematicIllustrationType;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  className?: string;
}

/**
 * Full-bleed atmospheric vector backdrop scenes matching the rich Slidesgo reference images:
 * - Indian Heritage & Monument Skylines (Saffron/Terracotta with domes, minarets, flying birds)
 * - Islamic Ramadan / Eid (Deep Turquoise/Navy with golden crescent moon, arabesques, hanging lanterns)
 * - Eco Planet & Nature (Deep Violet with smiling Earth mascot and foliage)
 * - Pastel Washi Scrapbook (Lavender with washi tapes, stickers and notes)
 * - Cyber / Tech PPTWORK (Dark Green/Cyan with holographic globe and radar grid)
 * - Royal Luxury Gold (Midnight Blue with golden bokeh and baroque filigrees)
 * - Cosmic Astral TrailUp (Deep purple celestial nebulae, runes, astrolabe)
 */
export const ThematicBackgroundScene: React.FC<ThematicBackgroundProps> = ({
  archetype = 'trailup-astral',
  illustrationType,
  primaryColor = '#7C3AED',
  secondaryColor = '#3B82F6',
  accentColor = '#F59E0B',
  className = '',
}) => {
  // 1. Indian Heritage / Warm Saffron Skyline
  if (archetype === 'indian-heritage' || illustrationType === 'indian_oriental_skyline') {
    return (
      <div className={`absolute inset-0 pointer-events-none overflow-hidden select-none z-0 ${className}`}>
        {/* Warm Saffron & Terracotta Gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#EA580C] via-[#C2410C] to-[#431407] opacity-95" />
        
        {/* Subtle Top Clouds */}
        <svg viewBox="0 0 1000 160" className="absolute top-0 left-0 right-0 w-full h-24 text-amber-300/20" preserveAspectRatio="none">
          <path d="M0 60 Q120 10 250 50 Q380 90 520 40 Q680 10 820 60 Q940 90 1000 50 L1000 0 L0 0 Z" fill="currentColor" />
          <path d="M0 40 Q180 5 360 35 Q540 65 720 30 Q900 5 1000 40 L1000 0 L0 0 Z" fill="currentColor" opacity="0.5" />
        </svg>

        {/* Flying Birds in Silhouette */}
        <div className="absolute top-8 left-1/4 opacity-60">
          <svg width="28" height="14" viewBox="0 0 28 14" fill="none" stroke="#260C03" strokeWidth="1.8" strokeLinecap="round">
            <path d="M1 9 Q7 1 14 7 Q21 1 27 9" />
          </svg>
        </div>
        <div className="absolute top-14 left-[28%] opacity-40 scale-75">
          <svg width="28" height="14" viewBox="0 0 28 14" fill="none" stroke="#260C03" strokeWidth="1.8" strokeLinecap="round">
            <path d="M1 9 Q7 1 14 7 Q21 1 27 9" />
          </svg>
        </div>
        <div className="absolute top-10 right-1/4 opacity-50">
          <svg width="28" height="14" viewBox="0 0 28 14" fill="none" stroke="#260C03" strokeWidth="1.8" strokeLinecap="round">
            <path d="M1 9 Q7 1 14 7 Q21 1 27 9" />
          </svg>
        </div>

        {/* Architectural Palace / Fort Skyline Silhouette at Bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-36 sm:h-48 opacity-85">
          <svg viewBox="0 0 1200 240" className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="indianSilBack" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#9A3412" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#7C2D12" stopOpacity="0.9" />
              </linearGradient>
              <linearGradient id="indianSilFront" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#431407" />
                <stop offset="100%" stopColor="#2A0B04" />
              </linearGradient>
            </defs>

            {/* Back Layer Silhouette (Domes & Towers) */}
            <path
              d="M0 240 L0 180 L40 180 L40 130 Q50 90 60 130 L60 180 L140 180 Q190 120 240 180 L320 180 L320 110 Q340 70 360 110 L360 180 L480 180 Q560 60 640 180 L760 180 L760 110 Q780 70 800 110 L800 180 L880 180 Q930 120 980 180 L1060 180 L1060 130 Q1070 90 1080 130 L1080 180 L1200 180 L1200 240 Z"
              fill="url(#indianSilBack)"
            />

            {/* Front Layer Silhouette (Taj Mahal / Grand Palace Domes & Arched Gates) */}
            <path
              d="M0 240 L0 190 L80 190 L80 150 L90 150 L90 100 L95 100 L95 80 L100 80 L100 100 L105 100 L105 150 L115 150 L115 190 L300 190 L300 160 Q340 120 380 160 L380 190 L480 190 L480 130 Q520 80 560 130 L560 190 L580 190 L580 100 Q600 40 620 100 L620 190 L640 190 L640 130 Q680 80 720 130 L720 190 L820 190 L820 160 Q860 120 900 160 L900 190 L1085 190 L1085 150 L1095 150 L1095 100 L1100 100 L1100 80 L1105 80 L1105 100 L1110 100 L1110 150 L1120 150 L1120 190 L1200 190 L1200 240 Z"
              fill="url(#indianSilFront)"
            />

            {/* Gate Arch in Center Front */}
            <path d="M570 240 L570 180 Q600 140 630 180 L630 240 Z" fill="#180602" opacity="0.8" />
          </svg>
        </div>
      </div>
    );
  }

  // 2. Islamic Ramadan / Eid / Oriental Blue & Gold
  if (archetype === 'islamic-ramadan' || illustrationType === 'islamic_mosque_moon' || illustrationType === 'hanging_lanterns_gold') {
    return (
      <div className={`absolute inset-0 pointer-events-none overflow-hidden select-none z-0 ${className}`}>
        {/* Deep Turquoise / Teal to Midnight Navy Gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#042F2E] via-[#0F766E] to-[#021817] opacity-95" />

        {/* Arabesque Pattern Overlay on Top Header */}
        <div className="absolute top-0 left-0 right-0 h-28 opacity-25">
          <svg width="100%" height="100%">
            <defs>
              <pattern id="arabesquePatt" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="12" fill="none" stroke="#FDE68A" strokeWidth="0.8" />
                <path d="M20 0 L40 20 L20 40 L0 20 Z" fill="none" stroke="#FDE68A" strokeWidth="0.6" />
                <circle cx="20" cy="20" r="4" fill="#FDE68A" opacity="0.3" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#arabesquePatt)" />
          </svg>
        </div>

        {/* Giant Glowing Golden Crescent Moon on Top Right */}
        <div className="absolute -top-10 -right-10 sm:top-2 sm:right-6 w-48 h-48 sm:w-64 sm:h-64 opacity-90">
          <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-[0_0_25px_rgba(245,158,11,0.5)]">
            <defs>
              <linearGradient id="crescentGold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FDE68A" />
                <stop offset="50%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#D97706" />
              </linearGradient>
            </defs>

            {/* Crescent */}
            <path
              d="M100 20 C144 20 180 56 180 100 C180 144 144 180 100 180 C130 160 145 130 145 100 C145 70 130 40 100 20 Z"
              fill="url(#crescentGold)"
            />

            {/* Inner Mosque Silhouette inside Moon */}
            <path
              d="M110 140 L110 115 Q120 105 130 115 L130 140 Z M134 140 L134 100 L138 100 L138 140 Z M144 140 L144 120 Q150 110 156 120 L156 140 Z"
              fill="#042F2E"
              opacity="0.8"
            />

            {/* Star Sparkles around Moon */}
            <polygon points="70,40 73,48 81,50 73,52 70,60 67,52 59,50 67,48" fill="#FFF" />
            <polygon points="170,140 172,145 177,146 172,147 170,152 168,147 163,146 168,145" fill="#FDE68A" />
            <circle cx="85" cy="80" r="2.5" fill="#FFF" />
            <circle cx="160" cy="80" r="2" fill="#FDE68A" />
          </svg>
        </div>

        {/* Hanging Golden Fanoos Lanterns */}
        <div className="absolute top-0 left-8 sm:left-14 flex flex-col items-center">
          <div className="w-0.5 h-12 sm:h-20 bg-gradient-to-b from-amber-200 to-amber-500/80" />
          <div className="w-6 h-9 sm:w-8 sm:h-12 rounded-lg bg-gradient-to-b from-amber-300 via-amber-500 to-amber-700 border border-amber-200 shadow-[0_0_16px_rgba(245,158,11,0.8)] flex items-center justify-center relative">
            <div className="w-2 h-4 bg-white/90 rounded-full shadow-[0_0_8px_#FFF] animate-pulse" />
            <div className="absolute -bottom-1.5 w-3 h-1.5 bg-amber-400 rounded-b-md" />
          </div>
        </div>

        <div className="absolute top-0 left-28 sm:left-40 hidden sm:flex flex-col items-center opacity-80">
          <div className="w-0.5 h-10 bg-gradient-to-b from-amber-200 to-amber-500/80" />
          <div className="w-5 h-7 rounded-md bg-gradient-to-b from-amber-300 via-amber-500 to-amber-700 border border-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.7)] flex items-center justify-center">
            <div className="w-1.5 h-3 bg-white/90 rounded-full animate-pulse" />
          </div>
        </div>

        {/* Bottom Mosque Silhouette */}
        <div className="absolute bottom-0 left-0 right-0 h-28 sm:h-40 opacity-80">
          <svg viewBox="0 0 1000 200" className="w-full h-full" preserveAspectRatio="none">
            <path
              d="M0 200 L0 160 L40 160 L40 120 L45 120 L45 80 L50 80 L50 120 L55 120 L55 160 L140 160 Q200 100 260 160 L360 160 L360 120 Q390 80 420 120 L420 160 L500 160 Q560 70 620 160 L740 160 L740 120 Q770 80 800 120 L800 160 L880 160 L880 120 L885 120 L885 80 L890 80 L890 120 L895 120 L895 160 L1000 160 L1000 200 Z"
              fill="#021817"
            />
          </svg>
        </div>
      </div>
    );
  }

  // 3. Eco Planet & Nature / Smiling Earth
  if (archetype === 'nature-eco' || illustrationType === 'earth_mascot' || illustrationType === 'nature_foliage') {
    return (
      <div className={`absolute inset-0 pointer-events-none overflow-hidden select-none z-0 ${className}`}>
        {/* Deep Violet / Indigo Eco Night Gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#2E1065] via-[#1E1B4B] to-[#0F172A] opacity-95" />

        {/* Floating Green Leaves & Foliage in Corners (Pure Vector SVGs) */}
        <div className="absolute -top-4 -left-4 text-emerald-400 opacity-50 rotate-45">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
        </div>
        <div className="absolute top-12 left-10 text-emerald-300 opacity-40 -rotate-12">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/></svg>
        </div>
        <div className="absolute top-6 right-16 text-emerald-400 opacity-50 rotate-12">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg>
        </div>
        <div className="absolute -bottom-4 -right-4 text-emerald-400 opacity-50 -rotate-45">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/></svg>
        </div>

        {/* Smiling Earth Mascot on Top Right */}
        <div className="absolute top-4 right-4 sm:right-12 w-28 h-28 sm:w-36 sm:h-36 opacity-90">
          <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_20px_rgba(74,222,128,0.4)]">
            <defs>
              <linearGradient id="ecoOcean" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38BDF8" />
                <stop offset="100%" stopColor="#0284C7" />
              </linearGradient>
              <linearGradient id="ecoLand" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4ADE80" />
                <stop offset="100%" stopColor="#16A34A" />
              </linearGradient>
            </defs>

            {/* Earth Planet Globe */}
            <circle cx="50" cy="54" r="38" fill="url(#ecoOcean)" stroke="#FFFFFF" strokeWidth="2.5" />
            <path d="M26 40 C32 32 44 36 46 44 C48 52 38 60 30 58 C24 56 22 46 26 40 Z" fill="url(#ecoLand)" />
            <path d="M58 35 C68 32 78 40 76 50 C74 58 64 62 58 56 C54 52 52 40 58 35 Z" fill="url(#ecoLand)" />

            {/* Kawaii Eyes and Smile */}
            <circle cx="42" cy="54" r="3" fill="#0F172A" />
            <circle cx="58" cy="54" r="3" fill="#0F172A" />
            <circle cx="43" cy="53" r="1" fill="#FFFFFF" />
            <circle cx="59" cy="53" r="1" fill="#FFFFFF" />
            <circle cx="36" cy="59" r="3.5" fill="#F43F5E" opacity="0.8" />
            <circle cx="64" cy="59" r="3.5" fill="#F43F5E" opacity="0.8" />
            <path d="M46 60 Q50 66 54 60" fill="none" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />

            {/* Golden Crown */}
            <path d="M62 24 L74 14 L78 28 L86 16 L88 32 L60 32 Z" fill="#FBBF24" stroke="#B45309" strokeWidth="1.5" />
          </svg>
        </div>

        {/* Bottom Eco Waves */}
        <div className="absolute bottom-0 left-0 right-0 h-24 opacity-40">
          <svg viewBox="0 0 600 100" className="w-full h-full" preserveAspectRatio="none">
            <path d="M0 60 Q150 20 300 50 T600 40 L600 100 L0 100 Z" fill="#10B981" />
            <path d="M0 75 Q200 40 400 70 T600 60 L600 100 L0 100 Z" fill="#059669" />
          </svg>
        </div>
      </div>
    );
  }

  // 4. Pastel Washi Tape Scrapbook / Aspirations
  if (archetype === 'scrapbook-stickers' || illustrationType === 'scrapbook_stickers' || illustrationType === 'washi_paper_notes') {
    return (
      <div className={`absolute inset-0 pointer-events-none overflow-hidden select-none z-0 ${className}`}>
        {/* Soft Violet Canvas */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#2E1065] via-[#1E1145] to-[#12072B] opacity-95" />

        {/* Subtle Grid Dot Pattern */}
        <div className="absolute inset-0 opacity-15">
          <svg width="100%" height="100%">
            <defs>
              <pattern id="dotPatt" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1" fill="#E9D5FF" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dotPatt)" />
          </svg>
        </div>

        {/* Top Floating Washi Tape Strips */}
        <div className="absolute -top-3 left-10 w-28 h-7 -rotate-6 bg-pink-400/90 border border-pink-300 shadow-md flex items-center justify-center text-[10px] font-extrabold text-pink-950">
          ✦ MEU PLANO ✦
        </div>
        <div className="absolute -top-2 right-12 w-24 h-6 rotate-6 bg-cyan-300/90 border border-cyan-200 shadow-md" />

        {/* Star Ribbon Bookmark */}
        <div className="absolute top-0 right-1/3 w-6 h-14 bg-rose-500 shadow-md flex flex-col items-center justify-between pb-1">
          <span className="text-white text-[10px] mt-1">★</span>
          <div className="w-0 h-0 border-x-4 border-x-transparent border-b-4 border-b-purple-950" />
        </div>

        {/* Floating Vector Sticker on Bottom Right */}
        <div className="absolute bottom-6 right-8 w-16 h-16 sm:w-20 sm:h-20 bg-pink-300 rounded-full border-2 border-white shadow-xl flex items-center justify-center -rotate-12 opacity-90 text-pink-900">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M12 2l2.4 7.4h7.6l-6.1 4.5 2.3 7.1-6.2-4.6-6.2 4.6 2.3-7.1-6.1-4.5h7.6z"/>
          </svg>
        </div>
      </div>
    );
  }

  // 5. Cyber / Tech PPTWORK (Dark Green/Cyan with Holographic Globe & Radar Grid)
  if (archetype === 'cyber-tech' || illustrationType === 'cyber_sphere' || illustrationType === 'tech_radar_globe') {
    return (
      <div className={`absolute inset-0 pointer-events-none overflow-hidden select-none z-0 ${className}`}>
        {/* Matrix Dark Green / Obsidian Teal Gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#022C22] via-[#041E19] to-[#01100D] opacity-95" />

        {/* Cyber Radar Grid */}
        <div className="absolute inset-0 opacity-20">
          <svg width="100%" height="100%">
            <defs>
              <pattern id="cyberGrid" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#22D3EE" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#cyberGrid)" />
          </svg>
        </div>

        {/* Concentric Holographic Globe Radar on Top Right */}
        <div className="absolute top-2 right-4 sm:right-10 w-36 h-36 sm:w-52 sm:h-52 opacity-85">
          <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_20px_rgba(34,211,238,0.5)]">
            <defs>
              <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#0891B2" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#083344" stopOpacity="0.1" />
              </radialGradient>
            </defs>
            <circle cx="50" cy="50" r="46" fill="none" stroke="#06B6D4" strokeWidth="0.8" strokeDasharray="6 4" opacity="0.6" />
            <circle cx="50" cy="50" r="40" fill="url(#radarGlow)" stroke="#22D3EE" strokeWidth="1.5" />
            <ellipse cx="50" cy="50" rx="38" ry="14" fill="none" stroke="#67E8F9" strokeWidth="1.2" opacity="0.8" />
            <ellipse cx="50" cy="50" rx="38" ry="26" fill="none" stroke="#67E8F9" strokeWidth="1" opacity="0.7" />
            <ellipse cx="50" cy="50" rx="16" ry="38" fill="none" stroke="#67E8F9" strokeWidth="1" opacity="0.7" />
            <circle cx="34" cy="42" r="2.5" fill="#A5F3FC" />
            <circle cx="66" cy="54" r="2.5" fill="#A5F3FC" />
            <circle cx="50" cy="50" r="3" fill="#FFFFFF" />
            <line x1="34" y1="42" x2="50" y2="50" stroke="#22D3EE" strokeWidth="1" />
            <line x1="50" y1="50" x2="66" y2="54" stroke="#22D3EE" strokeWidth="1" />
          </svg>
        </div>

        {/* Telemetry Coordinate HUD at Bottom Left */}
        <div className="absolute bottom-4 left-6 font-mono text-[9px] text-cyan-400/60 space-y-0.5 hidden sm:block">
          <div>SYS_NODE // 0x48A2</div>
          <div>RADAR_FREQ: 2.45 GHz</div>
          <div>STATUS: ONLINE / BUFFERED</div>
        </div>
      </div>
    );
  }

  // 6. Royal Luxury Gold & Festive New Year
  if (archetype === 'royal-luxury') {
    return (
      <div className={`absolute inset-0 pointer-events-none overflow-hidden select-none z-0 ${className}`}>
        {/* Deep Midnight Blue with Golden Bokeh */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B132B] via-[#1C2541] to-[#0A0E1A] opacity-95" />

        {/* Golden Bokeh Particle Circles */}
        <div className="absolute top-12 left-10 w-24 h-24 rounded-full bg-amber-400/10 blur-xl" />
        <div className="absolute top-20 right-20 w-32 h-32 rounded-full bg-amber-300/10 blur-2xl" />
        <div className="absolute bottom-16 left-1/3 w-40 h-40 rounded-full bg-amber-500/10 blur-2xl" />

        {/* Hanging Golden Stars on Top */}
        <div className="absolute top-0 right-16 flex flex-col items-center">
          <div className="w-0.5 h-16 bg-amber-400/60" />
          <div className="w-4 h-4 rounded-full bg-amber-400 shadow-[0_0_10px_#F59E0B] flex items-center justify-center text-[10px] text-black font-bold">★</div>
        </div>
        <div className="absolute top-0 right-28 flex flex-col items-center">
          <div className="w-0.5 h-24 bg-amber-400/60" />
          <div className="w-5 h-5 rounded-full bg-amber-300 shadow-[0_0_12px_#FCD34D] flex items-center justify-center text-xs text-black font-bold">★</div>
        </div>

        {/* Baroque Corner Filigrees (Vector SVGs) */}
        <div className="absolute top-3 left-3 text-amber-400/60 w-4 h-4">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full"><path d="M12 2l2 5h5l-4 3 2 5-5-3-5 3 2-5-4-3h5z"/></svg>
        </div>
        <div className="absolute top-3 right-3 text-amber-400/60 w-4 h-4">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full"><path d="M12 2l2 5h5l-4 3 2 5-5-3-5 3 2-5-4-3h5z"/></svg>
        </div>
        <div className="absolute bottom-3 left-3 text-amber-400/60 w-4 h-4">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full"><path d="M12 2l2 5h5l-4 3 2 5-5-3-5 3 2-5-4-3h5z"/></svg>
        </div>
        <div className="absolute bottom-3 right-3 text-amber-400/60 w-4 h-4">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full"><path d="M12 2l2 5h5l-4 3 2 5-5-3-5 3 2-5-4-3h5z"/></svg>
        </div>
      </div>
    );
  }

  // 7. Default TrailUp Astral (Deep Celestial Nebula, Constellations & Runes)
  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden select-none z-0 ${className}`}>
      {/* Deep Violet & Obsidian Cosmos */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#090514] via-[#140B2E] to-[#06030D] opacity-95" />

      {/* Radiant Nebula Glow */}
      <div
        className="absolute -top-20 -left-20 w-96 h-96 rounded-full blur-3xl opacity-30 pointer-events-none"
        style={{ backgroundColor: primaryColor }}
      />
      <div
        className="absolute -bottom-20 -right-20 w-96 h-96 rounded-full blur-3xl opacity-25 pointer-events-none"
        style={{ backgroundColor: secondaryColor }}
      />

      {/* Constellation Star Chart Lines */}
      <div className="absolute inset-0 opacity-25">
        <svg width="100%" height="100%">
          <circle cx="15%" cy="20%" r="2" fill="#E9D5FF" />
          <circle cx="28%" cy="15%" r="3" fill="#FFF" />
          <circle cx="35%" cy="30%" r="2" fill="#E9D5FF" />
          <circle cx="80%" cy="25%" r="3" fill="#FFF" />
          <circle cx="90%" cy="40%" r="2" fill="#E9D5FF" />
          <line x1="15%" y1="20%" x2="28%" y2="15%" stroke="#C084FC" strokeWidth="0.8" strokeDasharray="3 3" />
          <line x1="28%" y1="15%" x2="35%" y2="30%" stroke="#C084FC" strokeWidth="0.8" strokeDasharray="3 3" />
          <line x1="80%" y1="25%" x2="90%" y2="40%" stroke="#C084FC" strokeWidth="0.8" strokeDasharray="3 3" />
        </svg>
      </div>
    </div>
  );
};

interface ThematicFrameProps {
  frameType?: ThematicFrameType;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Authentic framing structures matching the reference designs:
 * - Islamic Arch (Mihrab silhouette, hanging twin fanoos, golden arabesque trims)
 * - Indian Palace Arch (Scalloped foil arch, pillar accents, chapter badges)
 * - Notched Ticket (Cutout corner tickets with golden rivets)
 * - Scrapbook Washi Tape (Gingham & solid washi tape, pushpin notes)
 * - Cyber HUD (Angle-cut corners, radar coordinates, neon teal brackets)
 * - Eco Nature (Foliage borders and wave dividers)
 * - Royal Luxury (Gilded borders, baroque filigrees)
 */
export const ThematicFrameContainer: React.FC<ThematicFrameProps> = ({
  frameType = 'minimal-glass',
  primaryColor = '#7C3AED',
  secondaryColor = '#3B82F6',
  accentColor = '#F59E0B',
  children,
  className = '',
}) => {
  // 1. Islamic Arch (Mihrab Subtle Motif)
  if (frameType === 'islamic-arch') {
    return (
      <div className={`relative rounded-2xl border p-3.5 sm:p-5 md:p-6 backdrop-blur-md shadow-xl ${className}`}
        style={{
          borderColor: `${accentColor}50`,
          backgroundColor: `${primaryColor}18`,
        }}
      >
        {children}
      </div>
    );
  }

  // 2. Indian Palace Arch (Scalloped Subtle Card)
  if (frameType === 'indian-palace-arch') {
    return (
      <div className={`relative rounded-2xl border border-amber-500/40 p-3.5 sm:p-5 md:p-6 backdrop-blur-md shadow-xl bg-gradient-to-b from-amber-950/30 to-stone-950/80 ${className}`}>
        {children}
      </div>
    );
  }

  // 3. Notched Ticket (Golden Trim Card)
  if (frameType === 'notched-ticket') {
    return (
      <div className={`relative rounded-2xl border border-amber-400/40 p-3.5 sm:p-5 md:p-6 bg-gradient-to-b from-stone-950/80 via-slate-900/70 to-stone-950/80 backdrop-blur-md shadow-xl ${className}`}>
        {children}
      </div>
    );
  }

  // 4. Scrapbook Style (Subtle Card)
  if (frameType === 'scrapbook-tape') {
    return (
      <div
        className={`relative rounded-xl border border-purple-400/40 p-3.5 sm:p-5 md:p-6 backdrop-blur-md shadow-lg ${className}`}
        style={{
          backgroundColor: `${primaryColor}18`,
        }}
      >
        {children}
      </div>
    );
  }

  // 5. Cyber HUD (Clean Tech Frame)
  if (frameType === 'cyber-hud') {
    return (
      <div className={`relative rounded-xl border border-cyan-500/40 p-3.5 sm:p-5 md:p-6 bg-stone-950/80 backdrop-blur-md shadow-lg ${className}`}>
        {children}
      </div>
    );
  }

  // 6. Eco Nature
  if (frameType === 'eco-nature') {
    return (
      <div className={`relative rounded-2xl border border-emerald-500/40 p-3.5 sm:p-5 md:p-6 backdrop-blur-md shadow-xl ${className}`} style={{ backgroundColor: `${primaryColor}18` }}>
        {children}
      </div>
    );
  }

  // 7. Royal Luxury
  if (frameType === 'royal-luxury') {
    return (
      <div className={`relative rounded-2xl border border-amber-400/50 p-3.5 sm:p-5 md:p-6 bg-gradient-to-b from-stone-950/80 via-purple-950/30 to-stone-950/80 backdrop-blur-md shadow-xl ${className}`}>
        {children}
      </div>
    );
  }

  // Default Minimal Glass
  return (
    <div className={`relative rounded-xl border border-white/10 p-3.5 sm:p-5 md:p-6 backdrop-blur-sm shadow-lg ${className}`}>
      {children}
    </div>
  );
};

interface SectionHeaderBadgeProps {
  sectionNumber?: string | number;
  label?: string;
  archetype?: string;
  className?: string;
}

/**
 * Thematic Chapter & Section Badge (e.g. "01 SECTION", "CHAPTER ONE", "01 // CAPÍTULO")
 */
export const ThematicSectionHeaderBadge: React.FC<SectionHeaderBadgeProps> = ({
  sectionNumber = '01',
  label = 'SECTION',
  archetype = 'indian-heritage',
  className = '',
}) => {
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-cinzel font-extrabold tracking-widest shadow-md border ${className}`}>
      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
      <span>{String(sectionNumber).padStart(2, '0')}</span>
      <span className="opacity-40">•</span>
      <span className="uppercase">{label}</span>
    </div>
  );
};

interface InfographicRatingProps {
  label: string;
  score: number;
  maxScore?: number;
  sublabel?: string;
  color?: string;
  className?: string;
}

/**
 * Metric Progress & Rating Circles (like "Venus 4/5 ●●●●○", "Mars 2/5 ●●○○○" in the Indian reference)
 */
export const ThematicInfographicRating: React.FC<InfographicRatingProps> = ({
  label,
  score,
  maxScore = 5,
  sublabel,
  color = '#F59E0B',
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center p-3 rounded-xl border border-white/10 bg-stone-950/60 backdrop-blur-sm ${className}`}>
      <span className="text-xs font-bold text-stone-200 tracking-wider uppercase mb-1">{label}</span>
      <div className="flex items-center gap-1.5 my-1.5">
        {Array.from({ length: maxScore }).map((_, idx) => (
          <span
            key={idx}
            className={`w-3 h-3 rounded-full transition-all ${
              idx < score ? 'bg-amber-400 shadow-[0_0_6px_#F59E0B]' : 'bg-stone-800 border border-stone-700'
            }`}
          />
        ))}
      </div>
      <span className="text-xs font-mono font-bold text-amber-300">
        {score}/{maxScore}
      </span>
      {sublabel && <span className="text-[10px] text-stone-400 mt-0.5 text-center">{sublabel}</span>}
    </div>
  );
};

interface ThematicTimelineProps {
  steps: Array<{
    title: string;
    description: string;
    badge?: string;
  }>;
  className?: string;
}

/**
 * Winding curved timeline path (like 1972 -> 2000 -> 2018 in the Eco reference)
 */
export const ThematicTimelineRoadmap: React.FC<ThematicTimelineProps> = ({ steps, className = '' }) => {
  return (
    <div className={`relative py-4 ${className}`}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 relative z-10">
        {steps.map((step, idx) => (
          <div key={idx} className="flex flex-col items-center text-center p-3 rounded-xl border border-stone-800 bg-stone-900/80 shadow-lg">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-black font-cinzel font-bold flex items-center justify-center shadow-[0_0_12px_rgba(245,158,11,0.5)] mb-2">
              {idx + 1}
            </div>
            {step.badge && (
              <span className="text-[10px] font-bold text-amber-300 tracking-wider uppercase px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 mb-1">
                {step.badge}
              </span>
            )}
            <h4 className="font-serif text-xs font-bold text-stone-100 mb-1">{step.title}</h4>
            <p className="text-[11px] text-stone-300 leading-snug">{step.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

interface ThematicQuoteProps {
  quote: string;
  author: string;
  archetype?: string;
  className?: string;
}

/**
 * Ornate quote banner with large quote marks and author ribbon (like the famous quote slides)
 */
export const ThematicQuoteBanner: React.FC<ThematicQuoteProps> = ({
  quote,
  author,
  archetype = 'indian-heritage',
  className = '',
}) => {
  return (
    <div className={`relative p-6 sm:p-8 rounded-2xl border border-amber-500/40 bg-stone-950/70 backdrop-blur-md shadow-2xl text-center overflow-hidden ${className}`}>
      {/* Giant Background Quotation Mark */}
      <span className="absolute top-2 left-6 text-7xl font-serif text-amber-400/15 pointer-events-none select-none">
        “
      </span>

      <p className="font-serif text-sm sm:text-base lg:text-lg italic text-stone-100 leading-relaxed relative z-10 max-w-2xl mx-auto">
        "{quote}"
      </p>

      <div className="mt-4 inline-flex items-center gap-2 px-4 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs font-bold tracking-wider text-amber-300 uppercase">
        <span>—</span>
        <span>{author}</span>
        <span>—</span>
      </div>
    </div>
  );
};

interface StickyNoteProps {
  badge?: string;
  text: string;
  color?: 'yellow' | 'pink' | 'purple' | 'cyan';
  className?: string;
}

/**
 * Pinned Sticky Note block (like Aspirations reference)
 */
export const ThematicStickyNote: React.FC<StickyNoteProps> = ({
  badge = 'IMPORTANTE ✦',
  text,
  color = 'yellow',
  className = '',
}) => {
  const getColorStyles = () => {
    switch (color) {
      case 'pink':
        return 'bg-pink-200 text-pink-950 border-pink-300';
      case 'purple':
        return 'bg-purple-200 text-purple-950 border-purple-300';
      case 'cyan':
        return 'bg-cyan-200 text-cyan-950 border-cyan-300';
      default:
        return 'bg-amber-100 text-amber-950 border-amber-300';
    }
  };

  return (
    <div className={`relative p-3 rounded-lg border shadow-lg -rotate-1 ${getColorStyles()} ${className}`}>
      <div className="absolute -top-2 left-4 w-12 h-3.5 bg-rose-500/80 rounded-sm -rotate-6 shadow-sm flex items-center justify-center">
        <div className="w-1 h-1 bg-white rounded-full" />
      </div>
      <div className="text-[10px] font-extrabold tracking-wider uppercase mb-1">
        {badge}
      </div>
      <p className="text-xs font-semibold leading-relaxed">
        {text}
      </p>
    </div>
  );
};

// ============================================================================
// MEDIEVAL & BRAINHEX AI-GENERATED THEMATIC VECTOR VISUAL ELEMENTS
// (BORDERS, DIVIDERS, ICONS & ART PROMPTS)
// ============================================================================

// Monta o divisor como 3 SVGs lado a lado (flex) em vez de 1 SVG so: as
// linhas retas (leftShapes/rightShapes) toleram preserveAspectRatio="none"
// sem problema (esticar uma linha reta nao distorce nada visualmente), mas
// o ornamento central (circulos/poligonos) precisa do PROPRIO viewport SVG
// (com seu proprio viewBox, sem preserveAspectRatio="none") pra nao ser
// esmagado pelo esticamento nao-uniforme do container pai - um <svg
// class="h-full w-auto"> calcula a largura sozinho a partir do aspect ratio
// do viewBox, entao o ornamento SEMPRE mantem a proporcao certa, veio o
// container pai do tamanho que vier. Ver docs/superpowers/specs/
// 2026-08-24-divisor-svg-aninhado-design.md - tentativa anterior
// (preserveAspectRatio="xMidYMid slice" no SVG unico) evitava a distorcao
// mas cortava o ornamento demais num container tao raso, virando um blob
// sem forma reconhecivel.
function buildSplitDivider(params: {
  leftEnd: number;
  rightStart: number;
  leftShapes: string;
  ornamentShapes: string;
  rightShapes: string;
}): string {
  const { leftEnd, rightStart, leftShapes, ornamentShapes, rightShapes } = params;
  const ornamentWidth = rightStart - leftEnd;
  const rightWidth = 600 - rightStart;
  return `<span class="w-full h-full flex items-center gap-0.5 pointer-events-none select-none">
    <svg viewBox="0 0 ${leftEnd} 40" preserveAspectRatio="none" class="h-full flex-1 min-w-0" fill="none" xmlns="http://www.w3.org/2000/svg">${leftShapes}</svg>
    <svg viewBox="${leftEnd} 0 ${ornamentWidth} 40" class="h-full w-auto shrink-0" fill="none" xmlns="http://www.w3.org/2000/svg">${ornamentShapes}</svg>
    <svg viewBox="${rightStart} 0 ${rightWidth} 40" preserveAspectRatio="none" class="h-full flex-1 min-w-0" fill="none" xmlns="http://www.w3.org/2000/svg">${rightShapes}</svg>
  </span>`;
}

/**
 * Procedural Medieval SVG Divider Generator based on BrainHex Profile
 */
export function generateMedievalSvgDivider(profile: BrainHexType | string = 'Achiever'): string {
  const prof = String(profile || '').toLowerCase();

  // 1. Achiever (Paladino da Honra - Laurel ribbon & victory star)
  if (prof.includes('achiever')) {
    return buildSplitDivider({
      leftEnd: 230,
      rightStart: 370,
      leftShapes: `
        <path d="M10 20 L230 20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M50 16 L220 16" stroke="currentColor" stroke-width="0.8" stroke-dasharray="4 3" opacity="0.6"/>
      `,
      ornamentShapes: `
        <polygon points="300,6 308,18 322,20 310,28 314,40 300,32 286,40 290,28 278,20 292,18" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="1.8"/>
        <circle cx="250" cy="20" r="4" fill="currentColor"/>
        <circle cx="350" cy="20" r="4" fill="currentColor"/>
        <path d="M255 12 Q270 20 255 28 M345 12 Q330 20 345 28" stroke="currentColor" stroke-width="1.5" fill="none"/>
      `,
      rightShapes: `
        <path d="M370 20 L590 20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M380 16 L550 16" stroke="currentColor" stroke-width="0.8" stroke-dasharray="4 3" opacity="0.6"/>
      `,
    });
  }

  // 2. Seeker (Cartógrafo Místico - Astrolabe compass line & celtic knots)
  if (prof.includes('seeker')) {
    return buildSplitDivider({
      leftEnd: 240,
      rightStart: 360,
      leftShapes: `<line x1="20" y1="20" x2="240" y2="20" stroke="currentColor" stroke-width="1.8" stroke-dasharray="12 4 2 4"/>`,
      ornamentShapes: `
        <circle cx="300" cy="20" r="16" stroke="currentColor" stroke-width="1.8" fill="currentColor" fill-opacity="0.15"/>
        <circle cx="300" cy="20" r="11" stroke="currentColor" stroke-width="1" stroke-dasharray="3 2" opacity="0.7"/>
        <polygon points="300,7 304,18 300,16 296,18" fill="currentColor"/>
        <polygon points="300,33 304,22 300,24 296,22" fill="currentColor"/>
        <polygon points="313,20 302,24 304,20 302,16" fill="currentColor"/>
        <polygon points="287,20 298,24 296,20 298,16" fill="currentColor"/>
        <circle cx="260" cy="20" r="3" fill="currentColor"/>
        <circle cx="340" cy="20" r="3" fill="currentColor"/>
      `,
      rightShapes: `<line x1="360" y1="20" x2="580" y2="20" stroke="currentColor" stroke-width="1.8" stroke-dasharray="12 4 2 4"/>`,
    });
  }

  // 3. Survivor (Guardião da Bastilha - Spiked iron barricade & fortress gate)
  if (prof.includes('survivor')) {
    return buildSplitDivider({
      leftEnd: 230,
      rightStart: 370,
      leftShapes: `<line x1="10" y1="20" x2="230" y2="20" stroke="currentColor" stroke-width="2.2"/>`,
      ornamentShapes: `
        <path d="M280 8 L320 8 V24 C320 32 300 38 300 38 C300 38 280 32 280 24 Z" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2"/>
        <line x1="280" y1="18" x2="320" y2="18" stroke="currentColor" stroke-width="1.5"/>
        <line x1="300" y1="8" x2="300" y2="34" stroke="currentColor" stroke-width="1.5"/>
        <polygon points="245,14 252,20 245,26 238,20" fill="currentColor"/>
        <polygon points="355,14 362,20 355,26 348,20" fill="currentColor"/>
      `,
      rightShapes: `<line x1="370" y1="20" x2="590" y2="20" stroke="currentColor" stroke-width="2.2"/>`,
    });
  }

  // 4. Daredevil (Berserker Flamejante - Dragon blade & embers)
  if (prof.includes('daredevil')) {
    return buildSplitDivider({
      leftEnd: 240,
      rightStart: 360,
      leftShapes: `<path d="M15 20 Q120 12 240 20" stroke="currentColor" stroke-width="2"/>`,
      ornamentShapes: `
        <polygon points="300,4 316,20 300,36 284,20" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2"/>
        <path d="M292 20 L308 20 M300 12 L300 28" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <circle cx="260" cy="20" r="4" fill="currentColor"/>
        <circle cx="340" cy="20" r="4" fill="currentColor"/>
        <path d="M272 16 L278 20 L272 24 M328 16 L322 20 L328 24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      `,
      rightShapes: `<path d="M360 20 Q480 28 585 20" stroke="currentColor" stroke-width="2"/>`,
    });
  }

  // 5. Mastermind (Arquimago Hermético - Arcane energy beam & transmutation seal)
  if (prof.includes('mastermind')) {
    return buildSplitDivider({
      leftEnd: 230,
      rightStart: 370,
      leftShapes: `
        <line x1="20" y1="20" x2="230" y2="20" stroke="currentColor" stroke-width="1.5"/>
        <line x1="70" y1="14" x2="210" y2="14" stroke="currentColor" stroke-width="0.75" stroke-dasharray="3 4" opacity="0.6"/>
      `,
      ornamentShapes: `
        <circle cx="300" cy="20" r="16" stroke="currentColor" stroke-width="2" fill="currentColor" fill-opacity="0.2"/>
        <polygon points="300,7 312,28 288,28" stroke="currentColor" stroke-width="1.2" fill="none"/>
        <polygon points="300,33 312,12 288,12" stroke="currentColor" stroke-width="1.2" fill="none"/>
        <circle cx="300" cy="20" r="3" fill="currentColor"/>
        <circle cx="250" cy="20" r="5" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <circle cx="350" cy="20" r="5" stroke="currentColor" stroke-width="1.5" fill="none"/>
      `,
      rightShapes: `
        <line x1="370" y1="20" x2="580" y2="20" stroke="currentColor" stroke-width="1.5"/>
        <line x1="390" y1="14" x2="530" y2="14" stroke="currentColor" stroke-width="0.75" stroke-dasharray="3 4" opacity="0.6"/>
      `,
    });
  }

  // 6. Conqueror (Senhor da Guerra - Imperial spears & crowned banner)
  if (prof.includes('conqueror')) {
    return buildSplitDivider({
      leftEnd: 235,
      rightStart: 365,
      leftShapes: `<line x1="15" y1="20" x2="235" y2="20" stroke="currentColor" stroke-width="2.2"/>`,
      ornamentShapes: `
        <path d="M285 10 L300 4 L315 10 L315 28 L300 36 L285 28 Z" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="2"/>
        <polygon points="300,12 308,24 292,24" fill="currentColor"/>
        <path d="M250 12 L260 20 L250 28 M350 12 L340 20 L350 28" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      `,
      rightShapes: `<line x1="365" y1="20" x2="585" y2="20" stroke="currentColor" stroke-width="2.2"/>`,
    });
  }

  // 7. Socializer (Bardo da Távola Redonda - Fellowship knot & mead toast)
  return buildSplitDivider({
    leftEnd: 230,
    rightStart: 370,
    leftShapes: `<path d="M20 20 Q120 26 230 20" stroke="currentColor" stroke-width="1.8"/>`,
    ornamentShapes: `
      <circle cx="300" cy="20" r="14" stroke="currentColor" stroke-width="2" fill="currentColor" fill-opacity="0.2"/>
      <circle cx="288" cy="20" r="8" stroke="currentColor" stroke-width="1.4" fill="none"/>
      <circle cx="312" cy="20" r="8" stroke="currentColor" stroke-width="1.4" fill="none"/>
      <circle cx="300" cy="20" r="3" fill="currentColor"/>
      <circle cx="250" cy="20" r="3.5" fill="currentColor"/>
      <circle cx="350" cy="20" r="3.5" fill="currentColor"/>
    `,
    rightShapes: `<path d="M370 20 Q480 26 580 20" stroke="currentColor" stroke-width="1.8"/>`,
  });
}

/**
 * Generate a procedural fallback SVG vector icon tailored to the topic & BrainHex profile
 */
export function generateThematicSvgIcon(seedText: string = '', profile: BrainHexType | string = 'Achiever'): string {
  const norm = String(seedText || '').toLowerCase();
  const prof = String(profile || '').toLowerCase();

  // 1. Data/Architecture/System (Mastermind - Hermetic Grimoire & Transmutation Seal)
  if (norm.includes('rede') || norm.includes('dados') || norm.includes('arquitetura') || norm.includes('sistema') || prof.includes('mastermind')) {
    return `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full block pointer-events-none" style="width: 100%; height: 100%; display: block;">
      <circle cx="50" cy="50" r="36" stroke="currentColor" stroke-width="2" stroke-dasharray="6 3" opacity="0.6"/>
      <circle cx="50" cy="50" r="26" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2"/>
      <polygon points="50,26 68,60 32,60" stroke="currentColor" stroke-width="1.5" fill="none"/>
      <polygon points="50,74 68,40 32,40" stroke="currentColor" stroke-width="1.5" fill="none"/>
      <circle cx="50" cy="50" r="6" fill="currentColor"/>
      <line x1="50" y1="8" x2="50" y2="18" stroke="currentColor" stroke-width="2"/>
      <line x1="50" y1="82" x2="50" y2="92" stroke="currentColor" stroke-width="2"/>
      <line x1="8" y1="50" x2="18" y2="50" stroke="currentColor" stroke-width="2"/>
      <line x1="82" y1="50" x2="92" y2="50" stroke="currentColor" stroke-width="2"/>
    </svg>`;
  }

  // 2. Trophy/Badge/Goal/Metric (Achiever - Paladin Gilded Heraldic Shield)
  if (norm.includes('meta') || norm.includes('conquista') || norm.includes('score') || norm.includes('kpi') || prof.includes('achiever')) {
    return `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full block pointer-events-none" style="width: 100%; height: 100%; display: block;">
      <path d="M28 18 H72 V46 C72 62 60 74 50 78 C40 74 28 62 28 46 Z" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2.5"/>
      <path d="M28 26 H16 C12 26 12 42 24 44 L28 44" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M72 26 H84 C88 26 88 42 76 44 L72 44" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M50 78 V88 M36 92 H64" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
      <polygon points="50,28 53,37 63,38 56,45 58,55 50,50 42,55 44,45 37,38 47,37" fill="currentColor"/>
    </svg>`;
  }

  // 3. Compass/Map/Rune (Seeker - Cartographer Astrolabe)
  if (norm.includes('busca') || norm.includes('explor') || norm.includes('origem') || norm.includes('mapa') || prof.includes('seeker')) {
    return `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full block pointer-events-none" style="width: 100%; height: 100%; display: block;">
      <circle cx="50" cy="50" r="38" stroke="currentColor" stroke-width="2.5"/>
      <circle cx="50" cy="50" r="30" stroke="currentColor" stroke-width="1.2" stroke-dasharray="4 3" opacity="0.6"/>
      <polygon points="50,20 58,46 50,42 42,46" fill="currentColor"/>
      <polygon points="50,80 58,54 50,58 42,54" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="1.5"/>
      <circle cx="50" cy="50" r="4.5" fill="currentColor"/>
      <line x1="50" y1="8" x2="50" y2="15" stroke="currentColor" stroke-width="2.5"/>
      <line x1="50" y1="85" x2="50" y2="92" stroke="currentColor" stroke-width="2.5"/>
      <line x1="8" y1="50" x2="15" y2="50" stroke="currentColor" stroke-width="2.5"/>
      <line x1="85" y1="50" x2="92" y2="50" stroke="currentColor" stroke-width="2.5"/>
    </svg>`;
  }

  // 4. Shield/Defense/Security (Survivor - Bastion Iron Fortress Shield)
  if (norm.includes('seguran') || norm.includes('risco') || norm.includes('blind') || norm.includes('falha') || prof.includes('survivor')) {
    return `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full block pointer-events-none" style="width: 100%; height: 100%; display: block;">
      <path d="M50 12 L82 24 V52 C82 74 66 86 50 92 C34 86 18 74 18 52 V24 Z" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2.5"/>
      <path d="M50 24 L72 32 V52 C72 68 62 78 50 82 C38 78 28 68 28 52 V32 Z" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2" opacity="0.7"/>
      <circle cx="50" cy="52" r="8" fill="currentColor"/>
      <path d="M50 36 V44 M50 60 V68 M34 52 H42 M58 52 H66" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`;
  }

  // 5. Swords/Arena/Crown (Conqueror - Warlord Dual Broadswords & Crown)
  if (norm.includes('combate') || norm.includes('lider') || norm.includes('domina') || norm.includes('arena') || prof.includes('conqueror')) {
    return `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full block pointer-events-none" style="width: 100%; height: 100%; display: block;">
      <path d="M22 84 L78 16 M78 16 L80 26 M78 16 L68 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      <path d="M78 84 L22 16 M22 16 L20 26 M22 16 L32 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      <line x1="18" y1="74" x2="34" y2="78" stroke="currentColor" stroke-width="2.5"/>
      <line x1="82" y1="74" x2="66" y2="78" stroke="currentColor" stroke-width="2.5"/>
      <polygon points="50,32 58,48 50,44 42,48" fill="currentColor"/>
      <circle cx="50" cy="62" r="6" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="2"/>
    </svg>`;
  }

  // 6. Guild/People/Hands (Socializer - Knights Roundtable Crest)
  if (norm.includes('equipe') || norm.includes('social') || norm.includes('guilda') || norm.includes('colab') || prof.includes('socializer')) {
    return `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full block pointer-events-none" style="width: 100%; height: 100%; display: block;">
      <circle cx="50" cy="30" r="12" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2.5"/>
      <circle cx="24" cy="38" r="9" fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="2"/>
      <circle cx="76" cy="38" r="9" fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="2"/>
      <path d="M28 82 C28 66 38 56 50 56 C62 56 72 66 72 82" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M10 84 C10 72 18 64 26 64" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M90 84 C90 72 82 64 74 64" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
  }

  // 7. Lightning/Flame/Action (Daredevil - Dragon Berserker Flame Blade)
  return `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-full h-full block pointer-events-none" style="width: 100%; height: 100%; display: block;">
    <polygon points="54,10 26,52 48,52 42,90 74,44 52,44" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="50" cy="50" r="42" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.5"/>
  </svg>`;
}

/**
 * Generate a procedural fallback SVG vector border tailored to the topic & BrainHex profile
 */
export function generateThematicSvgBorder(archetype: string = 'medieval-rpg', profile: BrainHexType | string = 'Mastermind'): string {
  const arch = String(archetype || '').toLowerCase();
  const prof = String(profile || '').toLowerCase();

  // 1. Medieval RPG / Achiever (Corner-focused Ornate Accents)
  if (arch.includes('medieval') || prof.includes('achiever') || prof.includes('conqueror')) {
    return `<svg viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" class="w-full h-full block pointer-events-none select-none" style="width: 100%; height: 100%; display: block;">
      <path d="M12 36 L12 12 L36 12 M388 36 L388 12 L364 12 M12 264 L12 288 L36 288 M388 264 L388 288 L364 288" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <polygon points="20,20 24,16 28,20 24,24" fill="currentColor"/>
      <polygon points="380,20 384,16 388,20 384,24" fill="currentColor"/>
      <polygon points="20,280 24,276 28,280 24,284" fill="currentColor"/>
      <polygon points="380,280 384,276 388,280 384,284" fill="currentColor"/>
    </svg>`;
  }

  // 2. High-Tech / Cyber HUD
  if (arch.includes('cyber') || prof.includes('daredevil')) {
    return `<svg viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" class="w-full h-full block pointer-events-none select-none" style="width: 100%; height: 100%; display: block;">
      <path d="M10 32 L10 10 L32 10 M390 32 L390 10 L368 10 M10 268 L10 290 L32 290 M390 268 L390 290 L368 290" stroke="currentColor" stroke-width="2" stroke-linecap="square"/>
      <rect x="14" y="14" width="4" height="4" fill="currentColor"/>
      <rect x="382" y="14" width="4" height="4" fill="currentColor"/>
      <rect x="14" y="282" width="4" height="4" fill="currentColor"/>
      <rect x="382" y="282" width="4" height="4" fill="currentColor"/>
    </svg>`;
  }

  // 3. Oriental / Palace / Indian Heritage
  if (arch.includes('indian') || arch.includes('islamic') || arch.includes('royal')) {
    return `<svg viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" class="w-full h-full block pointer-events-none select-none" style="width: 100%; height: 100%; display: block;">
      <path d="M10 30 Q10 10 30 10 M390 30 Q390 10 370 10 M10 270 Q10 290 30 290 M390 270 Q390 290 370 290" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="20" cy="20" r="3" fill="currentColor"/>
      <circle cx="380" cy="20" r="3" fill="currentColor"/>
      <circle cx="20" cy="280" r="3" fill="currentColor"/>
      <circle cx="380" cy="280" r="3" fill="currentColor"/>
    </svg>`;
  }

  // 4. Astral Sigil / Runic / Nature (Seeker / Mastermind)
  return `<svg viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" class="w-full h-full block pointer-events-none select-none" style="width: 100%; height: 100%; display: block;">
    <path d="M12 32 L12 12 L32 12 M388 32 L388 12 L368 12 M12 268 L12 288 L32 288 M388 268 L388 288 L368 288" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <polygon points="18,18 22,14 26,18 22,22" fill="currentColor"/>
    <polygon points="378,18 382,14 386,18 382,22" fill="currentColor"/>
    <polygon points="18,278 22,274 26,278 22,282" fill="currentColor"/>
    <polygon points="378,278 382,274 386,278 382,282" fill="currentColor"/>
  </svg>`;
}

interface AiThematicIconProps {
  svgCode?: string;
  seedText?: string;
  profile?: BrainHexType | string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  primaryColor?: string;
  accentColor?: string;
  className?: string;
}

/**
 * AI-Generated Vector Thematic / Medieval Icon Component
 */
export const AiThematicIcon: React.FC<AiThematicIconProps> = ({
  svgCode,
  seedText = '',
  profile = 'Achiever',
  size = 'md',
  primaryColor = '#7C3AED',
  accentColor = '#F59E0B',
  className = '',
}) => {
  const finalSvg = svgCode && svgCode.includes('<svg')
    ? svgCode
    : generateThematicSvgIcon(seedText, profile);

  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20',
  }[size];

  return (
    <div
      className={`relative inline-flex items-center justify-center transition-transform hover:scale-105 duration-300 select-none shrink-0 ${sizeClasses} ${className}`}
      style={{ color: accentColor || primaryColor }}
    >
      <div
        className="w-full h-full drop-shadow-[0_0_12px_rgba(245,158,11,0.35)] [&>svg]:w-full [&>svg]:h-full"
        dangerouslySetInnerHTML={{ __html: finalSvg }}
      />
    </div>
  );
};

interface AiMedievalDividerProps {
  svgCode?: string;
  profile?: BrainHexType | string;
  primaryColor?: string;
  accentColor?: string;
  className?: string;
}

/**
 * AI-Generated Medieval Thematic SVG Divider Component
 */
export const AiMedievalDivider: React.FC<AiMedievalDividerProps> = ({
  svgCode,
  profile = 'Achiever',
  primaryColor = '#7C3AED',
  accentColor = '#F59E0B',
  className = '',
}) => {
  const finalSvg = svgCode && svgCode.includes('<svg')
    ? svgCode
    : generateMedievalSvgDivider(profile);

  return (
    <div
      className={`w-full h-6 my-2.5 flex items-center justify-center select-none opacity-85 transition-opacity duration-300 hover:opacity-100 ${className}`}
      style={{ color: accentColor || primaryColor }}
    >
      <div
        className="w-full max-w-2xl h-full drop-shadow-[0_0_8px_rgba(245,158,11,0.25)] [&>svg]:w-full [&>svg]:h-full"
        dangerouslySetInnerHTML={{ __html: finalSvg }}
      />
    </div>
  );
};

interface AiMedievalPromptBadgeProps {
  decorations?: AiVisualDecorations;
  profile?: BrainHexType | string;
  primaryColor?: string;
  accentColor?: string;
  className?: string;
}

/**
 * AI Medieval Art Prompt Inspector Badge
 */
export const AiMedievalPromptBadge: React.FC<AiMedievalPromptBadgeProps> = ({
  decorations,
  profile = 'Achiever',
  primaryColor = '#7C3AED',
  accentColor = '#F59E0B',
  className = '',
}) => {
  if (!decorations) return null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-mono shadow-sm transition-all duration-200 hover:scale-[1.02] ${className}`}
      style={{
        borderColor: `${accentColor}50`,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        color: accentColor,
      }}
      title={decorations.medievalPromptDescription || decorations.motifDescription || 'Prompt de Arte Medieval Gerado por IA'}
    >
      <span className="w-1.5 h-1.5 rounded-full animate-ping" style={{ backgroundColor: accentColor }} />
      <span className="font-bold uppercase tracking-wider text-[9px] text-white">
        {decorations.medievalClassArchetype || profile}:
      </span>
      <span className="truncate max-w-[200px] sm:max-w-[320px] text-slate-300">
        {decorations.motifDescription || decorations.medievalPromptDescription || 'Arte Heráldica'}
      </span>
    </div>
  );
};

interface AiThematicSlideFrameProps {
  decorations?: AiVisualDecorations;
  thematicFrame?: ThematicFrameType;
  archetype?: VisualThematicArchetype | string;
  profile?: BrainHexType | string;
  slideTitle?: string;
  primaryColor?: string;
  accentColor?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * AI-Generated Unique Medieval & Thematic Slide Frame & Outer Border
 */
export const AiThematicSlideFrame: React.FC<AiThematicSlideFrameProps> = ({
  decorations,
  thematicFrame = 'minimal-glass',
  archetype = 'medieval-rpg',
  profile = 'Mastermind',
  slideTitle = '',
  primaryColor = '#7C3AED',
  accentColor = '#F59E0B',
  children,
  className = '',
}) => {
  const borderSvg = decorations?.customBorderSvg && decorations.customBorderSvg.includes('<svg')
    ? decorations.customBorderSvg
    : generateThematicSvgBorder(archetype, profile);

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      {/* Dynamic AI / Medieval Vector Border Overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-20 select-none opacity-85 [&>svg]:w-full [&>svg]:h-full"
        style={{ color: primaryColor }}
        dangerouslySetInnerHTML={{ __html: borderSvg }}
      />

      {/* Subtle Corner Glow Accents */}
      <div
        className="absolute top-1 left-1 w-8 h-8 rounded-full blur-md opacity-30 pointer-events-none z-10"
        style={{ backgroundColor: accentColor }}
      />
      <div
        className="absolute top-1 right-1 w-8 h-8 rounded-full blur-md opacity-30 pointer-events-none z-10"
        style={{ backgroundColor: accentColor }}
      />
      <div
        className="absolute bottom-1 left-1 w-8 h-8 rounded-full blur-md opacity-30 pointer-events-none z-10"
        style={{ backgroundColor: accentColor }}
      />
      <div
        className="absolute bottom-1 right-1 w-8 h-8 rounded-full blur-md opacity-30 pointer-events-none z-10"
        style={{ backgroundColor: accentColor }}
      />

      {/* Frame Content Container */}
      <div className="relative z-10 w-full h-full flex flex-col justify-between p-4 sm:p-6 lg:p-8">
        {children}
      </div>
    </div>
  );
};

interface BrainHexDecorativeBorderOverlayProps {
  profile?: BrainHexType | string;
  primaryColor?: string;
  accentColor?: string;
  className?: string;
}

/**
 * Dynamic CSS Decorative Border Ornaments & Corner Accents per BrainHex Profile
 */
export const BrainHexDecorativeBorderOverlay: React.FC<BrainHexDecorativeBorderOverlayProps> = ({
  profile = 'Achiever',
  primaryColor = '#7C3AED',
  accentColor = '#F59E0B',
  className = '',
}) => {
  return (
    <div className={`absolute inset-0 pointer-events-none z-0 select-none overflow-hidden [&_*]:pointer-events-none ${className}`}>
      <div
        className="absolute top-1 left-1 w-3.5 h-3.5 border-t-2 border-l-2 opacity-40 rounded-tl-sm transition-colors duration-300"
        style={{ borderColor: accentColor || primaryColor }}
      />
      <div
        className="absolute top-1 right-1 w-3.5 h-3.5 border-t-2 border-r-2 opacity-40 rounded-tr-sm transition-colors duration-300"
        style={{ borderColor: accentColor || primaryColor }}
      />
      <div
        className="absolute bottom-1 left-1 w-3.5 h-3.5 border-b-2 border-l-2 opacity-40 rounded-bl-sm transition-colors duration-300"
        style={{ borderColor: accentColor || primaryColor }}
      />
      <div
        className="absolute bottom-1 right-1 w-3.5 h-3.5 border-b-2 border-r-2 opacity-40 rounded-br-sm transition-colors duration-300"
        style={{ borderColor: accentColor || primaryColor }}
      />
    </div>
  );
};
