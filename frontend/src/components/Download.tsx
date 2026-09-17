import { ArrowRight, Smartphone } from "lucide-react";
import { Link } from "react-router-dom";
import { DESIGN_ART } from "@/lib/design-art";

export default function Download() {
  return (
    <section className="journey-download" id="download" aria-labelledby="download-title">
      <img className="scene-landscape" src={DESIGN_ART.lanterns} alt="" loading="lazy" width="1600" height="900" />
      <div className="download-shade" aria-hidden="true" />
      <div className="journey-width download-content">
        <p className="journey-eyebrow">O próximo passo é seu</p>
        <h2 id="download-title">Sua jornada.<br /><em>Onde você estiver.</em></h2>
        <p>Leve suas trilhas, descobertas e conquistas com você.</p>
        <div className="journey-actions">
          <Link to="/download" className="journey-button journey-button-coral"><Smartphone size={20} /> Baixar para Android</Link>
          <Link to="/cadastro-aluno" className="journey-link">Criar minha conta <ArrowRight size={18} /></Link>
        </div>
      </div>
    </section>
  );
}
