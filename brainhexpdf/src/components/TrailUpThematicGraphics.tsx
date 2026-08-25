import React from 'react';
import { BrainHexType } from '../types';

interface GemLogoProps {
  className?: string;
  size?: number;
  glow?: boolean;
}

/**
 * The official TrailUp 3D multifaceted astral crystal gem
 */
export const TrailUpGemLogo: React.FC<GemLogoProps> = ({
  className = '',
  size = 48,
  glow = true,
}) => {
  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {glow && (
        <div
          className="absolute inset-0 rounded-full blur-md opacity-70 animate-astral-pulse"
          style={{
            background: 'radial-gradient(circle, rgba(168, 85, 247, 0.8) 0%, rgba(236, 72, 153, 0.4) 50%, transparent 70%)',
          }}
        />
      )}
      <svg
        viewBox="0 0 100 100"
        className="relative z-10 w-full h-full drop-shadow-[0_4px_12px_rgba(147,51,234,0.5)]"
      >
        <defs>
          <linearGradient id="trailupTop" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#C084FC" />
            <stop offset="100%" stopColor="#7E22CE" />
          </linearGradient>
          <linearGradient id="trailupBottom" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9333EA" />
            <stop offset="100%" stopColor="#581C87" />
          </linearGradient>
          <linearGradient id="trailupLeft" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#E879F9" />
            <stop offset="100%" stopColor="#A855F7" />
          </linearGradient>
          <linearGradient id="trailupRight" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F472B6" />
            <stop offset="100%" stopColor="#C026D3" />
          </linearGradient>
        </defs>

        {/* 4-Pointed Faceted Crystal Star */}
        {/* Top Facet */}
        <polygon points="50,6 64,36 50,50 36,36" fill="url(#trailupTop)" />
        {/* Bottom Facet */}
        <polygon points="50,94 64,64 50,50 36,64" fill="url(#trailupBottom)" />
        {/* Left Facet */}
        <polygon points="6,50 36,36 50,50 36,64" fill="url(#trailupLeft)" />
        {/* Right Facet */}
        <polygon points="94,50 64,36 50,50 64,64" fill="url(#trailupRight)" />

        {/* Inner Highlight Shard */}
        <polygon points="50,22 57,36 50,50 43,36" fill="#FDF4FF" opacity="0.6" />
        <polygon points="50,50 57,64 50,78 43,64" fill="#581C87" opacity="0.5" />

        {/* Center Star Glint */}
        <circle cx="50" cy="50" r="3" fill="#FFFFFF" />
      </svg>
    </div>
  );
};

interface ArchetypeSigilProps {
  profile: BrainHexType;
  size?: number;
  className?: string;
  glow?: boolean;
}

/**
 * The 7 glowing hexagonal archetype sigils from TrailUp lore
 */
