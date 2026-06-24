import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { 
  Hexagon, Target, Users, Zap, Sparkles, BookOpen, 
  Lightbulb, Rocket, GraduationCap, BrainCircuit 
} from "lucide-react";
import { cn } from "@/lib/utils";

// PARA SEU PROJETO: Descomente as importações reais
import Header from "@/components/Header";
import Footer from "@/components/Footer";



const Sobre = () => {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col overflow-x-hidden selection:bg-primary/30 relative">
      
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-primary/10 blur-[120px] rounded-full opacity-40 animate-pulse duration-[4000ms]" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[500px] bg-purple-500/5 blur-[100px] rounded-full opacity-30" />
      </div>

      <Header />

      {/* Main Content */}
      <main className="relative z-10 pt-28 pb-20 px-4 flex-grow">
        
        {/* Hero Section */}
        <section className="container mx-auto text-center max-w-4xl mb-24 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="inline-flex items-center justify-center px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-medium uppercase tracking-wider mb-6 shadow-[0_0_15px_-3px_rgba(124,58,237,0.2)]">
            <Sparkles className="w-3 h-3 mr-2" />
            Nossa Essência
          </div>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 tracking-tight text-foreground leading-tight">
            Sobre o <span className="bg-gradient-to-r from-primary via-purple-400 to-primary bg-clip-text text-transparent animate-gradient bg-[length:200%_auto]">TrailUp</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Transformando a educação universitária através de gamificação inteligente, personalização científica e design centrado no aluno.
          </p>
        </section>

        {/* Mission Section - Featured Card */}
        <section className="container mx-auto max-w-5xl mb-24 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-purple-600/20 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-500" />
            <Card className="relative p-8 md:p-12 border-border/50 bg-card/60 backdrop-blur-xl overflow-hidden rounded-2xl">
              <div className="grid md:grid-cols-2 gap-12 items-center">
                <div className="space-y-6">
                  <div className="inline-flex p-3 rounded-xl bg-primary/10 text-primary mb-2">
                    <Rocket className="w-8 h-8" />
                  </div>
                  <h2 className="text-3xl font-bold text-foreground">Nossa Missão</h2>
                  <p className="text-muted-foreground text-lg leading-relaxed">
                    O TrailUp nasceu com o objetivo de revolucionar a forma como universitários aprendem. 
                    Acreditamos que cada estudante é único e merece uma experiência de aprendizado personalizada 
                    que respeite suas preferências, motivações e estilo cognitivo.
                  </p>
                </div>
                <div className="relative h-full min-h-[200px] rounded-xl bg-gradient-to-br from-card to-background border border-border/50 flex items-center justify-center p-8 group-hover:scale-[1.02] transition-transform duration-500">
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:16px_16px] opacity-50" />
                  <div className="text-center relative z-10 space-y-2">
                    <GraduationCap className="w-16 h-16 text-primary mx-auto mb-4 opacity-80" />
                    <p className="text-2xl font-bold text-foreground">Educação Adaptativa</p>
                    <p className="text-sm text-muted-foreground">Focada no indivíduo</p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* Values Grid */}
        <section className="container mx-auto mb-24">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-4">Nossos Valores</h2>
            <p className="text-muted-foreground">Os pilares que sustentam nossa plataforma</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {[
              { 
                icon: Target, 
                title: "Personalização", 
                desc: "Cada aluno recebe uma trilha adaptada ao seu perfil único de aprendizado.",
                color: "text-emerald-500",
                bg: "bg-emerald-500/10"
              },
              { 
                icon: Zap, 
                title: "Engajamento", 
                desc: "Gamificação inteligente que realmente motiva e mantém o interesse.",
                color: "text-amber-500",
                bg: "bg-amber-500/10"
              },
              { 
                icon: Users, 
                title: "Comunidade", 
                desc: "Construímos uma comunidade de aprendizado colaborativo e suporte mútuo.",
                color: "text-blue-500",
                bg: "bg-blue-500/10"
              }
            ].map((item, index) => (
              <Card 
                key={index}
                className="group p-8 border-border/50 bg-card/40 backdrop-blur-sm hover:bg-card/60 hover:border-primary/20 transition-all duration-300 hover:-translate-y-1"
              >
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110", item.bg)}>
                  <item.icon className={cn("w-7 h-7", item.color)} />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-3 group-hover:text-primary transition-colors">
                  {item.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed text-sm">
                  {item.desc}
                </p>
              </Card>
            ))}
          </div>
        </section>

        {/* Story & Tech Sections */}
        <section className="container mx-auto max-w-5xl space-y-12 mb-12">
          
          {/* Story */}
          <div className="grid md:grid-cols-[1fr_2fr] gap-8 p-8 rounded-3xl bg-card/20 border border-border/50 backdrop-blur-sm hover:bg-card/40 transition-colors">
            <div className="flex flex-col justify-center">
              <div className="inline-flex p-3 rounded-xl bg-primary/10 text-primary w-fit mb-4">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-2">Nossa História</h3>
              <div className="h-1 w-12 bg-primary rounded-full" />
            </div>
            <div className="space-y-4 text-muted-foreground text-lg leading-relaxed">
              <p>
                O TrailUp começou como um projeto de TCC com o objetivo de investigar como a gamificação e a personalização poderiam melhorar o engajamento de estudantes universitários.
              </p>
              <p>
                Após extensiva pesquisa bibliográfica e prototipagem, adaptamos o modelo <span className="text-primary font-medium">BrainHex</span> para o contexto educacional. O resultado foi surpreendente: alunos relataram maior motivação e satisfação.
              </p>
            </div>
          </div>

          {/* Technology */}
          <div className="grid md:grid-cols-[2fr_1fr] gap-8 p-8 rounded-3xl bg-card/20 border border-border/50 backdrop-blur-sm hover:bg-card/40 transition-colors">
            <div className="space-y-6 order-2 md:order-1">
              <p className="text-muted-foreground text-lg leading-relaxed">
                O TrailUp é fundamentado em pesquisa científica sólida e utiliza tecnologias de ponta para oferecer a melhor experiência possível:
              </p>
              <ul className="grid sm:grid-cols-2 gap-3">
                {[
                  "Modelo BrainHex Adaptado",
                  "Algoritmos de Personalização",
                  "Gamificação Intrínseca",
                  "Analytics de Progresso",
                  "Design Acessível",
                  "Inteligência Artificial"
                ].map((tech, i) => (
                  <li key={i} className="flex items-center gap-2 text-muted-foreground text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    {tech}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col justify-center items-end text-right order-1 md:order-2">
              <div className="inline-flex p-3 rounded-xl bg-purple-500/10 text-purple-500 w-fit mb-4">
                <BrainCircuit className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-2">Tecnologia e Ciência</h3>
              <div className="h-1 w-12 bg-purple-500 rounded-full" />
            </div>
          </div>

        </section>

      </main>

      <Footer />
    </div>
  );
};

export default Sobre;