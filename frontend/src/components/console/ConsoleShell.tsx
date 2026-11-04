import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Activity, Award, CalendarDays, ClipboardCheck, Coins, Flag, GraduationCap, LayoutDashboard, Lightbulb, LogOut, Menu, Route, Settings, ShieldCheck, Sparkles, Trophy, X } from "lucide-react";
import { Shield, Swords } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useMinhaConta } from "@/hooks/useMinhaConta";
import { DESIGN_ART } from "@/lib/design-art";
import { CONSOLE_SECTIONS, ROTULO_DA_VIEW, consolePathForView, viewSoDoDono, type ConsoleView } from "@/pages/consoleSections";
import Escriba from "./escriba/Escriba";
import SinoDeNotificacoes from "./notificacoes/SinoDeNotificacoes";
import { useContagemDeRecomendacoes } from "./recomendacoes/useRecomendacoesDaIA";
import { rotuloDoSelo } from "./recomendacoes/recomendacoes";

const navigation = {
  dashboard: { label: ROTULO_DA_VIEW.dashboard, icon: LayoutDashboard },
  recomendacoes: { label: ROTULO_DA_VIEW.recomendacoes, icon: Lightbulb },
  trilha: { label: ROTULO_DA_VIEW.trilha, icon: Route },
  missoes: { label: ROTULO_DA_VIEW.missoes, icon: Flag },
  conquistas: { label: ROTULO_DA_VIEW.conquistas, icon: Award },
  notas: { label: ROTULO_DA_VIEW.notas, icon: ClipboardCheck },
  eventos: { label: ROTULO_DA_VIEW.eventos, icon: CalendarDays },
  economia: { label: ROTULO_DA_VIEW.economia, icon: Coins },
  classes: { label: ROTULO_DA_VIEW.classes, icon: GraduationCap },
  personalizacoes: { label: ROTULO_DA_VIEW.personalizacoes, icon: Sparkles },
  ranks: { label: ROTULO_DA_VIEW.ranks, icon: Trophy },
  batalhas: { label: ROTULO_DA_VIEW.batalhas, icon: Swords },
  guildas: { label: ROTULO_DA_VIEW.guildas, icon: Shield },
  profile: { label: ROTULO_DA_VIEW.profile, icon: Settings },
  aprovacoes: { label: ROTULO_DA_VIEW.aprovacoes, icon: ShieldCheck },
  tecnico: { label: ROTULO_DA_VIEW.tecnico, icon: Activity },
};

// Recomendações, conta e administração ficam no topo, ao lado do sino; o menu lateral fica com as
// telas de trabalho. "Meus dados" é o avatar com o nome. Na tela estreita, onde o menu vira gaveta,
// os ícones não cabem no topo e voltam para a gaveta (CSS).
const ICONES_NO_TOPO: ConsoleView[] = ["recomendacoes", "aprovacoes", "tecnico"];

// Dialog, Select e Popover do Radix renderizam em portal no <body>, fora de
// .console-shell — sem isto eles ficariam com as cores da área pública.
function useConsoleThemeOnDocument() {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-console-theme", "");
    return () => root.removeAttribute("data-console-theme");
  }, []);
}

