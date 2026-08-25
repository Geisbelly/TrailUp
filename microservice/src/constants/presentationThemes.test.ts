import assert from "node:assert/strict";
import { test } from "node:test";
import { PROFILES } from "./brainHex";
import {
  buildPresentationDesignPlan,
  presentationImageDirection,
  presentationLayoutForSlide,
} from "./presentationThemes";

test("cada perfil recebe uma direção editorial própria e vários layouts", () => {
  const styles = new Set<string>();
  for (const profile of PROFILES) {
    const plan = buildPresentationDesignPlan(profile, {
      subject: "Sistemas distribuídos",
    });
    styles.add(plan.styleName);
    assert.equal(plan.subject, "Sistemas distribuídos");
    assert.equal(plan.palette.accent.length, 7);
    assert.ok(plan.motifs.length >= 3);
    assert.ok(new Set(plan.layoutSequence).size >= 4);
  }
  assert.equal(styles.size, PROFILES.length);
});

test("capa e encerramento são estáveis e o miolo varia", () => {
  const plan = buildPresentationDesignPlan("seeker");
  assert.equal(presentationLayoutForSlide(plan, 0, 6), "cover");
  assert.equal(presentationLayoutForSlide(plan, 5, 6), "finale");
  assert.notEqual(
    presentationLayoutForSlide(plan, 1, 6),
    presentationLayoutForSlide(plan, 2, 6),
  );
});

test("direção de imagem incorpora assunto, estilo e motivos do deck", () => {
  const direction = presentationImageDirection(
    buildPresentationDesignPlan("mastermind", {
      subject: "Teorema CAP",
    }),
  );
  assert.match(direction, /Teorema CAP/);
  assert.match(direction, /Blueprint Estratégico/);
  assert.match(direction, /nó conectado/);
});
