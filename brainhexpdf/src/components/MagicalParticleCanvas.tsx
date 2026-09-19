import React, { useEffect, useRef, useCallback } from 'react';
import { BrainHexType, SlideData, MagicalEffectType, MagicalEffectIntensity } from '../types';
import { BRAIN_HEX_PROFILES } from '../data/brainHexProfiles';

interface MagicalParticleCanvasProps {
  profile: BrainHexType;
  slide?: SlideData;
  effectType?: MagicalEffectType; // 'auto' or specific
  intensity?: MagicalEffectIntensity; // 'subtle' | 'epic' | 'dazzling' | 'off'
  burstTrigger?: number; // Increment to trigger a special burst
  interactive?: boolean;
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  maxAlpha: number;
  decay: number;
  life: number;
  maxLife: number;
  kind: 'spark' | 'rune' | 'mote' | 'ember' | 'swirl' | 'shield_hex' | 'lightning_node';
  symbol?: string;
  rotation?: number;
  rotationSpeed?: number;
  orbitAngle?: number;
  orbitRadius?: number;
  orbitSpeed?: number;
  orbitCenterX?: number;
  orbitCenterY?: number;
}

const RUNIC_GLYPHS = ['ᚱ', 'ᚦ', 'ᚨ', 'ᛟ', 'ᛉ', 'ᚺ', 'ᛊ', 'ᛗ', '✧', '✦', '◈', '◇', '⬡', '𖤍', '⟐'];
const MATRIX_SYMBOLS = ['01', '10', 'λ', '∫', '∇', '∑', '⬡', '⬢', '{ }', '->', '&&', '!=', '0x'];
const CELESTIAL_SYMBOLS = ['✦', '✧', '★', '⋆', '☽', '◈', '◇', '❂', '✺'];

export type ResolvedMagicalEffectType =
  | 'sparks'
  | 'runes'
  | 'swirling_energy'
  | 'embers'
  | 'shield_aura'
  | 'matrix_nodes'
  | 'lightning_plasma';

