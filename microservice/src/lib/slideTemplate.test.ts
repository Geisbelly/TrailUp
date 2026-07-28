import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeckHtml } from "./slideTemplate";
import { buildPresentationDesignPlan } from "../constants/presentationThemes";

const FAKE_SLIDE = {
  titulo: "Título de Teste",
  topics: ["Tópico 1", "Tópico 2"],
  explanation: "Explicação de teste.",
  characterQuote: "Fala de teste do guia.",
  imagem_referencia: "data:image/png;base64,AAAA",
  icones: ["data:image/png;base64,BBBB", "data:image/png;base64,CCCC"],
  sourceIds: ["pptx-s1", "pptx-s2"],
};

test("inclui titulo, topicos e explicacao do slide", () => {
  const html = buildDeckHtml([FAKE_SLIDE], "seeker");
  assert.ok(html.includes("Título de Teste"));
  assert.ok(html.includes("Tópico 1"));
  assert.ok(html.includes("Explicação de teste."));
});

test("nao vaza sourceIds como texto visivel", () => {
  const html = buildDeckHtml([FAKE_SLIDE], "seeker");
  assert.ok(!html.includes("pptx-s1"));
  assert.ok(!html.includes("Ref:"));
});

test("inclui a cena de fundo e os icones do slide", () => {
  const html = buildDeckHtml([FAKE_SLIDE], "seeker");
  assert.ok(html.includes("data:image/png;base64,AAAA"));
  assert.ok(html.includes("data:image/png;base64,BBBB"));
  assert.ok(html.includes("data:image/png;base64,CCCC"));
});

test("slide sem cena de fundo nao lanca excecao e nao inclui tag de cena vazia", () => {
  const semCena = { ...FAKE_SLIDE, imagem_referencia: undefined, icones: [] };
  const html = buildDeckHtml([semCena], "mastermind");
  assert.ok(html.includes("Título de Teste"));
  assert.ok(!html.includes('class="scene"'));
});

test("gera 1 <section class=\"slide\"> por slide", () => {
  const html = buildDeckHtml([FAKE_SLIDE, FAKE_SLIDE, FAKE_SLIDE], "achiever");
  const count = (html.match(/<section\s+class="slide /g) || []).length;
  assert.equal(count, 3);
});

test("cor de acento no CSS reflete a cor-assinatura do perfil (nao mais tabela dessincronizada)", () => {
  const html = buildDeckHtml([FAKE_SLIDE], "seeker");
  assert.ok(html.includes("#17a398")); // cor oficial ATUAL do Seeker em brainHex.ts (paleta migrada)
});

test("aplica direção temática recebida e identifica o design system", () => {
  const theme = buildPresentationDesignPlan("seeker", {
    subject: "Civilização Maia",
    style_name: "Atlas Maia Editorial",
    motifs: ["glifo maia", "pirâmide escalonada", "mapa da Mesoamérica"],
  });
  const html = buildDeckHtml([FAKE_SLIDE], "seeker", theme);

  assert.ok(html.includes("Civilização Maia"));
  assert.ok(html.includes("Atlas Maia Editorial"));
  assert.ok(html.includes('data-design-system="slidesgo-editorial-v3"'));
});

test("varia a composição entre capa, miolo e encerramento", () => {
  const slides = Array.from({ length: 6 }, (_, index) => ({
    ...FAKE_SLIDE,
    titulo: `Slide ${index + 1}`,
  }));
  const html = buildDeckHtml(slides, "mastermind");
  const layouts = [...html.matchAll(/data-layout="([^"]+)"/g)]
    .map((match) => match[1]);

  assert.equal(layouts[0], "cover");
  assert.equal(layouts.at(-1), "finale");
  assert.ok(new Set(layouts).size >= 5);
  assert.ok(html.includes("layout-timeline"));
  assert.ok(html.includes("layout-cards"));
});

test("cada perfil recebe uma assinatura CSS própria", () => {
  const profiles = [
    "seeker",
    "survivor",
    "daredevil",
    "mastermind",
    "conqueror",
    "socializer",
    "achiever",
  ] as const;
  for (const profile of profiles) {
    const html = buildDeckHtml([FAKE_SLIDE], profile);
    assert.ok(html.includes(`profile-${profile}`));
    assert.ok(html.includes(buildPresentationDesignPlan(profile).styleName));
  }
});
