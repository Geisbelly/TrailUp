import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { describe, expect, it } from "vitest";
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

  it("does not expose the owner-only section to other professors", () => {
    const markup = render(createElement(ConsoleShell, {
      view: "dashboard", name: "Professor", isOwner: false, onSignOut: () => {},
    }));
    expect(markup).not.toContain('href="/console/aprovacoes"');
  });
});
