import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { GraduationCap, LayoutDashboard, LogOut, Route, Settings, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DESIGN_ART } from "@/lib/design-art";
import { CONSOLE_SECTIONS, consolePathForView, type ConsoleView } from "@/pages/consoleSections";

const navigation = {
  dashboard: { label: "Visão geral", icon: LayoutDashboard },
  trilha: { label: "Trilhas", icon: Route },
  classes: { label: "Turmas", icon: GraduationCap },
  personalizacoes: { label: "Personalizações", icon: Sparkles },
  ranks: { label: "Rankings", icon: Trophy },
  profile: { label: "Meus dados", icon: Settings },
  aprovacoes: { label: "Aprovações", icon: ShieldCheck },
};

export default function ConsoleShell({ view, name, institution, isOwner, onSignOut, children }: {
  view: ConsoleView;
  name: string;
  institution?: string | null;
  isOwner: boolean;
  onSignOut: () => void;
  children?: ReactNode;
}) {
  const initials = name.split(" ").filter(Boolean).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "PR";
  return (
    <div className="journey-console console-shell">
      <img className="console-scenery" data-page-background src={DESIGN_ART.landscape} alt="" width="1200" height="675" aria-hidden="true" />
      <header className="console-topbar">
        <Link to="/" className="journey-brand" aria-label="TrailUp, início">
          <img src={DESIGN_ART.star} alt="" width="38" height="38" /><span>TrailUp</span>
        </Link>
        <span className="console-workspace-name">Console do professor</span>
        <div className="console-account">
          <Avatar className="h-9 w-9"><AvatarFallback className="bg-primary/15 text-primary text-xs">{initials}</AvatarFallback></Avatar>
          <div className="console-account-copy"><strong>{name}</strong>{institution && <span>{institution}</span>}</div>
          <button type="button" className="console-icon-button" onClick={onSignOut} aria-label="Sair da conta" title="Sair da conta"><LogOut size={18} /></button>
        </div>
      </header>
      <nav className="console-navigation" aria-label="Seções do console">
        {CONSOLE_SECTIONS.filter(section => section.view !== "aprovacoes" || isOwner).map(section => {
          const item = navigation[section.view];
          const Icon = item.icon;
          return <Link key={section.view} to={consolePathForView(section.view)} aria-current={view === section.view ? "page" : undefined} title={item.label}><Icon size={18} /><span>{item.label}</span></Link>;
        })}
      </nav>
      <main className="console-main" aria-label={navigation[view].label}>{children}</main>
    </div>
  );
}
