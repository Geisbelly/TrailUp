import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Hexagon, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import heroBg from "@/assets/hero-bg.jpg";
import trailupLogo from "@/assets/trailup-logo.png";
import GradientBlobs from "@/components/GradientBlobs";
import { HallBackground, OrnamentDivider } from "@/components/HallOrnaments";

// Brasas flutuantes: posicao/tamanho/duracao pre-computados (sem estado, sem
// Math.random em cada render) para o efeito de fagulha subindo no fundo do Hero.
const EMBERS = [
  { left: "8%", size: 3, duration: 7, delay: 0, drift: 14 },
  { left: "18%", size: 2, duration: 9, delay: 1.4, drift: -10 },
  { left: "27%", size: 4, duration: 6.5, delay: 2.8, drift: 8 },
  { left: "39%", size: 2, duration: 8.2, delay: 0.6, drift: -16 },
  { left: "52%", size: 3, duration: 7.6, delay: 3.4, drift: 10 },
  { left: "64%", size: 2, duration: 9.4, delay: 1.9, drift: -8 },
  { left: "73%", size: 4, duration: 6.8, delay: 0.2, drift: 12 },
  { left: "84%", size: 3, duration: 8.6, delay: 2.3, drift: -14 },
  { left: "92%", size: 2, duration: 7.2, delay: 4.1, drift: 6 },
];

