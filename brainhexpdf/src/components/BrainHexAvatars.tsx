import React from 'react';
import { BrainHexType } from '../types';

interface AvatarProps {
  profile: BrainHexType;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  showBadge?: boolean;
}

export const BrainHexAvatar: React.FC<AvatarProps> = ({
  profile,
  className = '',
  size = 'md',
  showBadge = false,
}) => {
  const sizeMap = {
    sm: 'w-10 h-10',
    md: 'w-16 h-16',
    lg: 'w-24 h-24',
    xl: 'w-36 h-36',
    hero: 'w-52 h-52 sm:w-64 sm:h-64',
  };

  const renderCharacterVisual = () => {
    switch (profile) {
      case 'Achiever':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
            <defs>
              <linearGradient id="achieverGold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFF1B8" />
                <stop offset="50%" stopColor="#C9A227" />
                <stop offset="100%" stopColor="#836919" />
              </linearGradient>
              <linearGradient id="achieverCape" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#A82828" />
                <stop offset="100%" stopColor="#5A1010" />
              </linearGradient>
            </defs>
            {/* Aura Circle */}
            <circle cx="50" cy="50" r="46" fill="#141004" stroke="#C9A227" strokeWidth="2.5" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#E7D59E" strokeWidth="0.8" strokeDasharray="3 2" opacity="0.6" />
            
            {/* Cape */}
            <path d="M28 42 Q20 70 30 84 Q50 88 70 84 Q80 70 72 42 Z" fill="url(#achieverCape)" />
            
            {/* Armor & Shoulders */}
            <path d="M30 45 Q50 40 70 45 L74 65 Q50 78 26 65 Z" fill="url(#achieverGold)" stroke="#E7D59E" strokeWidth="1" />
            {/* Chest Diamond Jewel */}
            <polygon points="50,48 57,55 50,62 43,55" fill="#38BDF8" stroke="#FFFFFF" strokeWidth="0.8" />
            
            {/* Head & Hair (Achiever young knight) */}
            <circle cx="50" cy="30" r="14" fill="#8D5B4C" />
            {/* Curly hair */}
            <path d="M36 28 C34 18 42 14 50 14 C58 14 66 18 64 28 C62 20 40 20 36 28 Z" fill="#261814" />
            {/* Smile and eyes */}
            <circle cx="45" cy="29" r="2" fill="#231815" />
            <circle cx="55" cy="29" r="2" fill="#231815" />
            <path d="M47 34 Q50 38 53 34" stroke="#231815" strokeWidth="1.2" fill="none" strokeLinecap="round" />
            
            {/* Golden Sword */}
            <g transform="translate(18, 38) rotate(-25)">
              <rect x="-2" y="-18" width="4" height="26" fill="#FFF1B8" stroke="#C9A227" strokeWidth="0.8" />
              <polygon points="0,-24 -3,-18 3,-18" fill="#FFFBEB" />
              <rect x="-7" y="8" width="14" height="3" rx="1" fill="#C9A227" />
              <rect x="-1.5" y="11" width="3" height="7" fill="#836919" />
              <circle cx="0" cy="20" r="2.5" fill="#C9A227" />
            </g>
          </svg>
        );

      case 'Seeker':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
            <defs>
              <linearGradient id="seekerTeal" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#97D6D1" />
                <stop offset="50%" stopColor="#17A398" />
                <stop offset="100%" stopColor="#0F6A63" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="46" fill="#02100F" stroke="#17A398" strokeWidth="2.5" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#97D6D1" strokeWidth="0.8" strokeDasharray="4 2" opacity="0.6" />
            
            {/* Cloak */}
            <path d="M26 40 Q18 72 32 86 Q50 90 68 86 Q82 72 74 40 Z" fill="url(#seekerTeal)" />
            {/* Leather Vest */}
            <path d="M34 45 L66 45 L62 70 L38 70 Z" fill="#6E4720" stroke="#C9A227" strokeWidth="0.8" />
            
            {/* Head & Dreadlocks */}
            <circle cx="50" cy="30" r="13" fill="#8D5B4C" />
            {/* Dreadlocks */}
            <path d="M36 24 C30 16 35 10 48 12 C62 10 68 18 64 26 C60 16 40 16 36 24 Z" fill="#1C1412" />
            <path d="M33 22 Q26 36 28 48" stroke="#1C1412" strokeWidth="4" strokeLinecap="round" />
            <path d="M67 22 Q74 36 72 48" stroke="#1C1412" strokeWidth="4" strokeLinecap="round" />
            {/* Eyes & Smile */}
            <circle cx="46" cy="30" r="2" fill="#1C1412" />
            <circle cx="54" cy="30" r="2" fill="#1C1412" />
            <path d="M47 35 Q50 38 53 35" stroke="#1C1412" strokeWidth="1.2" fill="none" strokeLinecap="round" />
            
            {/* Glowing Golden Compass */}
            <g transform="translate(68, 54)">
              <circle cx="0" cy="0" r="14" fill="#C9A227" stroke="#E7D59E" strokeWidth="1.5" />
              <circle cx="0" cy="0" r="11" fill="#02100F" />
              {/* Compass Needle */}
              <polygon points="0,-8 3,0 0,2 -3,0" fill="#38BDF8" />
              <polygon points="0,8 3,0 0,-2 -3,0" fill="#E7D59E" />
              <circle cx="0" cy="0" r="2" fill="#FFFFFF" />
            </g>
          </svg>
        );

      case 'Mastermind':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
            <defs>
              <linearGradient id="masterPurple" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#B5A9EE" />
                <stop offset="50%" stopColor="#5B3FD9" />
                <stop offset="100%" stopColor="#3B298D" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="46" fill="#090616" stroke="#5B3FD9" strokeWidth="2.5" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#B5A9EE" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.6" />
            
            {/* Mage Robe */}
            <path d="M28 44 Q18 75 30 88 Q50 92 70 88 Q82 75 72 44 Z" fill="url(#masterPurple)" stroke="#C9A227" strokeWidth="1" />
            
            {/* Head & Glasses */}
            <circle cx="50" cy="30" r="13" fill="#9C6B58" />
            {/* Dark Curly Hair */}
            <path d="M36 26 C32 16 42 12 50 12 C58 12 68 16 64 26 C60 16 40 16 36 26 Z" fill="#1C182B" />
            {/* Glasses */}
            <circle cx="45" cy="30" r="4.5" fill="none" stroke="#1C182B" strokeWidth="1.2" />
            <circle cx="55" cy="30" r="4.5" fill="none" stroke="#1C182B" strokeWidth="1.2" />
            <line x1="49.5" y1="30" x2="50.5" y2="30" stroke="#1C182B" strokeWidth="1.2" />
            {/* Eyes */}
            <circle cx="45" cy="30" r="1.5" fill="#1C182B" />
            <circle cx="55" cy="30" r="1.5" fill="#1C182B" />
            <path d="M47 36 Q50 39 53 36" stroke="#1C182B" strokeWidth="1.2" fill="none" strokeLinecap="round" />

            {/* Glowing Tome with Star */}
            <g transform="translate(32, 60) rotate(-15)">
              <rect x="-14" y="-10" width="28" height="20" rx="2" fill="#241442" stroke="#B5A9EE" strokeWidth="1" />
              {/* Star / Constellation */}
              <polygon points="0,-6 2,-2 6,-2 3,1 4,5 0,3 -4,5 -3,1 -6,-2 -2,-2" fill="#38BDF8" opacity="0.9" />
            </g>

            {/* Cute Owl on shoulder */}
            <g transform="translate(74, 38)">
              <ellipse cx="0" cy="0" rx="8" ry="10" fill="#E2D4C3" stroke="#8C6D58" strokeWidth="0.8" />
              <circle cx="-3" cy="-3" r="3" fill="#FFF" />
              <circle cx="3" cy="-3" r="3" fill="#FFF" />
              <circle cx="-3" cy="-3" r="1.5" fill="#332211" />
              <circle cx="3" cy="-3" r="1.5" fill="#332211" />
              <polygon points="0,0 -1.5,-2 1.5,-2" fill="#D97706" />
            </g>
          </svg>
        );

      case 'Conqueror':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
            <defs>
              <linearGradient id="conqBlue" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#9AB0ED" />
                <stop offset="50%" stopColor="#1E4FD6" />
                <stop offset="100%" stopColor="#14338B" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="46" fill="#030815" stroke="#1E4FD6" strokeWidth="2.5" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#9AB0ED" strokeWidth="0.8" strokeDasharray="4 2" opacity="0.6" />
            
            {/* Royal Blue Armor & Cape */}
            <path d="M26 42 Q16 75 28 88 Q50 92 72 88 Q84 75 74 42 Z" fill="url(#conqBlue)" stroke="#C9A227" strokeWidth="1.2" />
            
            {/* Head & Royal Dread Crown */}
            <circle cx="50" cy="30" r="13" fill="#754838" />
            <path d="M36 24 C30 16 35 10 48 10 C62 10 68 16 64 24 Z" fill="#141824" />
            {/* Gold Crown */}
            <polygon points="40,16 45,10 50,14 55,10 60,16 40,16" fill="#C9A227" stroke="#FFF1B8" strokeWidth="0.6" />
            <circle cx="50" cy="14" r="1.5" fill="#38BDF8" />
            
            {/* Confident expression */}
            <circle cx="46" cy="29" r="2" fill="#141824" />
            <circle cx="54" cy="29" r="2" fill="#141824" />
            <path d="M47 34 Q50 37 54 34" stroke="#141824" strokeWidth="1.2" fill="none" strokeLinecap="round" />

            {/* Crystal Staff */}
            <g transform="translate(24, 32)">
              <line x1="0" y1="-14" x2="0" y2="52" stroke="#452B1E" strokeWidth="2.5" strokeLinecap="round" />
              {/* Huge Blue Crystal Tip */}
              <polygon points="0,-24 -6,-12 0,-4 6,-12" fill="#38BDF8" stroke="#E0F2FE" strokeWidth="1" />
              <circle cx="0" cy="-4" r="3" fill="#C9A227" />
            </g>
          </svg>
        );

      case 'Socializer':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
            <defs>
              <linearGradient id="socializerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FAB8A6" />
                <stop offset="50%" stopColor="#F4623A" />
                <stop offset="100%" stopColor="#9F4026" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="46" fill="#180A06" stroke="#F4623A" strokeWidth="2.5" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#FAB8A6" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.6" />
            
            {/* Bard Robe (Warm Orange / Coral with Purple Accents) */}
            <path d="M28 44 Q18 75 30 88 Q50 92 70 88 Q82 75 72 44 Z" fill="url(#socializerGradient)" stroke="#8B5CF6" strokeWidth="1" />
            <path d="M36 50 Q50 62 64 50" stroke="#8B5CF6" strokeWidth="2" fill="none" />
            
            {/* Head (Joyful Bard) */}
            <circle cx="50" cy="30" r="13" fill="#9C6855" />
            {/* Wavy Hair */}
            <path d="M35 25 C30 16 42 12 50 12 C58 12 70 16 65 25 C62 16 38 16 35 25 Z" fill="#2C1810" />
            <circle cx="34" cy="32" r="4" fill="#2C1810" />
            <circle cx="66" cy="32" r="4" fill="#2C1810" />
            
            {/* Cheerful Eyes & Big Smile */}
            <circle cx="45" cy="29" r="2" fill="#2C1810" />
            <circle cx="55" cy="29" r="2" fill="#2C1810" />
            <path d="M45 33 Q50 39 55 33 Z" fill="#C2410C" />

            {/* Bard Lute */}
            <g transform="translate(36, 56) rotate(-20)">
              {/* Lute Body */}
              <ellipse cx="0" cy="8" rx="10" ry="12" fill="#B45309" stroke="#78350F" strokeWidth="1" />
              <circle cx="0" cy="6" r="3" fill="#180A06" />
              {/* Neck */}
              <rect x="-2" y="-16" width="4" height="18" fill="#D97706" />
              <line x1="-1" y1="-14" x2="-1" y2="14" stroke="#FEF3C7" strokeWidth="0.6" />
              <line x1="1" y1="-14" x2="1" y2="14" stroke="#FEF3C7" strokeWidth="0.6" />
            </g>
          </svg>
        );

      case 'Daredevil':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
            <defs>
              <linearGradient id="dareFire" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ED9DA8" />
                <stop offset="50%" stopColor="#D7263D" />
                <stop offset="100%" stopColor="#8C1928" />
              </linearGradient>
              <linearGradient id="flameGlow" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#EA580C" />
                <stop offset="50%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#FEF08A" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="46" fill="#160406" stroke="#D7263D" strokeWidth="2.5" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#ED9DA8" strokeWidth="0.8" strokeDasharray="2 3" opacity="0.6" />
            
            {/* Fiery Top & Battle Skirt */}
            <path d="M32 44 L68 44 L72 70 Q50 84 28 70 Z" fill="url(#dareFire)" stroke="#F59E0B" strokeWidth="1" />
            
            {/* Head & Vibrant Orange Hair Ponytail */}
            <circle cx="50" cy="30" r="13" fill="#A1624E" />
            {/* Fire Hair */}
            <path d="M35 24 C30 14 42 8 52 8 C62 8 68 16 65 24 Z" fill="#EA580C" />
            {/* Wild Ponytail */}
            <path d="M62 14 C75 8 82 20 74 36 C70 42 66 30 62 20 Z" fill="#F97316" />
            
            {/* Daring wink and smile */}
            <circle cx="45" cy="29" r="2" fill="#1F130E" />
            <path d="M53 29 Q56 27 58 29" stroke="#1F130E" strokeWidth="1.5" fill="none" />
            <path d="M46 34 Q50 39 55 34" stroke="#1F130E" strokeWidth="1.4" fill="none" strokeLinecap="round" />

            {/* Hand with Raging Flame */}
            <g transform="translate(74, 50)">
              {/* Flame Shape */}
              <path d="M0 8 Q-8 -2 -4 -12 Q0 -6 2 -18 Q8 -8 6 2 Q8 -2 8 8 Z" fill="url(#flameGlow)" />
              <circle cx="1" cy="4" r="3" fill="#FFFBEB" />
            </g>
          </svg>
        );

      case 'Survivor':
        return (
          <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
            <defs>
              <linearGradient id="survivorStone" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#AFB5BA" />
                <stop offset="50%" stopColor="#4E5A66" />
                <stop offset="100%" stopColor="#333A42" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="46" fill="#08090A" stroke="#4E5A66" strokeWidth="2.5" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#AFB5BA" strokeWidth="0.8" strokeDasharray="4 2" opacity="0.6" />
            
            {/* Monk Dark Gi */}
            <path d="M30 45 L70 45 L74 88 Q50 92 26 88 Z" fill="url(#survivorStone)" stroke="#C9A227" strokeWidth="1" />
            {/* Prayer Beads */}
            <circle cx="40" cy="48" r="2.5" fill="#1C1E22" />
            <circle cx="45" cy="53" r="2.5" fill="#1C1E22" />
            <circle cx="50" cy="56" r="2.5" fill="#1C1E22" />
            <circle cx="55" cy="53" r="2.5" fill="#1C1E22" />
            <circle cx="60" cy="48" r="2.5" fill="#1C1E22" />
            
            {/* Head & Topknot Bun */}
            <circle cx="50" cy="30" r="13" fill="#8D5A47" />
            {/* Topknot Bun */}
            <ellipse cx="50" cy="14" rx="5" ry="6" fill="#181A1D" />
            <rect x="47" y="16" width="6" height="2" fill="#D97706" />
            <path d="M36 24 C34 16 42 16 50 16 C58 16 66 16 64 24 Z" fill="#181A1D" />
            
            {/* Calm Resilient Eyes */}
            <circle cx="45" cy="29" r="1.8" fill="#181A1D" />
            <circle cx="55" cy="29" r="1.8" fill="#181A1D" />
            <path d="M47 35 Q50 37 53 35" stroke="#181A1D" strokeWidth="1.2" fill="none" strokeLinecap="round" />

            {/* Impenetrable Rune Shield */}
            <g transform="translate(68, 56)">
              {/* Prism Shield */}
              <polygon points="0,-22 12,-10 10,18 0,26 -10,18 -12,-10" fill="#242B33" stroke="#AFB5BA" strokeWidth="1.5" />
              {/* Mountain Glyph */}
              <polygon points="0,-8 -6,6 6,6" fill="none" stroke="#E2E8F0" strokeWidth="1.5" />
            </g>
          </svg>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`relative inline-flex items-center justify-center ${sizeMap[size]} ${className}`}>
      {renderCharacterVisual()}
      {showBadge && (
        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-black border border-amber-200 shadow">
          ★
        </span>
      )}
    </div>
  );
};

