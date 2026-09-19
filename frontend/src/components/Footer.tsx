import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { DESIGN_ART } from "@/lib/design-art";

export default function Footer() {
  return (
    <footer className="journey-footer">
      <div className="journey-width footer-main">
        <div>
          <Link to="/" className="journey-brand"><img src={DESIGN_ART.star} alt="" width="40" height="40" />TrailUp</Link>
          <p>Conhecimento para ir além.<br />Uma descoberta de cada vez.</p>
        </div>
        <nav aria-label="Explore"><h2>Explore</h2><Link to="/sobre">Sobre o TrailUp</Link><Link to="/blog">Diário da jornada</Link><Link to="/download">Baixar o app</Link></nav>
        <nav aria-label="Participe"><h2>Faça parte</h2><Link to="/cadastro-aluno">Sou aluno <ArrowUpRight size={14} /></Link><Link to="/cadastro-professor">Sou professor <ArrowUpRight size={14} /></Link><Link to="/contato">Fale com a gente</Link></nav>
      </div>
      <div className="journey-width footer-bottom"><span>TrailUp · Aprendizado em movimento</span><nav aria-label="Informações legais"><Link to="/privacidade">Privacidade</Link><Link to="/termos">Termos de uso</Link></nav></div>
    </footer>
  );
}
