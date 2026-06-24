import { Hexagon, Twitter, Instagram, Linkedin, Github } from "lucide-react";
import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="border-t border-border/40 bg-background py-10 relative z-10 font-sans">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          
          {/* Brand & Tagline */}
          <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6 text-center md:text-left">
            <Link to="/" className="group flex items-center gap-2">
              <div className="p-2 rounded-xl bg-card border border-border/50 group-hover:border-primary/50 group-hover:bg-primary/10 transition-all duration-300 shadow-lg shadow-black/20">
                <Hexagon className="w-6 h-6 text-primary fill-primary/20 group-hover:rotate-12 transition-transform duration-500" />
              </div>
              <span className="text-xl font-bold text-foreground tracking-tight group-hover:text-primary transition-colors">TrailUp</span>
            </Link>
            
            <div className="hidden md:block w-px h-8 bg-border/40" />
            
            <p className="text-sm text-muted-foreground max-w-xs font-medium">
              Gamificação inteligente para ensino superior.
            </p>
          </div>

          {/* Minimal Links - Somente legais e suporte */}
          <nav className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm font-medium text-muted-foreground">
            <Link to="/privacidade" className="hover:text-primary transition-colors">Privacidade</Link>
            <Link to="/termos" className="hover:text-primary transition-colors">Termos</Link>
            <Link to="/contato" className="hover:text-primary transition-colors">Ajuda</Link>
          </nav>

          {/* Socials */}
          <div className="flex gap-3">
            {[Twitter, Instagram, Linkedin, Github].map((Icon, i) => (
              <a 
                key={i}
                href="#" 
                className="p-2.5 rounded-full bg-card border border-border/50 text-muted-foreground hover:text-foreground hover:bg-primary/10 hover:border-primary/50 transition-all duration-300 hover:scale-110 hover:shadow-[0_0_15px_-3px_hsla(var(--primary)/0.3)]"
              >
                <Icon className="w-4 h-4" />
              </a>
            ))}
          </div>
        </div>

       
      </div>
    </footer>
  );
};

export default Footer;