import { useState } from "react";
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
  const [activeKey, setActiveKey] = useState(PROFILE_LIST[0].key);
  const active = PROFILE_LIST.find((p) => p.key === activeKey) ?? PROFILE_LIST[0];
  const activeGuide = GUIDES[active.key];
  const activeColor = extractHex(active.textColor);

  const header = useInView<HTMLDivElement>(0.4);

  return (
    <section
      className="py-24 px-4 relative overflow-hidden"
      style={{
        background: "radial-gradient(ellipse 80% 60% at 50% 0%, hsl(266 40% 14%) 0%, hsl(226 30% 6%) 55%, hsl(226 32% 5%) 100%)",
      }}
    >
      {/* Cenario de fundo — nebulosa + lua + horizonte de castelo, para dar
          profundidade de cena (em vez de so um gradiente radial liso). */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {/* Nuvens de nebulosa (blobs radiais desfocados, mix-blend screen para
            um brilho aditivo tipo aurora) */}
        <div
          className="absolute -top-24 left-[8%] w-[38rem] h-[26rem] rounded-full blur-3xl"
          style={{
            background: "radial-gradient(ellipse, hsl(266 85% 45% / 0.5), transparent 70%)",
            mixBlendMode: "screen",
          }}
        />
        <div
          className="absolute -top-10 right-[6%] w-[34rem] h-[24rem] rounded-full blur-3xl"
          style={{
            background: "radial-gradient(ellipse, hsl(239 80% 50% / 0.4), transparent 70%)",
            mixBlendMode: "screen",
          }}
        />
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[44rem] h-[20rem] rounded-full blur-3xl"
          style={{
            background: "radial-gradient(ellipse, hsl(280 60% 30% / 0.35), transparent 75%)",
            mixBlendMode: "screen",
          }}
        />

        {/* Lua */}
        <div
          className="absolute rounded-full"
          style={{
            top: "6%",
            right: "14%",
            width: "5rem",
            height: "5rem",
            background: "radial-gradient(circle at 35% 35%, #f5f0ff, #cbb9ff 60%, transparent 100%)",
            boxShadow: "0 0 60px 20px hsl(266 85% 70% / 0.35)",
          }}
        />

        {/* Estrelas */}
        <div className="absolute inset-0 opacity-70">
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

        {/* Horizonte de castelo, ancorado no rodape da secao, atras do lineup */}
        <CastleSkyline />
      </div>

      <div className="container mx-auto relative z-10">
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-6">
          <div ref={header.ref} className={`reveal ${header.inView ? "reveal-in" : ""}`}>
            <p className="text-xs uppercase tracking-[0.3em] font-semibold mb-3" style={{ color: "#b9a3ff" }}>
              Os Guardiões da Trilha
            </p>
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-4 leading-[1.2] pb-1" style={{ color: "#f5f0ff" }}>
              Cada perfil. Um caminho.{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))" }}
              >
                Um guardião.
              </span>
            </h2>
            <p className="text-lg" style={{ color: "rgba(245,240,255,0.7)" }}>
              Sete caminhos, um mesmo destino: sua melhor versão. Escolha um guardião e conheça a
              sua história.
            </p>
          </div>
        </div>

        {/* Lineup dos guardioes — todos com a mesma altura (h-56/h-64), largura
            livre por personagem para nao distorcer a arte. */}
        <div className="flex flex-wrap justify-center items-end gap-x-2 gap-y-8 mt-14 mb-10">
          {PROFILE_LIST.map((profile, index) => (
            <GuardianButton
              key={profile.key}
              profile={profile}
              isActive={profile.key === activeKey}
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
          className="fade-scale-in max-w-xl mx-auto text-center rounded-2xl border px-8 py-6 backdrop-blur-sm"
          style={{
            borderColor: `${activeColor}55`,
            backgroundColor: "rgba(255,255,255,0.04)",
          }}
        >
          <p className="text-xs uppercase tracking-widest font-semibold mb-1" style={{ color: activeColor }}>
            {activeGuide.name} · {activeGuide.title}
          </p>
          <p className="text-lg italic leading-relaxed mb-4" style={{ color: "#f5f0ff" }}>
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
  delay,
  onSelect,
}: {
  profile: (typeof PROFILE_LIST)[number];
  isActive: boolean;
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
      className={`reveal ${inView ? "reveal-in" : ""} relative flex flex-col items-center shrink-0 transition-transform duration-300 hover:-translate-y-2 active:scale-95`}
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
        className="relative h-52 sm:h-60 w-auto max-w-[160px] object-contain drop-shadow-2xl select-none"
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
        style={{ color: isActive ? color : "rgba(245,240,255,0.55)" }}
      >
        {profile.title.split(" ")[0]}
      </span>
    </button>
  );
}

// Horizonte de castelo estilizado (silhueta). preserveAspectRatio="none" para
// esticar a largura toda sem distorcer demais a leitura (e um recorte
// decorativo, nao um logo).
const CASTLE_SKYLINE_PATH =
  "M0,240 L0,205 L0,185 L0,177 L16,177 L16,185 L28,185 L28,177 L44,177 L44,185 L56,185 L56,177 L72,177 L72,185 L84,185 L84,177 L100,177 L100,185 L112,185 L112,177 L128,177 L128,185 L140,185 L140,177 L156,177 L156,185 L168,185 L168,177 L184,177 L184,185 L190,185 L196,185 L196,110 L196,101 L210,101 L210,110 L220,110 L220,101 L234,101 L234,110 L244,110 L244,101 L258,101 L258,110 L264,110 L264,185 L264,177 L280,177 L280,185 L292,185 L292,177 L308,177 L308,185 L320,185 L320,177 L336,177 L336,185 L348,185 L348,177 L364,177 L364,185 L376,185 L376,177 L392,177 L392,185 L404,185 L404,177 L420,177 L420,185 L430,185 L502,185 L502,55 L496,55 L560,9 L624,55 L618,55 L618,185 L618,177 L634,177 L634,185 L646,185 L646,177 L662,177 L662,185 L674,185 L674,177 L690,177 L690,185 L702,185 L702,177 L718,177 L718,185 L730,185 L730,177 L746,177 L746,185 L758,185 L758,177 L774,177 L774,185 L760,185 L820,185 L820,90 L820,81 L834,81 L834,90 L844,90 L844,81 L858,81 L858,90 L868,90 L868,81 L882,81 L882,90 L892,90 L892,81 L906,81 L906,90 L900,90 L900,185 L900,177 L916,177 L916,185 L928,185 L928,177 L944,177 L944,185 L956,185 L956,177 L972,177 L972,185 L984,185 L984,177 L1000,177 L1000,185 L1012,185 L1012,177 L1028,177 L1028,185 L1040,185 L1116,185 L1116,75 L1110,75 L1160,29 L1210,75 L1204,75 L1204,185 L1204,177 L1220,177 L1220,185 L1232,185 L1232,177 L1248,177 L1248,185 L1260,185 L1260,177 L1276,177 L1276,185 L1288,185 L1288,177 L1304,177 L1304,185 L1316,185 L1316,177 L1332,177 L1332,185 L1344,185 L1344,177 L1360,177 L1360,185 L1372,185 L1372,177 L1388,177 L1388,185 L1400,185 L1400,177 L1416,177 L1416,185 L1428,185 L1428,177 L1444,177 L1444,185 L1440,185 L1440,205 L1440,240 Z";

function CastleSkyline() {
  return (
    <svg
      viewBox="0 0 1440 240"
      preserveAspectRatio="none"
      className="absolute bottom-0 left-0 w-full h-32 sm:h-44 md:h-52"
      style={{ opacity: 0.9 }}
    >
      <path d={CASTLE_SKYLINE_PATH} fill="hsl(258 45% 7%)" stroke="hsl(266 70% 45% / 0.5)" strokeWidth="1.5" />
    </svg>
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

// Posicoes fixas (nao Math.random em cada render) das estrelas do fundo.
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
