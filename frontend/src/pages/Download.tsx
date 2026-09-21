import { ExternalLink, FileDown } from "lucide-react";
import { PublicLayout, PublicPageTitle } from "@/components/PublicLayout";
import { DESIGN_ART } from "@/lib/design-art";

const DOWNLOAD_CONFIG = {
  playStoreUrl: "https://play.google.com/apps/test/com.seuprojeto.trailup/20",
  apkUrl: "https://github.com/geisbelly/brainhex-navigator/releases/download/APK_AAB/trailup_1_0_2.apk",
  aabUrl: "https://github.com/geisbelly/brainhex-navigator/releases/download/APK_AAB/trailup_1_0_2.aab",
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
    </PublicLayout>
  );
}
