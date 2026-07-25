// Motivos decorativos do "salao medieval" — mesma linguagem visual do app
// mobile (mobile/src/components/HallTheme.tsx): piso de losangos, luz de
// candelabro no topo, vinheta, brilho central e um divisor ornamental com
// losangos. Adaptado para SVG responsivo (preserveAspectRatio="none" em vez
// de Dimensions.get("window") do React Native).

const HALL_STARS = [
  { x: 6, y: 8 }, { x: 91, y: 6 }, { x: 18, y: 16 }, { x: 78, y: 13 },
  { x: 4, y: 30 }, { x: 96, y: 24 }, { x: 12, y: 44 }, { x: 87, y: 40 },
  { x: 50, y: 10 }, { x: 35, y: 22 }, { x: 64, y: 26 }, { x: 45, y: 52 },
];

export function HallBackground({ accent = "hsl(266 95% 66%)" }: { accent?: string }) {
  const id = "hall";
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    >
      <defs>
        <pattern id={`${id}-floor`} x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M3 0.4 L5.6 3 L3 5.6 L0.4 3 Z" fill="none" stroke={accent} strokeWidth="0.08" opacity="0.14" />
        </pattern>
        <linearGradient id={`${id}-top`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.16" />
          <stop offset="35%" stopColor={accent} stopOpacity="0.03" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}-floorglow`} cx="50%" cy="88%" r="55%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.1" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-vignette`} cx="50%" cy="45%" r="75%">
          <stop offset="45%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.45" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${id}-floor)`} />
      <rect width="100" height="100" fill={`url(#${id}-top)`} />
      <rect width="100" height="100" fill={`url(#${id}-floorglow)`} />
      {HALL_STARS.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={0.22} fill="#fff" opacity={0.5 + (i % 3) * 0.15} />
      ))}
      <rect width="100" height="100" fill={`url(#${id}-vignette)`} />
    </svg>
  );
}

export function OrnamentDivider({ color = "hsl(var(--primary))", className = "" }: { color?: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`} aria-hidden="true">
      <span className="h-px flex-1" style={{ backgroundColor: color, opacity: 0.35 }} />
      <svg width="8" height="8" viewBox="0 0 8 8" style={{ opacity: 0.5 }}>
        <path d="M4 0L8 4L4 8L0 4Z" fill={color} />
      </svg>
      <svg width="13" height="13" viewBox="0 0 8 8">
        <path d="M4 0L8 4L4 8L0 4Z" fill={color} />
      </svg>
      <svg width="20" height="20" viewBox="0 0 24 24" fill={color}>
        <path d="M12 0c0 5-2 9.5-5 12 3 2.5 5 7 5 12 0-5 2-9.5 5-12-3-2.5-5-7-5-12Z" />
      </svg>
      <svg width="13" height="13" viewBox="0 0 8 8">
        <path d="M4 0L8 4L4 8L0 4Z" fill={color} />
      </svg>
      <svg width="8" height="8" viewBox="0 0 8 8" style={{ opacity: 0.5 }}>
        <path d="M4 0L8 4L4 8L0 4Z" fill={color} />
      </svg>
      <span className="h-px flex-1" style={{ backgroundColor: color, opacity: 0.35 }} />
    </div>
  );
}
