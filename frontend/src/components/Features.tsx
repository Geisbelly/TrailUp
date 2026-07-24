import { Card } from "@/components/ui/card";
import { Compass, Map, Crown, Sword, Shield, Box, Drama } from "lucide-react";
import { useInView } from "@/hooks/useInView";

// Icones trocados pelos icones reais dos 7 perfis BrainHex (fonte:
// microservice/src/constants/brainHex.ts) para refletir a identidade visual
// que o app realmente usa, em vez de icones genericos.
const FEATURES = [
  {
    icon: Compass,
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
    icon: Crown,
    title: "Rankings Dinâmicos",
    description: "Meça sua evolução contra colegas de turma, instituição e desafios. Prove seu valor na tabela de honra.",
    color: "text-warning",
  },
  {
    icon: Sword,
    title: "Missões e Conquistas",
    description: "Enfrente desafios, ganhe insígnias e conquiste recompensas exclusivas ao dominar cada conteúdo.",
    color: "text-success",
  },
  {
    icon: Shield,
    title: "Adaptação em Tempo Real",
    description: "Seu guia ajusta a dificuldade e o ritmo da narrativa conforme seu desempenho e modo de estudo preferido.",
    color: "text-primary",
  },
  {
    icon: Box,
    title: "Recompensas Imediatas",
    description: "Feedback instantâneo e recompensas que te motivam a seguir na jornada.",
    color: "text-accent",
  },
  {
    icon: Drama,
    title: "Aprendizado Social",
    description: "Una-se a colegas, forme grupos de estudo e compartilhe conquistas na sua trilha.",
    color: "text-info",
  },
];

const Features = () => {
  const header = useInView<HTMLDivElement>(0.4);

  return (
    <section className="py-24 px-4">
      <div className="container mx-auto">
        {/* Section Header */}
        <div
          ref={header.ref}
          className={`reveal ${header.inView ? "reveal-in" : ""} text-center max-w-3xl mx-auto mb-16`}
        >
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
          {FEATURES.map((feature, index) => (
            <FeatureCard key={index} feature={feature} delay={(index % 3) * 0.08} />
          ))}
        </div>
      </div>
    </section>
  );
};

function FeatureCard({
  feature,
  delay,
}: {
  feature: (typeof FEATURES)[number];
  delay: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const Icon = feature.icon;
  return (
    <div
      ref={ref}
      className={`reveal ${inView ? "reveal-in" : ""}`}
      style={{ transitionDelay: inView ? `${delay}s` : "0s" }}
    >
      <Card className="p-6 bg-card/50 backdrop-blur border-primary/20 hover:border-primary/40 transition-all duration-300 hover:scale-105 group h-full">
        <div className={`w-12 h-12 rounded-lg bg-gradient-to-br from-${feature.color}/20 to-transparent flex items-center justify-center mb-4 group-hover:glow-primary transition-all`}>
          <Icon className={`w-6 h-6 ${feature.color}`} />
        </div>
        <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
        <p className="text-muted-foreground">{feature.description}</p>
      </Card>
    </div>
  );
}

export default Features;