export const GUIDE_ARTWORK_MAP: Record<BrainHexType, {
  name: string;
  title: string;
  imagePath: string;
  themeColor: string;
  traits: string[];
  weapon: string;
  quote: string;
}> = {
  Achiever: {
    name: 'Aurelius',
    title: 'O Paladino Dourado da Excelência',
    imagePath: '/guides/achiever.webp',
    themeColor: '#F59E0B',
    traits: ['Métricas Claras', 'Metas Ambiciosas', 'Código Limpo', 'Performance Máxima'],
    weapon: 'Espada Radiante da Maestria',
    quote: 'A perfeição não é um acidente, é o resultado de padrões rigorosos e foco inabalável.',
  },
  Conqueror: {
    name: 'Valéria',
    title: 'A Soberana Guerreira da Resiliência',
    imagePath: '/guides/conqueror.webp',
    themeColor: '#3B82F6',
    traits: ['Escalabilidade Massiva', 'Desafios Épicos', 'Domínio Sistêmico', 'Vitória Técnica'],
    weapon: 'Cajado Relâmpago de Cristal Azul',
    quote: 'Nenhum gargalo é intransponível quando a arquitetura é forjada para a vitória.',
  },
  Daredevil: {
    name: 'Ignis',
    title: 'A Piromante Ágil de Alta Frequência',
    imagePath: '/guides/daredevil.webp',
    themeColor: '#EF4444',
    traits: ['Tempo Real', 'Testes de Estresse', 'Alta Velocidade', 'Adrenalina Técnica'],
    weapon: 'Labaredas Místicas Arcanas',
    quote: 'Se o sistema não foi testado no limite do fogo, você ainda não conhece seu verdadeiro poder.',
  },
  Mastermind: {
    name: 'Orion',
    title: 'O Sábio Arcano dos Primeiros Princípios',
    imagePath: '/guides/mastermind.webp',
    themeColor: '#8B5CF6',
    traits: ['Modelagem Teórica', 'Causalidade Profunda', 'Design Patterns', 'Constelações Arquiteturais'],
    weapon: 'Grimório Astral & Coruja Guardiã',
    quote: 'Compreenda a causa fundamental e a solução se revelará com clareza cristalina.',
  },
  Seeker: {
    name: 'Lyra',
    title: 'A Exploradora Mística da Natureza',
    imagePath: '/guides/seeker.webp',
    themeColor: '#10B981',
    traits: ['Descoberta de Padrões', 'Estruturas Ocultas', 'Curiosidade Ativa', 'Mapas de Domínio'],
    weapon: 'Bússola Astral da Sabedoria',
    quote: 'Nas entrelinhas do código reside o mapa para as maiores descobertas.',
  },
  Socializer: {
    name: 'Harmonia & Caelum',
    title: 'Os Bardos da Sinergia e Cultura',
    imagePath: '/guides/socializer.webp',
    themeColor: '#F97316',
    traits: ['Colaboração de Times', 'Peer Review', 'Comunicação Clara', 'Harmonia Técnica'],
    weapon: 'Alaúde de Ébano & Flauta de Prata',
    quote: 'O melhor software é aquele construído por mentes que dialogam em perfeita harmonia.',
  },
  Survivor: {
    name: 'Kael',
    title: 'O Monge Guardião da Tolerância a Falhas',
    imagePath: '/guides/survivor.webp',
    themeColor: '#6B7280',
    traits: ['Zero-Trust', 'Circuit Breakers', 'Disaster Recovery', 'Impenetrabilidade'],
    weapon: 'Escudo Rúnico de Obsidiana',
    quote: 'Um sistema inabalável nasce da previsão metódica de cada ponto de falha.',
  },
};

