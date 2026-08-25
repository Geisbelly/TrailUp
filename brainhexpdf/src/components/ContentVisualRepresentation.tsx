import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BrainHexType,
  SlideData,
} from '../types';
import {
  Sparkles,
  Layers,
  Cpu,
  Target,
  Compass,
  Swords,
  Users,
  Flame,
  ShieldAlert,
  ArrowRight,
  CheckCircle2,
  Zap,
  Activity,
  Award,
  Maximize2,
  Minimize2,
  HelpCircle,
  TrendingUp,
  Boxes,
  Workflow,
  Network,
  Share2,
  FileCheck,
} from 'lucide-react';
import { TrailUpArchetypeSigil } from './TrailUpThematicGraphics';
import { BrainHexAvatar } from './BrainHexAvatars';

interface ContentVisualRepresentationProps {
  slide: SlideData;
  profile: BrainHexType;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  className?: string;
  onExpandVisual?: (title: string, nodeContent: React.ReactNode) => void;
}

export const ContentVisualRepresentation: React.FC<ContentVisualRepresentationProps> = ({
  slide,
  profile,
  primaryColor = '#3B82F6',
  secondaryColor = '#60A5FA',
  accentColor = '#F59E0B',
  className = '',
}) => {
  const [activeVisualTab, setActiveVisualTab] = useState<'infographic' | 'profile_logic' | 'flow'>('infographic');
  const [selectedNodeIndex, setSelectedNodeIndex] = useState<number | null>(0);

  // Derive visual concept pillars from slide content or title
  const rawPillars = slide.keyTakeaways && slide.keyTakeaways.length > 0
    ? slide.keyTakeaways.slice(0, 3)
    : slide.contentParagraphs && slide.contentParagraphs.length > 0
    ? slide.contentParagraphs.slice(0, 3)
    : [
        'Estruturação dos Conceitos Fundamentais',
        'Aplicação Prática no Cenário Real',
        'Validação de Resultados e Maestria',
      ];

  const pillars = rawPillars.map((text, idx) => {
    // Strip bullet points or formatting
    const cleanText = text.replace(/^[•\-*0-9.]+\s*/, '');
    const colonIndex = cleanText.indexOf(':');
    if (colonIndex !== -1 && colonIndex < 35) {
      return {
        title: cleanText.substring(0, colonIndex).trim(),
        desc: cleanText.substring(colonIndex + 1).trim(),
        iconIndex: idx,
      };
    }
    const words = cleanText.split(' ');
    const title = words.slice(0, 3).join(' ');
    const desc = words.slice(3).join(' ') || cleanText;
    return {
      title: title.length > 25 ? `${title.slice(0, 22)}...` : title,
      desc: desc,
      iconIndex: idx,
    };
  });

  // Profile-specific thematic visual metadata
  const getProfileVisualMeta = () => {
    switch (profile) {
      case 'Achiever':
        return {
          icon: <Target className="w-4 h-4 text-amber-400" />,
          label: 'Matriz de Metas & KPIs',
          visualModeName: 'Radar de Conquista',
          diagramType: 'Progresso de Domínio',
          statMetric: '98.5% Alinhamento',
          flowSteps: ['Diagnóstico', 'Execução Focada', 'Score de Maestria'],
          accentBadge: '✦ KPI-Oriented',
        };
      case 'Mastermind':
        return {
          icon: <Cpu className="w-4 h-4 text-blue-400" />,
          label: 'Topologia Arquitetural',
          visualModeName: 'Esquema de Blocos',
          diagramType: 'Grafo de Relações',
          statMetric: 'Arquitetura Desacoplada',
          flowSteps: ['Entrada de Dados', 'Processamento Central', 'Saída Validada'],
          accentBadge: '✦ Blueprint Lógico',
        };
      case 'Seeker':
        return {
          icon: <Compass className="w-4 h-4 text-emerald-400" />,
          label: 'Bússola de Descoberta',
          visualModeName: 'Mapa de Exploração',
          diagramType: 'Árvore de Lore & Conhecimento',
          statMetric: '3 Nódulos Revelados',
          flowSteps: ['Descoberta', 'Investigação Profunda', 'Insight Revelado'],
          accentBadge: '✦ Exploração Profunda',
        };
      case 'Conqueror':
        return {
          icon: <Swords className="w-4 h-4 text-purple-400" />,
          label: 'Matriz de Confronto & Trade-offs',
          visualModeName: 'Arena de Desafios',
          diagramType: 'Análise de Resistência',
          statMetric: 'Impacto Crítico +45%',
          flowSteps: ['Desafio Crítico', 'Estratégia Ofensiva', 'Domínio Total'],
          accentBadge: '✦ Desafio & Vitória',
        };
      case 'Socializer':
        return {
          icon: <Users className="w-4 h-4 text-rose-400" />,
          label: 'Teia de Colaboração & Papéis',
          visualModeName: 'Ecossistema Humano',
          diagramType: 'Rede de Sinergia',
          statMetric: 'Conexões Ativas',
          flowSteps: ['Comunicação', 'Alinhamento de Times', 'Impacto Coletivo'],
          accentBadge: '✦ Sinergia de Equipe',
        };
      case 'Daredevil':
        return {
          icon: <Flame className="w-4 h-4 text-orange-400" />,
          label: 'Pipeline Ágil de Alta Velocidade',
          visualModeName: 'Ciclo de Ação Direta',
          diagramType: 'Sprint de Impacto Imediato',
          statMetric: 'Tempo de Resposta Rápido',
          flowSteps: ['Gatilho Imediato', 'Iteração Veloz', 'Resultado em Tempo Real'],
          accentBadge: '✦ Ação Imediata',
        };
      case 'Survivor':
      default:
        return {
          icon: <ShieldAlert className="w-4 h-4 text-cyan-400" />,
          label: 'Escudo de Resiliência & Fallbacks',
          visualModeName: 'Matriz de Contingência',
          diagramType: 'Tolerância a Falhas & Defesa',
          statMetric: '0% Ponto Único de Falha',
          flowSteps: ['Prevenção', 'Isolamento de Erros', 'Recuperação Segura'],
          accentBadge: '✦ Alta Resiliência',
        };
    }
  };

  const meta = getProfileVisualMeta();

  return (
    <div
      className={`rounded-2xl border bg-stone-950/90 backdrop-blur-md p-3 sm:p-4 text-stone-100 flex flex-col justify-between shadow-xl relative overflow-hidden transition-all duration-300 ${className}`}
      style={{
        borderColor: `${primaryColor}50`,
        boxShadow: `0 8px 32px -12px ${primaryColor}40`,
      }}
    >
      {/* Visual Header with Tab Navigation */}
      <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-stone-800/80 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg shadow-inner shrink-0"
            style={{ backgroundColor: `${primaryColor}25`, color: accentColor }}
          >
            {meta.icon}
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-200">
                {meta.label}
              </span>
              <span
                className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full border"
                style={{
                  borderColor: `${primaryColor}60`,
                  backgroundColor: `${primaryColor}20`,
                  color: accentColor,
                }}
              >
                {meta.accentBadge}
              </span>
            </div>
            <p className="text-[10px] text-stone-400 hidden sm:block">
              {slide.subtopic || slide.title} • Ilustração Visual Direta
            </p>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-stone-900/90 p-0.5 rounded-lg border border-stone-800 text-[10px]">
          <button
            type="button"
            onClick={() => setActiveVisualTab('infographic')}
            className={`px-2 py-0.5 rounded-md font-semibold transition-all cursor-pointer ${
              activeVisualTab === 'infographic'
                ? 'bg-stone-800 text-amber-300 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <span className="flex items-center gap-1">
              <Boxes className="w-3 h-3" />
              <span>Infográfico</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveVisualTab('flow')}
            className={`px-2 py-0.5 rounded-md font-semibold transition-all cursor-pointer ${
              activeVisualTab === 'flow'
                ? 'bg-stone-800 text-amber-300 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <span className="flex items-center gap-1">
              <Workflow className="w-3 h-3" />
              <span>Fluxo</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveVisualTab('profile_logic')}
            className={`px-2 py-0.5 rounded-md font-semibold transition-all cursor-pointer ${
              activeVisualTab === 'profile_logic'
                ? 'bg-stone-800 text-amber-300 shadow-sm'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <span className="flex items-center gap-1">
              <Network className="w-3 h-3" />
              <span>{profile}</span>
            </span>
          </button>
        </div>
      </div>

      {/* Main Visual Representation Stage */}
      <div className="relative flex-1 flex flex-col justify-center min-h-[140px] sm:min-h-[160px]">
        <AnimatePresence mode="wait">
          {/* 1. Infographic Concept Pillars View */}
          {activeVisualTab === 'infographic' && (
            <motion.div
              key="infographic"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2.5 h-full"
            >
              {pillars.map((pillar, pidx) => {
                const isSelected = selectedNodeIndex === pidx;
                return (
                  <motion.div
                    key={pidx}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedNodeIndex(pidx)}
                    className={`p-2.5 rounded-xl border flex flex-col justify-between transition-all cursor-pointer relative overflow-hidden ${
                      isSelected
                        ? 'border-amber-400/80 bg-gradient-to-b from-stone-900/95 to-amber-950/20 shadow-md ring-1 ring-amber-400/40'
                        : 'border-stone-800/80 bg-stone-900/60 hover:border-stone-700'
                    }`}
                  >
                    {/* Top Icon and Step Badge */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div
                        className="flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold shadow"
                        style={{
                          backgroundColor: isSelected ? themePrimaryGradient(primaryColor) : `${primaryColor}20`,
                          color: isSelected ? '#000000' : accentColor,
                        }}
                      >
                        {pidx === 0 ? <Zap className="w-3 h-3" /> : pidx === 1 ? <Layers className="w-3 h-3" /> : <Award className="w-3 h-3" />}
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-black/40 border border-white/5 text-stone-300">
                        Pilar 0{pidx + 1}
                      </span>
                    </div>

                    {/* Title & Short Concept */}
                    <div>
                      <h4 className="font-bold text-[11px] sm:text-xs text-white leading-tight mb-1 line-clamp-1">
                        {pillar.title}
                      </h4>
                      <p className="text-[10px] text-stone-300 line-clamp-2 leading-relaxed">
                        {pillar.desc}
                      </p>
                    </div>

                    {/* Bottom Status Chip */}
                    <div className="mt-2 pt-1.5 border-t border-white/5 flex items-center justify-between text-[9px]">
                      <span className="text-stone-400 flex items-center gap-1">
                        <CheckCircle2 className={`w-2.5 h-2.5 ${isSelected ? 'text-amber-400' : 'text-emerald-400'}`} />
                        <span>Essencial</span>
                      </span>
                      <span className="text-amber-400/90 font-mono font-bold">100%</span>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}

          {/* 2. Process Flow & Pipeline View */}
          {activeVisualTab === 'flow' && (
            <motion.div
              key="flow"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col justify-center h-full gap-2"
            >
              <div className="grid grid-cols-3 gap-2 relative">
                {meta.flowSteps.map((step, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl border border-stone-800 bg-stone-900/80 flex flex-col items-center text-center relative group hover:border-amber-500/50 transition-colors"
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs mb-1.5 shadow"
                      style={{
                        backgroundColor: `${primaryColor}30`,
                        color: accentColor,
                        border: `1px solid ${primaryColor}70`,
                      }}
                    >
                      {idx + 1}
                    </div>
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider block">
                      {step}
                    </span>
                    <span className="text-[9px] text-stone-400 mt-0.5 line-clamp-1">
                      {idx === 0 ? 'Fase Inicial' : idx === 1 ? 'Execução Core' : 'Validação'}
                    </span>
                  </div>
                ))}
              </div>

              {/* Connecting Progress Line */}
              <div className="flex items-center justify-between px-4 py-1.5 rounded-lg bg-stone-900/40 border border-stone-800/60 text-[10px] text-stone-300">
                <span className="flex items-center gap-1 text-emerald-400 font-mono font-bold">
                  <Activity className="w-3 h-3" />
                  Fluxo Contínuo
                </span>
                <span className="text-stone-400">
                  {slide.subtopic || 'Sequência Lógica de Domínio'}
                </span>
                <span className="text-amber-400 font-mono font-bold">
                  {meta.statMetric}
                </span>
              </div>
            </motion.div>
          )}

          {/* 3. BrainHex Profile Thematic Logic Grid */}
          {activeVisualTab === 'profile_logic' && (
            <motion.div
              key="profile_logic"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="p-3 rounded-xl border border-stone-800 bg-stone-900/70 flex items-center justify-between gap-3 h-full"
            >
              <div className="flex items-center gap-3 shrink-0">
                <div className="relative">
                  <TrailUpArchetypeSigil profile={profile} size={42} glow={true} />
                </div>
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 block">
                    Perfil {profile}
                  </span>
                  <h4 className="text-xs font-bold text-white">
                    {meta.visualModeName}
                  </h4>
                  <p className="text-[10px] text-stone-300 mt-0.5">
                    {meta.diagramType}
                  </p>
                </div>
              </div>

              <div className="text-right pl-3 border-l border-stone-800 flex flex-col justify-center">
                <span className="text-[9px] uppercase font-mono text-stone-400 block">
                  Eficiência Didática
                </span>
                <span className="text-sm font-extrabold text-amber-300 font-mono">
                  {meta.statMetric}
                </span>
                <span className="text-[9px] text-emerald-400 flex items-center justify-end gap-0.5 mt-0.5 font-bold">
                  <TrendingUp className="w-2.5 h-2.5" />
                  +100% Retenção
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Selected Item Sub-caption bar for instant visual understanding */}
      {activeVisualTab === 'infographic' && selectedNodeIndex !== null && pillars[selectedNodeIndex] && (
        <div className="mt-2 pt-1.5 border-t border-stone-800/80 flex items-center justify-between gap-2 text-[10px] text-stone-300 bg-stone-900/40 px-2 py-1 rounded-lg">
          <span className="flex items-center gap-1 text-amber-300 font-semibold truncate">
            <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
            <strong className="text-white">{pillars[selectedNodeIndex].title}:</strong> {pillars[selectedNodeIndex].desc}
          </span>
          <span className="text-[9px] font-mono text-stone-400 shrink-0">
            {selectedNodeIndex + 1}/{pillars.length}
          </span>
        </div>
      )}
    </div>
  );
};

function themePrimaryGradient(primaryColor: string) {
  return primaryColor || '#F59E0B';
}
