import { ExternalLink, FileDown } from "lucide-react";
import { PublicLayout, PublicPageTitle } from "@/components/PublicLayout";
import { DESIGN_ART } from "@/lib/design-art";
import VideoDoSite from "@/components/VideoDoSite";

const DOWNLOAD_CONFIG = {
  playStoreUrl: "https://play.google.com/apps/test/com.seuprojeto.trailup/20",
  // Release PÚBLICO no espelho: o brainhex-navigator é privado e o link de lá dava 404 sem login.
  // A versão daqui não pode ficar abaixo de `app_config.app_versao_minima` (hoje 1.0.8), senão
  // quem instala por este link cai direto na tela de atualizar.
  apkUrl: "https://github.com/Geisbelly/TrailUp/releases/download/app-v1.0.11/trailup_1_0_11.apk",
  aabUrl: "https://github.com/Geisbelly/TrailUp/releases/download/app-v1.0.11/trailup_1_0_11.aab",
};

export default function Download() {
  return (
    <PublicLayout scene={DESIGN_ART.lanterns}>
      <div className="download-identity"><img src={DESIGN_ART.star} alt="" width="80" height="80" /></div>
      <PublicPageTitle title="TrailUp para Android" eyebrow="Leve sua jornada com você">Suas trilhas, descobertas e conquistas, onde você estiver.</PublicPageTitle>
      <div className="download-options">
        <section className="download-option"><div><h2>Google Play</h2><p>Acesse a versão de teste disponível na loja.</p></div><a className="journey-button journey-button-coral" href={DOWNLOAD_CONFIG.playStoreUrl} target="_blank" rel="noopener noreferrer">Abrir Google Play <ExternalLink size={18} /></a></section>
        <section className="download-option"><div><h2>Instalador Android</h2><p>Versão beta em formato APK.</p></div><a className="journey-button" href={DOWNLOAD_CONFIG.apkUrl} download><FileDown size={18} />Baixar APK</a></section>
        <section className="download-option"><div><h2>Android App Bundle</h2><p>Pacote AAB para distribuição.</p></div><a className="journey-link" href={DOWNLOAD_CONFIG.aabUrl} download><FileDown size={18} />Baixar AAB</a></section>
      </div>
      <section className="public-band text-center" aria-labelledby="primeiro-acesso-titulo">
        <h2 id="primeiro-acesso-titulo">Depois de instalar</h2>
        <p className="mx-auto mb-6 max-w-2xl">Confirme o e-mail, responda ao questionário de preferências e complete o perfil. Depois disso, a trilha introdutória já abre.</p>
        <VideoDoSite slug="guia" />
      </section>
    </PublicLayout>
  );
}
