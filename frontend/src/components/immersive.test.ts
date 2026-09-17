import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parse, type Declaration, type Rule } from "postcss";
import Hero from "./Hero";
import BrainHexShowcase from "./BrainHexShowcase";
import Header from "./Header";
import Features from "./Features";
import Index from "@/pages/Index";
import { AuthBrand } from "./auth/AuthScenery";
import { PROFILE_WORLDS } from "@/lib/design-art";

describe("immersive public homepage", () => {
  const renderHero = () => renderToStaticMarkup(
    createElement(StaticRouter, { location: "/" }, createElement(Hero)),
  );

  it("identifies TrailUp in the main heading", () => {
    expect(renderHero()).toMatch(/<h1[^>]*>TrailUp<\/h1>/);
  });

  it("uses an illustrated scene instead of decorative gradient blobs", () => {
    expect(renderHero()).toContain("scene-landscape");
    expect(renderHero()).not.toContain("animate-ember");
  });

  it("preserves the student and professor entry points", () => {
    expect(renderHero()).toContain('href="/cadastro-aluno"');
    expect(renderHero()).toContain('href="/login"');
  });

  it("provides a guide for each of the seven profiles", () => {
    expect(PROFILE_WORLDS).toHaveLength(7);
    expect(new Set(PROFILE_WORLDS.map(profile => profile.guide.art)).size).toBe(7);
    for (const profile of PROFILE_WORLDS) {
      expect(profile.guide.name).not.toBe("");
      expect(profile.guide.title).not.toBe("");
      expect(profile.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("keeps distinct profile scenery and emblems", () => {
    expect(new Set(PROFILE_WORLDS.map(profile => profile.world)).size).toBe(7);
    expect(new Set(PROFILE_WORLDS.map(profile => profile.emblem)).size).toBe(7);
  });

  it("renders the selected guide and seven accessible profile tabs", () => {
    const markup = renderToStaticMarkup(
      createElement(StaticRouter, { location: "/" }, createElement(BrainHexShowcase)),
    );
    expect(markup.match(/role="tab"/g)).toHaveLength(7);
    expect(markup).toContain('alt="Idris, guia do perfil Estrategista"');
    expect(markup).toContain('alt="Cenário do perfil Estrategista"');
    expect(markup).toContain('href="/cadastro-aluno"');
  });

  it("provides a named mobile menu trigger", () => {
    const markup = renderToStaticMarkup(
      createElement(StaticRouter, { location: "/" }, createElement(Header)),
    );
    expect(markup).toContain('aria-label="Abrir menu"');
    expect(markup).toContain('aria-haspopup="dialog"');
  });

  it("anchors each guide to its own foreground terrain", () => {
    for (const profile of PROFILE_WORLDS) {
      expect(profile.guide).toHaveProperty("scene");
      expect(profile.guide).toHaveProperty("floor");
    }
    const markup = renderToStaticMarkup(
      createElement(StaticRouter, { location: "/" }, createElement(BrainHexShowcase)),
    );
    expect(markup).toContain('class="profile-guide-stage"');
    expect(markup).toContain('class="profile-guide-terrain"');
  });

  it("anchors visible soles instead of the transparent image boundary", () => {
    for (const { guide } of PROFILE_WORLDS) {
      expect(guide).toHaveProperty("grounding");
      const { width, height, baseline, contacts } = guide.grounding;
      expect(baseline).toBeGreaterThan(height * .95);
      expect(baseline).toBeLessThanOrEqual(height);
      expect(contacts.length).toBeGreaterThan(0);
      for (const contact of contacts) {
        expect(contact.x).toBeGreaterThan(0);
        expect(contact.x).toBeLessThan(width);
        expect(contact.y).toBeGreaterThan(height * .9);
        expect(contact.y).toBeLessThanOrEqual(baseline);
      }
    }
    const markup = renderToStaticMarkup(
      createElement(StaticRouter, { location: "/" }, createElement(BrainHexShowcase)),
    );
    expect(markup.match(/class="profile-guide-contact"/g)).toHaveLength(2);
    expect(markup).not.toContain('class="profile-guide-shadow"');
  });

  it("renders the shared auth logo without a frame", () => {
    const markup = renderToStaticMarkup(
      createElement(StaticRouter, { location: "/login" }, createElement(AuthBrand)),
    );
    expect(markup).toContain('href="/"');
    expect(markup).toContain('class="auth-star"');
    expect(markup.match(/<img /g)).toHaveLength(1);
    expect(markup).not.toContain("auth-frame");
  });

  it("uses one continuous scene per guide instead of stacking two landscapes", () => {
    const markup = renderToStaticMarkup(
      createElement(StaticRouter, { location: "/" }, createElement(BrainHexShowcase)),
    );
    expect(markup).toContain('class="profile-world-visual"');
    expect(markup).not.toContain('class="scene-landscape"');
    expect(markup.match(/Cenário do perfil/g)).toHaveLength(1);
  });

  it("connects the opening and feature sections in one composition", () => {
    const markup = renderToStaticMarkup(
      createElement(StaticRouter, { location: "/" }, createElement(Index)),
    );
    expect(markup).toContain('class="journey-opening"');
    expect(markup).toContain('id="experiencia"');
  });

  it("keeps the original journey content and artwork without a second landscape", () => {
    const markup = renderToStaticMarkup(createElement(Features));
    expect(markup).not.toContain("feature-scenery");
    expect(markup).toContain("Abra novos caminhos");
    expect(markup).toContain("Conhecimento que acompanha seu ritmo e sua forma de pensar.");
    expect(markup.match(/width="160" height="160"/g)).toHaveLength(4);
    expect(markup.match(/<article/g)).toHaveLength(4);
    expect(markup.match(/<img /g)).toHaveLength(4);
    for (const id of ["trilhas", "conhecimento", "conquistas", "comunidade"]) {
      expect(markup).toContain(`id="${id}"`);
    }
  });

  it("reserves the hero scenery extension before the opaque reading section", () => {
    const css = parse(readFileSync(new URL("../styles/immersive.css", import.meta.url), "utf8"));
    const value = (selector: string, property: string) => {
      const rule = css.nodes.find((node): node is Rule => node.type === "rule" && node.selector === selector);
      return rule?.nodes.find((node): node is Declaration => node.type === "decl" && node.prop === property)?.value;
    };
    expect(value(".journey-hero", "margin-bottom")).toBe("var(--hero-scene-tail)");
    expect(value(".hero-landscape", "height")).toBe("calc(100% + var(--hero-scene-tail))");
    expect(value(".journey-features", "background")).toBe("var(--journey-ink)");
  });
});
