import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  Smartphone, ExternalLink, FileDown, Hexagon, 
  CheckCircle2, QrCode, WifiOff, Bell, RefreshCw, Layers, Sparkles,
  Trophy, Ghost, Gamepad2, Rocket, Star
} from "lucide-react";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

// PARA SEU PROJETO: Descomente a importação real da imagem e remova a constante abaixo
// import appMockup from "@/assets/app-mockup.png";
const appMockup = "https://placehold.co/400x800/18181b/7c3aed?text=TrailUp+App"; // Placeholder para preview

// Configurações de download
const DOWNLOAD_CONFIG = {
  playStoreUrl: "https://play.google.com/apps/test/com.seuprojeto.trailup/20",
  apkUrl: "https://github.com/geisbelly/brainhex-navigator/releases/download/APK_AAB/trailup_1_0_2.apk",
  aabUrl: "https://github.com/geisbelly/brainhex-navigator/releases/download/APK_AAB/trailup_1_0_2.aab",
};


const Download = () => {
  const hasPlayStore = !!DOWNLOAD_CONFIG.playStoreUrl;
  const hasApk = !!DOWNLOAD_CONFIG.apkUrl;
  const hasAab = !!DOWNLOAD_CONFIG.aabUrl;

  const features = [
    { icon: RefreshCw, title: "Sincronização Real", desc: "Progresso salvo na nuvem instantaneamente." },
    { icon: WifiOff, title: "Modo Offline", desc: "Estude onde estiver, sem depender de internet." },
    { icon: Bell, title: "Notificações Smart", desc: "Lembretes estratégicos para manter sua ofensiva." },
    { icon: Layers, title: "UX Fluida", desc: "Performance nativa otimizada para Android." },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col overflow-x-hidden selection:bg-primary/30 relative">
      
      {/* Background Effects - Mantendo a base do site mas com movimento sutil */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:24px_24px]" />
        
        {/* Orbes de luz (Mesmas cores do tema: Primary/Roxo) */}
        <div className="absolute top-[-10%] right-[-5%] w-[800px] h-[800px] bg-primary/10 blur-[120px] rounded-full opacity-40 animate-pulse duration-[4000ms]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-primary/5 blur-[100px] rounded-full opacity-30 animate-pulse duration-[5000ms] delay-1000" />
        
        {/* Partículas Flutuantes Sutis */}
        <div className="absolute top-1/4 left-10 animate-bounce delay-700 opacity-10"><Hexagon className="w-12 h-12 text-primary" /></div>
        <div className="absolute bottom-1/3 right-10 animate-bounce delay-1000 duration-[3000ms] opacity-10"><Star className="w-8 h-8 text-primary" /></div>
      </div>

      {/* Header (Consistente) */}
        <Header />

      {/* Main Content */}
      <main className="relative z-10 pt-32 pb-20 px-4 flex-grow flex items-center">
        <div className="container mx-auto">
          <div className="grid lg:grid-cols-2 gap-20 items-center max-w-7xl mx-auto">
            
            {/* Left Column: Content */}
            <div className="space-y-12 animate-in fade-in slide-in-from-left-8 duration-700 relative">
              
              <div className="space-y-8 relative z-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary w-fit shadow-[0_0_20px_-5px_rgba(124,58,237,0.2)] backdrop-blur-md cursor-default group">
                  <Smartphone className="w-4 h-4 animate-bounce" />
                  <span className="text-xs font-semibold uppercase tracking-wider group-hover:tracking-widest transition-all">Mobile App Beta</span>
                </div>

                <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-foreground leading-[1.1]">
                  Aprenda <br className="hidden sm:block" />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-purple-400 to-primary animate-gradient bg-[length:200%_auto]">
                    sem limites
                  </span>
                </h1>
                
                <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-xl border-l-2 border-primary/20 pl-6">
                  Leve o <span className="text-foreground font-semibold">TrailUp</span> no bolso. Acesse trilhas personalizadas, cumpra missões diárias e suba no ranking, conectado ou offline.
                </p>
              </div>

              {/* Interactive Features Grid */}
              <div className="grid sm:grid-cols-2 gap-4">
                {features.map((feature, index) => {
                  const Icon = feature.icon;
                  return (
                    <div 
                      key={index} 
                      className="group flex items-start gap-4 p-4 rounded-xl bg-card/30 hover:bg-card/60 border border-border/40 hover:border-primary/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg backdrop-blur-sm relative overflow-hidden"
                    >
                      {/* Efeito de brilho suave ao passar o mouse */}
                      <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-primary/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                      
                      <div className="p-2.5 rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform duration-300 border border-primary/10 relative z-10">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="relative z-10">
                        <h3 className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">{feature.title}</h3>
                        <p className="text-xs text-muted-foreground mt-1 leading-snug">{feature.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* CTAs Area */}
              <div className="space-y-8 pt-6">
                {hasPlayStore ? (
                  <div className="relative group w-full sm:w-auto inline-block">
                    {/* Glow effect behind button */}
                    <div className="absolute -inset-1 bg-gradient-to-r from-primary to-purple-600 rounded-2xl blur opacity-20 group-hover:opacity-50 transition duration-500 animate-pulse" />
                    
                    <a href={DOWNLOAD_CONFIG.playStoreUrl} target="_blank" rel="noopener noreferrer" className="relative block">
                      <Button size="lg" className="w-full sm:w-auto h-20 px-8 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl gap-5 text-left border border-white/10 shadow-xl relative overflow-hidden group-hover:scale-[1.02] transition-all duration-300">
                        
                        {/* Shine Effect */}
                        <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />

                        <div className="relative z-10 bg-black/20 p-2.5 rounded-xl border border-white/10 group-hover:bg-black/30 transition-colors">
                           <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                             <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.5,12.92 20.16,13.19L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z" />
                           </svg>
                        </div>
                        <div className="relative z-10 flex flex-col">
                          <span className="text-[10px] uppercase font-bold opacity-80 tracking-wide">Disponível no</span>
                          <span className="text-xl font-bold leading-none tracking-tight">Google Play</span>
                        </div>
                        <ExternalLink className="w-5 h-5 opacity-60 group-hover:opacity-100 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all ml-2" />
                      </Button>
                    </a>
                  </div>
                ) : (
                  <Card className="inline-flex items-center gap-4 p-4 border-dashed border-border bg-muted/30 rounded-xl">
                    <Smartphone className="w-6 h-6 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-foreground">Em breve</p>
                      <p className="text-xs text-muted-foreground">Aguardando publicação oficial</p>
                    </div>
                  </Card>
                )}

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 border-t border-border/40 pt-6">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wide">Versões Beta:</span>
                  </div>
                  <div className="flex gap-3 w-full sm:w-auto">
                    {hasApk && (
                      <a href={DOWNLOAD_CONFIG.apkUrl} download className="flex-1">
                        <Button variant="outline" size="sm" className="w-full h-10 gap-2 border-border/50 bg-card/50 hover:bg-card hover:text-foreground hover:border-primary/30 transition-all rounded-lg">
                          <FileDown className="w-4 h-4 text-muted-foreground group-hover:text-primary" /> 
                          <span className="text-xs font-mono">.APK</span>
                        </Button>
                      </a>
                    )}
                    {hasAab && (
                      <a href={DOWNLOAD_CONFIG.aabUrl} download className="flex-1">
                        <Button variant="outline" size="sm" className="w-full h-10 gap-2 border-border/50 bg-card/50 hover:bg-card hover:text-foreground hover:border-primary/30 transition-all rounded-lg">
                          <FileDown className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                          <span className="text-xs font-mono">.AAB</span>
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: 3D Phone Presentation */}
            <div className="relative flex justify-center lg:justify-end animate-in fade-in slide-in-from-right-12 duration-1000 delay-200 perspective-1000 group/scene">
              <div className="relative transform-style-3d transition-transform duration-700 ease-out lg:group-hover/scene:rotate-y-6 lg:group-hover/scene:rotate-x-3">
                
                {/* Dynamic Glow Behind Phone (Usando cores do tema) */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[650px] bg-primary/20 blur-[90px] rounded-full opacity-50 group-hover/scene:opacity-70 transition-opacity duration-700 animate-pulse" />
                
                {/* Phone Body */}
                <div className="relative z-10 w-[300px] sm:w-[320px] rounded-[3.5rem] border-[8px] border-zinc-900 bg-black shadow-2xl overflow-hidden ring-1 ring-white/10 rotate-[-3deg] group-hover/scene:rotate-0 transition-transform duration-700 ease-out shadow-black/80">
                  {/* Glossy Reflection */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent z-30 pointer-events-none rounded-[3rem]" />
                  
                  {/* Notch */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-7 bg-zinc-900 rounded-b-2xl z-20" />
                  
                  {/* Screen Content */}
                  <div className="aspect-[9/19] bg-zinc-900 relative group-hover/scene:scale-105 transition-transform duration-700 origin-center">
                    <img
                      src={appMockup}
                      alt="TrailUp App Interface"
                      className="w-full h-full object-cover opacity-90 transition-opacity group-hover/scene:opacity-100"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                  </div>
                </div>

                {/* Floating "Personagens" e Elementos de Jogo (Cores ajustadas ao tema) */}
                
                {/* 1. Troféu - Gamificação (Com fundo escuro e borda sutil) */}
                <Card className="absolute top-16 -left-16 z-20 p-4 bg-card/90 border-border/50 backdrop-blur-xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] animate-float hidden sm:flex items-center gap-4 rounded-2xl border ring-1 ring-white/5 hover:scale-110 transition-transform cursor-default">
                  <div className="bg-primary/10 p-2.5 rounded-xl border border-primary/20">
                    <Trophy className="w-6 h-6 text-primary drop-shadow-[0_0_8px_rgba(124,58,237,0.3)]" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Novo Ranking</p>
                    <p className="text-lg font-black text-foreground leading-none mt-0.5 tracking-tight">Top #1</p>
                  </div>
                </Card>

                {/* 2. Fantasminha - Elemento Lúdico (Cor Primária) */}
                <div className="absolute top-1/2 -right-12 z-20 animate-float-delayed hidden sm:block">
                   <div className="relative group/ghost">
                      <div className="absolute inset-0 bg-primary/30 blur-xl rounded-full opacity-40 group-hover/ghost:opacity-60 transition-opacity" />
                      <div className="relative bg-card p-3 rounded-2xl border border-primary/30 shadow-xl rotate-12 group-hover/ghost:rotate-0 transition-transform duration-300">
                        <Ghost className="w-8 h-8 text-primary fill-primary/10" />
                      </div>
                   </div>
                </div>

                {/* 3. Controle de Jogo (Decorativo no fundo) */}
                <div className="absolute bottom-60 -left-10 z-0 opacity-20 animate-pulse hidden sm:block pointer-events-none">
                   <Gamepad2 className="w-24 h-24 text-muted-foreground rotate-[-15deg]" />
                </div>

                {/* 4. Card QR Code */}
                <Card className="absolute bottom-32 -right-8 z-20 p-4 bg-card/90 border-border/50 backdrop-blur-xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] animate-float-delayed hidden sm:flex items-center gap-4 rounded-2xl border ring-1 ring-white/5 hover:scale-105 transition-transform cursor-default">
                  <div className="bg-primary/20 p-2.5 rounded-xl border border-primary/20">
                    <QrCode className="w-6 h-6 text-primary drop-shadow-[0_0_8px_rgba(124,58,237,0.5)]" />
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Acesso Rápido</p>
                    <p className="text-lg font-black text-foreground leading-none mt-0.5 tracking-tight">Login QR</p>
                  </div>
                </Card>

                {/* Foguete subindo (Progresso - Emerald para sucesso) */}
                <div className="absolute -top-10 right-10 z-0 animate-bounce duration-[3000ms] hidden sm:block opacity-60">
                   <Rocket className="w-10 h-10 text-emerald-500/70 rotate-45" />
                </div>

              </div>
            </div>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Download;