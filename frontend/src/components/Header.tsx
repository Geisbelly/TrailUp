import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown, Menu } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { entradaDoAppAluno } from "@/features/signup/trilhaIntrodutoria";
import trailupLogo from "@/assets/trailup-brand-logo.png";

const links = [
  { href: "/#experiencia", label: "A jornada" },
  { href: "/#perfis", label: "Os perfis" },
  { href: "/sobre", label: "Sobre nós" },
  { href: "/blog", label: "Diário" },
  { href: "/contato", label: "Contato" },
];

// Quem já tem conta de aluno entra pelo app (login próprio); `/login` é o do professor.
const ENTRADA_ALUNO = entradaDoAppAluno(import.meta.env.VITE_ALUNO_APP_URL);

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
          <img src={trailupLogo} alt="" width="44" height="44" /><span>TrailUp</span>
        </Link>
        <nav className="journey-desktop-nav" aria-label="Navegação principal">
          {links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
        </nav>
        <div className="journey-header-actions">
          <DropdownMenu>
            <DropdownMenuTrigger className="header-login inline-flex items-center gap-1">
              Entrar <ChevronDown size={14} aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild><a href={ENTRADA_ALUNO}>Sou aluno</a></DropdownMenuItem>
              <DropdownMenuItem asChild><Link to="/login">Sou professor</Link></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link className="journey-button journey-button-small" to="/cadastro-aluno">Começar <ArrowRight size={16} /></Link>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <button className="journey-menu-button" type="button" aria-label="Abrir menu" title="Abrir menu"><Menu size={24} /></button>
          </SheetTrigger>
          <SheetContent className="journey-mobile-menu">
            <SheetTitle className="journey-brand"><img src={trailupLogo} alt="" width="40" height="40" />TrailUp</SheetTitle>
            <SheetDescription className="sr-only">Navegação principal</SheetDescription>
            <nav aria-label="Navegação mobile">
              {links.map(link => <SheetClose asChild key={link.href}><a href={link.href}>{link.label}<ArrowRight size={16} /></a></SheetClose>)}
              <SheetClose asChild><Link to="/download">Baixar o app <ArrowRight size={16} /></Link></SheetClose>
              <SheetClose asChild><Link to="/cadastro-professor">Sou professor <ArrowRight size={16} /></Link></SheetClose>
            </nav>
            <SheetClose asChild><a href={ENTRADA_ALUNO} className="journey-button journey-button-coral">Entrar como aluno <ArrowRight size={18} /></a></SheetClose>
            <SheetClose asChild><Link to="/login" className="journey-button mt-3">Entrar como professor <ArrowRight size={18} /></Link></SheetClose>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
