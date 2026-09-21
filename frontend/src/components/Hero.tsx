import { ArrowDown, ArrowUpRight, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { DESIGN_ART } from "@/lib/design-art";
import { useSceneMotion } from "@/hooks/useSceneMotion";
import SceneNature from "./SceneNature";

const destinations = [
  { href: "#experiencia", label: "Trilhas", art: DESIGN_ART.map },
  { href: "#perfis", label: "Seu perfil", art: DESIGN_ART.compass },
  { href: "#conquistas", label: "Conquistas", art: DESIGN_ART.trophy },
  { href: "#comunidade", label: "Comunidade", art: DESIGN_ART.community },
];

export default function Hero() {
  const { ref, active } = useSceneMotion<HTMLElement>();
  return (
    <section ref={ref} className="journey-hero" aria-labelledby="journey-title" data-motion-active={active}>
      <div className="scene-camera hero-camera" aria-hidden="true">
        <img className="scene-landscape hero-landscape" src={DESIGN_ART.dawn} alt="" loading="eager" width="1600" height="900" />
      </div>
      <SceneNature />
      <div className="hero-shade" aria-hidden="true" />
      <div className="journey-width hero-content">
        <p className="journey-eyebrow"><span /> Conhecimento é uma aventura</p>
        <h1 id="journey-title">TrailUp</h1>
        <p className="hero-subtitle">Um mundo de possibilidades.<br />Uma jornada que é sua.</p>
        <p className="hero-description">Descubra seu jeito de aprender e transforme cada novo conhecimento em uma conquista.</p>
        <div className="journey-actions">
          <Link to="/cadastro-aluno" className="journey-button journey-button-coral">Começar minha jornada <ArrowRight size={18} /></Link>
          <Link to="/login" className="journey-link">Sou professor <ArrowUpRight size={17} /></Link>
        </div>
      </div>
      <div className="hero-bottom journey-width">
        <a className="hero-explore" href="#experiencia"><ArrowDown size={18} /> Um novo caminho começa aqui</a>
        <nav className="journey-dock" aria-label="Explore o TrailUp">
          {destinations.map(({ href, label, art }) => (
            <a key={href} href={href} title={label}>
              <img src={art} alt="" width="48" height="48" />
              <span>{label}</span>
            </a>
          ))}
        </nav>
      </div>
    </section>
  );
}
