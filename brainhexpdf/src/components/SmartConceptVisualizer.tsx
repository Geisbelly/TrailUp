import React from 'react';
import { motion } from 'motion/react';
import {
  BrainHexType,
  SlideData,
} from '../types';
import {
  Sparkles,
  CheckCircle2,
  Layers,
  Zap,
  Target,
  Cpu,
  Compass,
  Swords,
  Users,
  Flame,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  FileText,
  Lightbulb,
} from 'lucide-react';

interface SmartConceptVisualizerProps {
  slide: SlideData;
  profile: BrainHexType;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  className?: string;
}

export const SmartConceptVisualizer: React.FC<SmartConceptVisualizerProps> = ({
  slide,
  profile,
  primaryColor = '#3B82F6',
  secondaryColor = '#60A5FA',
  accentColor = '#F59E0B',
  className = '',
}) => {
  // Extract key concept phrases from paragraphs
  const paragraphs = slide.contentParagraphs || [];
  if (paragraphs.length === 0) return null;

  const conceptCards = paragraphs.slice(0, 3).map((para, index) => {
    const clean = para.replace(/^[•\-*0-9.]+\s*/, '');
    const colonIdx = clean.indexOf(':');
    let title = `Conceito 0${index + 1}`;
    let body = clean;

    if (colonIdx > 0 && colonIdx < 40) {
      title = clean.substring(0, colonIdx).trim();
      body = clean.substring(colonIdx + 1).trim();
    } else {
      const parts = clean.split('. ');
      if (parts.length > 1 && parts[0].length < 50) {
        title = parts[0].trim();
        body = parts.slice(1).join('. ').trim();
      }
    }

    const icon = getConceptIcon(index, profile);

    return {
      title,
      body,
      icon,
    };
  });

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3 ${className}`}>
      {conceptCards.map((card, idx) => (
        <motion.div
          key={idx}
          whileHover={{ y: -2, scale: 1.01 }}
          transition={{ duration: 0.15 }}
          className="p-3 sm:p-3.5 rounded-xl border border-stone-800 bg-stone-900/70 hover:border-stone-700 backdrop-blur-sm flex flex-col justify-between transition-all group"
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-xs shadow"
                style={{
                  backgroundColor: `${primaryColor}20`,
                  color: accentColor,
                  border: `1px solid ${primaryColor}40`,
                }}
              >
                {card.icon}
              </div>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-black/40 border border-stone-800 text-stone-300">
                Pilar {idx + 1}
              </span>
            </div>

            <h4 className="text-xs sm:text-sm font-bold text-white mb-1 group-hover:text-amber-300 transition-colors line-clamp-1">
              {card.title}
            </h4>

            <p className="text-[11px] sm:text-xs text-stone-300 leading-relaxed line-clamp-3">
              {card.body}
            </p>
          </div>

          <div className="mt-2.5 pt-2 border-t border-white/5 flex items-center justify-between text-[10px]">
            <span className="text-stone-400 flex items-center gap-1 font-mono">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              Sintetizado
            </span>
            <span className="text-amber-400 font-semibold flex items-center gap-0.5">
              <span>{profile}</span>
              <ArrowRight className="w-2.5 h-2.5" />
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

function getConceptIcon(index: number, profile: BrainHexType) {
  switch (profile) {
    case 'Achiever':
      return index === 0 ? <Target className="w-3.5 h-3.5" /> : index === 1 ? <TrendingUp className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />;
    case 'Mastermind':
      return index === 0 ? <Cpu className="w-3.5 h-3.5" /> : index === 1 ? <Layers className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />;
    case 'Seeker':
      return index === 0 ? <Compass className="w-3.5 h-3.5" /> : index === 1 ? <Lightbulb className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />;
    case 'Conqueror':
      return index === 0 ? <Swords className="w-3.5 h-3.5" /> : index === 1 ? <Target className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />;
    case 'Socializer':
      return index === 0 ? <Users className="w-3.5 h-3.5" /> : index === 1 ? <Sparkles className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />;
    case 'Daredevil':
      return index === 0 ? <Flame className="w-3.5 h-3.5" /> : index === 1 ? <Zap className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />;
    case 'Survivor':
    default:
      return index === 0 ? <ShieldAlert className="w-3.5 h-3.5" /> : index === 1 ? <Layers className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />;
  }
}