export const MagicalParticleCanvas: React.FC<MagicalParticleCanvasProps> = ({
  profile,
  slide,
  effectType = 'auto',
  intensity = 'epic',
  burstTrigger = 0,
  interactive = true,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameIdRef = useRef<number | null>(null);
  const mousePosRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const prevBurstTriggerRef = useRef<number>(burstTrigger);
  const lastTimeRef = useRef<number>(performance.now());
  const dimensionsRef = useRef<{ width: number; height: number }>({ width: 800, height: 600 });

  // Resolve active theme palette
  const theme = BRAIN_HEX_PROFILES[profile] || BRAIN_HEX_PROFILES.Achiever;

  // Determine Effective Effect Mode based on Profile + Slide Content
  const getResolvedEffectType = useCallback((): ResolvedMagicalEffectType => {
    if (effectType && effectType !== 'auto') {
      return effectType as ResolvedMagicalEffectType;
    }

    // 1. Content Specific Overrides
    if (slide?.type === 'boss_battle') {
      return 'embers';
    }
    if (slide?.type === 'reward_certificate' || slide?.type === 'epic_conclusion') {
      return 'sparks';
    }
    if (slide?.type === 'deep_lore' || (slide?.secretLore && slide.secretLore.revealedContent)) {
      return 'runes';
    }
    if (slide?.codeSnippet || (slide?.conceptTitle && slide.conceptTitle.toLowerCase().includes('código'))) {
      return 'matrix_nodes';
    }

    // 2. Profile Archetype Mapping
    switch (profile) {
      case 'Achiever':
        return 'sparks'; // Golden stardust & achievement glimmers
      case 'Mastermind':
        return 'matrix_nodes'; // Logical runes, code matrices & neural nodes
      case 'Seeker':
        return 'swirling_energy'; // Astral cosmic vortex & mystical runes
      case 'Conqueror':
        return 'embers'; // Fiery embers & combat sparks
      case 'Socializer':
        return 'sparks'; // Glowing warm orbs & harmonious motes
      case 'Daredevil':
        return 'lightning_plasma'; // High speed electric arcs & kinetic streaks
      case 'Survivor':
        return 'shield_aura'; // Protective hexagonal barrier particles
      default:
        return 'sparks';
    }
  }, [effectType, profile, slide]);

  const resolvedEffect = getResolvedEffectType();

  // Particle colors mapping
  const getPaletteColors = useCallback((): string[] => {
    const primary = theme.palette.primary;
    const accent = theme.palette.accent;
    const secondary = theme.palette.secondary;

    switch (resolvedEffect) {
      case 'sparks':
        return [accent, primary, '#FDE047', '#F59E0B', '#FFFFFF'];
      case 'matrix_nodes':
        return ['#06B6D4', '#22D3EE', '#10B981', '#38BDF8', '#E0F2FE'];
      case 'swirling_energy':
        return ['#A855F7', '#C084FC', '#38BDF8', '#F472B6', '#E9D5FF'];
      case 'embers':
        return ['#EF4444', '#F97316', '#FBBF24', '#DC2626', '#FFA500'];
      case 'shield_aura':
        return ['#10B981', '#34D399', '#059669', '#6EE7B7', '#A7F3D0'];
      case 'lightning_plasma':
        return ['#38BDF8', '#818CF8', '#C084FC', '#FFFFFF', '#67E8F9'];
      case 'runes':
        return [accent, '#E9D5FF', '#C084FC', '#FDE047', primary];
      default:
        return [primary, accent, secondary, '#FFFFFF'];
    }
  }, [resolvedEffect, theme]);

  // Determine Max Particle Limits based on Intensity
  const getParticleLimit = useCallback((): number => {
    if (intensity === 'off') return 0;
    if (intensity === 'subtle') return 25;
    if (intensity === 'dazzling') return 80;
    return 48; // 'epic' default
  }, [intensity]);

  // Create a single particle
  const createParticle = useCallback(
    (customX?: number, customY?: number, isBurst = false): Particle => {
      const { width, height } = dimensionsRef.current;
      const x = customX !== undefined ? customX : Math.random() * width;
      const y = customY !== undefined ? customY : Math.random() * height;
      const colors = getPaletteColors();
      const color = colors[Math.floor(Math.random() * colors.length)];

      let kind: Particle['kind'] = 'mote';
      let symbol: string | undefined;

      if (resolvedEffect === 'runes') {
        kind = Math.random() > 0.4 ? 'rune' : 'mote';
        symbol = RUNIC_GLYPHS[Math.floor(Math.random() * RUNIC_GLYPHS.length)];
      } else if (resolvedEffect === 'matrix_nodes') {
        kind = Math.random() > 0.4 ? 'lightning_node' : 'mote';
        symbol = MATRIX_SYMBOLS[Math.floor(Math.random() * MATRIX_SYMBOLS.length)];
      } else if (resolvedEffect === 'embers') {
        kind = Math.random() > 0.3 ? 'ember' : 'spark';
      } else if (resolvedEffect === 'swirling_energy') {
        kind = Math.random() > 0.5 ? 'swirl' : 'spark';
        if (Math.random() > 0.7) {
          symbol = CELESTIAL_SYMBOLS[Math.floor(Math.random() * CELESTIAL_SYMBOLS.length)];
        }
      } else if (resolvedEffect === 'shield_aura') {
        kind = Math.random() > 0.4 ? 'shield_hex' : 'mote';
      } else if (resolvedEffect === 'lightning_plasma') {
        kind = Math.random() > 0.4 ? 'spark' : 'mote';
      } else {
        kind = Math.random() > 0.5 ? 'spark' : 'mote';
      }

      const speedFactor = isBurst ? (intensity === 'dazzling' ? 3.5 : 2.2) : 1;
      const angle = isBurst ? Math.random() * Math.PI * 2 : (Math.random() - 0.5) * Math.PI;
      const velocity = (Math.random() * 0.8 + 0.3) * speedFactor;

      let vx = Math.cos(angle) * velocity;
      let vy = Math.sin(angle) * velocity;

      // Natural directional drift per effect
      if (!isBurst) {
        if (resolvedEffect === 'embers' || resolvedEffect === 'sparks') {
          vy = -(Math.random() * 0.8 + 0.3); // Upward float
          vx = (Math.random() - 0.5) * 0.5;
        } else if (resolvedEffect === 'shield_aura') {
          vx = (Math.random() - 0.5) * 0.3;
          vy = (Math.random() - 0.5) * 0.3;
        }
      }

      const maxLife = isBurst ? Math.random() * 50 + 40 : Math.random() * 160 + 90;
      const size =
        kind === 'rune' || kind === 'lightning_node'
          ? Math.random() * 6 + 10
          : kind === 'shield_hex'
          ? Math.random() * 8 + 6
          : Math.random() * 3.5 + 1.5;

      const maxAlpha = isBurst ? Math.random() * 0.4 + 0.6 : Math.random() * 0.5 + 0.35;

      return {
        x,
        y,
        vx,
        vy,
        size,
        color,
        alpha: isBurst ? maxAlpha : 0,
        maxAlpha,
        decay: maxAlpha / maxLife,
        life: 0,
        maxLife,
        kind,
        symbol,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.04,
        orbitAngle: Math.random() * Math.PI * 2,
        orbitRadius: Math.random() * (width * 0.35) + 30,
        orbitSpeed: (Math.random() * 0.015 + 0.005) * (Math.random() > 0.5 ? 1 : -1),
        orbitCenterX: width * 0.5,
        orbitCenterY: height * 0.5,
      };
    },
    [getPaletteColors, intensity, resolvedEffect]
  );

  // Trigger Burst Effect
  const triggerBurst = useCallback(
    (count = 24, originX?: number, originY?: number) => {
      if (intensity === 'off') return;
      const { width, height } = dimensionsRef.current;
      const targetX = originX !== undefined ? originX : width / 2;
      const targetY = originY !== undefined ? originY : height / 2;

      const newParticles: Particle[] = [];
      for (let i = 0; i < count; i++) {
        newParticles.push(createParticle(targetX, targetY, true));
      }
      particlesRef.current.push(...newParticles);
    },
    [createParticle, intensity]
  );

  // Watch for external explicit burst triggers (e.g. boss hit, secret revealed, manual pulse)
  useEffect(() => {
    if (burstTrigger > prevBurstTriggerRef.current) {
      prevBurstTriggerRef.current = burstTrigger;
      triggerBurst(intensity === 'dazzling' ? 36 : 22);
    }
  }, [burstTrigger, intensity, triggerBurst]);

  // Resize handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleResize = () => {
      const width = container.clientWidth || 800;
      const height = container.clientHeight || 600;
      dimensionsRef.current = { width, height };

      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(dpr, dpr);
        }
      }
    };

    handleResize();
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Main Canvas Render Loop
  useEffect(() => {
    if (intensity === 'off') {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let isRunning = true;

    const render = (now: number) => {
      if (!isRunning) return;

      const dt = Math.min(32, now - lastTimeRef.current);
      lastTimeRef.current = now;
      const deltaFactor = dt / 16.666;

      const { width, height } = dimensionsRef.current;
      ctx.clearRect(0, 0, width, height);

      // Mouse interactive trail creation
      if (interactive && mousePosRef.current.active && Math.random() > 0.4) {
        particlesRef.current.push(
          createParticle(
            mousePosRef.current.x + (Math.random() - 0.5) * 16,
            mousePosRef.current.y + (Math.random() - 0.5) * 16,
            true
          )
        );
      }

      // Maintain ambient particle population
      const maxParticles = getParticleLimit();
      while (particlesRef.current.length < maxParticles) {
        particlesRef.current.push(createParticle());
      }

      // Render & Update Particles
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      const aliveParticles: Particle[] = [];

      for (let i = 0; i < particlesRef.current.length; i++) {
        const p = particlesRef.current[i];
        p.life += deltaFactor;

        // Alpha envelope: fade-in then fade-out
        if (p.life < p.maxLife * 0.2) {
          p.alpha = Math.min(p.maxAlpha, p.alpha + p.decay * 2 * deltaFactor);
        } else {
          p.alpha = Math.max(0, p.alpha - p.decay * deltaFactor);
        }

        // Movement updates
        if (p.kind === 'swirl' && p.orbitAngle !== undefined && p.orbitRadius !== undefined && p.orbitSpeed !== undefined) {
          p.orbitAngle += p.orbitSpeed * deltaFactor;
          p.x = (p.orbitCenterX || width / 2) + Math.cos(p.orbitAngle) * p.orbitRadius;
          p.y = (p.orbitCenterY || height / 2) + Math.sin(p.orbitAngle) * (p.orbitRadius * 0.65);
        } else {
          p.x += p.vx * deltaFactor;
          p.y += p.vy * deltaFactor;
        }

        if (p.rotation !== undefined && p.rotationSpeed !== undefined) {
          p.rotation += p.rotationSpeed * deltaFactor;
        }

        // Wrap around boundaries for ambient particles
        if (p.alpha > 0.01 && p.life < p.maxLife) {
          aliveParticles.push(p);

          ctx.save();
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.strokeStyle = p.color;

          if (p.kind === 'rune' && p.symbol) {
            // Draw floating Runic Symbol with gentle glow
            ctx.font = `${Math.round(p.size)}px "Cinzel", "Cinzel Decorative", serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 8;
            ctx.translate(p.x, p.y);
            if (p.rotation) ctx.rotate(p.rotation);
            ctx.fillText(p.symbol, 0, 0);
          } else if (p.kind === 'lightning_node' && p.symbol) {
            // Draw Matrix Code Node
            ctx.font = `${Math.round(p.size)}px "JetBrains Mono", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 6;
            ctx.fillText(p.symbol, p.x, p.y);
          } else if (p.kind === 'shield_hex') {
            // Draw Hexagonal Defense Glyph
            const hexRadius = p.size;
            ctx.beginPath();
            for (let h = 0; h < 6; h++) {
              const a = (h * Math.PI) / 3 + (p.rotation || 0);
              const hx = p.x + hexRadius * Math.cos(a);
              const hy = p.y + hexRadius * Math.sin(a);
              if (h === 0) ctx.moveTo(hx, hy);
              else ctx.lineTo(hx, hy);
            }
            ctx.closePath();
            ctx.lineWidth = 1.2;
            ctx.stroke();
          } else if (p.kind === 'spark') {
            // 4-Point Star Spark
            const sparkRadius = p.size;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - sparkRadius * 2);
            ctx.quadraticCurveTo(p.x, p.y, p.x + sparkRadius * 2, p.y);
            ctx.quadraticCurveTo(p.x, p.y, p.x, p.y + sparkRadius * 2);
            ctx.quadraticCurveTo(p.x, p.y, p.x - sparkRadius * 2, p.y);
            ctx.quadraticCurveTo(p.x, p.y, p.x, p.y - sparkRadius * 2);
            ctx.closePath();
            ctx.fill();
          } else if (p.kind === 'ember') {
            // Crackling Flame Ember
            ctx.shadowColor = '#F97316';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // Default Luminous Mote / Orbital Stardust
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();
        }
      }

      ctx.restore();
      particlesRef.current = aliveParticles;

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    animFrameIdRef.current = requestAnimationFrame(render);

    return () => {
      isRunning = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [createParticle, getParticleLimit, intensity, interactive]);

  // Pointer Interaction Handlers
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    mousePosRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      active: true,
    };
  };

  const handlePointerLeave = () => {
    mousePosRef.current.active = false;
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    triggerBurst(intensity === 'dazzling' ? 24 : 14, clickX, clickY);
  };

  return (
    <div
      ref={containerRef}
      id="magical-particle-overlay"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      className={`absolute inset-0 pointer-events-none z-[4] overflow-hidden ${className}`}
      style={{ touchAction: 'none' }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block pointer-events-none"
        style={{
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  );
};
