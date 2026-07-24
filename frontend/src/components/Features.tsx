import { Card } from "@/components/ui/card";
import { Trophy, Target, Zap, Users, Brain, Star, Map } from "lucide-react";

const FEATURES = [
  {
    icon: Brain,
    title: "Perfil BrainHex",
    description: "Descubra qual guia fala a sua língua através de um questionário científico. Seeker, Conqueror, Achiever e mais — cada perfil com seu tom, ritmo e narrativa.",
    color: "text-primary",
  },
  {
    icon: Map,
    title: "Trilhas Personalizadas",
    description: "Cada tópico vira um grimório sob medida para você. Desbloqueie trilhas de acordo com seu progresso e preferências.",
    color: "text-accent",
  },
  {
    icon: Trophy,
    title: "Rankings Dinâmicos",
    description: "Meça sua evolução contra colegas de turma, instituição e desafios. Prove seu valor na tabela de honra.",
    color: "text-warning",
  },
  {
    icon: Target,
    title: "Missões e Conquistas",
    description: "Enfrente desafios, ganhe insígnias e conquiste recompensas exclusivas ao dominar cada conteúdo.",
    color: "text-success",
  },
  {
    icon: Zap,
    title: "Adaptação em Tempo Real",
    description: "Seu guia ajusta a dificuldade e o ritmo da narrativa conforme seu desempenho e modo de estudo preferido.",
    color: "text-primary",
  },
  {
    icon: Star,
    title: "Recompensas Imediatas",
    description: "Feedback instantâneo e recompensas que te motivam a seguir na jornada.",
    color: "text-accent",
  },
  {
    icon: Users,
    title: "Aprendizado Social",
    description: "Una-se a colegas, forme grupos de estudo e compartilhe conquistas na sua trilha.",
    color: "text-info",
  },
];

const Features = () => {
  return (
    <section className="py-24 px-4">
      <div className="container mx-auto">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Por que escolher o{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              TrailUp?
            </span>
          </h2>
          <p className="text-xl text-muted-foreground">
            Uma plataforma que transforma cada tópico em uma jornada narrada sob medida para o seu perfil
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Card
                key={index}
                className="p-6 bg-card/50 backdrop-blur border-primary/20 hover:border-primary/40 transition-all duration-300 hover:scale-105 group"
              >
                <div className={`w-12 h-12 rounded-lg bg-gradient-to-br from-${feature.color}/20 to-transparent flex items-center justify-center mb-4 group-hover:glow-primary transition-all`}>
                  <Icon className={`w-6 h-6 ${feature.color}`} />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Features;
