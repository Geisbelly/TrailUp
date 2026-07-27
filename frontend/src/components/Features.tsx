import { Card } from "@/components/ui/card";
import { Compass, Map, Crown, Sword, Shield, Box, Drama } from "lucide-react";
import { useInView } from "@/hooks/useInView";
import GradientBlobs from "@/components/GradientBlobs";

// Icones trocados pelos icones reais dos 7 perfis BrainHex (fonte:
// microservice/src/constants/brainHex.ts) para refletir a identidade visual
// que o app realmente usa, em vez de icones genericos.
const FEATURES = [
  {
    icon: Compass,
    title: "Desperte seu Guardião",
    description:
      "Antes da jornada começar, o TrailUp identifica seu perfil BrainHex e desperta um dos sete Guardiões da Trilha. Cada mentor possui uma personalidade, uma forma única de ensinar e uma maneira própria de desafiar você.",
    color: "primary",
  },
  {
    icon: Map,
    title: "Trilhas que Evoluem",
    description:
      "Os conteúdos deixam de ser capítulos soltos e passam a formar uma aventura contínua. Cada conquista desbloqueia novos caminhos, desafios e conhecimentos.",
    color: "accent",
  },
  {
    icon: Sword,
    title: "Missões e Relíquias",
    description:
      "Aprender rende recompensas. Complete desafios, conquiste insígnias lendárias e monte sua coleção de conquistas ao longo da jornada.",
    color: "warning",
  },
  {
    icon: Shield,
    title: "Um Grimório Vivo",
    description:
      "Seu guia adapta a narrativa, a dificuldade e o ritmo conforme você evolui. O conhecimento cresce junto com você.",
    color: "success",
  },
  {
    icon: Crown,
    title: "Arena dos Estudantes",
    description:
      "Compare sua evolução com colegas, dispute posições nos rankings e mostre que sua dedicação merece um lugar entre os maiores aventureiros.",
    color: "primary",
  },
  {
    icon: Drama,
    title: "Guildas e Companheiros",
    description:
      "Nenhuma grande aventura acontece sozinho. Forme grupos, compartilhe descobertas e avance lado a lado com outros exploradores.",
    color: "accent",
  },
  {
    icon: Box,
    title: "Uma Jornada Infinita",
    description:
      "Sempre existe uma nova trilha para explorar, uma missão para cumprir e um desafio esperando pelo próximo passo da sua história.",
    color: "info",
  },
];

const Features = () => {
  const header = useInView<HTMLDivElement>(0.4);

  return (
    <section className="py-24 px-4 relative overflow-hidden">
      <GradientBlobs preset="top-center" />
      <div className="container mx-auto relative z-10">
        {/* Section Header */}
        <div
          ref={header.ref}
          className={`reveal ${header.inView ? "reveal-in" : ""} text-center max-w-3xl mx-auto mb-16`}
        >
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-4 leading-[1.2] pb-1">
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
