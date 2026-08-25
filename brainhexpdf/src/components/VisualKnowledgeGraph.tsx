import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'motion/react';
import {
  BrainHexType,
  DeckData,
  KnowledgeGraphData,
  KnowledgeGraphNode,
  KnowledgeGraphLink,
  KnowledgeGraphNodeType,
} from '../types';
import { BRAIN_HEX_PROFILES, BRAIN_HEX_GUIDE_NAMES } from '../data/brainHexProfiles';
import { buildDeckKnowledgeGraph } from '../utils/knowledgeGraphBuilder';
import { playSoundEffect } from '../utils/audioSynth';
import {
  Network,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
  Layers,
  Sparkles,
  ChevronRight,
  Play,
  Share2,
  Info,
  CheckCircle2,
  Compass,
  Zap,
  Award,
  Shield,
  BookOpen,
  Filter,
  Download,
} from 'lucide-react';

interface VisualKnowledgeGraphProps {
  deck: DeckData;
  currentSlideIndex?: number;
  onSelectSlide?: (slideIndex: number) => void;
  className?: string;
  onClose?: () => void;
}

export const VisualKnowledgeGraph: React.FC<VisualKnowledgeGraphProps> = ({
  deck,
  currentSlideIndex = 0,
  onSelectSlide,
  className = '',
  onClose,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const profile = deck.targetProfile || 'Mastermind';
  const theme = deck.themeConfig || BRAIN_HEX_PROFILES[profile] || BRAIN_HEX_PROFILES.Mastermind;
  const guideName = BRAIN_HEX_GUIDE_NAMES[profile] || theme.perfil;

  // Graph Data
  const graphData: KnowledgeGraphData = useMemo(() => {
    return buildDeckKnowledgeGraph(deck);
  }, [deck]);

  // UI States
  const [selectedNode, setSelectedNode] = useState<KnowledgeGraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<KnowledgeGraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'all' | KnowledgeGraphNodeType>('all');
  const [layoutMode, setLayoutMode] = useState<'force' | 'radial' | 'flow'>('force');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Profile-specific Theme Accents
  const profileTheming = useMemo(() => {
    switch (profile) {
      case 'Achiever':
        return {
          glowColor: '#F59E0B',
          bgGradient: 'from-amber-950/40 via-stone-950/90 to-black',
          pattern: 'grid',
          accentText: 'text-amber-400',
          borderAccent: 'border-amber-500/40',
          haloGlow: 'rgba(245, 158, 11, 0.4)',
        };
      case 'Conqueror':
        return {
          glowColor: '#3B82F6',
          bgGradient: 'from-blue-950/40 via-stone-950/90 to-black',
          pattern: 'rings',
          accentText: 'text-blue-400',
          borderAccent: 'border-blue-500/40',
          haloGlow: 'rgba(59, 130, 246, 0.4)',
        };
      case 'Daredevil':
        return {
          glowColor: '#EF4444',
          bgGradient: 'from-rose-950/40 via-stone-950/90 to-black',
          pattern: 'particles',
          accentText: 'text-rose-400',
          borderAccent: 'border-rose-500/40',
          haloGlow: 'rgba(239, 68, 68, 0.4)',
        };
      case 'Mastermind':
        return {
          glowColor: '#8B5CF6',
          bgGradient: 'from-purple-950/40 via-stone-950/90 to-black',
          pattern: 'constellation',
          accentText: 'text-purple-400',
          borderAccent: 'border-purple-500/40',
          haloGlow: 'rgba(139, 92, 246, 0.4)',
        };
      case 'Seeker':
        return {
          glowColor: '#10B981',
          bgGradient: 'from-emerald-950/40 via-stone-950/90 to-black',
          pattern: 'compass',
          accentText: 'text-emerald-400',
          borderAccent: 'border-emerald-500/40',
          haloGlow: 'rgba(16, 185, 129, 0.4)',
        };
      case 'Socializer':
        return {
          glowColor: '#F97316',
          bgGradient: 'from-orange-950/40 via-stone-950/90 to-black',
          pattern: 'resonance',
          accentText: 'text-orange-400',
          borderAccent: 'border-orange-500/40',
          haloGlow: 'rgba(249, 115, 22, 0.4)',
        };
      case 'Survivor':
        return {
          glowColor: '#6B7280',
          bgGradient: 'from-stone-900/60 via-stone-950/90 to-black',
          pattern: 'shield',
          accentText: 'text-stone-300',
          borderAccent: 'border-stone-500/40',
          haloGlow: 'rgba(107, 114, 128, 0.4)',
        };
    }
  }, [profile]);

  // Zoom reference to programmatically trigger zoom in/out/reset
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // Initialize and update D3 Force Simulation
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 550;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clean previous render

    // Deep clone nodes and links so D3 doesn't mutate React state directly
    const nodes: KnowledgeGraphNode[] = graphData.nodes.map((d) => ({ ...d }));
    const links: any[] = graphData.links.map((d) => ({ ...d }));

    // Container Groups
    const defs = svg.append('defs');

    // Glow Filter Definition
    const filter = defs.append('filter').attr('id', 'archetype-glow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');
    filter.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Radial Gradients for nodes
    defs
      .append('radialGradient')
      .attr('id', 'node-archetype-grad')
      .selectAll('stop')
      .data([
        { offset: '0%', color: theme.palette.accent || '#F59E0B' },
        { offset: '60%', color: theme.palette.primary || '#8B5CF6' },
        { offset: '100%', color: '#1E1B4B' },
      ])
      .enter()
      .append('stop')
      .attr('offset', (d) => d.offset)
      .attr('stop-color', (d) => d.color);

    // Arrow markers for directional relationships
    defs
      .append('marker')
      .attr('id', 'arrow-sequential')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 22)
      .attr('refY', 0)
      .attr('markerWidth', 5)
      .attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', '#94A3B8');

    // Zoomable Root Container
    const g = svg.append('g').attr('class', 'graph-root');

    // Setup Zoom Behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3.5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);
    zoomBehaviorRef.current = zoom;

    // Center Initial View
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.85).translate(-width / 2, -height / 2));

    // Force Simulation Setup
    const simulation = d3
      .forceSimulation<KnowledgeGraphNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<KnowledgeGraphNode, any>(links)
          .id((d) => d.id)
          .distance((d) => {
            if (d.type === 'archetype_lens') return 120;
            if (d.type === 'contains_concept') return 60;
            if (d.type === 'sequential') return 80;
            if (d.type === 'cross_reference') return 100;
            return 70;
          })
          .strength((d) => (d.type === 'sequential' ? 0.8 : 0.4))
      )
      .force(
        'charge',
        d3
          .forceManyBody()
          .strength((d: any) => (d.type === 'archetype' ? -500 : d.type === 'module' ? -250 : -120))
      )
      .force('collide', d3.forceCollide().radius((d: any) => (d.radius || 15) + 12).iterations(2));

    // Apply layout-specific forces
    if (layoutMode === 'force') {
      simulation
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('x', d3.forceX(width / 2).strength(0.05))
        .force('y', d3.forceY(height / 2).strength(0.05));
    } else if (layoutMode === 'radial') {
      simulation.force(
        'radial',
        d3.forceRadial((d: any) => {
          if (d.type === 'archetype') return 0;
          if (d.type === 'module') return 140;
          if (d.type === 'slide' || d.type === 'challenge') return 240;
          return 320;
        }, width / 2, height / 2).strength(0.8)
      );
    } else if (layoutMode === 'flow') {
      const totalSlides = deck.slides.length || 1;
      simulation
        .force(
          'x',
          d3.forceX((d: any) => {
            if (d.type === 'archetype') return width * 0.1;
            if (d.slideIndex !== undefined) {
              return width * 0.2 + (d.slideIndex / totalSlides) * (width * 0.7);
            }
            return width * 0.5;
          }).strength(0.6)
        )
        .force(
          'y',
          d3.forceY((d: any) => {
            if (d.type === 'module') return height * 0.25;
            if (d.type === 'concept') return height * 0.75;
            return height * 0.5;
          }).strength(0.4)
        );
    }

    // Render Links
    const link = g
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', (d) => d.color || '#475569')
      .attr('stroke-opacity', 0.5)
      .attr('stroke-width', (d) => (d.type === 'sequential' ? 2 : d.type === 'cross_reference' ? 1.5 : 1))
      .attr('stroke-dasharray', (d) => (d.type === 'cross_reference' ? '4,4' : d.type === 'tests_concept' ? '2,2' : 'none'))
      .attr('marker-end', (d) => (d.type === 'sequential' ? 'url(#arrow-sequential)' : null));

    // Render Node Elements Group
    const node = g
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node-item')
      .style('cursor', 'pointer')
      .call(
        d3
          .drag<SVGGElement, KnowledgeGraphNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            // keep pinned
          })
      );

    // Node Outer Glow / Aura Ring
    node
      .append('circle')
      .attr('r', (d) => (d.radius || 14) + 4)
      .attr('fill', (d) => d.color || '#3B82F6')
      .attr('fill-opacity', 0.15)
      .attr('stroke', (d) => d.color || '#3B82F6')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.4)
      .attr('filter', (d) => (d.type === 'archetype' || d.type === 'challenge' ? 'url(#archetype-glow)' : 'none'));

    // Node Main Core Circle
    node
      .append('circle')
      .attr('r', (d) => d.radius || 14)
      .attr('fill', (d) => (d.type === 'archetype' ? 'url(#node-archetype-grad)' : d.color || '#3B82F6'))
      .attr('stroke', '#0F172A')
      .attr('stroke-width', 2);

    // Active Slide Indicator Pulse Ring
    node
      .filter((d) => d.slideIndex === currentSlideIndex)
      .append('circle')
      .attr('r', (d) => (d.radius || 14) + 8)
      .attr('fill', 'none')
      .attr('stroke', '#FBBF24')
      .attr('stroke-width', 2.5)
      .attr('stroke-dasharray', '3,3')
      .attr('class', 'animate-spin-slow');

    // Node Inner Glyph / Badge Text
    node
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', '#FFFFFF')
      .attr('font-size', (d) => (d.type === 'archetype' ? '14px' : d.type === 'module' ? '11px' : '9px'))
      .attr('font-family', 'ui-monospace, monospace')
      .attr('font-weight', 'bold')
      .attr('pointer-events', 'none')
      .text((d) => {
        if (d.type === 'archetype') return '★';
        if (d.type === 'challenge') return '⚔';
        if (d.type === 'module') return '◆';
        if (d.slideIndex !== undefined) return `${d.slideIndex + 1}`;
        return '•';
      });

    // Node Labels
    node
      .append('text')
      .attr('dy', (d) => (d.radius || 14) + 12)
      .attr('text-anchor', 'middle')
      .attr('fill', '#E2E8F0')
      .attr('font-size', (d) => (d.type === 'archetype' ? '12px' : d.type === 'module' ? '11px' : '10px'))
      .attr('font-weight', (d) => (d.type === 'archetype' || d.type === 'module' ? 'bold' : '500'))
      .attr('pointer-events', 'none')
      .text((d) => {
        const text = d.label;
        return text.length > 22 ? text.substring(0, 20) + '...' : text;
      });

    // Node Interactions (Hover & Click)
    node
      .on('mouseenter', (event, d) => {
        setHoveredNode(d);

        // Highlight connected links and nodes
        const connectedNodeIds = new Set<string>();
        connectedNodeIds.add(d.id);

        links.forEach((l) => {
          const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
          const targetId = typeof l.target === 'object' ? l.target.id : l.target;
          if (sourceId === d.id) connectedNodeIds.add(targetId);
          if (targetId === d.id) connectedNodeIds.add(sourceId);
        });

        node.style('opacity', (n) => (connectedNodeIds.has(n.id) ? 1 : 0.25));
        link.style('opacity', (l) => {
          const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
          const targetId = typeof l.target === 'object' ? l.target.id : l.target;
          return sourceId === d.id || targetId === d.id ? 1 : 0.1;
        });
      })
      .on('mouseleave', () => {
        setHoveredNode(null);
        node.style('opacity', 1);
        link.style('opacity', 0.5);
      })
      .on('click', (event, d) => {
        event.stopPropagation();
        playSoundEffect('action');
        setSelectedNode(d);
      });

    // Canvas Background Click -> deselect
    svg.on('click', () => {
      setSelectedNode(null);
    });

    // Simulation Tick Updates
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [graphData, layoutMode, theme, currentSlideIndex, profile]);

  // Zoom Controls
  const handleZoomIn = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.scaleBy, 1.3);
  };

  const handleZoomOut = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current).transition().duration(300).call(zoomBehaviorRef.current.scaleBy, 0.7);
  };

  const handleResetZoom = () => {
    if (!svgRef.current || !containerRef.current || !zoomBehaviorRef.current) return;
    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 550;
    d3.select(svgRef.current)
      .transition()
      .duration(500)
      .call(
        zoomBehaviorRef.current.transform,
        d3.zoomIdentity.translate(width / 2, height / 2).scale(0.85).translate(-width / 2, -height / 2)
      );
  };

  // Search and Focus Node
  const handleSearchSelect = (targetNode: KnowledgeGraphNode) => {
    setSelectedNode(targetNode);
    if (!svgRef.current || !containerRef.current || !zoomBehaviorRef.current) return;
    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 550;

    if (targetNode.x !== undefined && targetNode.y !== undefined) {
      d3.select(svgRef.current)
        .transition()
        .duration(600)
        .call(
          zoomBehaviorRef.current.transform,
          d3.zoomIdentity.translate(width / 2, height / 2).scale(1.4).translate(-targetNode.x, -targetNode.y)
        );
    }
  };

  // Filtered nodes for search preview
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return graphData.nodes.filter(
      (n) =>
        n.label.toLowerCase().includes(q) ||
        (n.description && n.description.toLowerCase().includes(q)) ||
        (n.subtopic && n.subtopic.toLowerCase().includes(q))
    );
  }, [searchQuery, graphData]);

  // Export Graph as SVG
  const handleExportSVG = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgRef.current);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `trailup-knowledge-graph-${deck.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.svg`;
    link.click();
    URL.revokeObjectURL(url);
    playSoundEffect('quest_check');
  };

  return (
    <div
      className={`relative flex flex-col w-full h-full rounded-2xl border bg-gradient-to-b ${profileTheming.bgGradient} overflow-hidden shadow-2xl backdrop-blur-xl ${className} ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none border-0' : 'min-h-[580px] max-h-[780px]'
      }`}
      style={{ borderColor: `${theme.palette.primary}40` }}
    >
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-stone-800/80 bg-stone-950/70 z-10">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl shadow-inner border"
            style={{
              backgroundColor: `${theme.palette.primary}25`,
              borderColor: `${theme.palette.primary}60`,
              color: theme.palette.accent || '#F59E0B',
            }}
          >
            <Network className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5 font-cinzel">
                <span>Grafo de Conhecimento D3</span>
                <span className="text-stone-400 font-sans font-normal text-xs">• {deck.title}</span>
              </h2>
              <span
                className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border shadow-sm"
                style={{
                  backgroundColor: `${theme.palette.primary}20`,
                  borderColor: `${theme.palette.primary}50`,
                  color: theme.palette.accent || '#F59E0B',
                }}
              >
                {guideName} ({theme.archetype})
              </span>
            </div>
            <p className="text-[11px] text-stone-400">
              Mapeamento topológico de conceitos, interações e fluxo pedagógico.
            </p>
          </div>
        </div>

        {/* Top Controls: Layout Selector & Actions */}
        <div className="flex items-center gap-2">
          {/* Layout Mode Switcher */}
          <div className="flex items-center gap-1 bg-stone-900/90 p-1 rounded-lg border border-stone-800 text-xs">
            <button
              onClick={() => {
                setLayoutMode('force');
                playSoundEffect('action');
              }}
              className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                layoutMode === 'force'
                  ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40 shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
              title="Cluster Orgânico por Forças"
            >
              Orgânico
            </button>
            <button
              onClick={() => {
                setLayoutMode('radial');
                playSoundEffect('action');
              }}
              className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                layoutMode === 'radial'
                  ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40 shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
              title="Constelação Radial em Órbitas"
            >
              Constelação
            </button>
            <button
              onClick={() => {
                setLayoutMode('flow');
                playSoundEffect('action');
              }}
              className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                layoutMode === 'flow'
                  ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40 shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
              title="Fluxo Narrativo Sequencial"
            >
              Fluxo
            </button>
          </div>

          {/* Export SVG */}
          <button
            onClick={handleExportSVG}
            className="p-1.5 rounded-lg border border-stone-700 bg-stone-900/80 text-stone-300 hover:text-white transition-colors"
            title="Exportar Grafo como SVG"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg border border-stone-700 bg-stone-900/80 text-stone-300 hover:text-white transition-colors"
            title={isFullscreen ? 'Sair da Tela Cheia' : 'Expandir em Tela Cheia'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Close Modal if callback present */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg border border-stone-700 bg-stone-900/80 text-stone-400 hover:text-white transition-colors text-xs font-bold px-2.5"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div className="relative flex-1 w-full h-full min-h-[460px]" ref={containerRef}>
        {/* The SVG D3 Canvas */}
        <svg
          ref={svgRef}
          className="w-full h-full cursor-grab active:cursor-grabbing select-none"
          style={{ minHeight: '460px' }}
        />

        {/* Floating Zoom & Orientation Controls */}
        <div className="absolute bottom-4 left-4 flex flex-col gap-1.5 bg-stone-950/80 backdrop-blur-md p-1.5 rounded-xl border border-stone-800 shadow-xl z-20">
          <button
            onClick={handleZoomIn}
            className="p-2 rounded-lg bg-stone-900/80 hover:bg-stone-800 text-stone-300 hover:text-white transition-colors"
            title="Aproximar (Zoom In)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 rounded-lg bg-stone-900/80 hover:bg-stone-800 text-stone-300 hover:text-white transition-colors"
            title="Afastar (Zoom Out)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-2 rounded-lg bg-stone-900/80 hover:bg-stone-800 text-stone-300 hover:text-white transition-colors"
            title="Centralizar e Resetar Câmera"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Top-Left Search Bar */}
        <div className="absolute top-4 left-4 w-72 z-20">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar conceito ou slide..."
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl bg-stone-950/90 border border-stone-700/80 text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-400 shadow-lg backdrop-blur-md"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-stone-400 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Search Dropdown Results */}
          {searchResults.length > 0 && (
            <div className="mt-1 p-1 bg-stone-950/95 border border-stone-800 rounded-xl shadow-2xl max-h-48 overflow-y-auto space-y-1 backdrop-blur-md">
              {searchResults.slice(0, 5).map((node) => (
                <button
                  key={node.id}
                  onClick={() => {
                    handleSearchSelect(node);
                    setSearchQuery('');
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-stone-800 text-xs flex items-center justify-between transition-colors"
                >
                  <div className="truncate pr-2">
                    <span className="font-semibold text-stone-200">{node.label}</span>
                    <span className="text-[10px] text-stone-400 block truncate">{node.description}</span>
                  </div>
                  <span
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase"
                    style={{ backgroundColor: `${node.color}30`, color: node.color }}
                  >
                    {node.type}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Legend Overlay at Bottom-Right */}
        <div className="absolute bottom-4 right-4 hidden md:flex items-center gap-3 px-3 py-1.5 rounded-xl bg-stone-950/80 backdrop-blur-md border border-stone-800 text-[10px] text-stone-400 shadow-xl z-20">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.palette.primary }} />
            <span>Arquétipo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span>Módulos</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
            <span>Slides</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span>Conceitos</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span>Desafios/Quizzes</span>
          </div>
        </div>

        {/* Node Inspector Drawer */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ opacity: 0, x: 50, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.95 }}
              className="absolute top-4 right-4 w-80 max-w-[calc(100%-2rem)] p-4 rounded-2xl bg-stone-950/95 border shadow-2xl backdrop-blur-xl z-30 text-xs text-stone-200 space-y-3"
              style={{ borderColor: selectedNode.color || theme.palette.primary }}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 border-b border-stone-800 pb-2.5">
                <div>
                  <span
                    className="text-[9px] font-mono uppercase font-bold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `${selectedNode.color}25`,
                      color: selectedNode.color || '#F59E0B',
                    }}
                  >
                    {selectedNode.type === 'slide'
                      ? `Slide ${selectedNode.slideIndex !== undefined ? selectedNode.slideIndex + 1 : ''}`
                      : selectedNode.type === 'archetype'
                      ? 'Lente do Arquétipo'
                      : selectedNode.type === 'module'
                      ? 'Módulo Central'
                      : selectedNode.type === 'challenge'
                      ? 'Desafio Interativo'
                      : 'Conceito Fundamental'}
                  </span>
                  <h3 className="text-sm font-bold text-white mt-1 leading-snug">{selectedNode.label}</h3>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-stone-400 hover:text-white text-sm px-1 rounded hover:bg-stone-800"
                >
                  ✕
                </button>
              </div>

              {/* Description */}
              <div className="p-2.5 rounded-xl bg-stone-900/70 border border-stone-800/80 leading-relaxed text-stone-300">
                {selectedNode.description || 'Nenhum detalhe adicional disponível para este nó.'}
              </div>

              {/* Tags & Metadata */}
              {selectedNode.tags && selectedNode.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedNode.tags.map((tag, tIdx) => (
                    <span
                      key={tIdx}
                      className="text-[9px] font-mono px-2 py-0.5 rounded bg-stone-900 border border-stone-800 text-stone-400"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Action Button: Jump to Slide */}
              {selectedNode.slideIndex !== undefined && onSelectSlide && (
                <button
                  onClick={() => {
                    playSoundEffect('slide_next');
                    onSelectSlide(selectedNode.slideIndex!);
                    if (onClose) onClose();
                  }}
                  className="w-full py-2 px-3 rounded-xl font-bold text-black flex items-center justify-center gap-2 shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    backgroundColor: theme.palette.accent || '#F59E0B',
                  }}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Navegar para este Slide ({selectedNode.slideIndex + 1})</span>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Cluster Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-t border-stone-800/80 bg-stone-950/80 text-[11px] text-stone-400 z-10">
        <div className="flex items-center gap-2">
          <span className="font-bold text-stone-300 font-cinzel">Estrutura do Deck:</span>
          <span>{graphData.nodes.length} nós</span>
          <span>•</span>
          <span>{graphData.links.length} conexões</span>
        </div>

        {/* Modules summary pills */}
        <div className="hidden sm:flex items-center gap-2 overflow-x-auto">
          {graphData.clusters.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] whitespace-nowrap"
              style={{
                borderColor: `${c.color}40`,
                backgroundColor: `${c.color}15`,
                color: c.color,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
              <span>{c.name} ({c.count})</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
