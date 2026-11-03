import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown, LogOut, Menu } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { entradaDoAppAluno } from "@/features/signup/trilhaIntrodutoria";
import { useAuth } from "@/hooks/useAuth";
import { useMinhaConta } from "@/hooks/useMinhaConta";
import { iniciais } from "@/components/console/meusdados/conta";
import { consolePathForView } from "@/pages/consoleSections";
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

/** Para onde a conta logada vai: o console do professor ou a área do aluno. */
function destinoDaConta(papel: "professor" | "aluno" | null) {
  if (papel === "professor") return { to: consolePathForView("dashboard"), label: "Ir para o console" };
  if (papel === "aluno") return { to: "/aluno", label: "Minha área" };
  return null;
}

function FotoDaConta({ nome, fotoUrl, tamanho }: { nome: string; fotoUrl: string | null; tamanho: number }) {
  return (
    <Avatar style={{ width: tamanho, height: tamanho }}>
      {fotoUrl && <AvatarImage src={fotoUrl} alt="" className="object-cover" />}
      <AvatarFallback className="bg-[#ffa98f] text-[12px] font-bold text-[#201331]">{iniciais(nome)}</AvatarFallback>
    </Avatar>
  );
}

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  const { user, userRole, isLoading, signOut } = useAuth();
  const conta = useMinhaConta().data;
  const nome = conta?.nome ?? (String(user?.user_metadata?.nome ?? "").trim() || user?.email?.split("@")[0] || "Minha conta");
  const fotoUrl = conta?.fotoUrl ?? null;
  const destino = destinoDaConta(userRole);
  // Enquanto a sessão é restaurada, o lugar fica vazio: nem "Entrar" piscando para quem está logado.
  const logado = !!user;
  const indefinido = isLoading && !user;

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
          {indefinido ? (
            <span className="header-account-placeholder" aria-hidden="true" />
          ) : logado ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="header-account" aria-label={`Conta de ${nome}`}>
                <FotoDaConta nome={nome} fotoUrl={fotoUrl} tamanho={32} />
                <span className="header-account-name">{nome}</span>
                <ChevronDown size={14} aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {destino && <DropdownMenuItem asChild><Link to={destino.to}>{destino.label}</Link></DropdownMenuItem>}
                {userRole === "professor" && <DropdownMenuItem asChild><Link to={consolePathForView("profile")}>Meus dados</Link></DropdownMenuItem>}
                {destino && <DropdownMenuSeparator />}
                <DropdownMenuItem onSelect={() => void signOut()}><LogOut size={14} className="mr-2" aria-hidden="true" />Sair</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger className="header-login inline-flex items-center gap-1">
                Entrar <ChevronDown size={14} aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild><a href={ENTRADA_ALUNO}>Sou aluno</a></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/login">Sou professor</Link></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {logado
            ? destino && <Link className="journey-button journey-button-small" to={destino.to}>{userRole === "professor" ? "Console" : "Minha área"} <ArrowRight size={16} /></Link>
            : <Link className="journey-button journey-button-small" to="/cadastro-aluno">Começar <ArrowRight size={16} /></Link>}
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <button className="journey-menu-button" type="button" aria-label="Abrir menu" title="Abrir menu"><Menu size={24} /></button>
          </SheetTrigger>
          <SheetContent className="journey-mobile-menu">
            <SheetTitle className="journey-brand"><img src={trailupLogo} alt="" width="40" height="40" />TrailUp</SheetTitle>
            <SheetDescription className="sr-only">Navegação principal</SheetDescription>
            {logado && (
              <div className="journey-mobile-account">
                <FotoDaConta nome={nome} fotoUrl={fotoUrl} tamanho={44} />
                <strong>{nome}</strong>
              </div>
            )}
            <nav aria-label="Navegação mobile">
              {links.map(link => <SheetClose asChild key={link.href}><a href={link.href}>{link.label}<ArrowRight size={16} /></a></SheetClose>)}
              <SheetClose asChild><Link to="/download">Baixar o app <ArrowRight size={16} /></Link></SheetClose>
              {!logado && <SheetClose asChild><Link to="/cadastro-professor">Sou professor <ArrowRight size={16} /></Link></SheetClose>}
              {logado && userRole === "professor" && <SheetClose asChild><Link to={consolePathForView("profile")}>Meus dados <ArrowRight size={16} /></Link></SheetClose>}
            </nav>
            {logado ? (
              <>
                {destino && <SheetClose asChild><Link to={destino.to} className="journey-button journey-button-coral">{destino.label} <ArrowRight size={18} /></Link></SheetClose>}
                <SheetClose asChild><button type="button" className="journey-button mt-3" onClick={() => void signOut()}>Sair <LogOut size={18} /></button></SheetClose>
              </>
            ) : (
              <>
                <SheetClose asChild><a href={ENTRADA_ALUNO} className="journey-button journey-button-coral">Entrar como aluno <ArrowRight size={18} /></a></SheetClose>
                <SheetClose asChild><Link to="/login" className="journey-button mt-3">Entrar como professor <ArrowRight size={18} /></Link></SheetClose>
              </>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