const Hero = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = sectionRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: px, y: py });
  };

  return (
    <section
      ref={sectionRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      className="relative min-h-screen flex items-center justify-center overflow-hidden pt-24 pb-16"
    >
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <img
          src={heroBg}
          alt=""
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/80 to-background" />
        <HallBackground accent="hsl(266 95% 66%)" />
      </div>

      <GradientBlobs preset="corners" />

      {/* Glow arcano pulsante atras do titulo */}
      <div
        className="absolute top-1/2 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[36rem] h-[36rem] rounded-full pointer-events-none animate-pulse-slow"
        style={{ background: "radial-gradient(circle, hsl(var(--glow-primary) / 0.3) 0%, transparent 70%)" }}
      />

      {/* Brasas flutuantes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {EMBERS.map((ember, i) => (
          <span
            key={i}
            className="absolute bottom-0 rounded-full animate-ember"
            style={{
              left: ember.left,
              width: ember.size,
              height: ember.size,
              backgroundColor: "hsl(var(--accent))",
              boxShadow: "0 0 6px hsl(var(--accent) / 0.9)",
              animationDuration: `${ember.duration}s`,
              animationDelay: `${ember.delay}s`,
              // @ts-expect-error custom property lido pela keyframe .animate-ember
              "--ember-drift": `${ember.drift}px`,
            }}
          />
        ))}
      </div>

      {/* Floating Hexagons */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <Hexagon className="absolute top-20 left-10 w-16 h-16 text-primary/20 animate-float" style={{ animationDelay: "0s" }} />
        <Hexagon className="absolute top-40 right-20 w-12 h-12 text-accent/20 animate-float" style={{ animationDelay: "1s" }} />
        <Hexagon className="absolute bottom-32 left-1/4 w-20 h-20 text-primary/10 animate-float" style={{ animationDelay: "2s" }} />
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 z-10">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
          {/* Texto — alinhado a esquerda */}
          <div className="space-y-7 text-center lg:text-left">
            <div
              className="fade-up-in inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary"
              style={{ animationDelay: "0s" }}
            >
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">Um grimório vivo, moldado ao seu perfil</span>
            </div>

            <h1
              className="fade-up-in font-display text-5xl md:text-6xl xl:text-7xl font-bold leading-[1.15]"
              style={{ animationDelay: "0.1s" }}
            >
              Sua trilha,
              <span className="block pb-2 bg-gradient-to-r from-primary via-accent to-primary-light bg-clip-text text-transparent">
                seu guia, sua lenda
              </span>
            </h1>

            <p
              className="fade-up-in text-lg md:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0"
              style={{ animationDelay: "0.2s" }}
            >
              O TrailUp reescreve cada tópico como um grimório sob medida para o seu perfil de jogador, narrado por um guia que fala a sua língua. Desbloqueie trilhas, enfrente desafios e domine o conhecimento no seu próprio ritmo.
            </p>

            <div
              className="fade-up-in flex flex-col sm:flex-row gap-4 justify-center lg:justify-start items-center pt-2"
              style={{ animationDelay: "0.3s" }}
            >
              <Link to="/cadastro-aluno">
                <Button size="lg" className="gradient-primary text-lg px-8 py-6 animate-glow">
                  Sou aluno, quero iniciar minha jornada!
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="outline" className="text-lg px-8 py-6">
                  Sou professor, já tenho conta
                </Button>
              </Link>
            </div>
            <p
              className="fade-up-in text-sm text-muted-foreground"
              style={{ animationDelay: "0.35s" }}
            >
              É professor e ainda não tem conta?{" "}
              <Link to="/cadastro-professor" className="text-primary hover:underline">
                Cadastre-se aqui
              </Link>
            </p>

            <div
              className="fade-up-in max-w-md mx-auto lg:mx-0"
              style={{ animationDelay: "0.4s" }}
            >
              <OrnamentDivider color="hsl(var(--primary))" />
            </div>

            {/* Stats */}
            <div
              className="fade-up-in grid grid-cols-3 gap-8 max-w-md mx-auto lg:mx-0"
              style={{ animationDelay: "0.45s" }}
            >
              <div>
                <div className="text-3xl md:text-4xl font-bold text-primary">7</div>
                <div className="text-sm text-muted-foreground mt-1">Guias e perfis únicos</div>
              </div>
              <div>
                <div className="text-3xl md:text-4xl font-bold text-accent">100%</div>
                <div className="text-sm text-muted-foreground mt-1">Personalizado</div>
              </div>
              <div>
                <div className="text-3xl md:text-4xl font-bold text-primary">∞</div>
                <div className="text-sm text-muted-foreground mt-1">Trilhas a explorar</div>
              </div>
            </div>
          </div>

          {/* Guardiao em destaque — glow em camadas + leve parallax pelo mouse */}
          <div
            className="fade-up-in relative hidden lg:flex items-center justify-center h-[36rem]"
            style={{ animationDelay: "0.25s" }}
          >
            <div
              className="absolute w-[26rem] h-[26rem] rounded-full transition-transform duration-300 ease-out"
              style={{
                background: "radial-gradient(circle, hsl(var(--primary) / 0.45), transparent 70%)",
                filter: "blur(30px)",
                transform: `translate(${tilt.x * 14}px, ${tilt.y * 14}px)`,
              }}
            />
            <div
              className="absolute w-[20rem] h-[20rem] rounded-full border border-primary/25 animate-pulse-slow transition-transform duration-300 ease-out"
              style={{ transform: `translate(${tilt.x * 8}px, ${tilt.y * 8}px)` }}
            />
            <div
              className="absolute w-[15rem] h-[15rem] rounded-full border border-accent/30 transition-transform duration-300 ease-out"
              style={{ transform: `translate(${tilt.x * 5}px, ${tilt.y * 5}px)` }}
            />
            {/* Simbolo oficial (nao um guardiao especifico) — o Hero e um
                espaco neutro antes do aluno escolher/descobrir seu perfil;
                usar um dos 7 guias aqui favoreceria esse perfil sobre os
                outros, o mesmo motivo pelo qual o site nao usa a cor de um
                perfil especifico como primary (ver CLAUDE.md). Os 7 guardioes
                aparecem, sem favoritismo, na secao "Os Guardioes da Trilha". */}
            <img
              src={trailupLogo}
              alt="TrailUp"
              className="relative w-40 md:w-56 h-auto object-contain animate-float select-none transition-transform duration-300 ease-out"
              style={{
                filter: "drop-shadow(0 0 55px hsl(var(--primary) / 0.6))",
                transform: `translate(${tilt.x * -10}px, ${tilt.y * -10}px)`,
              }}
              draggable={false}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
