import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Hexagon, Menu, X, ChevronDown,
  Smartphone, BookOpen, LayoutGrid,
  GraduationCap, Users, Rocket, MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Efeito de scroll para mudar o background
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Componente de Item de Menu Dropdown
  const NavItem = ({ title, name, children }: { title: string; name: string; children: React.ReactNode }) => (
    <div 
      className="relative group h-full flex items-center"
      onMouseEnter={() => setActiveDropdown(name)}
      onMouseLeave={() => setActiveDropdown(null)}
    >
      <button 
        className={cn(
          "flex items-center gap-1 text-sm font-medium transition-colors py-2",
          activeDropdown === name ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        {title}
        <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", activeDropdown === name ? "rotate-180" : "")} />
      </button>
      
      {/* Dropdown Area */}
      <div 
        className={cn(
          "absolute top-full left-0 pt-4 transition-all duration-200 ease-out origin-top-left min-w-[260px]",
          activeDropdown === name ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-2 pointer-events-none"
        )}
      >
        <div className="bg-popover/95 backdrop-blur-xl border border-border/50 rounded-xl p-2 shadow-2xl ring-1 ring-black/5 flex flex-col gap-1">
          {children}
        </div>
      </div>
    </div>
  );

  const DropdownLink = ({ to, icon: Icon, title, desc }: { to: string; icon: LucideIcon; title: string; desc: string }) => (
    <Link 
      to={to} 
      className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-all group/item"
    >
      <div className="mt-1 p-1.5 rounded-md bg-muted border border-border/50 text-muted-foreground group-hover/item:bg-primary/20 group-hover/item:text-primary group-hover/item:border-primary/20 transition-colors">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <div className="text-sm font-medium text-foreground group-hover/item:text-primary transition-colors">{title}</div>
        <div className="text-xs text-muted-foreground group-hover/item:text-muted-foreground/80 transition-colors line-clamp-1">{desc}</div>
      </div>
    </Link>
  );

  return (
    <header 
      className={cn(
        "fixed top-0 w-full z-50 border-b transition-all duration-300",
        isScrolled 
          ? "bg-background/80 backdrop-blur-md border-border/40 py-3" 
          : "bg-transparent border-transparent py-5"
      )}
    >
      <div className="container mx-auto px-4 flex items-center justify-between">
        
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2 group relative z-50">
          <div className="relative p-1.5 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors duration-300">
            <Hexagon className="w-6 h-6 text-primary fill-primary/20 group-hover:rotate-90 transition-transform duration-500" />
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">TrailUp</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8">
          
          <NavItem title="Produto" name="produto">
            <DropdownLink to="/#features" icon={LayoutGrid} title="Funcionalidades" desc="O que o TrailUp oferece" />
            <DropdownLink to="/download" icon={Smartphone} title="App Mobile" desc="Baixe para Android" />
          </NavItem>

          <NavItem title="Participar" name="participar">
            <DropdownLink to="/cadastro-aluno" icon={GraduationCap} title="Sou Aluno" desc="Comece sua jornada" />
            <DropdownLink to="/cadastro-professor" icon={Users} title="Sou Professor" desc="Gerencie suas turmas" />
          </NavItem>

          <NavItem title="Explorar" name="explorar">
            <DropdownLink to="/sobre" icon={Rocket} title="Sobre Nós" desc="Nossa missão e valores" />
            <DropdownLink to="/blog" icon={BookOpen} title="Blog" desc="Artigos e novidades" />
          </NavItem>

          <Link to="/contato" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
            Contato
          </Link>

        </nav>

        {/* Actions */}
        <div className="hidden md:flex items-center gap-4">
          <Link to="/login">
            <Button variant="ghost" className="text-muted-foreground hover:text-foreground hover:bg-muted/50">
              Entrar
            </Button>
          </Link>
          <Link to="/cadastro-aluno">
            <Button size="sm" className="gradient-primary text-primary-foreground font-medium shadow-lg shadow-primary/20 transition-all hover:scale-105 hover:shadow-primary/30 border-0">
              Começar Agora
            </Button>
          </Link>
        </div>

        {/* Mobile Toggle */}
        <button 
          className="md:hidden relative z-50 p-2 text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>

        {/* Mobile Menu Overlay */}
        {mobileMenuOpen && (
          <div className="absolute inset-0 top-0 h-screen bg-background p-6 pt-24 flex flex-col gap-6 animate-in slide-in-from-top-10 duration-300 md:hidden overflow-y-auto">
            <div className="space-y-6">
              
              <div className="space-y-3">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-2">Produto</p>
                <div className="grid gap-2">
                  <Link to="/#features" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50 text-foreground">
                    <LayoutGrid className="w-4 h-4 text-primary" /> Funcionalidades
                  </Link>
                  <Link to="/download" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50 text-foreground">
                    <Smartphone className="w-4 h-4 text-primary" /> App Mobile
                  </Link>
                </div>
              </div>
              
              <div className="space-y-3">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-2">Participar</p>
                <div className="grid gap-2">
                  <Link to="/cadastro-aluno" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl bg-primary/10 border border-primary/20 text-primary font-medium">
                    <GraduationCap className="w-4 h-4" /> Sou Aluno
                  </Link>
                  <Link to="/cadastro-professor" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/50 text-foreground">
                    <Users className="w-4 h-4 text-primary" /> Sou Professor
                  </Link>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-2">Empresa</p>
                <div className="grid gap-1">
                  <Link to="/sobre" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg">Sobre Nós</Link>
                  <Link to="/blog" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg">Blog</Link>
                  <Link to="/contato" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg">Contato</Link>
                </div>
              </div>
            </div>
            
            <div className="mt-auto border-t border-border/40 pt-6 space-y-4">
              <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                <Button className="w-full bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted" variant="outline">Fazer Login</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;