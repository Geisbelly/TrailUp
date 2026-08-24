import { describe, it, expect } from "vitest";
import {
  CONSOLE_SECTIONS,
  DEFAULT_CONSOLE_VIEW,
  consolePathForView,
  consoleViewFromPathname,
  type ConsoleView,
} from "./consoleSections";

describe("consolePathForView", () => {
  it("mapeia a aba padrao pra /console (link antigo continua valendo)", () => {
    expect(consolePathForView("dashboard")).toBe("/console");
    expect(DEFAULT_CONSOLE_VIEW).toBe("dashboard");
  });

  it("mapeia as demais abas pro caminho proprio", () => {
    expect(consolePathForView("trilha")).toBe("/console/trilha");
    expect(consolePathForView("classes")).toBe("/console/turmas");
    expect(consolePathForView("personalizacoes")).toBe("/console/personalizacoes");
    expect(consolePathForView("ranks")).toBe("/console/ranks");
    expect(consolePathForView("profile")).toBe("/console/meus-dados");
    expect(consolePathForView("aprovacoes")).toBe("/console/aprovacoes");
  });
});

describe("consoleViewFromPathname", () => {
  it("resolve /console e /console/ pra aba padrao", () => {
    expect(consoleViewFromPathname("/console")).toBe("dashboard");
    expect(consoleViewFromPathname("/console/")).toBe("dashboard");
  });

  it("resolve o caminho de cada aba", () => {
    expect(consoleViewFromPathname("/console/trilha")).toBe("trilha");
    expect(consoleViewFromPathname("/console/turmas")).toBe("classes");
    expect(consoleViewFromPathname("/console/personalizacoes")).toBe("personalizacoes");
    expect(consoleViewFromPathname("/console/ranks")).toBe("ranks");
    expect(consoleViewFromPathname("/console/meus-dados")).toBe("profile");
    expect(consoleViewFromPathname("/console/aprovacoes")).toBe("aprovacoes");
  });

  it("mantem a aba da trilha nas subrotas do editor de topico", () => {
    expect(consoleViewFromPathname("/console/trilha/129/editar")).toBe("trilha");
  });

  it("ignora barra final", () => {
    expect(consoleViewFromPathname("/console/personalizacoes/")).toBe("personalizacoes");
  });

  it("devolve null pra segmento desconhecido dentro do console", () => {
    expect(consoleViewFromPathname("/console/inexistente")).toBeNull();
  });

  it("devolve null pra caminho fora do console", () => {
    expect(consoleViewFromPathname("/login")).toBeNull();
    expect(consoleViewFromPathname("/consolezinho")).toBeNull();
    expect(consoleViewFromPathname("/")).toBeNull();
  });
});

describe("CONSOLE_SECTIONS", () => {
  it("faz round-trip de toda aba declarada", () => {
    for (const secao of CONSOLE_SECTIONS) {
      expect(consoleViewFromPathname(consolePathForView(secao.view))).toBe(secao.view);
    }
  });

  it("nao tem slug repetido (duas abas na mesma URL)", () => {
    const slugs = CONSOLE_SECTIONS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("declara exatamente uma aba na raiz /console", () => {
    expect(CONSOLE_SECTIONS.filter((s) => s.slug === "")).toHaveLength(1);
  });

  it("nao tem view repetida", () => {
    const views = CONSOLE_SECTIONS.map((s) => s.view as ConsoleView);
    expect(new Set(views).size).toBe(views.length);
  });
});
