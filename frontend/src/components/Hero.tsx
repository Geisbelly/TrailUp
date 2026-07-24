import { Button } from "@/components/ui/button";
import { Hexagon, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import heroBg from "@/assets/hero-bg.jpg";

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

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay, ease: "easeOut" as const },
  }),
};

const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <img
          src={heroBg}
          alt=""
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/80 to-background" />
      </div>

      {/* Glow arcano pulsante atras do titulo */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[36rem] h-[36rem] rounded-full pointer-events-none animate-pulse-slow"
        style={{ background: "radial-gradient(circle, hsl(var(--glow-primary) / 0.35) 0%, transparent 70%)" }}
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
        <Hexagon className="absolute bottom-20 right-1/3 w-14 h-14 text-accent/15 animate-float" style={{ animationDelay: "1.5s" }} />
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 z-10 text-center">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Badge */}
          <motion.div
            initial="hidden"
            animate="show"
            custom={0}
            variants={fadeUp}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary mb-4"
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">Um grimório vivo, moldado ao seu perfil</span>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial="hidden"
            animate="show"
            custom={0.1}
            variants={fadeUp}
            className="text-5xl md:text-7xl font-bold leading-tight"
          >
            Sua trilha,
            <span className="block bg-gradient-to-r from-primary via-accent to-primary-light bg-clip-text text-transparent">
              seu guia, sua lenda
            </span>
          </motion.h1>

          {/* Description */}
          <motion.p
            initial="hidden"
            animate="show"
            custom={0.2}
            variants={fadeUp}
            className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto"
          >
            O TrailUp reescreve cada tópico como um grimório sob medida para o seu perfil de jogador, narrado por um guia que fala a sua língua. Desbloqueie trilhas, enfrente desafios e domine o conhecimento no seu próprio ritmo.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial="hidden"
            animate="show"
            custom={0.3}
            variants={fadeUp}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4"
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
          </motion.div>
          <motion.p
            initial="hidden"
            animate="show"
            custom={0.35}
            variants={fadeUp}
            className="text-sm text-muted-foreground"
          >
            É professor e ainda não tem conta?{" "}
            <Link to="/cadastro-professor" className="text-primary hover:underline">
              Cadastre-se aqui
            </Link>
          </motion.p>

          {/* Stats */}
          <motion.div
            initial="hidden"
            animate="show"
            custom={0.45}
            variants={fadeUp}
            className="grid grid-cols-3 gap-8 pt-12 max-w-2xl mx-auto"
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
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
