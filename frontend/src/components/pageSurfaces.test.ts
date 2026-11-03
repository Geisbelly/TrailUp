import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { describe, expect, it, vi } from "vitest";

// O ConsoleShell monta a Lumi, que fala com o Supabase; aqui só importa o HTML.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
import { PublicLayout, PublicPageTitle } from "./PublicLayout";
import ConsoleShell from "./console/ConsoleShell";
import { CONSOLE_SECTIONS, consolePathForView } from "@/pages/consoleSections";
import Sobre from "@/pages/Sobre";
import Blog from "@/pages/Blog";
import Contato from "@/pages/Contato";
import Download from "@/pages/Download";
import Privacidade from "@/pages/Privacidade";
import Termos from "@/pages/Termos";
import NotFound from "@/pages/NotFound";

const render = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(
  createElement(StaticRouter, { location: "/" }, element),
);

describe("shared page surfaces", () => {
  it.each([Sobre, Blog, Contato, Download, Privacidade, Termos, NotFound])("keeps %s on one shared background", Page => {
    const markup = render(createElement(Page));
    expect(markup.match(/data-page-background/g)).toHaveLength(1);
    expect(markup.match(/<main/g)).toHaveLength(1);
    expect(markup).toContain("public-page");
  });

  it("renders one public background and shared navigation", () => {
    const markup = render(createElement(PublicLayout, {}, createElement(PublicPageTitle, { title: "Sobre o TrailUp" })));
    expect(markup.match(/data-page-background/g)).toHaveLength(1);
    expect(markup.match(/<main/g)).toHaveLength(1);
    expect(markup).toContain("Sobre o TrailUp");
    expect(markup).toContain('href="/login"');
    expect(markup).not.toContain("animate-pulse");
  });

  it("keeps all professor navigation routes and the active section", () => {
    const markup = render(createElement(ConsoleShell, {
      view: "trilha", name: "Professor", institution: "Universidade", isOwner: true,
      onSignOut: () => {},
    }, "Conteúdo"));
    expect(markup.match(/data-page-background/g)).toHaveLength(1);
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    for (const section of CONSOLE_SECTIONS) expect(markup).toContain(`href="${consolePathForView(section.view)}"`);
    expect(markup).toContain('aria-label="Sair da conta"');
    expect(markup).toContain("Conteúdo");
  });

  it("keeps account and admin in the top bar, out of the side menu", () => {
    const markup = render(createElement(ConsoleShell, {
      view: "aprovacoes", name: "Professor", isOwner: true, onSignOut: () => {},
    }));
    const [topo, lateral] = markup.split('id="console-sections-navigation"');
    for (const view of ["profile", "recomendacoes", "aprovacoes", "tecnico"] as const) {
      expect(topo, view).toContain(`href="${consolePathForView(view)}"`);
    }
    expect(topo).toContain('aria-current="page"');
    // Meus dados é o avatar. Os ícones do topo só aparecem na gaveta da tela estreita (CSS).
    expect(lateral).not.toContain(`href="${consolePathForView("profile")}"`);
    for (const view of ["recomendacoes", "aprovacoes", "tecnico"] as const) {
      expect(lateral, view).toMatch(new RegExp(`<a data-so-na-gaveta="true"[^>]*href="${consolePathForView(view)}"`));
    }
  });

  it("does not expose the owner-only section to other professors", () => {
    const markup = render(createElement(ConsoleShell, {
      view: "dashboard", name: "Professor", isOwner: false, onSignOut: () => {},
    }));
    expect(markup).not.toContain('href="/console/aprovacoes"');
    expect(markup).not.toContain('href="/console/tecnico"');
  });

  it("shows the Lumi on the working sections but not on Aprovações", () => {
    const escriba = /aria-label="Pergunte à Lumi, a guia do professor"/g;
    for (const view of ["dashboard", "trilha", "classes", "personalizacoes", "ranks", "profile"] as const) {
      const markup = render(createElement(ConsoleShell, { view, name: "Professor", isOwner: true, onSignOut: () => {} }));
      expect(markup.match(escriba), view).toHaveLength(1);
    }
    const aprovacoes = render(createElement(ConsoleShell, { view: "aprovacoes", name: "Professor", isOwner: true, onSignOut: () => {} }));
    expect(aprovacoes).not.toMatch(escriba);
    const tecnico = render(createElement(ConsoleShell, { view: "tecnico", name: "Professor", isOwner: true, onSignOut: () => {} }));
    expect(tecnico).not.toMatch(escriba);
  });
});