interface FullBodyGuideProps {
  profile: BrainHexType;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  showSpeech?: boolean;
  speechText?: string;
  speechTitle?: string;
}

export const BrainHexFullBodyGuide: React.FC<FullBodyGuideProps> = ({
  profile,
  className = '',
  size = 'md',
  showSpeech = true,
  speechText,
  speechTitle,
}) => {
  const guide = GUIDE_ARTWORK_MAP[profile] || GUIDE_ARTWORK_MAP.Mastermind;
  const [imageError, setImageError] = React.useState(false);

  const sizeClasses = {
    sm: 'h-32 sm:h-40',
    md: 'h-48 sm:h-64',
    lg: 'h-64 sm:h-80',
    hero: 'h-80 sm:h-96',
  };

  return (
    <div className={`flex flex-col sm:flex-row items-center gap-4 ${className}`}>
      {/* Full Body Artwork or High-Res SVG Avatar */}
      <div className={`relative flex items-center justify-center shrink-0 ${sizeClasses[size]}`}>
        {!imageError ? (
          <img
            src={guide.imagePath}
            alt={`${guide.name} - ${guide.title}`}
            onError={() => setImageError(true)}
            className="h-full w-auto object-contain drop-shadow-[0_10px_25px_rgba(0,0,0,0.5)] select-none"
            referrerPolicy="no-referrer"
          />
        ) : (
          <BrainHexAvatar profile={profile} size={size === 'hero' ? 'hero' : 'xl'} showBadge />
        )}
      </div>

      {/* Guide Speech & Identity */}
      {showSpeech && (
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-bold font-mono px-2 py-0.5 rounded-full border shadow-sm"
              style={{
                backgroundColor: `${guide.themeColor}20`,
                borderColor: `${guide.themeColor}50`,
                color: guide.themeColor,
              }}
            >
              {guide.name} - {guide.title}
            </span>
          </div>

          <div
            className="p-3.5 rounded-xl border bg-stone-900/80 backdrop-blur-sm text-xs leading-relaxed text-stone-200 relative shadow-md"
            style={{ borderColor: `${guide.themeColor}30` }}
          >
            {speechTitle && (
              <div className="font-bold text-amber-300 mb-1 flex items-center gap-1.5">
                <span>{speechTitle}</span>
              </div>
            )}
            <p className="text-stone-300 italic">
              "{speechText || guide.quote}"
            </p>
          </div>

          {/* Core Archetype Traits */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {guide.traits.map((t, idx) => (
              <span
                key={idx}
                className="text-[9px] font-mono px-2 py-0.5 rounded bg-stone-800/80 text-stone-400 border border-stone-700/60"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

