import { Button } from "@/components/ui/button";
import { Hexagon, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import heroBg from "@/assets/hero-bg.jpg";

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
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary mb-4">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">Aprendizado Personalizado e Gamificado</span>
          </div>

          {/* Title */}
          <h1 className="text-5xl md:text-7xl font-bold leading-tight">
            Sua jornada de
            <span className="block bg-gradient-to-r from-primary via-accent to-primary-light bg-clip-text text-transparent">
              aprendizado começa aqui
            </span>
          </h1>

          {/* Description */}
          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
            TrailUp adapta seu aprendizado ao seu perfil único. Conquiste missões, desbloqueie conquistas e domine o conhecimento no seu próprio ritmo.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
            <Link to="/cadastro-aluno">
              <Button size="lg" className="gradient-primary text-lg px-8 py-6 animate-glow">
                Sou aluno, quero começar!
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline" className="text-lg px-8 py-6">
                Sou professor, já tenho conta
              </Button>
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            É professor e ainda não tem conta?{" "}
            <Link to="/cadastro-professor" className="text-primary hover:underline">
              Cadastre-se aqui
            </Link>
          </p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 pt-12 max-w-2xl mx-auto">
            <div>
              <div className="text-3xl md:text-4xl font-bold text-primary">7</div>
              <div className="text-sm text-muted-foreground mt-1">Perfis de Jogador</div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-bold text-accent">100%</div>
              <div className="text-sm text-muted-foreground mt-1">Personalizado</div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-bold text-primary">∞</div>
              <div className="text-sm text-muted-foreground mt-1">Possibilidades</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