export default function ConsoleShell({ view, name, institution, isOwner, onSignOut, children }: {
  view: ConsoleView;
  name: string;
  institution?: string | null;
  isOwner: boolean;
  onSignOut: () => void;
  children?: ReactNode;
}) {
  useConsoleThemeOnDocument();
  const [menuAberto, setMenuAberto] = useState(false);
  useEffect(() => {
    if (!menuAberto) return;
    const fecharComEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuAberto(false);
    };
    window.addEventListener("keydown", fecharComEscape);
    return () => window.removeEventListener("keydown", fecharComEscape);
  }, [menuAberto]);
  // O selo é só um aviso: a RLS limita a contagem às turmas do professor logado.
  const selo = rotuloDoSelo(useContagemDeRecomendacoes(true));
  const fotoUrl = useMinhaConta().data?.fotoUrl ?? null;
  const initials = name.split(" ").filter(Boolean).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "PR";
  return (
    <div className="journey-console console-shell">
      <img className="console-scenery" data-page-background src={DESIGN_ART.consoleScenery} alt="" width="1200" height="675" aria-hidden="true" />
      <header className="console-topbar">
        <button
          type="button"
          className="console-mobile-menu-toggle"
          aria-label={menuAberto ? "Fechar menu de navegação" : "Abrir menu de navegação"}
          aria-expanded={menuAberto}
          aria-controls="console-sections-navigation"
          onClick={() => setMenuAberto((aberto) => !aberto)}
        >
          {menuAberto ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
        <Link to="/" className="journey-brand" aria-label="TrailUp, início">
          <img src={DESIGN_ART.star} alt="" width="30" height="30" /><span>TrailUp</span>
        </Link>
        <span className="console-topbar-divider" aria-hidden="true" />
        <span className="console-workspace-name">Console do professor</span>
        <div className="console-account">
          {ICONES_NO_TOPO.filter((secao) => !viewSoDoDono(secao) || isOwner).map((secao) => {
            const Icon = navigation[secao].icon;
            const aviso = secao === "recomendacoes" ? selo : null;
            const rotulo = aviso ? `${navigation[secao].label}, ${aviso} aguardando decisão` : navigation[secao].label;
            return (
              <Link key={secao} to={consolePathForView(secao)} className="console-icon-button relative" data-icone-no-topo aria-current={view === secao ? "page" : undefined} aria-label={rotulo} title={navigation[secao].label}>
                <Icon size={18} />
                {aviso && <span className="console-bell-badge" aria-hidden="true">{aviso}</span>}
              </Link>
            );
          })}
          <SinoDeNotificacoes />
          <Link to={consolePathForView("profile")} className="console-account-link" aria-current={view === "profile" ? "page" : undefined} aria-label={`${navigation.profile.label}: ${name}`} title={navigation.profile.label}>
            <Avatar className="h-[38px] w-[38px] shrink-0">{fotoUrl && <AvatarImage src={fotoUrl} alt="" className="object-cover" />}<AvatarFallback className="bg-primary text-primary-foreground text-[13px] font-bold">{initials}</AvatarFallback></Avatar>
            <div className="console-account-copy"><strong>{name}</strong>{institution && <span>{institution}</span>}</div>
          </Link>
          <button type="button" className="console-icon-button" onClick={onSignOut} aria-label="Sair da conta" title="Sair da conta"><LogOut size={18} /></button>
        </div>
      </header>
      <nav id="console-sections-navigation" className="console-navigation" data-open={menuAberto} aria-label="Seções do console">
        {CONSOLE_SECTIONS.filter(section => section.view !== "profile" && (!viewSoDoDono(section.view) || isOwner)).map(section => {
          const item = navigation[section.view];
          const soNaGaveta = ICONES_NO_TOPO.includes(section.view);
          const Icon = item.icon;
          const aviso = section.view === "recomendacoes" ? selo : null;
          return <Link key={section.view} to={consolePathForView(section.view)} data-so-na-gaveta={soNaGaveta || undefined} data-tutorial={`menu-${section.view}`} onClick={() => setMenuAberto(false)} aria-current={view === section.view ? "page" : undefined} aria-label={aviso ? `${item.label}, ${aviso} aguardando decisão` : undefined} title={item.label}><Icon size={20} strokeWidth={1.6} /><span>{item.label}</span>{aviso && <span className="console-nav-badge" aria-hidden="true">{aviso}</span>}</Link>;
        })}
      </nav>
      <main className="console-main" aria-label={navigation[view].label}>{children}</main>
      {/* A Lumi acompanha as telas de trabalho; Aprovações e Painel técnico são administração, não turma. */}
      {!viewSoDoDono(view) && <Escriba />}
    </div>
  );
}
