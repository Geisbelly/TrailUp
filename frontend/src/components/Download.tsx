import { ArrowRight, Smartphone } from "lucide-react";
import { Link } from "react-router-dom";
import { DESIGN_ART } from "@/lib/design-art";
import { useSceneMotion } from "@/hooks/useSceneMotion";
import { useInView } from "@/hooks/useInView";
import SceneNature from "./SceneNature";

export default function Download() {
  const { ref, active } = useSceneMotion<HTMLElement>();
  const { ref: contentRef, inView } = useInView<HTMLDivElement>();
  return (
    <section ref={ref} className="journey-download" id="download" aria-labelledby="download-title" data-motion-active={active}>
      <div className="scene-camera download-camera" aria-hidden="true">
        <img className="scene-landscape" src={DESIGN_ART.lanterns} alt="" loading="lazy" width="1600" height="900" />
      </div>
      <SceneNature />
      <div className="download-shade" aria-hidden="true" />
      <div ref={contentRef} className="journey-width download-content" data-revealed={inView}>
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
