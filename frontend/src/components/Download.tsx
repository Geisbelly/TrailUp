import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Smartphone, Download as DownloadIcon, ExternalLink, FileDown } from "lucide-react";
import appMockup from "@/assets/app-mockup.png";

// Configurações de download - altere os links conforme necessário
const DOWNLOAD_CONFIG = {
  playStoreUrl: "https://play.google.com/apps/test/com.seuprojeto.trailup/20", // Ex: "https://play.google.com/store/apps/details?id=com.trailup.app"
  apkUrl: "https://github.com/geisbelly/brainhex-navigator/releases/download/APK_AAB/trailup_1_0_2.apk", // URL do arquivo APK para download direto
  aabUrl: "https://github.com/geisbelly/brainhex-navigator/releases/download/APK_AAB/trailup_1_0_2.aab", // URL do arquivo AAB para download direto
};

const Download = () => {
  const hasPlayStore = !!DOWNLOAD_CONFIG.playStoreUrl;
  const hasApk = !!DOWNLOAD_CONFIG.apkUrl;
  const hasAab = !!DOWNLOAD_CONFIG.aabUrl;
  const hasAnyDownload = hasPlayStore || hasApk || hasAab;

  return (
    <section className="py-24 px-4 relative overflow-hidden">
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />
      
      <div className="container mx-auto relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary">
              <Smartphone className="w-4 h-4" />
              <span className="text-sm font-medium">Disponível para Android</span>
            </div>

            <h2 className="text-4xl md:text-5xl font-bold">
              Leve seu aprendizado
              <span className="block bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                para qualquer lugar
              </span>
            </h2>

            <p className="text-xl text-muted-foreground">
              Baixe o app TrailUp e tenha acesso completo às suas trilhas de aprendizado, missões e conquistas na palma da sua mão.
            </p>

            {/* Features List */}
            <div className="space-y-4 pt-4">
              {[
                "Sincronização automática em todos os dispositivos",
                "Notificações inteligentes de lembretes",
                "Acesso offline ao conteúdo baixado",
                "Interface otimizada para mobile",
              ].map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                  </div>
                  <span className="text-foreground">{feature}</span>
                </div>
              ))}
            </div>

            {/* Download Options */}
            <div className="space-y-4 pt-6">
              {/* Play Store - Principal */}
              {hasPlayStore ? (
                <a href={DOWNLOAD_CONFIG.playStoreUrl} target="_blank" rel="noopener noreferrer">
                  <Button size="lg" className="w-full sm:w-auto gradient-primary gap-3">
                    <img 
                      src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Google_Play_2016_icon.svg/512px-Google_Play_2016_icon.svg.png?20190913154302" 
                      alt="Google Play" 
                      className="w-5 h-5"
                    />
                    Baixar na Play Store
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </a>
              ) : (
                <Card className="p-4 border-dashed border-2 border-muted-foreground/30 bg-muted/20">
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Smartphone className="w-5 h-5" />
                    <span className="text-sm">Link da Play Store será adicionado em breve</span>
                  </div>
                </Card>
              )}

              {/* Download direto - APK/AAB */}
              <div className="flex flex-col sm:flex-row gap-3">
                {hasApk ? (
                  <a href={DOWNLOAD_CONFIG.apkUrl} download>
                    <Button size="lg" variant="outline" className="w-full gap-2">
                      <FileDown className="w-5 h-5" />
                      Baixar APK
                    </Button>
                  </a>
                ) : (
                  <Button size="lg" variant="outline" className="gap-2" disabled>
                    <FileDown className="w-5 h-5" />
                    APK em breve
                  </Button>
                )}

                {hasAab ? (
                  <a href={DOWNLOAD_CONFIG.aabUrl} download>
                    <Button size="lg" variant="outline" className="w-full gap-2">
                      <FileDown className="w-5 h-5" />
                      Baixar AAB
                    </Button>
                  </a>
                ) : (
                  <Button size="lg" variant="outline" className="gap-2" disabled>
                    <FileDown className="w-5 h-5" />
                    AAB em breve
                  </Button>
                )}
              </div>

              {/* Info sobre os formatos */}
              <p className="text-xs text-muted-foreground">
                <strong>APK:</strong> Instale diretamente no seu dispositivo Android. 
                <strong className="ml-2">AAB:</strong> Formato para desenvolvedores e publicação na Play Store.
              </p>
            </div>
          </div>

          {/* Right Content - App Mockup */}
          <div className="relative flex justify-center lg:justify-end">
            <div className="relative animate-float">
              <img
                src={appMockup}
                alt="TrailUp App Interface"
                className="w-full max-w-sm drop-shadow-2xl"
              />
              {/* Glow Effect */}
              <div className="absolute inset-0 bg-gradient-to-t from-primary/30 to-transparent blur-3xl -z-10" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Download;
