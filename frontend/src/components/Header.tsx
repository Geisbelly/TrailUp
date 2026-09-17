import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Menu } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DESIGN_ART } from "@/lib/design-art";

const links = [
  { href: "/#experiencia", label: "A jornada" },
  { href: "/#perfis", label: "Os perfis" },
  { href: "/sobre", label: "Sobre nós" },
  { href: "/blog", label: "Diário" },
  { href: "/contato", label: "Contato" },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header className={`journey-header${scrolled ? " is-scrolled" : ""}`}>
      <div className="journey-width header-inner">
        <Link to="/" className="journey-brand" aria-label="TrailUp, início">
          <img src={DESIGN_ART.star} alt="" width="44" height="44" /><span>TrailUp</span>
        </Link>
        <nav className="journey-desktop-nav" aria-label="Navegação principal">
          {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
        </nav>
        <div className="journey-header-actions">
          <Link className="header-login" to="/login">Entrar</Link>
          <Link className="journey-button journey-button-small" to="/cadastro-aluno">Começar <ArrowRight size={16} /></Link>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <button className="journey-menu-button" type="button" aria-label="Abrir menu" title="Abrir menu"><Menu size={24} /></button>
          </SheetTrigger>
          <SheetContent className="journey-mobile-menu">
            <SheetTitle className="journey-brand"><img src={DESIGN_ART.star} alt="" width="40" height="40" />TrailUp</SheetTitle>
            <SheetDescription className="sr-only">Navegação principal</SheetDescription>
            <nav aria-label="Navegação mobile">
              {links.map(link => <SheetClose asChild key={link.href}><a href={link.href}>{link.label}<ArrowRight size={16} /></a></SheetClose>)}
              <SheetClose asChild><Link to="/download">Baixar o app <ArrowRight size={16} /></Link></SheetClose>
              <SheetClose asChild><Link to="/cadastro-professor">Sou professor <ArrowRight size={16} /></Link></SheetClose>
            </nav>
            <SheetClose asChild><Link to="/login" className="journey-button journey-button-coral">Entrar <ArrowRight size={18} /></Link></SheetClose>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