export const TrailUpArchetypeSigil: React.FC<ArchetypeSigilProps> = ({
  profile,
  size = 40,
  className = '',
  glow = true,
}) => {
  const getSigilData = () => {
    switch (profile) {
      case 'Achiever':
        return {
          glowColor: '#F59E0B',
          borderColor: '#FBBF24',
          bgGradient: ['#451A03', '#78350F'],
          innerContent: (
            <>
              {/* Sun Glyph */}
              <circle cx="50" cy="50" r="13" fill="#FDE68A" />
              <circle cx="50" cy="50" r="9" fill="#D97706" />
              {/* Radiating Rays */}
              <g stroke="#FDE68A" strokeWidth="2.5" strokeLinecap="round">
                <line x1="50" y1="24" x2="50" y2="30" />
                <line x1="50" y1="70" x2="50" y2="76" />
                <line x1="24" y1="50" x2="30" y2="50" />
                <line x1="70" y1="50" x2="76" y2="50" />
                <line x1="32" y1="32" x2="36" y2="36" />
                <line x1="64" y1="64" x2="68" y2="68" />
                <line x1="32" y1="68" x2="36" y2="64" />
                <line x1="64" y1="36" x2="68" y2="32" />
              </g>
            </>
          ),
        };

      case 'Seeker':
        return {
          glowColor: '#10B981',
          borderColor: '#34D399',
          bgGradient: ['#022C22', '#064E3B'],
          innerContent: (
            <>
              {/* 8-Point Compass Star */}
              <polygon points="50,22 55,45 78,50 55,55 50,78 45,55 22,50 45,45" fill="#6EE7B7" />
              <polygon points="50,30 53,47 70,50 53,53 50,70 47,53 30,50 47,47" fill="#047857" />
              <circle cx="50" cy="50" r="3" fill="#ECFDF5" />
            </>
          ),
        };

      case 'Mastermind':
        return {
          glowColor: '#3B82F6',
          borderColor: '#60A5FA',
          bgGradient: ['#0F172A', '#1E3A8A'],
          innerContent: (
            <>
              {/* Arcane Hexagram / Constellation Star */}
              <polygon points="50,22 68,36 68,64 50,78 32,64 32,36" fill="none" stroke="#93C5FD" strokeWidth="1.8" />
              <polygon points="50,30 63,60 37,60" fill="none" stroke="#60A5FA" strokeWidth="1.5" />
              <polygon points="50,70 63,40 37,40" fill="none" stroke="#60A5FA" strokeWidth="1.5" />
              <circle cx="50" cy="50" r="4" fill="#DBEAFE" />
            </>
          ),
        };

      case 'Conqueror':
        return {
          glowColor: '#A855F7',
          borderColor: '#C084FC',
          bgGradient: ['#2E1065', '#581C87'],
          innerContent: (
            <>
              {/* Royal Crown Sigil */}
              <path
                d="M26 62 L32 38 L43 48 L50 32 L57 48 L68 38 L74 62 Z"
                fill="#C084FC"
                stroke="#E9D5FF"
                strokeWidth="1.5"
              />
              <circle cx="32" cy="36" r="2.5" fill="#FDF4FF" />
              <circle cx="50" cy="30" r="3" fill="#FDF4FF" />
              <circle cx="68" cy="36" r="2.5" fill="#FDF4FF" />
              <rect x="28" y="62" width="44" height="6" rx="2" fill="#E9D5FF" />
            </>
          ),
        };

      case 'Socializer':
        return {
          glowColor: '#F43F5E',
          borderColor: '#FB7185',
          bgGradient: ['#4C0519', '#881337'],
          innerContent: (
            <>
              {/* Twin Figures / Guild Alliance */}
              <circle cx="40" cy="40" r="7" fill="#FECDD3" />
              <circle cx="60" cy="40" r="7" fill="#FECDD3" />
              <path
                d="M26 72 C26 56 36 54 40 54 C44 54 48 57 50 60 C52 57 56 54 60 54 C64 54 74 56 74 72 Z"
                fill="#FB7185"
              />
              <path d="M43 62 Q50 68 57 62" stroke="#FFF" strokeWidth="2" fill="none" strokeLinecap="round" />
            </>
          ),
        };

      case 'Daredevil':
        return {
          glowColor: '#F97316',
          borderColor: '#FB923C',
          bgGradient: ['#431407', '#7C2D12'],
          innerContent: (
            <>
              {/* Raging Fire Flame Sigil */}
              <path
                d="M50 20 C54 32 68 40 68 56 C68 68 59 78 50 78 C41 78 32 68 32 56 C32 44 42 36 44 28 C45 34 48 38 50 20 Z"
                fill="#FB923C"
              />
              <path
                d="M50 42 C52 50 60 54 60 62 C60 68 55 72 50 72 C45 72 40 68 40 62 C40 56 46 52 47 48 C48 51 49 53 50 42 Z"
                fill="#FEF08A"
              />
            </>
          ),
        };

      case 'Survivor':
        return {
          glowColor: '#06B6D4',
          borderColor: '#22D3EE',
          bgGradient: ['#083344', '#164E63'],
          innerContent: (
            <>
              {/* Impenetrable Mountain Shield */}
              <polygon points="50,22 72,36 68,64 50,78 32,64 28,36" fill="none" stroke="#67E8F9" strokeWidth="2" />
              {/* Mountain peaks */}
              <polygon points="50,38 62,60 38,60" fill="#A5F3FC" opacity="0.9" />
              <polygon points="42,48 50,60 34,60" fill="#0891B2" opacity="0.9" />
            </>
          ),
        };
    }
  };

  const data = getSigilData();

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {glow && (
        <div
          className="absolute inset-0 rounded-full blur-sm opacity-60"
          style={{ backgroundColor: data.glowColor }}
        />
      )}
      <svg viewBox="0 0 100 100" className="relative z-10 w-full h-full">
        <defs>
          <linearGradient id={`hexBg-${profile}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={data.bgGradient[0]} />
            <stop offset="100%" stopColor={data.bgGradient[1]} />
          </linearGradient>
        </defs>

        {/* Outer Hexagon Frame */}
        <polygon
          points="50,4 90,26 90,74 50,96 10,74 10,26"
          fill={`url(#hexBg-${profile})`}
          stroke={data.borderColor}
          strokeWidth="3"
        />

        {/* Inner Hexagon Detail */}
        <polygon
          points="50,12 82,30 82,70 50,88 18,70 18,30"
          fill="none"
          stroke={data.borderColor}
          strokeWidth="0.8"
          strokeDasharray="4 2"
          opacity="0.6"
        />

        {/* Inner Archetype Glyph */}
        {data.innerContent}
      </svg>
    </div>
  );
};

interface HeraldicBannerProps {
  profile: BrainHexType;
  title: string;
  subtitle?: string;
  rank?: string;
}

/**
 * Hanging heraldic tapestry banner from TrailUp Grand Palace
 */
export const TrailUpHeraldicBanner: React.FC<HeraldicBannerProps> = ({
  profile,
  title,
  subtitle,
  rank,
}) => {
  return (
    <div className="relative flex items-center gap-3 p-3.5 rounded-2xl border border-white/10 bg-gradient-to-r from-purple-950/40 via-stone-950/80 to-purple-950/30 backdrop-blur-md shadow-xl overflow-hidden">
      {/* Glow accent */}
      <div className="absolute -left-4 -top-4 w-24 h-24 rounded-full bg-purple-600/20 blur-xl pointer-events-none" />

      {/* Archetype Sigil */}
      <TrailUpArchetypeSigil profile={profile} size={48} />

      {/* Information */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-cinzel text-xs font-bold text-amber-300 tracking-wider uppercase">
            {profile}
          </span>
          {rank && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-900/60 border border-purple-500/40 text-purple-200">
              Rank {rank}
            </span>
          )}
        </div>
        <h3 className="font-serif text-sm font-bold text-white truncate">{title}</h3>
        {subtitle && <p className="text-xs text-stone-300 truncate">{subtitle}</p>}
      </div>

      {/* Right TrailUp Gem */}
      <TrailUpGemLogo size={28} glow={false} className="shrink-0 opacity-80" />
    </div>
  );
};

interface NatureLandscapeVectorProps {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
}

/**
 * Vector illustration of organic landscape, starry night and flora inspired by references
 */
export const TrailUpNatureVector: React.FC<NatureLandscapeVectorProps> = ({
  primaryColor = '#7C3AED',
  secondaryColor = '#DB2777',
  accentColor = '#F59E0B',
}) => {
  return (
    <div className="w-full h-32 relative overflow-hidden rounded-xl border border-white/10 my-3">
      <svg viewBox="0 0 600 180" className="w-full h-full object-cover" preserveAspectRatio="none">
        <defs>
          <linearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0B061A" />
            <stop offset="50%" stopColor="#1E0E3E" />
            <stop offset="100%" stopColor="#3B1768" />
          </linearGradient>
          <linearGradient id="hill1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={primaryColor} />
            <stop offset="100%" stopColor="#1E0E3E" />
          </linearGradient>
          <linearGradient id="hill2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={secondaryColor} />
            <stop offset="100%" stopColor={primaryColor} />
          </linearGradient>
          <linearGradient id="hill3" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={accentColor} />
            <stop offset="100%" stopColor={secondaryColor} />
          </linearGradient>
        </defs>

        {/* Night Sky Background */}
        <rect width="600" height="180" fill="url(#skyGrad)" />

        {/* Stars / Constellation Points */}
        <circle cx="50" cy="30" r="1.5" fill="#FFF" opacity="0.8" />
        <circle cx="120" cy="50" r="2" fill="#FDE68A" opacity="0.9" />
        <circle cx="210" cy="25" r="1.5" fill="#FFF" opacity="0.7" />
        <circle cx="340" cy="40" r="2" fill="#E9D5FF" opacity="0.8" />
        <circle cx="480" cy="20" r="1.5" fill="#FFF" opacity="0.9" />
        <circle cx="550" cy="45" r="2" fill="#FDE68A" opacity="0.8" />

        {/* Celestial Glowing Orb / Moon */}
        <circle cx="460" cy="50" r="24" fill="#FDF4FF" opacity="0.85" />
        <circle cx="460" cy="50" r="36" fill="#C084FC" opacity="0.25" />

        {/* Distant Hills Wave */}
        <path
          d="M0 120 Q120 70 240 110 T480 90 T600 110 L600 180 L0 180 Z"
          fill="url(#hill1)"
          opacity="0.8"
        />

        {/* Mid Hills Wave */}
        <path
          d="M0 140 Q150 100 300 135 T600 120 L600 180 L0 180 Z"
          fill="url(#hill2)"
          opacity="0.85"
        />

        {/* Foreground Organic Wave */}
        <path
          d="M0 160 Q180 130 360 165 T600 145 L600 180 L0 180 Z"
          fill="url(#hill3)"
          opacity="0.9"
        />

        {/* Stylized Flowers / Foliage on Foreground */}
        <g stroke="#FDF4FF" strokeWidth="1.5" strokeLinecap="round">
          {/* Flower 1 */}
          <line x1="60" y1="175" x2="60" y2="150" />
          <circle cx="60" cy="147" r="4" fill={accentColor} />
          {/* Flower 2 */}
          <line x1="85" y1="175" x2="85" y2="142" />
          <circle cx="85" cy="139" r="5" fill="#FFF" />
          {/* Flower 3 */}
          <line x1="110" y1="175" x2="110" y2="152" />
          <circle cx="110" cy="149" r="4" fill={secondaryColor} />
        </g>
      </svg>
    </div>
  );
};
