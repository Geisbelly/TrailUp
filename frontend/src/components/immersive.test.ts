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

  it("starts scenery motion automatically without a play control", () => {
    expect(renderHero()).toContain('data-motion-active="false"');
    expect(renderHero()).not.toContain("<button");
  });

  it("animates individual foliage and butterflies in a decorative layer", () => {
    const markup = renderHero();
    expect(markup).toContain('class="scene-nature" aria-hidden="true"');
    expect(markup.match(/class="nature-sprig"/g)).toHaveLength(2);
    expect(markup.match(/class="nature-butterfly"/g)).toHaveLength(3);
    expect(markup.match(/class="nature-wing nature-wing-left"/g)).toHaveLength(3);
    expect(markup.match(/class="nature-wing nature-wing-right"/g)).toHaveLength(3);
    expect(markup.match(/class="nature-leaf"/g)).toHaveLength(2);
  });

  it("keeps scenery free of idle camera drift and nature non-interactive", () => {
    const css = parse(readFileSync(new URL("../styles/motion.css", import.meta.url), "utf8"));
    const nature = css.nodes.find((node): node is Rule => node.type === "rule" && node.selector === ".scene-nature");
    expect(nature?.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ prop: "pointer-events", value: "none" })]));
    css.walkDecls(/^animation/, declaration => {
      expect(declaration.value).not.toMatch(/scene-drift|scene-light/);
    });
  });

  it("renders every butterfly as a luminous yellow silhouette", () => {
    const css = parse(readFileSync(new URL("../styles/motion.css", import.meta.url), "utf8"));
    const wings = css.nodes.find((node): node is Rule => node.type === "rule" && node.selector === ".nature-wing, .nature-body");
    expect(wings?.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ prop: "background-color", value: "#fff1a6" }),
      expect.objectContaining({ prop: "mask-image", value: "var(--nature-atlas)" }),
    ]));
    const butterfly = css.nodes.find((node): node is Rule => node.type === "rule" && node.selector === ".nature-butterfly");
    expect(butterfly?.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ prop: "filter", value: expect.stringContaining("drop-shadow") }),
    ]));
  });

  it("limits motion to compositor properties and keeps it opt-in to the OS preference", () => {
    const css = parse(readFileSync(new URL("../styles/motion.css", import.meta.url), "utf8"));
    css.walkAtRules("keyframes", rule => {
      rule.walkDecls(declaration => expect(["transform", "opacity"]).toContain(declaration.prop));
    });
    css.walkDecls(/^animation/, declaration => {
      let ancestor = declaration.parent;
      while (ancestor && ancestor.type !== "atrule") ancestor = ancestor.parent;
      expect(ancestor).toMatchObject({ type: "atrule", name: "media", params: "(prefers-reduced-motion: no-preference)" });
    });
  });

  it("reveals each journey item independently as it enters the viewport", () => {
    const markup = renderToStaticMarkup(createElement(Features));
    expect(markup.match(/class="journey-feature" data-revealed="false"/g)).toHaveLength(4);
  });

  it("progressively enhances scrolling without animating guides apart from their terrain", () => {
    const css = parse(readFileSync(new URL("../styles/motion.css", import.meta.url), "utf8"));
    const timelines: string[] = [];
    css.walkDecls("animation-timeline", declaration => timelines.push(declaration.value));
    expect(timelines).toEqual(expect.arrayContaining(["--hero-scroll", "--guide-scroll", "view(block 0 12%)", "scroll(root block)"]));
    css.walkDecls("animation-timeline", declaration => {
      let ancestor = declaration.parent;
      while (ancestor && !(ancestor.type === "atrule" && ancestor.name === "supports")) ancestor = ancestor.parent;
      expect(ancestor).toBeDefined();
    });
    css.walkRules(rule => {
      if (rule.selector.includes(".profile-guide-art") || rule.selector.includes(".profile-guide-figure")) {
        expect(rule.nodes.some(node => node.type === "decl" && node.prop.startsWith("animation"))).toBe(false);
      }
    });
  });

  it("keeps artwork moving through a section instead of stopping after entry", () => {
    const css = parse(readFileSync(new URL("../styles/motion.css", import.meta.url), "utf8"));
    const animations = new Map<string, Record<string, string>>();
    css.walkRules(rule => {
      const properties: Record<string, string> = {};
      rule.walkDecls(declaration => { properties[declaration.prop] = declaration.value; });
      if (properties.animation) animations.set(properties.animation.split(" ")[0], properties);
    });
    expect(animations.get("scroll-camera")?.["animation-timeline"]).toBe("--hero-scroll");
    expect(animations.get("scroll-art-pass")?.["animation-range"]).toBe("entry 0% exit 100%");
    expect(animations.get("scroll-guide")?.["animation-range"]).toBe("entry 0% exit 100%");
    expect(animations.get("scroll-emblem-wave")?.["animation-timeline"]).toBe("--profile-tabs-scroll");
    expect(animations.get("scroll-download-camera")?.["animation-timeline"]).toBe("--download-scroll");
  });

  it("masks camera frames independently and keeps scrolled navigation opaque", () => {
    expect(renderHero()).toContain('class="scene-camera hero-camera" aria-hidden="true"');
    const css = parse(readFileSync(new URL("../styles/motion.css", import.meta.url), "utf8"));
    const properties = (selector: string) => {
      const rule = css.nodes.find((node): node is Rule => node.type === "rule" && node.selector === selector);
      return Object.fromEntries((rule?.nodes ?? []).filter((node): node is Declaration => node.type === "decl").map(node => [node.prop, node.value]));
    };
    expect(properties(".hero-camera")["mask-image"]).toContain("transparent");
    expect(properties(".scene-camera .scene-landscape")["mask-image"]).toBe("none");
    expect(properties(".immersive-site .journey-header.is-scrolled").background).toBe("#180f26");
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
