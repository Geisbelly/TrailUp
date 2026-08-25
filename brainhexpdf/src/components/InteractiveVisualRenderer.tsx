import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Cpu,
  Database,
  Server,
  Shield,
  ShieldCheck,
  Layers,
  Zap,
  Award,
  CheckSquare,
  Globe,
  Compass,
  Share2,
  Lock,
  Activity,
  ArrowRight,
  ChevronRight,
  Info,
  Sparkles,
  Terminal,
  CheckCircle2,
  BarChart3,
  Eye,
  MapPin,
  GitCommit,
  Network,
} from 'lucide-react';
import {
  BrainHexType,
  VisualDiagramData,
  VisualDiagramNode,
  VisualCaseExample,
} from '../types';
import { BrainHexAvatar } from './BrainHexAvatars';

interface InteractiveVisualRendererProps {
  diagram?: VisualDiagramData;
  examples?: VisualCaseExample[];
  profile: BrainHexType;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  className?: string;
}

export const InteractiveVisualRenderer: React.FC<InteractiveVisualRendererProps> = ({
  diagram,
  examples,
  profile,
  primaryColor = '#3B82F6',
  secondaryColor = '#60A5FA',
  accentColor = '#F59E0B',
  className = '',
}) => {
  const [selectedNode, setSelectedNode] = useState<VisualDiagramNode | null>(null);
  const [activeTab, setActiveTab] = useState<'diagram' | 'examples' | 'breakdown'>('diagram');

  if (!diagram && (!examples || examples.length === 0)) {
    return null;
  }

  const renderIcon = (iconName?: string, classNameStr: string = 'w-4 h-4') => {
    switch (iconName) {
      case 'Cpu':
        return <Cpu className={classNameStr} />;
      case 'Database':
        return <Database className={classNameStr} />;
      case 'Server':
        return <Server className={classNameStr} />;
      case 'ShieldCheck':
        return <ShieldCheck className={classNameStr} />;
      case 'Shield':
        return <Shield className={classNameStr} />;
      case 'Layers':
        return <Layers className={classNameStr} />;
      case 'Zap':
        return <Zap className={classNameStr} />;
      case 'Award':
        return <Award className={classNameStr} />;
      case 'CheckSquare':
        return <CheckSquare className={classNameStr} />;
      case 'Globe':
        return <Globe className={classNameStr} />;
      case 'Compass':
        return <Compass className={classNameStr} />;
      case 'Share2':
        return <Share2 className={classNameStr} />;
      case 'Lock':
        return <Lock className={classNameStr} />;
      default:
        return <Network className={classNameStr} />;
    }
  };

  return (
    <div
      className={`rounded-2xl border bg-stone-950/80 backdrop-blur-md p-4 sm:p-5 text-stone-100 shadow-xl overflow-hidden ${className}`}
      style={{
        borderColor: `${primaryColor}40`,
        boxShadow: `0 8px 30px -10px ${primaryColor}30`,
      }}
    >
      {/* Header & Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-stone-800/80">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg shadow-inner"
            style={{ backgroundColor: `${primaryColor}25`, color: accentColor }}
          >
            <Network className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-300">
                {diagram?.title || 'Visualização Arquitetural Adaptada'}
              </span>
              {diagram?.badge && (
                <span
                  className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border shadow-sm"
                  style={{
                    backgroundColor: `${primaryColor}20`,
                    borderColor: `${primaryColor}50`,
                    color: accentColor,
                  }}
                >
                  {diagram.badge}
                </span>
              )}
            </div>
            {diagram?.caption && (
              <p className="text-[11px] text-stone-400 mt-0.5">{diagram.caption}</p>
            )}
          </div>
        </div>

        {/* Tab switchers if examples exist */}
        {examples && examples.length > 0 && (
          <div className="flex items-center gap-1 bg-stone-900/90 p-1 rounded-lg border border-stone-800 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('diagram')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                activeTab === 'diagram'
                  ? 'bg-stone-800 text-white shadow-sm font-semibold'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Diagrama & Mapa
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('examples')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1 ${
                activeTab === 'examples'
                  ? 'bg-stone-800 text-white shadow-sm font-semibold'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              Exemplo Real
            </button>
          </div>
        )}
      </div>

      {/* Main Content Renderers */}
      <div className="mt-4">
        {activeTab === 'diagram' && diagram && (
          <>
            {/* System Topology / Node Network */}
            {diagram.type === 'system_topology' && diagram.nodes && (
              <div className="space-y-4">
                {/* Layers or Nodes Visual Matrix */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  {diagram.nodes.map((node, nIdx) => {
                    const isSelected = selectedNode?.id === node.id;
                    const statusColors = {
                      active: 'border-blue-500/50 bg-blue-950/20 text-blue-300',
                      success: 'border-emerald-500/50 bg-emerald-950/20 text-emerald-300',
                      warning: 'border-amber-500/50 bg-amber-950/20 text-amber-300',
                      critical: 'border-rose-500/50 bg-rose-950/20 text-rose-300',
                      highlight: 'border-purple-500/50 bg-purple-950/20 text-purple-300',
                    };

                    return (
                      <motion.div
                        key={node.id}
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setSelectedNode(isSelected ? null : node)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between relative overflow-hidden ${
                          isSelected
                            ? 'ring-2 ring-amber-400 border-amber-400 bg-stone-900 shadow-lg'
                            : 'border-stone-800 bg-stone-900/60 hover:border-stone-600'
                        }`}
                      >
                        {/* Connecting Step Badge */}
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className={`p-1.5 rounded-lg border text-xs ${
                              statusColors[node.status || 'active']
                            }`}
                          >
                            {renderIcon(node.icon)}
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-stone-800 text-stone-400 border border-stone-700">
                            Nó #{nIdx + 1}
                          </span>
                        </div>

                        <div>
                          <div className="text-xs font-bold text-stone-100">{node.label}</div>
                          {node.sublabel && (
                            <div className="text-[10px] text-stone-400 mt-0.5">
                              {node.sublabel}
                            </div>
                          )}
                        </div>

                        {node.layer && (
                          <div className="mt-2.5 pt-2 border-t border-stone-800/80 flex items-center justify-between text-[9px] text-stone-500">
                            <span>{node.layer}</span>
                            <ChevronRight className="w-3 h-3 text-stone-500" />
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>

                {/* Selected Node Drawer / Deep Details */}
                <AnimatePresence>
                  {selectedNode && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3.5 text-xs text-amber-100 flex items-start gap-3"
                    >
                      <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="font-bold text-amber-300 flex items-center gap-2">
                          <span>{selectedNode.label}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-900/60 border border-amber-700/50">
                            {selectedNode.layer || 'Componente'}
                          </span>
                        </div>
                        <p className="text-stone-300 leading-relaxed">
                          {selectedNode.details ||
                            'Componente estrutural com alta disponibilidade e responsabilidade bem delimitada.'}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Connections Flow Indicator */}
                {diagram.connections && diagram.connections.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-stone-900/40 border border-stone-800/80 flex flex-wrap items-center gap-2 text-[11px] text-stone-400">
                    <span className="font-mono font-bold text-stone-500 uppercase text-[9px] tracking-wider">
                      Fluxos Ativos:
                    </span>
                    {diagram.connections.map((conn, cIdx) => (
                      <span
                        key={cIdx}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-stone-800/80 border border-stone-700 text-stone-300 text-[10px]"
                      >
                        <GitCommit className="w-3 h-3 text-amber-400" />
                        <span>{conn.label || `${conn.from} → ${conn.to}`}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Flow Roadmap / Step-by-Step Pipeline */}
            {diagram.type === 'flow_roadmap' && diagram.nodes && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {diagram.nodes.map((step, sIdx) => (
                    <motion.div
                      key={step.id}
                      whileHover={{ scale: 1.02 }}
                      className="p-3.5 rounded-xl border border-stone-800 bg-stone-900/60 flex flex-col justify-between relative overflow-hidden"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-stone-800 text-amber-300 border border-stone-700">
                          Etapa {sIdx + 1}
                        </span>
                        <div className="p-1 rounded-md bg-stone-800/80 text-stone-300">
                          {renderIcon(step.icon)}
                        </div>
                      </div>
                      <div className="text-xs font-bold text-stone-100 mb-1">{step.label}</div>
                      <p className="text-[11px] text-stone-400 leading-relaxed">
                        {step.details || step.sublabel}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Comparative Matrix & Trade-offs */}
            {diagram.type === 'comparison_matrix' && diagram.comparisonMatrix && (
              <div className="overflow-x-auto rounded-xl border border-stone-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-900/90 text-stone-300 font-semibold border-b border-stone-800">
                    <tr>
                      {diagram.comparisonMatrix.headers.map((h, hIdx) => (
                        <th key={hIdx} className="p-3 text-[11px] uppercase tracking-wider">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800/60 bg-stone-900/30">
                    {diagram.comparisonMatrix.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-stone-800/30 transition-colors">
                        <td className="p-3 font-medium text-stone-200">{row.criteria}</td>
                        {row.values.map((val, vIdx) => (
                          <td
                            key={vIdx}
                            className={`p-3 text-stone-300 ${
                              vIdx === 1 ? 'text-amber-300 font-medium' : ''
                            }`}
                          >
                            {val}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Metric Radar & KPI Dashboard */}
            {diagram.type === 'metric_radar' && diagram.metrics && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {diagram.metrics.map((metric, mIdx) => (
                  <div
                    key={mIdx}
                    className="p-3 rounded-xl border border-stone-800 bg-stone-900/60 flex flex-col items-center justify-center text-center relative overflow-hidden"
                  >
                    <span className="text-[10px] text-stone-400 uppercase tracking-wider mb-1">
                      {metric.label}
                    </span>
                    <div className="text-xl sm:text-2xl font-mono font-bold text-amber-300 flex items-baseline gap-1">
                      {metric.value}
                      {metric.unit && (
                        <span className="text-[10px] text-stone-400 font-normal">
                          {metric.unit}
                        </span>
                      )}
                    </div>
                    {metric.change && (
                      <span className="mt-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                        {metric.change}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Code Pipeline Visualizer */}
            {diagram.type === 'code_pipeline' && diagram.codeVisual && (
              <div className="rounded-xl border border-stone-800 bg-stone-900/90 overflow-hidden font-mono text-xs">
                <div className="px-3.5 py-2 bg-stone-950 border-b border-stone-800 flex items-center justify-between text-stone-400 text-[11px]">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-3.5 h-3.5 text-amber-400" />
                    <span>{diagram.codeVisual.title || 'pipeline.ts'}</span>
                  </div>
                  <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-800 text-stone-400">
                    {diagram.codeVisual.language}
                  </span>
                </div>
                <div className="p-3.5 overflow-x-auto text-stone-300 leading-relaxed">
                  <pre className="text-[11px]">{diagram.codeVisual.code}</pre>
                </div>
                {diagram.codeVisual.annotations && diagram.codeVisual.annotations.length > 0 && (
                  <div className="p-2.5 bg-stone-950/70 border-t border-stone-800 space-y-1">
                    {diagram.codeVisual.annotations.map((ann, aIdx) => (
                      <div
                        key={aIdx}
                        className="flex items-center gap-2 text-[10px] text-amber-300/90 font-sans"
                      >
                        <span className="font-mono text-stone-500">Linha {ann.line}:</span>
                        <span>{ann.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Concept Tree / Hierarchical Map */}
            {diagram.type === 'concept_tree' && diagram.nodes && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                  {diagram.nodes.map((node, cIdx) => (
                    <div
                      key={node.id}
                      className={`p-3 rounded-xl border ${
                        cIdx === 0
                          ? 'border-amber-500/50 bg-amber-950/20 text-amber-200'
                          : 'border-stone-800 bg-stone-900/60 text-stone-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        {renderIcon(node.icon, 'w-3.5 h-3.5 text-amber-400')}
                        <span className="font-bold text-xs">{node.label}</span>
                      </div>
                      <p className="text-[10px] text-stone-400 leading-relaxed">
                        {node.details || node.sublabel}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Real Visual Case Examples Tab */}
        {activeTab === 'examples' && examples && examples.length > 0 && (
          <div className="space-y-3">
            {examples.map((ex) => (
              <div
                key={ex.id}
                className="p-4 rounded-xl border border-stone-800 bg-stone-900/70 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-stone-200 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    {ex.title}
                  </span>
                  <span className="text-[10px] font-mono text-stone-400">Aplicação Real</span>
                </div>
                <p className="text-xs text-stone-300 leading-relaxed">{ex.context}</p>

                <div className="p-2.5 rounded-lg bg-stone-950/60 border border-stone-800/80 text-xs">
                  <span className="font-semibold text-amber-300 text-[11px] block mb-1">
                    Solução Arquitetural:
                  </span>
                  <p className="text-stone-300 text-[11px]">{ex.solutionVisual}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-stone-800/80">
                  {ex.impactMetrics.map((m, mIdx) => (
                    <div
                      key={mIdx}
                      className="px-2.5 py-1 rounded-md bg-stone-800/80 border border-stone-700 text-xs flex items-center gap-1.5"
                    >
                      <span className="text-stone-400 text-[10px]">{m.label}:</span>
                      <span className="font-bold font-mono text-emerald-400">{m.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
