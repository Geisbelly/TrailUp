import { useState } from "react";
import { Sun, Moon } from "lucide-react";
import { PROFILES } from "@/features/signup/brainhex";
import { useInView } from "@/hooks/useInView";

import mastermindArt from "@/assets/guardioes/mastermind.webp";
import achieverArt from "@/assets/guardioes/achiever.webp";
import seekerArt from "@/assets/guardioes/seeker.webp";
import survivorArt from "@/assets/guardioes/survivor.webp";
import conquerorArt from "@/assets/guardioes/conqueror.webp";
import socializerArt from "@/assets/guardioes/socializer.webp";
import daredevilArt from "@/assets/guardioes/daredevil.webp";

// Nomes de guia e titulo oficiais (fonte: api/app/services/personalizacao.py
// _BRAINHEX_GUIDE_PERSONAS). Citacoes e tracos sao autorais, escritos para
// capturar o tom_voz de cada perfil nas assinaturas editoriais do backend —
// nao sao gerados por IA, sao um asset fixo da marca. Arte: recorte do
// poster oficial "Os Guardioes da Trilha" fornecido pelo usuario.
const GUIDES: Record<string, { name: string; title: string; quote: string; art: string; traits: string[] }> = {
  mastermind: {
    name: "Atena",
    title: "A Sábia das Constelações",
    quote: "Toda pergunta certa já contém metade da resposta.",
    art: mastermindArt,
    traits: ["Analítica", "Estratégica", "Profunda"],
  },
  achiever: {
    name: "Auri",
    title: "O Cavaleiro Solar",
    quote: "Cada marco conquistado abre o próximo caminho.",
    art: achieverArt,
    traits: ["Focado", "Disciplinado", "Determinado"],
  },
  seeker: {
    name: "Orion",
    title: "A Guardiã das Runas",
    quote: "Todo mapa esconde uma pergunta melhor que a resposta.",
    art: seekerArt,
    traits: ["Curiosa", "Exploradora", "Intuitiva"],
  },
  survivor: {
    name: "Valka",
    title: "O Guardião da Montanha",
    quote: "Sobreviver é ter um plano B. Redundância não é desperdício.",
    art: survivorArt,
    traits: ["Paciente", "Resiliente", "Confiável"],
  },
  conqueror: {
    name: "Drako",
    title: "A Rainha da Tempestade",
    quote: "Não existe segundo lugar na sua própria jornada.",
    art: conquerorArt,
    traits: ["Líder", "Competitiva", "Determinada"],
  },
  socializer: {
    name: "Luma",
    title: "O Espírito da Aurora",
    quote: "Ninguém chega longe sozinho — nem mesmo você.",
    art: socializerArt,
    traits: ["Comunicativo", "Empático", "Inspirador"],
  },
  daredevil: {
    name: "Rexa",
    title: "A Fênix do Caos",
    quote: "Hesitar é a única forma de perder.",
    art: daredevilArt,
    traits: ["Ousada", "Energética", "Impulsiva"],
  },
};

const PROFILE_LIST = Object.values(PROFILES);

function extractHex(twClass: string): string {
  return twClass.match(/#[0-9a-fA-F]{6}/)?.[0] ?? "#a78c07";
}

const BrainHexShowcase = () => {
  const [mode, setMode] = useState<"dark" | "light">("dark");
  const [activeKey, setActiveKey] = useState(PROFILE_LIST[0].key);
  const active = PROFILE_LIST.find((p) => p.key === activeKey) ?? PROFILE_LIST[0];
  const activeGuide = GUIDES[active.key];
  const activeColor = extractHex(active.textColor);
  const isDark = mode === "dark";

  const header = useInView<HTMLDivElement>(0.4);

  return (
    <section
      className="py-24 px-4 relative overflow-hidden transition-colors duration-700"
      style={{
        background: isDark
          ? "radial-gradient(ellipse 80% 60% at 50% 0%, hsl(266 40% 14%) 0%, hsl(226 30% 6%) 55%, hsl(226 32% 5%) 100%)"
          : "radial-gradient(ellipse 80% 60% at 50% 0%, #f7f0e6 0%, #ede0cc 60%, #e6d7bd 100%)",
      }}
    >
      {/* Estrelas (so no modo escuro) */}
      {isDark && (
        <div className="absolute inset-0 pointer-events-none opacity-70" aria-hidden="true">
          {STAR_POSITIONS.map((s, i) => (
            <span
              key={i}
              className="absolute rounded-full bg-white animate-pulse-slow"
              style={{
                left: s.left,
                top: s.top,
                width: s.size,
                height: s.size,
                animationDelay: `${s.delay}s`,
                animationDuration: `${s.duration}s`,
              }}
            />
          ))}
        </div>
      )}

      <div className="container mx-auto relative z-10">
        {/* Header + toggle claro/escuro */}
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-6 relative">
          <button
            type="button"
            onClick={() => setMode(isDark ? "light" : "dark")}
            className="absolute right-0 top-0 flex items-center gap-2 px-3 py-2 rounded-full border transition-colors duration-300 text-xs font-medium"
            style={{
              borderColor: isDark ? "rgba(255,255,255,0.2)" : "rgba(38,26,10,0.2)",
              color: isDark ? "#f5f0ff" : "#3a2a12",
              backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.5)",
            }}
            aria-label={isDark ? "Ver versão clara" : "Ver versão escura"}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {isDark ? "Modo claro" : "Modo escuro"}
          </button>

          <div ref={header.ref} className={`reveal ${header.inView ? "reveal-in" : ""}`}>
            <p
              className="text-xs uppercase tracking-[0.3em] font-semibold mb-3"
              style={{ color: isDark ? "#b9a3ff" : "#8a5a1f" }}
            >
              Os Guardiões da Trilha
            </p>
            <h2
              className="text-4xl md:text-5xl font-bold mb-4 transition-colors duration-700"
              style={{ color: isDark ? "#f5f0ff" : "#241708" }}
            >
              Cada perfil. Um caminho.{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage: isDark
                    ? "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))"
                    : "linear-gradient(90deg, #8a5a1f, #b8862f)",
                }}
              >
                Um guardião.
              </span>
            </h2>
            <p
              className="text-lg transition-colors duration-700"
              style={{ color: isDark ? "rgba(245,240,255,0.7)" : "rgba(36,23,8,0.75)" }}
            >
              Sete caminhos, um mesmo destino: sua melhor versão. Escolha um guardião e conheça a
              sua história.
            </p>
          </div>
        </div>

        {/* Lineup dos guardioes */}
        <div className="flex flex-wrap justify-center items-end gap-x-2 gap-y-8 mt-14 mb-10">
          {PROFILE_LIST.map((profile, index) => (
            <GuardianButton
              key={profile.key}
              profile={profile}
              isActive={profile.key === activeKey}
              isDark={isDark}
              delay={index * 0.07}
              onSelect={() => setActiveKey(profile.key)}
            />
          ))}
        </div>

        {/* Card do guardiao selecionado — a key forca remount, o que dispara
            a animacao .fade-scale-in de novo a cada troca (sem lib de exit
            animation: e uma entrada nova, nao uma transicao cross-fade). */}
        <div
          key={active.key}
          className="fade-scale-in max-w-xl mx-auto text-center rounded-2xl border px-8 py-6 backdrop-blur-sm transition-colors duration-700"
          style={{
            borderColor: `${activeColor}55`,
            backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.55)",
          }}
        >
          <p className="text-xs uppercase tracking-widest font-semibold mb-1" style={{ color: activeColor }}>
            {activeGuide.name} · {activeGuide.title}
          </p>
          <p
            className="text-lg italic leading-relaxed mb-4 transition-colors duration-700"
            style={{ color: isDark ? "#f5f0ff" : "#241708" }}
          >
            &ldquo;{activeGuide.quote}&rdquo;
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {activeGuide.traits.map((trait) => (
              <span
                key={trait}
                className="text-xs font-medium px-3 py-1 rounded-full border"
                style={{ borderColor: `${activeColor}66`, color: activeColor }}
              >
                {trait}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

function GuardianButton({
  profile,
  isActive,
  isDark,
  delay,
  onSelect,
}: {
  profile: (typeof PROFILE_LIST)[number];
  isActive: boolean;
  isDark: boolean;
  delay: number;
  onSelect: () => void;
}) {
  const { ref, inView } = useInView<HTMLButtonElement>(0.2);
  const color = extractHex(profile.textColor);
  const guide = GUIDES[profile.key];
  const Icon = profile.icon;

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      className={`reveal ${inView ? "reveal-in" : ""} relative flex flex-col items-center w-[120px] sm:w-[140px] shrink-0 transition-transform duration-300 hover:-translate-y-2 active:scale-95`}
      style={{
        transitionDelay: inView ? `${delay}s` : "0s",
        filter: isActive ? "none" : "grayscale(0.15) brightness(0.85)",
        opacity: isActive ? 1 : 0.8,
      }}
      aria-label={`Ver ${profile.title}`}
    >
      <div
        className="absolute inset-x-0 bottom-16 h-40 rounded-full blur-2xl transition-opacity duration-300"
        style={{ backgroundColor: color, opacity: isActive ? 0.35 : 0 }}
      />
      <img
        src={guide.art}
        alt={`${guide.name}, ${guide.title}`}
        className="relative w-full h-auto drop-shadow-2xl select-none"
        draggable={false}
      />
      <div
        className="relative -mt-3 w-11 h-11 flex items-center justify-center transition-transform duration-300"
        style={{ transform: isActive ? "scale(1.12)" : "scale(1)" }}
      >
        <HexBadge color={color} Icon={Icon} />
      </div>
      <span
        className="relative mt-2 text-xs sm:text-sm font-bold uppercase tracking-wide transition-colors duration-700"
        style={{ color: isActive ? color : isDark ? "rgba(245,240,255,0.55)" : "rgba(36,23,8,0.55)" }}
      >
        {profile.title.split(" ")[0]}
      </span>
    </button>
  );
}

function HexBadge({ color, Icon }: { color: string; Icon: (typeof PROFILE_LIST)[number]["icon"] }) {
  return (
    <div className="relative w-full h-full">
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
        <polygon
          points="50,3 93,26 93,74 50,97 7,74 7,26"
          fill={`${color}22`}
          stroke={color}
          strokeWidth="4"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
    </div>
  );
}

// Posicoes fixas (nao Math.random em cada render) das estrelas do fundo escuro.
const STAR_POSITIONS = [
  { left: "5%", top: "10%", size: 2, delay: 0, duration: 4 },
  { left: "12%", top: "28%", size: 3, delay: 1.2, duration: 5 },
  { left: "22%", top: "8%", size: 2, delay: 2.1, duration: 4.5 },
  { left: "30%", top: "35%", size: 2, delay: 0.6, duration: 3.8 },
  { left: "40%", top: "15%", size: 3, delay: 1.8, duration: 5.2 },
  { left: "48%", top: "5%", size: 2, delay: 0.3, duration: 4.1 },
  { left: "58%", top: "22%", size: 2, delay: 2.4, duration: 4.8 },
  { left: "66%", top: "10%", size: 3, delay: 1.1, duration: 5.5 },
  { left: "74%", top: "30%", size: 2, delay: 0.8, duration: 4.3 },
  { left: "82%", top: "12%", size: 2, delay: 1.6, duration: 3.9 },
  { left: "90%", top: "25%", size: 3, delay: 2.2, duration: 5.1 },
  { left: "95%", top: "8%", size: 2, delay: 0.4, duration: 4.6 },
  { left: "15%", top: "45%", size: 2, delay: 1.4, duration: 4.2 },
  { left: "85%", top: "42%", size: 2, delay: 0.9, duration: 4.9 },
];

export default BrainHexShowcase;
